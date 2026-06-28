# Vittal

## Final Project Documentation

### Version
1.0

### Project Type
Mobile healthcare monitoring and clinical coordination platform

### Main Repository Scope
- Mobile application built with Expo and React Native
- Backend API built with Node.js and Express
- Cloud database and authentication powered by Supabase
- Android push notifications through Expo Push Service and FCM
- Bluetooth Low Energy smartwatch integration for health data ingestion

---

## 1. Executive Summary

Vittal is a mobile health monitoring application designed to connect caregivers, doctors, and patient data in a single coordinated platform. The system allows a caregiver to register a patient, monitor key vital signs, assign a doctor, review alerts, track location data, and connect a compatible smartwatch. Doctors can access a professional clinical dashboard, review assigned patients, analyze vital trends, write medical notes, and receive role-based notifications when relevant events occur.

The project combines a modern mobile interface, a secure cloud database, a backend notification and ingestion layer, and role-specific workflows. Its purpose is to improve communication, continuity of care, and near-real-time visibility into the patient’s health condition.

Vittal is designed as a practical digital health solution for remote follow-up scenarios in which a caregiver needs daily operational tools and a doctor needs a clearer, more clinical dashboard for decision-making.

---

## 2. Problem Statement

Traditional patient follow-up often suffers from fragmentation:
- caregivers and doctors do not always share the same updated information,
- vital signs may be collected manually and inconsistently,
- alerts are difficult to track and escalate,
- patient assignment to a doctor is not always reflected immediately in the clinical interface,
- remote monitoring devices are often disconnected from the medical workflow,
- communication events between roles are not structured or auditable.

Vittal addresses this problem by centralizing:
- patient registration,
- caregiver and doctor role management,
- patient-doctor assignment,
- vital sign monitoring,
- alerts,
- clinical notes,
- location support,
- push notifications,
- smartwatch-based data ingestion.

---

## 3. Project Objectives

### 3.1 General Objective

To develop a mobile healthcare monitoring platform that improves remote patient follow-up through role-based interfaces, centralized patient information, wearable data ingestion, and real-time communication between caregivers and doctors.

### 3.2 Specific Objectives

- Provide secure authentication and differentiated access for caregivers and doctors.
- Allow caregivers to register and manage patient information.
- Enable doctors to view assigned patients through a professional clinical dashboard.
- Store and visualize patient vital signs over time.
- Generate and manage alerts with actionable states.
- Support medical note creation for doctor follow-up.
- Enable doctor assignment from the caregiver workflow.
- Implement push notifications for key cross-role events.
- Support smartwatch connection and health data synchronization.
- Provide location-related monitoring capabilities through the app.

---

## 4. Solution Overview

Vittal is composed of four main layers:

1. Mobile client
   - Built with Expo, React Native, and TypeScript.
   - Offers dedicated role-based interfaces for caregivers and doctors.

2. Backend API
   - Built with Node.js and Express.
   - Handles protected operations, push notification orchestration, device binding, and vital sign ingestion.

3. Database and authentication
   - Managed through Supabase.
   - Provides authentication, relational tables, row-level security, and real-time subscriptions.

4. Device and notification services
   - Expo Push Service for notifications.
   - Firebase Cloud Messaging as Android delivery transport.
   - Bluetooth Low Energy integration for smartwatch connection.

---

## 5. Target Users and Roles

### 5.1 Caregiver

The caregiver role is intended for the person responsible for the daily monitoring of the patient. Main responsibilities in the system include:
- completing caregiver profile information,
- registering the patient,
- reviewing the patient dashboard,
- checking alerts,
- reviewing trends,
- opening the location screen,
- connecting the smartwatch,
- selecting or changing the assigned doctor,
- receiving doctor and system notifications.

### 5.2 Doctor

The doctor role is designed for the professional who supervises patient evolution. Main responsibilities in the system include:
- completing doctor profile information,
- reviewing assigned patients,
- checking recent vital signs,
- following alerts,
- reviewing trends,
- creating clinical notes,
- receiving notifications related to patient assignments, alerts, and caregiver actions.

---

## 6. Functional Scope

The final application includes the following functional modules.

### 6.1 Authentication and Session Management

