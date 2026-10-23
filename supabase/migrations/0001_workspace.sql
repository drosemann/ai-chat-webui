-- Workspace schema for the self-hosted Supabase stack.
-- Apply once per database, then keep this file immutable and add 0002_*.sql, etc.
--
--   docker compose --env-file .env -f supabase/docker-compose.yml up -d db auth rest gateway
--   docker compose --env-file .env -f supabase/docker-compose.yml exec db \
--     psql -U postgres -d postgres -f /migrations/0001_workspace.sql

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables (every row is owned by exactly one auth user)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  default_model text,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  prefs jsonb not null default '{}'::jsonb
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  color text not null default '#8957e5',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null default 'New chat' check (char_length(title) between 1 and 200),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  model text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text not null default '',
  due date,
  status text not null default 'open' check (status in ('open', 'done')),
  needs_input boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 4000),
  include_in_chat boolean not null default true,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id, updated_at desc);
create index if not exists conversations_user_id_idx on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status, due);
create index if not exists memories_user_id_idx on public.memories (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Profile + settings bootstrap on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_name text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(requested_name, 'New member'))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_projects_updated_at on public.projects;
create trigger touch_projects_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_conversations_updated_at on public.conversations;
create trigger touch_conversations_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: no anonymous access anywhere, owners see only own rows
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.projects enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.tasks enable row level security;
alter table public.memories enable row level security;

revoke all on all tables in schema public from anon;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.memories to authenticated;

drop policy if exists "profiles_owner" on public.profiles;
create policy "profiles_owner" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "user_settings_owner" on public.user_settings;
create policy "user_settings_owner" on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects_owner" on public.projects;
create policy "projects_owner" on public.projects
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "conversations_owner" on public.conversations;
create policy "conversations_owner" on public.conversations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "messages_owner" on public.messages;
create policy "messages_owner" on public.messages
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_owner" on public.tasks;
create policy "tasks_owner" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "memories_owner" on public.memories;
create policy "memories_owner" on public.memories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
