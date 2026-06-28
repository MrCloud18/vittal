const db = require('../config/db');

async function getDoctorIdByUserId(userId) {
  const result = await db.query('SELECT id FROM doctors WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

async function getPatientIdByUserId(userId) {
  const result = await db.query('SELECT id FROM patients WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

async function isInvolvedParty(user, appointment) {
  const role = (user.role || '').toLowerCase();
  if (role === 'admin') return true;

  if (role === 'doctor') {
    const doctorId = await getDoctorIdByUserId(user.id);
    return doctorId && doctorId === appointment.doctor_id;
  }

  if (role === 'patient') {
    const patientId = await getPatientIdByUserId(user.id);
    return patientId && patientId === appointment.patient_id;
  }

  return false;
}

exports.listAppointments = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const role = (req.user?.role || '').toLowerCase();
    let result;

    if (role === 'admin') {
      result = await db.query(
        'SELECT id, patient_id, doctor_id, scheduled_at, status, reason, notes, created_at FROM appointments ORDER BY scheduled_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
    } else if (role === 'doctor') {
      const doctorId = await getDoctorIdByUserId(req.user.id);
      if (!doctorId) {
        return res.status(404).json({ status: 404, message: 'Doctor profile not found' });
      }
      result = await db.query(
        'SELECT id, patient_id, doctor_id, scheduled_at, status, reason, notes, created_at FROM appointments WHERE doctor_id = $1 ORDER BY scheduled_at DESC LIMIT $2 OFFSET $3',
        [doctorId, limit, offset]
      );
    } else if (role === 'patient') {
      const patientId = await getPatientIdByUserId(req.user.id);
      if (!patientId) {
        return res.status(404).json({ status: 404, message: 'Patient profile not found' });
      }
      result = await db.query(
        'SELECT id, patient_id, doctor_id, scheduled_at, status, reason, notes, created_at FROM appointments WHERE patient_id = $1 ORDER BY scheduled_at DESC LIMIT $2 OFFSET $3',
        [patientId, limit, offset]
      );
    } else {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      data: { appointments: result.rows, page, limit },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.createAppointment = async (req, res, next) => {
  try {
    const { patient_id, doctor_id, scheduled_at, reason, notes } = req.body || {};
    if (!patient_id || !doctor_id || !scheduled_at) {
      return res.status(400).json({ status: 400, message: 'Missing required fields: patient_id, doctor_id, scheduled_at' });
    }

    const role = (req.user?.role || '').toLowerCase();
    if (!['patient', 'doctor', 'admin'].includes(role)) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    if (role === 'patient') {
      const myPatientId = await getPatientIdByUserId(req.user.id);
      if (!myPatientId || myPatientId !== patient_id) {
        return res.status(403).json({ status: 403, message: 'Forbidden' });
      }
    }

    if (role === 'doctor') {
      const myDoctorId = await getDoctorIdByUserId(req.user.id);
      if (!myDoctorId || myDoctorId !== doctor_id) {
        return res.status(403).json({ status: 403, message: 'Forbidden' });
      }
    }

    const conflict = await db.query(
      `SELECT 1 FROM appointments
       WHERE doctor_id = $1
         AND scheduled_at = $2
         AND status IN ('scheduled', 'confirmed')
       LIMIT 1`,
      [doctor_id, scheduled_at]
    );
    if (conflict.rows.length > 0) {
      return res.status(409).json({ status: 409, message: 'Scheduling conflict: doctor is not available at that time' });
    }

    const created = await db.query(
      'INSERT INTO appointments (patient_id, doctor_id, scheduled_at, reason, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id, patient_id, doctor_id, scheduled_at, status, reason, notes, created_at',
      [patient_id, doctor_id, scheduled_at, reason || null, notes || null]
    );

    res.status(201).json({
      success: true,
      statusCode: 201,
      message: 'Appointment created successfully',
      data: { appointment: created.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.getAppointmentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT id, patient_id, doctor_id, scheduled_at, status, reason, notes, created_at FROM appointments WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'Appointment not found' });
    }

    const appointment = result.rows[0];
    const allowed = await isInvolvedParty(req.user, appointment);
    if (!allowed) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      data: { appointment },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.updateAppointmentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const allowedStatuses = new Set(['scheduled', 'confirmed', 'cancelled', 'completed']);
    if (!allowedStatuses.has((status || '').toString())) {
      return res.status(422).json({ status: 422, message: 'Invalid status' });
    }

    const existing = await db.query('SELECT id, patient_id, doctor_id FROM appointments WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'Appointment not found' });
    }

    const appointment = existing.rows[0];
    const allowed = await isInvolvedParty(req.user, appointment);
    if (!allowed) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    const updated = await db.query(
      'UPDATE appointments SET status = $2 WHERE id = $1 RETURNING id, patient_id, doctor_id, scheduled_at, status, reason, notes, created_at',
      [id, status]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Appointment status updated successfully',
      data: { appointment: updated.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.cancelAppointment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id, patient_id, doctor_id FROM appointments WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'Appointment not found' });
    }

    const appointment = existing.rows[0];
    const allowed = await isInvolvedParty(req.user, appointment);
    if (!allowed) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    await db.query('UPDATE appointments SET status = $2 WHERE id = $1', [id, 'cancelled']);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