- User registration
- User login
- Session persistence
- Role-based navigation
- Active/inactive account validation
- Account deletion flow

### 6.2 Caregiver Profile and Patient Registration

- Caregiver profile creation
- Patient registration during setup
- Extended patient profile fields:
  - allergies,
  - medications,
  - emergency contact name,
  - emergency contact phone

### 6.3 Caregiver Dashboard

- Latest patient health information
- Alert summary
- Access to trends
- Access to smartwatch connection
- Access to doctor directory
- Access to location screen
- Access to notifications

### 6.4 Doctor Dashboard

- Clinical dashboard with professional presentation
- Assigned patient list
- Prioritization by active alerts
- Latest vital sign summary
- Access to trends
- Access to medical notes
- Access to notifications

### 6.5 Doctor Assignment Workflow

- Caregiver selects a doctor from the doctor directory
- Patient record is updated with:
  - `assigned_doctor_id`
  - `assignment_status`
  - `assigned_at`
- The assigned patient automatically appears in the doctor dashboard

### 6.6 Vital Sign History and Trends

- Historical consultation of patient vital signs
- Trend visualization for:
  - heart rate,
  - oxygen saturation,
  - temperature

### 6.7 Alerts

- Alert listing
- Alert states:
  - pending,
  - acknowledged,
  - resolved
- Alert follow-up actions by caregiver
- Notification to doctor when alert status changes

### 6.8 Doctor Notes

- Doctors can create notes for a patient
- Notes are stored with timestamps
- Notes can be reviewed in the doctor workflow
- Notes trigger notifications to caregivers

### 6.9 Notification System

- Push token registration
- Internal notification inbox
- Unread count badges
- Foreground notification handling
- Navigation from notification tap to the correct screen
- Role-to-role event notifications

### 6.10 Smartwatch Integration

- BLE-based smartwatch connection
- Device binding flow
- Targeted support for Hello Watch 3+
- Discovery of compatible BLE services and characteristics
- Ingestion of sensor readings through backend endpoint

### 6.11 Location Support

- Caregiver location registration
- Latest location visualization
- Patient and caregiver location references through the `locations` table

### 6.12 Account and Settings

- Profile access
- Theme handling
- Notification token refresh
- Logout
- Account deletion

---

## 7. End-to-End User Flows

### 7.1 Caregiver Flow

1. The caregiver registers or logs in.
2. The application checks whether profile setup is complete.
3. If setup is incomplete, the caregiver completes profile information.
4. The caregiver registers the patient.
5. The caregiver enters the caregiver home screen.
6. The caregiver can open:
   - dashboard,
   - trends,
   - smartwatch,
   - map,
   - doctor directory,
   - notifications,
   - account.
7. The caregiver can select a doctor from the directory.
8. The selected doctor becomes the assigned doctor of the patient.
9. The system notifies the doctor that a new patient has been assigned.
10. The caregiver continues monitoring the patient and can follow alerts and updates.

### 7.2 Doctor Flow

1. The doctor registers or logs in.
2. The application checks whether doctor profile setup is complete.
3. If setup is incomplete, the doctor completes specialty-related information.
4. Once assigned by a caregiver, the patient appears automatically in the doctor dashboard.
5. The doctor reviews recent vital signs and alert status.
6. The doctor can open trends for a specific patient.
7. The doctor can create medical notes.
8. The caregiver receives a notification that a new medical note exists.

### 7.3 Notification Flow

The notification system covers key role-based events:

- caregiver assigns doctor -> doctor receives notification,
- doctor claims or confirms patient follow-up -> caregiver receives notification,
- doctor creates note -> caregiver receives notification,
- caregiver acknowledges or resolves alert -> doctor receives notification,
- new health alert from ingested vitals -> caregiver and assigned doctor may receive notification.

### 7.4 Smartwatch Flow

1. Caregiver opens the smartwatch screen.
2. The app requests Bluetooth permissions.
3. The app creates or reuses a secure device token through the backend.
4. The app scans and connects through BLE.
5. The app discovers available services and characteristics.
6. If standard compatible characteristics are available, the app parses sensor values.
7. The app sends values to the backend ingestion endpoint.
8. The data is stored in `vital_signs`.
9. Dashboard, history, and alert logic can react to the new data.

