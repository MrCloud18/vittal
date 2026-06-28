import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';

import App from './App';
import { backendUrl } from './src/lib/supabase';

function postDebug(payload: Record<string, unknown>) {
  const base = backendUrl;
  if (!base) return;
  const url = `${base.replace(/\/$/, '')}/api/debug/log`;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

const errorUtils = (global as any).ErrorUtils;
const prevHandler = errorUtils?.getGlobalHandler?.();
errorUtils?.setGlobalHandler?.((err: any, isFatal?: boolean) => {
  postDebug({
    event: 'global_error',
    isFatal: Boolean(isFatal),
    message: String(err?.message ?? err),
    stack: String(err?.stack ?? ''),
    at: new Date().toISOString(),
    platform: 'react-native',
  });
  if (typeof prevHandler === 'function') prevHandler(err, isFatal);
});

const p = globalThis as any;
if (p?.process?.on) {
  p.process.on('unhandledRejection', (reason: any) => {
    postDebug({
      event: 'unhandled_rejection',
      message: String(reason?.message ?? reason),
      stack: String(reason?.stack ?? ''),
      at: new Date().toISOString(),
      platform: 'react-native',
    });
  });
}

registerRootComponent(App);
