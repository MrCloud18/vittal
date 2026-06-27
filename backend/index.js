require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const authRoutes = require('./routes/authRoutes');
const patientRoutes = require('./routes/patientRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes');
const recordRoutes = require('./routes/recordRoutes');
const userRoutes = require('./routes/userRoutes');
const authMiddleware = require('./middlewares/authMiddleware');
const clinicalLimiter = require('./middlewares/clinicalLimiter');

const app = express();

// Middlewares
app.use(helmet());
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const isDev = (process.env.NODE_ENV || '').toLowerCase() !== 'production';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    if (isDev) {
      try {
        const url = new URL(origin);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
          return callback(null, true);
        }
      } catch (_) {}
    }

    return callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json());

function isEnvFlagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const disableAllRateLimits = isEnvFlagEnabled(process.env.DISABLE_ALL_RATE_LIMITS);

// Maintenance Mode
app.use('/api', (req, res, next) => {
  if (process.env.MAINTENANCE_MODE === 'true') {
    return res.status(503).json({
      status: 503,
      error: 'Service Unavailable',
      message: 'Vittal is under maintenance. Come back soon.',
      timestamp: new Date().toISOString()
    });
  }
  next();
});

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.GENERAL_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.GENERAL_RATE_LIMIT_MAX, 100),
  message: {
    status: 429,
    message: "Too many requests, please try again later."
  }
});
if (!disableAllRateLimits) {
  app.use('/api/', generalLimiter);
}

// Auth Rate Limiter (Stricter)
const authLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  max: parsePositiveInt(process.env.AUTH_RATE_LIMIT_MAX, 5),
  message: {
    status: 429,
    message: "Too many authentication attempts, please try again later."
  }
});

// Routes
const authRateLimitMiddleware = disableAllRateLimits ? (req, res, next) => next() : authLimiter;
app.use('/api/auth', authRateLimitMiddleware, authRoutes);
app.get('/api/version', (req, res) => {
  res.status(200).json({
    status: 'success',
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString()
  });
});
app.use('/api/users', authMiddleware, clinicalLimiter, userRoutes);
app.use('/api/patients', authMiddleware, clinicalLimiter, patientRoutes);
app.use('/api/appointments', authMiddleware, clinicalLimiter, appointmentRoutes);
app.use('/api', recordRoutes);

const ingestLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.INGEST_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  max: parsePositiveInt(process.env.INGEST_RATE_LIMIT_MAX, 120),
  message: {
    status: 429,
    message: 'Too many ingest requests, please try again later.',
  },
});