---

## 8. System Architecture

### 8.1 High-Level Architecture

The architecture follows a layered model:

- Presentation layer
  - React Native screens and role-based navigation

- Application layer
  - Supabase client helpers
  - App event emitters
  - Notification routing
  - BLE parsing logic

- Service layer
  - Express backend
  - Protected API endpoints
  - Notification dispatching
  - Device binding and ingestion

- Data layer
  - Supabase PostgreSQL
  - Authentication
  - RLS policies
  - Real-time channels

### 8.2 Frontend Stack

- Expo SDK 54
- React 19
- React Native 0.81
- TypeScript
- React Navigation
- Supabase JavaScript client
- Expo Notifications
- Expo Location
- React Native Maps
- React Native BLE PLX
- AsyncStorage
- React Native SVG

### 8.3 Backend Stack

- Node.js
- Express
- Supabase JavaScript client
- Helmet
- CORS
- Express Rate Limit
- dotenv

### 8.4 Cloud Services

- Supabase for database, authentication, and subscriptions
- Render for backend deployment
- Expo Application Services for Android builds
- Firebase Cloud Messaging for Android push delivery

---

## 9. Frontend Architecture

### 9.1 Entry Point

The main application entry is `App.tsx`. This file is responsible for:
- checking environment configuration,
- restoring the session,
- identifying the logged-in user,
- determining whether profile setup is required,
- registering push notifications,
- attaching notification listeners,
- opening the correct navigation stack according to the user role.

### 9.2 Navigation Structure

The app uses two role-specific native stack navigators.

#### Caregiver stack
- `CaregiverHome`
- `CaregiverDashboard`
- `CaregiverMap`
- `DoctorsDirectory`
- `VitalsHistory`
- `Smartwatch`
- `Notifications`
- `Account`

#### Doctor stack
- `DoctorHome`
- `PatientSearch`
- `VitalsHistory`
- `DoctorNotes`
- `Notifications`
- `Account`

### 9.3 Design System

The interface uses a shared design system with:
- reusable tokens for spacing, typography, radius, and palette,
- role-based color identity,
- reusable UI components,
- a centralized theme provider.

This allows the caregiver interface to feel warmer and more supportive, while the doctor interface uses a more clinical and professional visual language.

### 9.4 Real-Time Behavior

The app uses Supabase channels and internal app events to refresh critical UI areas such as:
- notification badges,
- doctor dashboard patient updates,
- incoming vitals,
- incoming alerts.

---

## 10. Backend Architecture

The backend is organized as an Express application with middleware, protected routes, and healthcare-specific services.

### 10.1 Core Responsibilities

- secure API gateway for selected operations,
- Supabase session validation,
- push notification orchestration,
- device token generation and binding,
- smartwatch and device vital ingestion,
- account deletion and cleanup,
- health and version endpoints.

### 10.2 Security Features

- `helmet` for basic HTTP security headers,
- configurable `cors`,
- general request rate limiting,
- stricter authentication rate limiting,
- clinical request limiter,
- protected routes using Supabase session validation.

### 10.3 Main Notification Endpoints

- `POST /api/notifications/send`
- `POST /api/notifications/events/doctor-assigned`
- `POST /api/notifications/events/patient-claimed`
- `POST /api/notifications/events/doctor-note`
- `POST /api/notifications/events/alert-status`

### 10.4 Main Device and Ingestion Endpoints

- `POST /api/devices/bindings`
- `POST /api/ingest/vitals`

### 10.5 Utility Endpoints

- `GET /api/health`
- `GET /api/version`
- `POST /api/debug/log`
- `POST /api/account/delete`

### 10.6 Existing REST Modules

The backend also includes traditional modules for:
- authentication,
- users,
- patients,
- appointments,
- records.

These modules support broader API coverage and form part of the project backend structure.

---

## 11. Database Model

The application uses Supabase PostgreSQL. The project already assumes a base schema for the healthcare domain and extends it through migrations.

### 11.1 Core Business Entities

The platform relies on the following core domain tables:

- `users`
  - application user identity and role
- `caregivers`
  - caregiver profile data
