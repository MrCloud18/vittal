const db = require('../config/db');

exports.listUsers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const result = await db.query(
      'SELECT id, name, email, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      data: { users: result.rows, page, limit },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT id, name, email, role, is_active, created_at, updated_at FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      data: { user: result.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.updateUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, is_active } = req.body || {};

    const existing = await db.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'User not found' });
    }

    const isAdmin = (req.user?.role || '').toLowerCase() === 'admin';
    const nextRole = isAdmin ? role : undefined;

    const updated = await db.query(
      `UPDATE users
       SET name = COALESCE($2, name),
           email = COALESCE($3, email),
           role = COALESCE($4, role),
           is_active = COALESCE($5, is_active),
           updated_at = now()
       WHERE id = $1
       RETURNING id, name, email, role, is_active, created_at, updated_at`,
      [id, name || null, email || null, nextRole || null, typeof is_active === 'boolean' ? is_active : null]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'User updated successfully',
      data: { user: updated.rows[0] },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('UPDATE users SET is_active = FALSE, updated_at = now() WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 404, message: 'User not found' });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