const debugLogLimiter = rateLimit({
  windowMs: parsePositiveInt(process.env.DEBUG_LOG_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  max: parsePositiveInt(process.env.DEBUG_LOG_RATE_LIMIT_MAX, 30),
  message: { status: 429, message: 'Too many debug logs.' },
});

app.post('/api/debug/log', disableAllRateLimits ? (req, res, next) => next() : debugLogLimiter, (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const line = JSON.stringify({
    at: new Date().toISOString(),
    kind: 'client_debug',
    ip: req.ip,
    ua: req.headers['user-agent'] || null,
    body,
  });
  try {
    process.stdout.write(`${line}\n`);
  } catch (_) {}
  res.status(204).end();
});

function getSupabaseAnon() {
  const url = process.env.SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchPushTokens(admin, userIds) {
  const uniqueUserIds = Array.from(new Set((userIds || []).filter(Boolean)));
  if (uniqueUserIds.length === 0) return [];
  const { data, error } = await admin.from('push_tokens').select('user_id, expo_push_token').in('user_id', uniqueUserIds);
  if (error) throw new Error(error.message);
  return (data || []).filter((row) => row.expo_push_token);
}

async function sendExpoPushMessages(messages) {
  if (!messages.length) return null;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.EXPO_PUSH_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_PUSH_ACCESS_TOKEN}`;
  }
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(messages),
  });
  return response.json().catch(() => null);
}

async function sendNotificationToUsers(
  admin,
  {
    userIds,
    title,
    body,
    category = 'manual',
    data = {},
    patientId = null,
    actorUserId = null,
  },
) {
  const recipientUserIds = Array.from(new Set((userIds || []).filter(Boolean)));
  if (recipientUserIds.length === 0) {
    return { sent: 0, stored: 0, expo: null };
  }

  const payload = data && typeof data === 'object' ? data : {};
  const inboxRows = recipientUserIds.map((userId) => ({
    user_id: userId,
    patient_id: patientId,
    actor_user_id: actorUserId,
    category,
    title: String(title),
    body: String(body),
    data: payload,
  }));

  const { data: storedRows, error: inboxError } = await admin
    .from('notification_inbox')
    .insert(inboxRows)
    .select('id, user_id');
  if (inboxError) throw new Error(inboxError.message);

  const tokensRows = await fetchPushTokens(admin, recipientUserIds);
  const tokenMap = new Map(tokensRows.map((row) => [row.user_id, row.expo_push_token]));
  const messages = (storedRows || [])
    .map((row) => {
      const to = tokenMap.get(row.user_id);
      if (!to) return null;
      return {
        to,
        title: String(title),
        body: String(body),
        data: {
          ...payload,
          category,
          notificationId: row.id,
          patientId: patientId || payload.patientId || null,
          patientName: payload.patientName || null,
        },
        sound: 'default',
        priority: 'high',
        channelId: 'default',
      };
    })
    .filter(Boolean);

  const expo = await sendExpoPushMessages(messages);
  return { sent: messages.length, stored: (storedRows || []).length, expo };
}

async function getPatientContext(admin, patientId) {
  const { data: patient, error } = await admin
    .from('patients')
    .select('id, full_name, caregiver_id, assigned_doctor_id')
    .eq('id', patientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!patient?.id) return null;

  let caregiverUserId = null;
  let doctorUserId = null;

  if (patient.caregiver_id) {
    const { data: caregiver, error: caregiverError } = await admin
      .from('caregivers')
      .select('user_id')
      .eq('id', patient.caregiver_id)
      .maybeSingle();
    if (caregiverError) throw new Error(caregiverError.message);
    caregiverUserId = caregiver?.user_id || null;
  }

  if (patient.assigned_doctor_id) {
    const { data: doctor, error: doctorError } = await admin
      .from('doctors')
      .select('id, user_id')
      .eq('id', patient.assigned_doctor_id)
      .maybeSingle();
    if (doctorError) throw new Error(doctorError.message);
    doctorUserId = doctor?.user_id || null;
  }

  return { patient, caregiverUserId, doctorUserId };
}

async function supabaseAuth(req, res, next) {
  try {
    const anon = getSupabaseAnon();
    const admin = getSupabaseAdmin();
    if (!anon || !admin) {
      return res.status(500).json({ status: 500, message: 'Supabase env not configured (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)' });
    }

    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ status: 401, message: 'Missing Authorization Bearer token' });
    }

    const { data, error } = await anon.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ status: 401, message: 'Invalid Supabase session' });
    }

    req.supabaseUser = data.user;

    const { data: appUser, error: appUserErr } = await admin
      .from('users')
      .select('id, role, is_active, auth_user_id')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();
    if (appUserErr) {
      return res.status(500).json({ status: 500, message: appUserErr.message });
    }
    if (appUser?.is_active === false) {
      return res.status(403).json({ status: 403, message: 'Account is inactive' });
    }
    req.appUser = appUser || null;
    next();
  } catch (e) {
    next(e);
  }
}

app.post('/api/account/delete', clinicalLimiter, supabaseAuth, async (req, res, next) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ status: 500, message: 'Supabase admin not configured' });

    const authUserId = req.supabaseUser?.id || null;
    if (!authUserId) return res.status(401).json({ status: 401, message: 'Unauthorized' });

    const appUser = req.appUser;
    const role = (appUser?.role || '').toString().toLowerCase();

    if (role === 'caregiver' && appUser?.id) {
      const { data: caregiver } = await admin.from('caregivers').select('id').eq('user_id', appUser.id).maybeSingle();
      if (caregiver?.id) {
        await admin.from('patients').delete().eq('caregiver_id', caregiver.id);
      }
    }

    if (role === 'doctor' && appUser?.id) {
      const { data: doctor } = await admin.from('doctors').select('id').eq('user_id', appUser.id).maybeSingle();
      if (doctor?.id) {
        await admin.from('patients').update({ assigned_doctor_id: null, assignment_status: 'available', assigned_at: null }).eq('assigned_doctor_id', doctor.id);
        await admin.from('appointments').update({ doctor_id: null }).eq('doctor_id', doctor.id);
      }
    }

    if (appUser?.id) {
      await admin.from('push_tokens').delete().eq('user_id', appUser.id);
      await admin.from('device_bindings').delete().eq('created_by_user_id', appUser.id);
      await admin.from('users').delete().eq('id', appUser.id);
    }

    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) return res.status(500).json({ status: 500, message: error.message });

    res.status(200).json({ success: true, statusCode: 200, message: 'Account deleted', timestamp: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

app.post('/api/notifications/send', clinicalLimiter, supabaseAuth, async (req, res, next) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ status: 500, message: 'Supabase admin not configured' });

    const { toUserId, toUserIds, title, body, data, category, patientId } = req.body || {};
    if (!toUserId || !title || !body) {
      if ((!Array.isArray(toUserIds) || toUserIds.length === 0) || !title || !body) {
        return res.status(400).json({ status: 400, message: 'Missing required fields: title, body and at least one recipient' });
      }
    }
    const recipients = Array.isArray(toUserIds) ? toUserIds : [toUserId];
    const result = await sendNotificationToUsers(admin, {
      userIds: recipients,
      title,
      body,
      category: category || 'manual',
      data: data && typeof data === 'object' ? data : {},
      patientId: patientId ? String(patientId) : null,
      actorUserId: req.appUser?.id || null,
    });

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Push requested',
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/notifications/events/doctor-assigned', clinicalLimiter, supabaseAuth, async (req, res, next) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ status: 500, message: 'Supabase admin not configured' });
    if ((req.appUser?.role || '').toLowerCase() !== 'caregiver') {
      return res.status(403).json({ status: 403, message: 'Only caregivers can notify doctor assignments' });
    }

    const { patientId, doctorId } = req.body || {};
    if (!patientId || !doctorId) {
      return res.status(400).json({ status: 400, message: 'Missing patientId or doctorId' });
    }

    const context = await getPatientContext(admin, String(patientId));
    if (!context?.patient?.id) return res.status(404).json({ status: 404, message: 'Patient not found' });
    if (context.patient.assigned_doctor_id !== String(doctorId)) {
      return res.status(409).json({ status: 409, message: 'The patient is not assigned to that doctor' });
    }
    if (!context.doctorUserId) {
      return res.status(404).json({ status: 404, message: 'Assigned doctor user not found' });
    }

    const result = await sendNotificationToUsers(admin, {
      userIds: [context.doctorUserId],
      title: 'Nuevo paciente asignado',
      body: `${context.patient.full_name} fue asignado a tu panel clínico.`,
      category: 'doctor_assigned',
      patientId: context.patient.id,
      actorUserId: req.appUser.id,
      data: {
        patientId: context.patient.id,
        patientName: context.patient.full_name,
      },
    });

    res.status(200).json({ success: true, statusCode: 200, data: result, timestamp: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

app.post('/api/notifications/events/patient-claimed', clinicalLimiter, supabaseAuth, async (req, res, next) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ status: 500, message: 'Supabase admin not configured' });
    if ((req.appUser?.role || '').toLowerCase() !== 'doctor') {
      return res.status(403).json({ status: 403, message: 'Only doctors can notify patient claims' });
    }

    const { patientId } = req.body || {};
    if (!patientId) return res.status(400).json({ status: 400, message: 'Missing patientId' });

    const context = await getPatientContext(admin, String(patientId));
    if (!context?.patient?.id) return res.status(404).json({ status: 404, message: 'Patient not found' });
    if (!context.caregiverUserId) return res.status(404).json({ status: 404, message: 'Caregiver user not found' });

    const result = await sendNotificationToUsers(admin, {
      userIds: [context.caregiverUserId],
      title: 'Tu paciente ya tiene médico',
      body: `El doctor ya puede revisar la información de ${context.patient.full_name}.`,
      category: 'patient_claimed',
      patientId: context.patient.id,
      actorUserId: req.appUser.id,
      data: {
        patientId: context.patient.id,
        patientName: context.patient.full_name,
      },
    });

    res.status(200).json({ success: true, statusCode: 200, data: result, timestamp: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

app.post('/api/notifications/events/doctor-note', clinicalLimiter, supabaseAuth, async (req, res, next) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ status: 500, message: 'Supabase admin not configured' });
    if ((req.appUser?.role || '').toLowerCase() !== 'doctor') {
      return res.status(403).json({ status: 403, message: 'Only doctors can notify new notes' });
    }

    const { patientId } = req.body || {};
    if (!patientId) return res.status(400).json({ status: 400, message: 'Missing patientId' });

    const context = await getPatientContext(admin, String(patientId));
    if (!context?.patient?.id) return res.status(404).json({ status: 404, message: 'Patient not found' });
    if (!context.caregiverUserId) return res.status(404).json({ status: 404, message: 'Caregiver user not found' });

    const result = await sendNotificationToUsers(admin, {
      userIds: [context.caregiverUserId],
      title: 'Nueva nota médica',
      body: `Se agregó una nueva nota clínica para ${context.patient.full_name}.`,
      category: 'doctor_note',
      patientId: context.patient.id,
      actorUserId: req.appUser.id,
      data: {
        patientId: context.patient.id,
        patientName: context.patient.full_name,
      },
    });

    res.status(200).json({ success: true, statusCode: 200, data: result, timestamp: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

app.post('/api/notifications/events/alert-status', clinicalLimiter, supabaseAuth, async (req, res, next) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ status: 500, message: 'Supabase admin not configured' });
    if ((req.appUser?.role || '').toLowerCase() !== 'caregiver') {
      return res.status(403).json({ status: 403, message: 'Only caregivers can notify alert follow-up' });
    }

    const { alertId, action } = req.body || {};
    if (!alertId || !action) return res.status(400).json({ status: 400, message: 'Missing alertId or action' });

    const { data: alertRow, error: alertError } = await admin
      .from('alerts')
      .select('id, patient_id, message')
      .eq('id', String(alertId))
      .maybeSingle();
    if (alertError) return res.status(500).json({ status: 500, message: alertError.message });
    if (!alertRow?.id) return res.status(404).json({ status: 404, message: 'Alert not found' });

    const context = await getPatientContext(admin, alertRow.patient_id);
    if (!context?.patient?.id) return res.status(404).json({ status: 404, message: 'Patient not found' });
    if (!context.doctorUserId) return res.status(404).json({ status: 404, message: 'Assigned doctor user not found' });

    const verb = String(action) === 'resolved' ? 'resolvió' : 'marcó como atendida';
    const result = await sendNotificationToUsers(admin, {
      userIds: [context.doctorUserId],
      title: 'Seguimiento de alerta',
      body: `El cuidador ${verb} una alerta de ${context.patient.full_name}.`,
      category: 'alert_status',
      patientId: context.patient.id,
      actorUserId: req.appUser.id,
      data: {
        patientId: context.patient.id,
        patientName: context.patient.full_name,
        alertId: alertRow.id,
        action: String(action),
        message: alertRow.message,
      },
    });

    res.status(200).json({ success: true, statusCode: 200, data: result, timestamp: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

app.post('/api/ingest/vitals', disableAllRateLimits ? (req, res, next) => next() : ingestLimiter, async (req, res, next) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ status: 500, message: 'Supabase admin not configured' });

    const deviceToken = String(req.headers['x-device-token'] || '').trim();
    const headerKey = String(req.headers['x-ingest-key'] || '').trim();
    const expectedKey = String(process.env.INGEST_API_KEY || '').trim();
    const hasIngestKey = expectedKey && headerKey === expectedKey;

    if (!deviceToken && !hasIngestKey) {
      return res.status(401).json({ status: 401, message: 'Unauthorized' });
    }

    const { patientId, patientDni, heartRate, oxygenLevel, temperature, bloodPressure, recordedAt } = req.body || {};
    const pid = patientId ? String(patientId) : null;
    const dni = patientDni ? String(patientDni) : null;

    let patient_id = pid;

    if (deviceToken) {
      const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
      const { data: binding, error: bindErr } = await admin
        .from('device_bindings')
        .select('id, patient_id')
        .eq('token_hash', tokenHash)
        .is('revoked_at', null)
        .maybeSingle();
      if (bindErr) return res.status(500).json({ status: 500, message: bindErr.message });
      if (!binding?.patient_id) return res.status(401).json({ status: 401, message: 'Invalid device token' });
      patient_id = binding.patient_id;
      await admin.from('device_bindings').update({ last_seen_at: new Date().toISOString() }).eq('id', binding.id);
    }

    if (!patient_id && hasIngestKey && dni) {
      const { data: p, error: pErr } = await admin.from('patients').select('id').eq('dni', dni).maybeSingle();
      if (pErr) return res.status(500).json({ status: 500, message: pErr.message });
      if (!p?.id) return res.status(404).json({ status: 404, message: 'Patient not found' });
      patient_id = p.id;
    }

    if (!patient_id && hasIngestKey && pid) {
      patient_id = pid;
    }

    if (!patient_id) {
      return res.status(400).json({ status: 400, message: 'Missing patient identification' });
    }

    const row = {
      patient_id,
      heart_rate: heartRate === null || heartRate === undefined ? null : Number(heartRate),
      oxygen_level: oxygenLevel === null || oxygenLevel === undefined ? null : Number(oxygenLevel),
      temperature: temperature === null || temperature === undefined ? null : Number(temperature),
      blood_pressure: bloodPressure === null || bloodPressure === undefined ? null : String(bloodPressure),
      recorded_at: recordedAt ? String(recordedAt) : undefined,
    };

    const { error } = await admin.from('vital_signs').insert(row);
    if (error) return res.status(500).json({ status: 500, message: error.message });

    if (String(process.env.PUSH_ON_INGEST || '').toLowerCase() === 'true') {
      const { data: latestAlert } = await admin
        .from('alerts')
        .select('id, message, severity, status, triggered_at')
        .eq('patient_id', patient_id)
        .eq('status', 'pending')
        .order('triggered_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const triggeredAt = latestAlert?.triggered_at ? new Date(String(latestAlert.triggered_at)) : null;
      const recent = triggeredAt ? Date.now() - triggeredAt.getTime() < 2 * 60 * 1000 : false;
      const shouldPush = Boolean(latestAlert?.id) && recent;

      if (shouldPush) {
        const context = await getPatientContext(admin, patient_id);
        const recipients = [context?.caregiverUserId, context?.doctorUserId].filter(Boolean);
        if (context?.patient?.id && recipients.length) {
          await sendNotificationToUsers(admin, {
            userIds: recipients,
            title: 'Alerta de salud',
            body: String(latestAlert?.message || 'Nuevo evento registrado'),
            category: 'health_alert',
            patientId: context.patient.id,
            data: {
              patientId: context.patient.id,
              patientName: context.patient.full_name,
              alertId: latestAlert.id,
              severity: latestAlert.severity,
            },
          });
        }
      }
    }

    res.status(200).json({ success: true, statusCode: 200, message: 'Vitals ingested', timestamp: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

app.post('/api/devices/bindings', clinicalLimiter, supabaseAuth, async (req, res, next) => {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return res.status(500).json({ status: 500, message: 'Supabase admin not configured' });
    const role = (req.appUser?.role || '').toString().toLowerCase();
    if (role !== 'caregiver') return res.status(403).json({ status: 403, message: 'Only caregivers can bind devices' });

    const { patientId, deviceName } = req.body || {};
    if (!patientId) return res.status(400).json({ status: 400, message: 'Missing patientId' });

    const { data: caregiver } = await admin.from('caregivers').select('id').eq('user_id', req.appUser.id).maybeSingle();
    if (!caregiver?.id) return res.status(403).json({ status: 403, message: 'Caregiver profile missing' });

    const { data: patient } = await admin.from('patients').select('id').eq('id', String(patientId)).eq('caregiver_id', caregiver.id).maybeSingle();
    if (!patient?.id) return res.status(404).json({ status: 404, message: 'Patient not found for caregiver' });

    const deviceToken = crypto.randomBytes(12).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');

    const { data: binding, error } = await admin
      .from('device_bindings')
      .insert({
        patient_id: patient.id,
        token_hash: tokenHash,
        device_name: deviceName ? String(deviceName) : null,
        created_by_user_id: req.appUser.id,
      })
      .select('id, patient_id, device_name, created_at')
      .single();
    if (error) return res.status(500).json({ status: 500, message: error.message });

    res.status(201).json({ success: true, statusCode: 201, data: { binding, deviceToken }, timestamp: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Vittal API is running normally',
    timestamp: new Date().toISOString()
  });
});

// En desarrollo / No encontrado
app.use((req, res) => {
  res.status(404).json({
    status: 404,
    error: 'Not Found',
    message: `The path ${req.originalUrl} is under development or does not exist.`,
    timestamp: new Date().toISOString(),
    availableRoutes: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/refresh-token',
      'GET /api/users',
      'GET /api/users/:id',
      'PUT /api/users/:id',
      'DELETE /api/users/:id',
      'GET /api/patients',
      'POST /api/patients',
      'GET /api/patients/:id',
      'PUT /api/patients/:id',
      'DELETE /api/patients/:id',
      'GET /api/appointments',
      'POST /api/appointments',
      'GET /api/appointments/:id',
      'PATCH /api/appointments/:id/status',
      'DELETE /api/appointments/:id',
      'GET /api/patients/:id/records',
      'POST /api/patients/:id/records',
      'GET /api/records/:id',
      'PUT /api/records/:id',
      'GET /api/health',
      'GET /api/version',
    ]
  });
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    status: err.status || 500,
    error: err.name || 'Internal Server Error',
    message: err.message || 'Something went wrong on the server',
    timestamp: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  });
}

module.exports = app;
