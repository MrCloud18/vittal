# Integracion Hello Watch 3+

Esta app quedo preparada para intentar conexion BLE directa con este reloj:

- Modelo: `Hello Watch 3+`
- Firmware: `4.10.62_241018`
- MAC objetivo: `A6:BC:81:73:DA:0C`
- Hardware: `M78_V4.1`

## Lo que hace ahora

- Agrega una pantalla `Reloj` para el cuidador.
- Busca el reloj por MAC y tambien por nombre si el anuncio BLE no expone esa MAC.
- Se conecta por BLE.
- Descubre servicios y caracteristicas.
- Si encuentra servicios BLE estandar, intenta leer:
  - Frecuencia cardiaca
  - Oxigeno
  - Temperatura
  - Presion arterial
- Reutiliza el backend existente para guardar las lecturas en:
  - `POST /api/ingest/vitals`
- Reutiliza `device_bindings` para generar y guardar el `x-device-token`.

## Importante

`react-native-ble-plx` no funciona en Expo Go. Esta integracion requiere build nativo.

## Como probar en Android

```bash
cd vittal_expo
npx expo prebuild
npx expo run:android
```

Luego:

1. Inicia sesion como cuidador.
2. Entra a `Reloj` o `Conectar Hello Watch 3+`.
3. Acepta permisos Bluetooth.
4. Enciende el reloj y dejalo visible por BLE.
5. Verifica si aparecen lecturas y si llegan al dashboard/historial.

## Limitacion actual

Muchos relojes como Hello Watch exponen sensores con UUIDs propietarios, no documentados publicamente.

Si la pantalla muestra que se conecto pero no detecto sensores compatibles, el siguiente paso es capturar los UUIDs reales publicados por el dispositivo en una prueba fisica y mapearlos en:

- `src/lib/helloWatch.ts`
- `src/screens/SmartwatchScreen.tsx`

## Archivos principales

- `src/screens/SmartwatchScreen.tsx`
- `src/lib/helloWatch.ts`
- `src/screens/CaregiverHomeScreen.tsx`
- `src/screens/CaregiverDashboardScreen.tsx`
- `App.tsx`
