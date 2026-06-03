export function requireRole(role) {
  return (req, res, next) => {
    const userRole = req.header('x-role') || 'viewer';
    if (userRole !== role && userRole !== 'admin') {
      return res.status(403).json({ error: 'forbidden', requiredRole: role });
    }
    next();
  };
}
