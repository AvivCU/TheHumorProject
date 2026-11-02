-- ============================================================
-- Week 8: Prompt Chain Tool
-- Superadmins can now create, edit, reorder and delete prompt
-- chains and their steps, run a chain on an optional image, and
-- see every caption a chain produced. Run once in the Supabase SQL
-- Editor, after domain.sql. Safe to re-run.
-- ============================================================

alter table prompt_chain_steps add column if not exists title text;
alter table prompt_chain_steps
  add column if not exists include_image boolean not null default false;

alter table prompt_chains
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists prompt_chains_touch on prompt_chains;
create trigger prompt_chains_touch
  before update on prompt_chains
  for each row execute function public.touch_updated_at();

alter table generation_requests
  add column if not exists source text not null default 'app';
alter table generation_requests drop constraint if exists generation_requests_source_check;
alter table generation_requests
  add constraint generation_requests_source_check check (source in ('app', 'tool'));
alter table generation_requests add column if not exists output text;
alter table generation_requests add column if not exists image_url text;

-- Lets one request (e.g. a tool run that produced five captions) own
-- several posted captions, so "media made by chain X" is one join.
alter table generations
  add column if not exists request_id bigint
  references generation_requests (id) on delete set null;
create index if not exists generations_request_id_idx on generations (request_id);
create index if not exists generation_requests_chain_id_idx
  on generation_requests (chain_id, created_at desc);

update generations g
set request_id = r.id
from generation_requests r
where r.generation_id = g.id and g.request_id is null;

-- ------------------------------------------------------------
-- Superadmins manage chains and steps (reads stay open to any
-- signed-in user because CUmor's generate route needs them).
-- ------------------------------------------------------------

drop policy if exists "Superadmins manage chains" on prompt_chains;
create policy "Superadmins manage chains" on prompt_chains
  for all using (public.is_superadmin()) with check (public.is_superadmin());

drop policy if exists "Superadmins manage chain steps" on prompt_chain_steps;
create policy "Superadmins manage chain steps" on prompt_chain_steps
  for all using (public.is_superadmin()) with check (public.is_superadmin());

-- New chains join the mix switched off, so a chain being built in the
-- tool never reaches CUmor users until an admin turns it on.
create or replace function public.add_chain_to_mix()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into prompt_chain_mix (chain_id, weight, is_active)
  values (new.id, 0, false)
  on conflict (chain_id) do nothing;
  return new;
end;
$$;

drop trigger if exists add_chain_to_mix on prompt_chains;
create trigger add_chain_to_mix
  after insert on prompt_chains
  for each row execute function public.add_chain_to_mix();

-- Reorders a chain's steps in one transaction. step_ids must list every
-- step of the chain exactly once, in the new order.
create or replace function public.reorder_prompt_chain_steps(
  p_chain_id bigint,
  p_step_ids bigint[]
)
returns void
language plpgsql
set search_path = public
as $$
declare
  expected integer;
begin
  if not public.is_superadmin() then
    raise exception 'Only superadmins can reorder steps' using errcode = '42501';
  end if;

  select count(*) into expected from prompt_chain_steps where chain_id = p_chain_id;

  if expected <> coalesce(array_length(p_step_ids, 1), 0)
     or expected <> (select count(distinct s) from unnest(p_step_ids) s)
     or exists (
       select 1 from unnest(p_step_ids) s
       where not exists (
         select 1 from prompt_chain_steps
         where id = s and chain_id = p_chain_id
       )
     ) then
    raise exception 'Step list does not match the chain''s steps; refresh and try again'
      using errcode = '22023';
  end if;

  -- Park every step far above the final range first: the unique
  -- (chain_id, step_order) index is checked row by row, so moving
  -- straight to 1..n would collide mid-update.
  update prompt_chain_steps
  set step_order = step_order + 100000
  where chain_id = p_chain_id;

  update prompt_chain_steps s
  set step_order = o.position
  from unnest(p_step_ids) with ordinality as o(step_id, position)
  where s.id = o.step_id;
end;
$$;

-- Deletes a step and closes the gap it leaves in the numbering.
create or replace function public.delete_prompt_chain_step(p_step_id bigint)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_chain_id bigint;
  v_ids bigint[];
begin
  if not public.is_superadmin() then
    raise exception 'Only superadmins can delete steps' using errcode = '42501';
  end if;

  delete from prompt_chain_steps where id = p_step_id returning chain_id into v_chain_id;
  if v_chain_id is null then
    return;
  end if;

  select array_agg(id order by step_order) into v_ids
  from prompt_chain_steps where chain_id = v_chain_id;

  if v_ids is not null then
    perform public.reorder_prompt_chain_steps(v_chain_id, v_ids);
  end if;
end;
$$;

grant execute on function public.reorder_prompt_chain_steps(bigint, bigint[]) to authenticated;
grant execute on function public.delete_prompt_chain_step(bigint) to authenticated;

-- ------------------------------------------------------------
-- Storage for images uploaded when test-running a chain.
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('chain-inputs', 'chain-inputs', true)
on conflict (id) do nothing;

drop policy if exists "Public read chain inputs" on storage.objects;
create policy "Public read chain inputs" on storage.objects
  for select using (bucket_id = 'chain-inputs');

drop policy if exists "Superadmins upload chain inputs" on storage.objects;
create policy "Superadmins upload chain inputs" on storage.objects
  for insert with check (bucket_id = 'chain-inputs' and public.is_superadmin());

drop policy if exists "Superadmins delete chain inputs" on storage.objects;
create policy "Superadmins delete chain inputs" on storage.objects
  for delete using (bucket_id = 'chain-inputs' and public.is_superadmin());

-- ------------------------------------------------------------
-- Seed: step titles for the existing chains, plus the assignment's
-- example chain (image -> description -> what's funny -> 5 captions).
-- It starts switched off in the mix because it outputs five captions,
-- while CUmor posts one.
-- ------------------------------------------------------------

update prompt_chain_steps s
set title = v.title
from prompt_chains c,
  (values
    ('Classic one-liner', 1, 'Write the caption'),
    ('Brainstorm then polish', 1, 'Brainstorm three ideas'),
    ('Brainstorm then polish', 2, 'Pick and polish the best')
  ) as v(chain_name, step_order, title)
where c.id = s.chain_id
  and c.name = v.chain_name
  and s.step_order = v.step_order
  and s.title is null;

insert into prompt_chains (name, description)
values (
  'Image to five captions',
  'Describes an uploaded image, finds what is funny about it, then writes five caption options.'
)
on conflict (name) do nothing;

insert into prompt_chain_steps (chain_id, step_order, llm_model_id, title, include_image, prompt_template)
select c.id, v.step_order, m.id, v.title, v.include_image, v.template
from prompt_chains c
cross join llm_models m
cross join (values
  (1, 'Describe the image', true,
'Describe the attached image in two or three plain sentences: who or what is in it, what is happening, and the mood.
If no image is attached, describe the scene suggested by: {{input}}'),
  (2, 'Find what''s funny', false,
'Here is a description of an image:
{{previous}}

In one or two sentences, say what is funny or absurd about it from the point of view of a Columbia student.
Campus terms you can use:
{{terms}}'),
  (3, 'Write five captions', false,
'Image description:
{{step_1}}

What is funny about it:
{{previous}}

Captions our users loved:
{{examples}}

Write five short, funny captions for this image. One caption per line, no numbering, no quotes, no extra text.')
) as v(step_order, title, include_image, template)
where c.name = 'Image to five captions'
  and m.model_identifier = 'gemini-3.8-flash'
on conflict (chain_id, step_order) do nothing;
