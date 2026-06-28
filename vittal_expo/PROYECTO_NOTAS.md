# Vittal — Notas de esta actualización

Este documento resume lo que cambió en esta pasada de rediseño y funciones nuevas,
para que sepas qué tocar (y qué no) la próxima vez.

## 1. Sistema de diseño

- **`src/ui/tokens.ts`** — fuente única de verdad para spacing, radios, tipografía,
  sombras y, lo más importante, **paletas de color por rol**:
  - `caregiverPalette` — turquesa/coral, cálido y cercano.
  - `doctorPalette` — azul/índigo, clínico y profesional.
  - `neutralPalette` — gris/azulado, usado en login/registro antes de elegir rol.
- **`src/ui/theme.tsx`** — `ThemeProvider` con modo claro/oscuro/sistema (persistido
  en `AsyncStorage`) y `setRole(...)` que cambia automáticamente la paleta activa
  según el rol del usuario logueado. Se sincroniza solo desde `App.tsx`.
- **`src/ui/components/`** — librería de componentes reutilizables: `Card`, `Button`
  (5 variantes), `Badge`, `EmptyState`, `IconCircle`, `ProgressBar`, `TopBar`,
  `FormField`. Todas las pantallas se reescribieron para usar estos componentes en
  vez de estilos sueltos repetidos pantalla por pantalla.

Antes había **dos archivos de tema duplicados** (`theme.ts` y `theme.tsx`); se
unificaron en `theme.tsx` porque era inevitable para construir el sistema de
paletas por rol que pediste.

## 2. Funciones nuevas

| Función | Dónde vive | Notas |
|---|---|---|
| Tendencias de vitales (gráfico de líneas) | `VitalsHistoryScreen.tsx` + `VitalsTrendChart.tsx` | Usa `react-native-svg`. Accesible desde ambos roles. |
| Notas médicas del doctor | `DoctorNotesScreen.tsx` | Tabla nueva `doctor_notes`, CRUD simple (crear/leer/borrar). |
| Alertas accionables | `CaregiverDashboardScreen.tsx` | Estados `pending → acknowledged → resolved`, con badges de severidad y botones para marcar atendida/resuelta. |
| Perfil de paciente extendido | `ProfileSetupScreen.tsx` | Alergias, medicamentos y contacto de emergencia, además de lo que ya existía. |

## 3. Migración de base de datos (Supabase) — **acción requerida**

Antes de probar las funciones nuevas, corre el SQL en:

```
supabase/migrations/001_vittal_new_features.sql
```

Esto agrega:
- Columnas `allergies`, `medications`, `emergency_contact_name`,
  `emergency_contact_phone` a `patients`.
- Columnas `resolved_at`, `resolved_by`, `resolution_note` a `alerts`.
- Tabla nueva `doctor_notes` con RLS (el doctor dueño puede todo; el cuidador del
  paciente solo puede leer).

Pégalo en el SQL Editor de tu proyecto Supabase y ejecútalo una vez.

## 4. Dependencias nuevas

Se agregó `react-native-svg` a `package.json` (necesaria para el gráfico de
tendencias). Como no había acceso a red en el entorno donde se hizo este trabajo,
**`package-lock.json` se eliminó** para evitar que quede desincronizado — se
regenera solo la próxima vez que corras `npm install`.

```bash
cd vittal_expo
npm install
npx expo install --fix   # alinea versiones nativas con tu SDK de Expo
```

## 5. Lo que NO se tocó (a propósito)

Por pedido explícito, esta pasada se enfocó solo en diseño y funciones nuevas.
Quedan pendientes para una próxima ronda, si quieres abordarlos:

- Credenciales de Supabase hardcodeadas en `app.json` (deberían ir a variables de
  entorno / secrets de EAS, no al control de versiones).
- Manejo de errores más robusto en llamadas a Supabase que hoy fallan en silencio.
- El `backend/` (Express) no se tocó; las funciones nuevas se implementaron
  directo contra Supabase desde el cliente.
