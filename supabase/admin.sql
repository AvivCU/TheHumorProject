-- ============================================================
-- Admin area support: superadmin flag + RLS for the admin app
-- ============================================================

alter table profiles
  add column if not exists is_superadmin boolean not null default false;

-- SECURITY DEFINER helper: lets RLS policies check "is the current
-- user a superadmin" without the policy querying profiles directly
-- (which would recurse against itself on the profiles table).
create or replace function public.is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_superadmin from profiles where id = auth.uid()),
    false
  );
$$;

-- Additive policies -- these sit alongside the existing "own row
-- only" policies from assignment 3/4 (Postgres OR's multiple
-- permissive policies together), so regular users keep exactly the
-- same restricted access and superadmins additionally get full
-- visibility/control.

drop policy if exists "Superadmins read all profiles" on profiles;
create policy "Superadmins read all profiles" on profiles
  for select
  using (public.is_superadmin());

drop policy if exists "Superadmins manage generations" on generations;
create policy "Superadmins manage generations" on generations
  for all
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "Superadmins read all votes" on votes;
create policy "Superadmins read all votes" on votes
  for select
  using (public.is_superadmin());

-- Bootstrap: is_superadmin defaults to false for everyone, including
-- you, so the admin app's own login wall would lock you out of ever
-- promoting the first admin through the app itself. The fix is to use
-- the access you already have outside the app: this SQL editor runs
-- with full database privileges and isn't subject to RLS at all, so
-- it can set the flag directly. Run this once, with your own user id
-- (find it in Authentication -> Users in the Supabase dashboard, or
-- via `select id, email from auth.users;` below):

-- select id, email from auth.users;
-- update profiles set is_superadmin = true where id = '<your-user-id>';
