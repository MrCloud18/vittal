# Debug Session: notifications-assignment-map

Status: OPEN

## Symptoms

- Push notifications arrive to the device, but the visible foreground heads-up/banner behavior is inconsistent.
- A doctor receives the assignment notification, but the assigned patient does not appear in the doctor dashboard list.
- Opening the map screen closes the app.

## Hypotheses

1. The doctor dashboard client query is correct, but Supabase RLS blocks doctors from reading `patients`, `vital_signs`, or `alerts` rows tied to assigned patients.
2. Foreground push is delivered, but permissions/channel initialization is happening too late or from an inconsistent config source, preventing heads-up behavior in active app sessions.
3. The map crash is caused by unsafe `MapView` mounting with `PROVIDER_GOOGLE` or invalid coordinates before the screen validates available location data.
4. Role-based data access policies added in recent migrations use the wrong identity bridge (`auth.uid()` vs `users.id`), which breaks doctor-side reads while backend service-role notifications still succeed.
5. The app has multiple backend/env resolution paths, causing some notification and device flows to work while others silently miss runtime config.

## Evidence Collected

- `SmartwatchScreen` and other screens had inconsistent backend URL resolution.
- `DoctorHomeScreen` reads assigned patients directly from Supabase client using `assigned_doctor_id = doctor.id`.
- Notification backend uses service-role reads, so it can see assignments even if the mobile client cannot.
- Current visible migrations include no doctor-read policy for `patients`, and one existing doctor-notes policy appears to use the wrong identity reference.
- `CaregiverMapScreen` mounts `MapView` with `PROVIDER_GOOGLE` immediately and does not validate coordinates before mounting markers.

## Plan

1. Harden notification permission and foreground display flow.
2. Add/repair Supabase policies for doctor-side reads of assigned patient data.
3. Harden the map screen against provider and coordinate issues.
4. Validate with TypeScript and diagnostics.
