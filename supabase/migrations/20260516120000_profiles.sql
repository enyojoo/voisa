-- Optional app profile per auth user (extends auth.users).
-- Run via Supabase CLI (`supabase db push`) or paste into SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text,
  -- Last-used translator prefs (sync from app when you want server-side defaults)
  preferences jsonb not null default '{}'::jsonb
);

comment on table public.profiles is 'Voisa user profile and optional client preferences.';

create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- Users can insert their own row (if trigger ever skipped)
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

-- Users can update their own profile
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Backfill profiles for users created before this migration
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
