-- Sistema de notificaciones push e inbox interno.
-- Ejecutar despues de las migraciones previas.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  expo_push_token text not null,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_user_unique unique (user_id)
);

create unique index if not exists push_tokens_token_unique on public.push_tokens(expo_push_token);

create table if not exists public.device_bindings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  token_hash text not null unique,
  device_name text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index if not exists device_bindings_patient_id_idx on public.device_bindings(patient_id);
create index if not exists device_bindings_created_by_user_id_idx on public.device_bindings(created_by_user_id);

create table if not exists public.notification_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  category text,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_inbox_user_id_idx on public.notification_inbox(user_id, created_at desc);
create index if not exists notification_inbox_unread_idx on public.notification_inbox(user_id, read_at);

create or replace function public.set_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row
  execute function public.set_push_tokens_updated_at();

alter table public.push_tokens enable row level security;
alter table public.device_bindings enable row level security;
alter table public.notification_inbox enable row level security;

drop policy if exists "push_tokens_owner_all" on public.push_tokens;
create policy "push_tokens_owner_all"
  on public.push_tokens
  for all
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  )
  with check (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

drop policy if exists "device_bindings_caregiver_read" on public.device_bindings;
create policy "device_bindings_caregiver_read"
  on public.device_bindings
  for select
  using (
    patient_id in (
      select p.id
      from public.patients p
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  );

drop policy if exists "notification_inbox_owner_read" on public.notification_inbox;
create policy "notification_inbox_owner_read"
  on public.notification_inbox
  for select
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

drop policy if exists "notification_inbox_owner_update" on public.notification_inbox;
create policy "notification_inbox_owner_update"
  on public.notification_inbox
  for update
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  )
  with check (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );
