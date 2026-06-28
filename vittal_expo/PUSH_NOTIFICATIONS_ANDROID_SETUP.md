# Push Notifications Android

Esta app ya queda preparada en codigo para usar `expo-notifications` con Expo Push y FCM como transporte en Android.

## Pendiente fuera del codigo

1. Crea o usa un proyecto en Firebase.
2. Registra la app Android con el package `com.santiagoym.vittal_expo`.
3. Descarga `google-services.json`.
4. Copia ese archivo en la raiz de `vittal_expo/`:

```text
d:\Vittal_rediseñado\vittal_expo\google-services.json
```

5. Sube las credenciales FCM a EAS:

```bash
cd d:\Vittal_rediseñado\vittal_expo
eas credentials
```

6. Genera una build real para Android:

```bash
cd d:\Vittal_rediseñado\vittal_expo
eas build --platform android --profile development
```

## Importante

- Las push remotas no se validan bien en Expo Go para Android. Usa una build EAS instalada en un dispositivo fisico.
- Si `google-services.json` no existe, la build de Android fallara porque `app.json` ya lo referencia.
- El backend actual ya envia notificaciones por Expo Push. No hace falta migrarlo a Firebase SDK directo.

## Revisiones del backend

Verifica en Render:

- `PUSH_ON_INGEST=true` si quieres push automaticas cuando entren alertas.
- `SUPABASE_URL` configurada.
- `SUPABASE_SERVICE_ROLE_KEY` configurada.
- `EXPO_PUSH_ACCESS_TOKEN` opcional pero recomendado.

## Flujo esperado

1. La app pide permisos.
2. La app obtiene un `ExpoPushToken`.
3. La app guarda el token en `push_tokens`.
4. El backend envia a `https://exp.host/--/api/v2/push/send`.
5. Expo enruta la push hacia FCM en Android.