- `doctors`
  - doctor profile data
- `patients`
  - patient identity and profile data
- `vital_signs`
  - recorded health values
- `alerts`
  - generated or tracked health alerts
- `locations`
  - geographic positions for caregiver and patient mapping
- `appointments`
  - scheduling data
- `records`
  - general medical records support

### 11.2 Migration 001: New Clinical Features

Adds or extends:
- patient allergies,
- medications,
- emergency contacts,
- alert resolution fields,
- `doctor_notes` table,
- RLS for doctor notes.

### 11.3 Migration 002: Doctor Assignment

Adds:
- `assignment_status` to patients,
- `assigned_doctor_id` to patients,
- `assigned_at` timestamp,
- indexes and constraints for assignment workflow.

### 11.4 Migration 003: Notifications and Devices

Creates:
- `push_tokens`
- `device_bindings`
- `notification_inbox`

Also enables:
- timestamps,
- indexes,
- row-level security policies.

---

## 12. Data Relationships

Main business relationships include:

- one `user` can be a caregiver or doctor depending on role,
- one `caregiver` can own one or more patients,
- one `doctor` can be assigned to one or more patients,
- one `patient` can have many vital sign records,
- one `patient` can have many alerts,
- one `patient` can have many doctor notes,
- one `user` can have one push token row,
- one `patient` can have multiple device bindings over time,
- one `user` can receive many inbox notifications.

---

## 13. Smartwatch Integration

Vittal includes BLE integration targeting:

- Device: Hello Watch 3+
- Firmware: `4.10.62_241018`
- Hardware version: `M78_V4.1`
- Target MAC address: `A6:BC:81:73:DA:0C`

### 13.1 Sensor Scope

The BLE parser is prepared to interpret standard-compatible services for:
- heart rate,
- pulse oximetry,
- temperature,
- blood pressure.

### 13.2 Smartwatch Strategy

The app:
- scans by BLE,
- attempts connection,
- inspects services and characteristics,
- parses supported standard UUIDs,
- forwards readings to the backend ingestion route.

### 13.3 Data Pipeline

1. BLE reading detected
2. App creates payload
3. App calls backend with device token
4. Backend validates device binding
5. Backend stores values in `vital_signs`
6. Alerts and dashboards can react to new values

### 13.4 Native Build Requirement

Because Bluetooth Low Energy is used through `react-native-ble-plx`, this feature requires a real Android build and cannot be evaluated properly in Expo Go.

---

## 14. Notifications Architecture

The notification system is one of the key integration points of the project.

### 14.1 Notification Components

- Expo Push Token registration on device
- `push_tokens` table in Supabase
- `notification_inbox` table for in-app history
- backend event endpoints
- Expo Push Service
- FCM transport on Android

### 14.2 Notification Categories

The current solution supports categories such as:
- `doctor_assigned`
- `patient_claimed`
- `doctor_note`
- `alert_status`
- `health_alert`
- `manual`

### 14.3 Delivery Logic

1. App obtains Expo push token.
2. App stores token in Supabase.
3. Business event occurs.
4. App or backend triggers notification endpoint.
5. Backend stores notification in inbox.
6. Backend fetches push tokens for recipient users.
7. Backend sends payload to Expo Push Service.
8. Device receives push.
9. Tapping the notification opens the correct screen.

### 14.4 Android Requirements

For real push notifications on Android, the following are required:
- `expo-notifications` configured in app,
- `google-services.json` present,
- FCM credentials uploaded to Expo/EAS,
- physical Android device,
- EAS build installed on the device.

---

## 15. Map and Location Module

The application includes a caregiver map screen that uses:
- `expo-location` to request device location,
- `react-native-maps` to render map data,
- Supabase `locations` table to persist and retrieve latest coordinates.

The module is intended to help caregivers visualize and update location-related information in the context of patient follow-up.

---

## 16. Professional Doctor Dashboard

One of the most important deliverables in the final version is the doctor interface redesign.

The doctor dashboard now includes:
- a dedicated clinical hero section,
- professional visual styling,
- assignment-based patient loading,
- summary KPI cards,
- patient prioritization by alert level,
- latest vital sign metrics,
- direct access to trends and notes,
- live updates from health and notification events.

