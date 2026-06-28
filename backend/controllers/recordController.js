const db = require('../config/db');

async function getDoctorIdByUserId(userId) {
  const result = await db.query('SELECT id FROM doctors WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

async function getPatientIdByUserId(userId) {
  const result = await db.query('SELECT id FROM patients WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

async function doctorHasAppointmentWithPatient(doctorUserId, patientId) {
  const doctorId = await getDoctorIdByUserId(doctorUserId);
  if (!doctorId) return false;
  const result = await db.query('SELECT 1 FROM appointments WHERE doctor_id = $1 AND patient_id = $2 LIMIT 1', [doctorId, patientId]);
  return result.rows.length > 0;
}

async function canAccessPatient(reqUser, patientId) {
  const role = (reqUser?.role || '').toLowerCase();
  if (role === 'admin') return true;
  if (role === 'doctor') return doctorHasAppointmentWithPatient(reqUser.id, patientId);
  if (role === 'patient') {
    const myPatientId = await getPatientIdByUserId(reqUser.id);
    return myPatientId && myPatientId === patientId;
  }
  return false;
}

exports.listRecordsByPatient = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = await canAccessPatient(req.user, id);
    if (!allowed) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    const records = await db.query(
      'SELECT id, appointment_id, patient_id, diagnosis, treatment, medications, record_date FROM medical_records WHERE patient_id = $1 ORDER BY record_date DESC',
      [id]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      data: { records: records.rows },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.createRecordForPatient = async (req, res, next) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    if (role !== 'doctor') {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    const { id } = req.params;
    const { appointment_id, diagnosis, treatment, medications } = req.body || {};
    if (!diagnosis) {
      return res.status(400).json({ status: 400, message: 'Missing required fields: diagnosis' });
    }

    const allowed = await doctorHasAppointmentWithPatient(req.user.id, id);
    if (!allowed) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    if (appointment_id) {
      const appt = await db.query('SELECT id FROM appointments WHERE id = $1 AND patient_id = $2', [appointment_id, id]);
      if (appt.rows.length === 0) {
        return res.status(422).json({ status: 422, message: 'Invalid appointment_id for this patient' });
      }
    }

    const created = await db.query(
      'INSERT INTO medical_records (appointment_id, patient_id, diagnosis, treatment, medications) VALUES ($1, $2, $3, $4, $5) RETURNING id, appointment_id, patient_id, diagnosis, treatment, medications, record_date',
      [appointment_id || null, id, diagnosis, treatment || null, medications || null]
    );

    res.status(201).json({
      success: true,
      statusCode: 201,
      message: 'Medical record created successfully',
      data: { record: created.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.getRecordById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const recordRes = await db.query(
      'SELECT id, appointment_id, patient_id, diagnosis, treatment, medications, record_date FROM medical_records WHERE id = $1',
      [id]
    );
    if (recordRes.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'Record not found' });
    }

    const record = recordRes.rows[0];
    const allowed = await canAccessPatient(req.user, record.patient_id);
    if (!allowed) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      data: { record },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.updateRecordById = async (req, res, next) => {
  try {
    const role = (req.user?.role || '').toLowerCase();
    if (role !== 'doctor') {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    const { id } = req.params;
    const { diagnosis, treatment, medications } = req.body || {};

    const existing = await db.query('SELECT id, patient_id FROM medical_records WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'Record not found' });
    }

    const record = existing.rows[0];
    const allowed = await doctorHasAppointmentWithPatient(req.user.id, record.patient_id);
    if (!allowed) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }

    const updated = await db.query(
      `UPDATE medical_records
       SET diagnosis = COALESCE($2, diagnosis),
           treatment = COALESCE($3, treatment),
           medications = COALESCE($4, medications)
       WHERE id = $1
       RETURNING id, appointment_id, patient_id, diagnosis, treatment, medications, record_date`,
      [id, diagnosis || null, treatment || null, medications || null]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Medical record updated successfully',
      data: { record: updated.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

