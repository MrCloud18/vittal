const db = require('../config/db');

async function getDoctorIdByUserId(userId) {
  const result = await db.query('SELECT id FROM doctors WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

async function doctorHasAppointmentWithPatient(doctorUserId, patientId) {
  const doctorId = await getDoctorIdByUserId(doctorUserId);
  if (!doctorId) return false;

  const result = await db.query(
    'SELECT 1 FROM appointments WHERE doctor_id = $1 AND patient_id = $2 LIMIT 1',
    [doctorId, patientId]
  );
  return result.rows.length > 0;
}

exports.listPatients = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ status: 401, message: 'Unauthorized' });
    }

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const role = (req.user.role || '').toLowerCase();
    let result;

    if (role === 'admin') {
      result = await db.query(
        'SELECT id, user_id, full_name, dni, birth_date, blood_type, phone, is_active, created_at FROM patients ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset]
      );
    } else if (role === 'doctor') {
      const doctorId = await getDoctorIdByUserId(req.user.id);
      if (!doctorId) {
        return res.status(404).json({ status: 404, message: 'Doctor profile not found' });
      }
      result = await db.query(
        `SELECT DISTINCT p.id, p.user_id, p.full_name, p.dni, p.birth_date, p.blood_type, p.phone, p.is_active, p.created_at
         FROM patients p
         JOIN appointments a ON a.patient_id = p.id
         WHERE a.doctor_id = $1
         ORDER BY p.created_at DESC
         LIMIT $2 OFFSET $3`,
        [doctorId, limit, offset]
      );
    } else {
      result = await db.query(
        'SELECT id, user_id, full_name, dni, birth_date, blood_type, phone, is_active, created_at FROM patients WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [req.user.id, limit, offset]
      );
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      data: { patients: result.rows, page, limit },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.createPatient = async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ status: 401, message: 'Unauthorized' });
    }

    const { user_id, full_name, dni, birth_date, blood_type, phone } = req.body || {};
    if (!full_name) {
      return res.status(400).json({ status: 400, message: 'Missing required fields: full_name' });
    }

    const role = (req.user.role || '').toLowerCase();
    const targetUserId = role === 'admin' ? (user_id || null) : req.user.id;
    if (!targetUserId) {
      return res.status(400).json({ status: 400, message: 'Missing required fields: user_id' });
    }

    const created = await db.query(
      'INSERT INTO patients (user_id, full_name, dni, birth_date, blood_type, phone) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, user_id, full_name, dni, birth_date, blood_type, phone, is_active, created_at',
      [targetUserId, full_name, dni || null, birth_date || null, blood_type || null, phone || null]
    );

    res.status(201).json({
      success: true,
      statusCode: 201,
      message: 'Patient created successfully',
      data: { patient: created.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.getPatientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const patientRes = await db.query(
      'SELECT id, user_id, full_name, dni, birth_date, blood_type, phone, is_active, created_at FROM patients WHERE id = $1',
      [id]
    );
    if (patientRes.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'Patient not found' });
    }

    const patient = patientRes.rows[0];
    const role = (req.user?.role || '').toLowerCase();

    if (role === 'admin') {
      return res.status(200).json({ success: true, statusCode: 200, data: { patient }, timestamp: new Date().toISOString() });
    }

    if (role === 'patient' && req.user.id === patient.user_id) {
      return res.status(200).json({ success: true, statusCode: 200, data: { patient }, timestamp: new Date().toISOString() });
    }

    if (role === 'doctor') {
      const allowed = await doctorHasAppointmentWithPatient(req.user.id, patient.id);
      if (allowed) {
        return res.status(200).json({ success: true, statusCode: 200, data: { patient }, timestamp: new Date().toISOString() });
      }
    }

    return res.status(403).json({ status: 403, message: 'Forbidden' });
  } catch (error) {
    next(error);
  }
};

exports.updatePatientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { full_name, dni, birth_date, blood_type, phone } = req.body || {};

    const patientRes = await db.query('SELECT id, user_id FROM patients WHERE id = $1', [id]);
    if (patientRes.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'Patient not found' });
    }

    const patient = patientRes.rows[0];
    const role = (req.user?.role || '').toLowerCase();
    const isOwner = role === 'patient' && req.user.id === patient.user_id;
    const isAdmin = role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    const updated = await db.query(
      `UPDATE patients
       SET full_name = COALESCE($2, full_name),
           dni = COALESCE($3, dni),
           birth_date = COALESCE($4, birth_date),
           blood_type = COALESCE($5, blood_type),
           phone = COALESCE($6, phone)
       WHERE id = $1
       RETURNING id, user_id, full_name, dni, birth_date, blood_type, phone, is_active, created_at`,
      [id, full_name || null, dni || null, birth_date || null, blood_type || null, phone || null]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Patient updated successfully',
      data: { patient: updated.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.deletePatientById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('UPDATE patients SET is_active = FALSE WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'Patient not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
