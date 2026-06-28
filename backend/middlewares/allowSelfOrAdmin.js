function allowSelfOrAdmin(req, res, next) {
  const userId = req.user?.id;
  const role = (req.user?.role || '').toString().toLowerCase();
  const targetId = req.params.id;

  if (role === 'admin' || (userId && targetId && userId === targetId)) {
    return next();
  }

  return res.status(403).json({ status: 403, message: 'Forbidden' });
}

module.exports = allowSelfOrAdmin;

