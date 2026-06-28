const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/db');

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, specialty, cmp, schedule } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ status: 400, message: 'Missing required fields: name, email, password' });
    }

    const normalizedRole = (role || 'patient').toString().toLowerCase();
    const allowedRoles = new Set(['patient', 'doctor', 'admin']);
    if (!allowedRoles.has(normalizedRole)) {
      return res.status(422).json({ status: 422, message: 'Invalid role' });
    }

    if (normalizedRole === 'doctor' && (!specialty || !cmp)) {
      return res.status(400).json({ status: 400, message: 'Missing required fields for doctor: specialty, cmp' });
    }

    const userExists = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ status: 409, message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(Number(process.env.BCRYPT_ROUNDS) || 12);
    const passwordHash = await bcrypt.hash(password, salt);

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const createdUser = await client.query(
        'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
        [name, email, passwordHash, normalizedRole]
      );

      const user = createdUser.rows[0];

      if (normalizedRole === 'doctor') {
        await client.query(
          'INSERT INTO doctors (user_id, specialty, cmp, schedule) VALUES ($1, $2, $3, $4)',
          [user.id, specialty, cmp, schedule || null]
        );
      }

      await client.query('COMMIT');

      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

      res.status(201).json({
        success: true,
        statusCode: 201,
        message: 'Successfully registered user',
        data: { token, user },
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 400, message: 'Missing required fields: email, password' });
    }

    // 1. Find user
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ status: 401, message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ status: 403, message: 'Account is inactive' });
    }

    // 2. Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ status: 401, message: 'Invalid credentials' });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ status: 500, message: 'JWT_SECRET not configured' });
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      return res.status(500).json({ status: 500, message: 'JWT_REFRESH_SECRET not configured' });
    }

    // 3. Generate Tokens (Dual Token Strategy)
    const accessToken = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '1h'
    });

    const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: '7d'
    });

    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at, is_revoked) VALUES ($1, $2, $3, $4)',
      [user.id, refreshTokenHash, expiresAt.toISOString(), false]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Login exitoso',
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.logout = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 401, message: 'Unauthorized' });
    }

    const { refreshToken } = req.body || {};
    if (refreshToken) {
      const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await db.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1 AND token = $2', [userId, refreshTokenHash]);
    } else {
      await db.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1', [userId]);
    }

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Logout successful',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ status: 500, message: 'JWT_SECRET not configured' });
    }
    if (!process.env.JWT_REFRESH_SECRET) {
      return res.status(500).json({ status: 500, message: 'JWT_REFRESH_SECRET not configured' });
    }

    const authHeader = req.headers.authorization || '';
    const [scheme, bearerToken] = authHeader.split(' ');
    const refreshToken = (scheme === 'Bearer' && bearerToken) ? bearerToken : (req.body?.refreshToken || '');

    if (!refreshToken) {
      return res.status(400).json({ status: 400, message: 'Missing required fields: refreshToken' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (_) {
      return res.status(401).json({ status: 401, message: 'Invalid or expired refresh token' });
    }

    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const tokenRow = await db.query(
      'SELECT id, user_id, expires_at, is_revoked FROM refresh_tokens WHERE token = $1',
      [refreshTokenHash]
    );

    if (tokenRow.rows.length === 0) {
      return res.status(401).json({ status: 401, message: 'Refresh token not recognized' });
    }

    const stored = tokenRow.rows[0];
    if (stored.is_revoked) {
      return res.status(401).json({ status: 401, message: 'Refresh token revoked' });
    }
    if (new Date(stored.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ status: 401, message: 'Refresh token expired' });
    }

    const userRes = await db.query('SELECT id, role, is_active FROM users WHERE id = $1', [stored.user_id]);
    if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
      return res.status(403).json({ status: 403, message: 'Account is inactive' });
    }

    const accessToken = jwt.sign({ id: stored.user_id, role: userRes.rows[0].role }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const newRefreshToken = jwt.sign({ id: stored.user_id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
    const newRefreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1', [stored.id]);
    await db.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at, is_revoked) VALUES ($1, $2, $3, $4)',
      [stored.user_id, newRefreshTokenHash, expiresAt.toISOString(), false]
    );

    res.status(200).json({
      success: true,
      statusCode: 200,
      message: 'Token refreshed successfully',
      data: { accessToken, refreshToken: newRefreshToken },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};