This creates a much more appropriate clinical experience compared to a generic dashboard.

---

## 17. Security Model

The platform uses multiple layers of protection.

### 17.1 Authentication

- Supabase authentication manages mobile user sessions.
- The backend validates the Supabase bearer token before protected actions.

### 17.2 Authorization

- User role determines available navigation and features.
- Backend event routes validate whether the requester is a caregiver or doctor.

### 17.3 Row-Level Security

Supabase RLS policies protect tables such as:
- `doctor_notes`
- `push_tokens`
- `device_bindings`
- `notification_inbox`

### 17.4 Transport and API Protection

- request rate limiting,
- secure headers,
- CORS restrictions,
- device token hashing in `device_bindings`,
- optional ingest API key protection for ingestion.

---

## 18. Environment Variables

### 18.1 Mobile App Variables

The mobile app expects:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_BACKEND_URL=
EXPO_PUBLIC_EAS_PROJECT_ID=
```

These values may be provided through:
- `app.json` extra,
- local `.env`,
- EAS environment configuration.

### 18.2 Backend Variables

The backend expects:

```env
PORT=3000
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_ORIGINS=
NODE_ENV=
INGEST_API_KEY=
PUSH_ON_INGEST=true
EXPO_PUSH_ACCESS_TOKEN=
```

Additional variables may also exist depending on legacy API modules.

---

## 19. Local Installation Guide

### 19.1 Prerequisites

- Node.js 18 or newer
- npm
- Expo CLI or `npx expo`
- EAS CLI for builds
- Supabase project
- Render account for backend deployment
- Firebase project for Android push
- Android device for real push and BLE validation

### 19.2 Install Mobile App

```bash
cd vittal_expo
npm install
```

### 19.3 Install Backend

```bash
cd backend
npm install
```

### 19.4 Configure Database

Run the SQL migrations in Supabase in this order:

1. `supabase/migrations/001_vittal_new_features.sql`
2. `supabase/migrations/002_patients_assignment.sql`
3. `supabase/migrations/003_notifications_system.sql`

These migrations extend the existing healthcare schema and enable the new modules used by the final version.

### 19.5 Run Backend Locally

```bash
cd backend
npm run dev
```

### 19.6 Run Mobile App Locally

```bash
cd vittal_expo
npm start
```

For Android native behavior, BLE, and real push:

```bash
cd vittal_expo
eas build --platform android --profile preview
```

---

## 20. Deployment Guide

### 20.1 Mobile Application

The mobile client is built with Expo and distributed through EAS Build.

Recommended Android flow:
- configure Firebase,
- place `google-services.json` in the app root,
- upload FCM credentials to Expo/EAS,
- generate an Android build,
- install on a physical device.

### 20.2 Backend Deployment

The backend is intended for deployment on Render.

Deployment steps:

1. Push the latest source code to GitHub.
2. Connect Render to the GitHub repository.
3. Set environment variables in Render.
4. Redeploy the latest commit.
5. Verify health using `/api/health`.

### 20.3 Production Data Flow

In production, the expected flow is:

- mobile app authenticates with Supabase,
- mobile app communicates directly with Supabase for selected reads and writes,
- mobile app uses backend for protected event-based operations,
- backend uses Supabase service role for trusted server-side actions,
- backend sends push notifications through Expo,
- Android delivery is completed through FCM.

---

## 21. Test and Evaluation Guide

This section is designed for academic demonstration and functional validation.

### 21.1 Recommended Test Scenario 1: Caregiver Registration

1. Open the app.
2. Register as caregiver.
3. Complete caregiver and patient setup.
4. Verify that the caregiver home screen opens correctly.

Expected result:
- caregiver sees patient data and role-specific menu options.

### 21.2 Recommended Test Scenario 2: Doctor Registration

1. Register as doctor.
2. Complete doctor setup with specialty and CMP.
3. Verify that the doctor dashboard opens.

Expected result:
- doctor sees professional dashboard and patient search access.

### 21.3 Recommended Test Scenario 3: Doctor Assignment

1. Log in as caregiver.
2. Open doctor directory.
3. Select a doctor.
4. Log in as that doctor.

Expected result:
- the patient appears automatically in the doctor dashboard.

### 21.4 Recommended Test Scenario 4: Clinical Monitoring

1. Open caregiver dashboard.
2. Verify the latest vitals if records exist.
3. Open trend history.

Expected result:
- historical data is shown and trend visualization renders correctly.

### 21.5 Recommended Test Scenario 5: Doctor Notes

1. Log in as doctor.
2. Open an assigned patient.
3. Create a new note.
4. Return to caregiver side.

Expected result:
- note is stored and caregiver notification is generated.

### 21.6 Recommended Test Scenario 6: Alerts

1. Use existing alert data or ingest values that trigger alerts.
2. Open caregiver dashboard.
3. Acknowledge or resolve the alert.

Expected result:
- alert state changes and the doctor receives a follow-up notification.

### 21.7 Recommended Test Scenario 7: Notifications

1. Perform an event such as doctor assignment or note creation.
2. Check the notification badge.
3. Open the notification center.
4. Tap a notification.

Expected result:
- unread counter updates,
- notification appears in inbox,
- tapping navigates appropriately.

### 21.8 Recommended Test Scenario 8: Smartwatch

1. Install the Android build on a physical device.
2. Open the smartwatch screen.
3. Allow Bluetooth permissions.
4. Turn on the Hello Watch 3+.
5. Connect and observe readings.

Expected result:
- app connects through BLE,
- compatible data can be ingested,
- health values appear in the monitoring pipeline.

### 21.9 Recommended Test Scenario 9: Map

1. Open the caregiver map screen.
2. Grant location permission.
3. Save or refresh the current position.

Expected result:
- location data is displayed and synchronized with the `locations` table.

---

## 22. API Summary

The backend includes both legacy REST modules and the final project event-based healthcare endpoints.

### 22.1 Health and Utility

- `GET /api/health`
- `GET /api/version`
- `POST /api/debug/log`

### 22.2 Notifications

- `POST /api/notifications/send`
- `POST /api/notifications/events/doctor-assigned`
- `POST /api/notifications/events/patient-claimed`
- `POST /api/notifications/events/doctor-note`
- `POST /api/notifications/events/alert-status`

### 22.3 Devices and Vitals

- `POST /api/devices/bindings`
- `POST /api/ingest/vitals`

### 22.4 Account

- `POST /api/account/delete`

### 22.5 Additional REST Modules

- `/api/auth/*`
- `/api/users/*`
- `/api/patients/*`
- `/api/appointments/*`
- record endpoints under `/api`

---

## 23. Academic and Technical Value

This project demonstrates practical implementation of:

- mobile software engineering,
- healthcare-oriented product design,
- role-based UX,
- secure cloud authentication,
- relational database modeling,
- row-level security,
- push notification infrastructure,
- wearable device integration,
- backend API development,
- real-time data synchronization.

It also reflects multidisciplinary value because it combines:
- software architecture,
- mobile development,
- database design,
- backend engineering,
- healthcare workflow understanding,
- user-centered interface design.

---

## 24. Future Expansion Opportunities

Although the final version already delivers a complete project scope, the platform can be extended in future iterations with:

- more advanced clinical scoring,
- predictive risk stratification,
- PDF clinical reports,
- appointment reminder workflows,
- medication adherence tracking,
- richer smartwatch protocol support,
- emergency contact escalation,
- analytics dashboards,
- web admin panel,
- telemedicine integrations.

---

## 25. Conclusion

Vittal is a complete healthcare monitoring platform that connects caregivers, doctors, patient information, device data, and notifications in one integrated solution. The final project demonstrates a coherent architecture, clear role separation, real-world mobile capabilities, and a strong technical foundation suitable for academic presentation and practical evaluation.

Its most important strengths are:
- a complete caregiver-to-doctor workflow,
- a professional doctor dashboard,
- role-aware notifications,
- historical and current vital sign monitoring,
- smartwatch integration capability,
- a secure backend and cloud data model,
- a mobile-first experience designed for real usage scenarios.

As a final project, Vittal presents both technical depth and practical value. It is not only a user interface prototype, but a functional end-to-end digital health system with mobile, backend, cloud, notification, and device integration layers.

