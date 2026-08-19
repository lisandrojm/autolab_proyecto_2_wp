export function requireAnyRole(req, res, next) {
    // roles puede venir como string único o array; normalizamos
    const rolesRaw = req.user?.roles ?? (req.user?.role ? [req.user.role] : []);
    const roles = Array.isArray(rolesRaw) ? rolesRaw.filter(Boolean) : [];
    if (roles.length === 0) {
        return res.status(403).json({ error: "Acceso restringido: usuario sin rol asignado" });
    }
    next();
}
