-- Grant superadmin automatically to approved staff (TAs/PMs) the first
-- time they sign in, so nobody has to wait for them and then run an
-- UPDATE by hand. Add addresses to preapproved_superadmins to approve more.

create table if not exists preapproved_superadmins (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

-- RLS on with no policies: only the SQL Editor and the trigger below can use it.
alter table preapproved_superadmins enable row level security;

insert into preapproved_superadmins (email) values ('gcn2106@columbia.edu')
on conflict (email) do nothing;

create or replace function public.grant_preapproved_superadmin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from auth.users u
    join preapproved_superadmins p on p.email = lower(u.email)
    where u.id = new.id
  ) then
    new.is_superadmin := true;
  end if;
  return new;
end;
$$;

drop trigger if exists grant_preapproved_superadmin on profiles;
create trigger grant_preapproved_superadmin
  before insert on profiles
  for each row execute function public.grant_preapproved_superadmin();

-- Covers anyone on the list who already signed in before this ran.
update profiles p
set is_superadmin = true
from auth.users u
join preapproved_superadmins a on a.email = lower(u.email)
where u.id = p.id and not p.is_superadmin;
