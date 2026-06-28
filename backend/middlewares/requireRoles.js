function requireRoles(allowedRoles) {
  const allowed = new Set(allowedRoles.map((r) => r.toLowerCase()));

  return function requireRolesMiddleware(req, res, next) {
    const role = (req.user?.role || '').toString().toLowerCase();
    if (!allowed.has(role)) {
      return res.status(403).json({ status: 403, message: 'Forbidden' });
    }
    next();
  };
}

module.exports = requireRoles;

