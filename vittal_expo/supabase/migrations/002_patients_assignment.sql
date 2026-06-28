alter table public.patients
  add column if not exists assignment_status text;

alter table public.patients
  add column if not exists assigned_doctor_id uuid;

alter table public.patients
  add column if not exists assigned_at timestamptz;

update public.patients
set assignment_status = 'available'
where assignment_status is null;

alter table public.patients
  alter column assignment_status set default 'available';

do $$
begin
  alter table public.patients
    add constraint patients_assignment_status_check
    check (assignment_status in ('available', 'assigned'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.patients
    add constraint patients_assigned_doctor_id_fkey
    foreign key (assigned_doctor_id) references public.doctors(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists patients_assignment_status_idx
  on public.patients (assignment_status);

create index if not exists patients_assigned_doctor_id_idx
  on public.patients (assigned_doctor_id);
