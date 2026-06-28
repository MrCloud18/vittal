-- Corrige acceso de lectura para doctor/cuidador sobre pacientes asignados,
-- signos vitales, alertas, notas y ubicaciones relacionadas.
-- Ejecutar despues de 001, 002 y 003.

drop policy if exists "patients_doctor_assigned_read" on public.patients;
create policy "patients_doctor_assigned_read"
  on public.patients
  for select
  using (
    assigned_doctor_id in (
      select d.id
      from public.doctors d
      join public.users u on u.id = d.user_id
      where u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "vital_signs_doctor_assigned_read" on public.vital_signs;
create policy "vital_signs_doctor_assigned_read"
  on public.vital_signs
  for select
  using (
    patient_id in (
      select p.id
      from public.patients p
      join public.doctors d on d.id = p.assigned_doctor_id
      join public.users u on u.id = d.user_id
      where u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "alerts_doctor_assigned_read" on public.alerts;
create policy "alerts_doctor_assigned_read"
  on public.alerts
  for select
  using (
    patient_id in (
      select p.id
      from public.patients p
      join public.doctors d on d.id = p.assigned_doctor_id
      join public.users u on u.id = d.user_id
      where u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "locations_caregiver_related_read" on public.locations;
create policy "locations_caregiver_related_read"
  on public.locations
  for select
  using (
    caregiver_id in (
      select c.id
      from public.caregivers c
      join public.users u on u.id = c.user_id
      where u.auth_user_id = auth.uid()
    )
    or patient_id in (
      select p.id
      from public.patients p
      join public.caregivers c on c.id = p.caregiver_id
      join public.users u on u.id = c.user_id
      where u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "locations_caregiver_insert_own" on public.locations;
create policy "locations_caregiver_insert_own"
  on public.locations
  for insert
  with check (
    caregiver_id in (
      select c.id
      from public.caregivers c
      join public.users u on u.id = c.user_id
      where u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "doctor_notes_owner_all" on public.doctor_notes;
create policy "doctor_notes_owner_all"
  on public.doctor_notes
  for all
  using (
    doctor_id in (
      select d.id
      from public.doctors d
      join public.users u on u.id = d.user_id
      where u.auth_user_id = auth.uid()
    )
  )
  with check (
    doctor_id in (
      select d.id
      from public.doctors d
      join public.users u on u.id = d.user_id
      where u.auth_user_id = auth.uid()
    )
  );

drop policy if exists "doctor_notes_caregiver_read" on public.doctor_notes;
create policy "doctor_notes_caregiver_read"
  on public.doctor_notes
  for select
  using (
    patient_id in (
      select p.id
      from public.patients p
      join public.caregivers c on c.id = p.caregiver_id
      join public.users u on u.id = c.user_id
      where u.auth_user_id = auth.uid()
    )
  );
