-- Migración Vittal: funciones nuevas (historial de vitales, notas médicas,
-- alertas accionables, perfil de paciente extendido).
-- Ejecutar en el SQL editor de Supabase del proyecto.

-- 1) Perfil de paciente extendido ------------------------------------------------
alter table public.patients
  add column if not exists allergies jsonb default '[]'::jsonb,
  add column if not exists medications jsonb default '[]'::jsonb,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

-- 2) Alertas accionables: estado "atendida" + datos de resolución --------------
-- Nota: si `status` ya es texto libre, esto solo agrega columnas nuevas.
alter table public.alerts
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.users(id),
  add column if not exists resolution_note text;

-- Si quieres restringir los valores válidos de status, descomenta:
-- alter table public.alerts
--   add constraint alerts_status_check check (status in ('pending','acknowledged','resolved'));

-- 3) Notas médicas del doctor sobre el paciente ---------------------------------
create table if not exists public.doctor_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists doctor_notes_patient_id_idx on public.doctor_notes(patient_id);
create index if not exists doctor_notes_doctor_id_idx on public.doctor_notes(doctor_id);

-- Mantener updated_at al día en cada edición
create or replace function public.set_doctor_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists doctor_notes_set_updated_at on public.doctor_notes;
create trigger doctor_notes_set_updated_at
  before update on public.doctor_notes
  for each row
  execute function public.set_doctor_notes_updated_at();

-- 4) Row Level Security para doctor_notes ---------------------------------------
alter table public.doctor_notes enable row level security;

-- El doctor dueño de la nota puede leer/crear/editar/borrar sus propias notas.
drop policy if exists "doctor_notes_owner_all" on public.doctor_notes;
create policy "doctor_notes_owner_all"
  on public.doctor_notes
  for all
  using (
    doctor_id in (
      select id from public.doctors where user_id = auth.uid()
    )
  )
  with check (
    doctor_id in (
      select id from public.doctors where user_id = auth.uid()
    )
  );

-- El cuidador del paciente puede leer (no editar) las notas de su paciente,
-- útil si en el futuro quieres mostrárselas en la app de cuidador.
drop policy if exists "doctor_notes_caregiver_read" on public.doctor_notes;
create policy "doctor_notes_caregiver_read"
  on public.doctor_notes
  for select
  using (
    patient_id in (
      select p.id
      from public.patients p
      join public.caregivers c on c.id = p.caregiver_id
      where c.user_id = auth.uid()
    )
  );
