import { Router } from "express";
import crypto from "crypto";
import { Types } from "mongoose";
import { RegistroLink, getRegistroLinkExpiry } from "../models/RegistroLink.js";
import { Client } from "../models/Client.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { Tenant } from "../models/Tenant.js";
import { Info } from "../models/Info.js";
import { Banco } from "../models/Banco.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";
import { MOBILE_REGISTRO } from "../utils/permisosMobile.js";
const router = Router();
/** Los links del móvil duran 7 días. Vencido, el próximo pedido genera uno nuevo (ver `POST /mio`). */
const DIAS_LINK_MOVIL = 7;
const DIA_MS = 24 * 60 * 60 * 1000;
const nombreDe = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || u?.email || "";
// GET /registro-links - Listar links de registro del tenant (activos y revocados)
router.get("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!tenantId) {
            res.status(400).json({ error: "Invalid tenant ID" });
            return;
        }
        const links = await RegistroLink.find({ tenantId }).sort({ createdAt: -1 }).lean();
        // Etiquetas de cliente, creador y —para los links del móvil— proyecto, área y turno.
        const unicos = (campo) => [...new Set(links.filter((l) => l[campo]).map((l) => String(l[campo])))];
        const [clients, users, projects, areas, shifts] = await Promise.all([
            unicos("clientId").length ? Client.find({ _id: { $in: unicos("clientId") } }).select("name").lean() : Promise.resolve([]),
            unicos("createdBy").length ? User.find({ _id: { $in: unicos("createdBy") } }).select("firstName lastName email").lean() : Promise.resolve([]),
            unicos("projectId").length ? Project.find({ _id: { $in: unicos("projectId") } }).select("name").lean() : Promise.resolve([]),
            unicos("areaId").length ? Area.find({ _id: { $in: unicos("areaId") } }).select("name").lean() : Promise.resolve([]),
            unicos("shiftId").length ? Shift.find({ _id: { $in: unicos("shiftId") } }).select("name").lean() : Promise.resolve([]),
        ]);
        const clientMap = new Map(clients.map((c) => [String(c._id), c.name]));
        const userMap = new Map(users.map((u) => [String(u._id), nombreDe(u)]));
        const projectMap = new Map(projects.map((p) => [String(p._id), p.name]));
        const areaMap = new Map(areas.map((a) => [String(a._id), a.name]));
        const shiftMap = new Map(shifts.map((s) => [String(s._id), s.name]));
        const result = links.map((l) => ({
            _id: String(l._id),
            token: l.token,
            clientId: l.clientId ? String(l.clientId) : null,
            clientName: l.clientId ? clientMap.get(String(l.clientId)) || null : null,
            label: l.label || null,
            active: l.active,
            usageCount: l.usageCount,
            lastUsedAt: l.lastUsedAt || null,
            createdAt: l.createdAt,
            expiresAt: new Date(getRegistroLinkExpiry(l)).toISOString(),
            createdByName: l.createdBy ? userMap.get(String(l.createdBy)) || null : null,
            origen: l.origen || "web",
            projectName: l.projectId ? projectMap.get(String(l.projectId)) || null : null,
            areaName: l.areaId ? areaMap.get(String(l.areaId)) || null : null,
            shiftName: l.shiftId ? shiftMap.get(String(l.shiftId)) || null : null,
        }));
        res.json({ links: result });
    }
    catch (error) {
        console.error("Get registro-links error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/*
  ═══════════════════════════════════════════════════════════════════════
  SECCIÓN «REGISTRO» DEL MÓVIL
  ═══════════════════════════════════════════════════════════════════════

  Un supervisor o coordinador comparte un link (por WhatsApp, por ejemplo) para que la gente se registre
  sola. El link SÓLO registra al usuario: no lo asigna a ningún proyecto, área ni turno —eso se decide
  después, como con cualquier alta—. Dura 7 días; vencido, el próximo pedido genera uno nuevo, así nunca
  hay que ir a renovarlo a mano. Quien se registra queda asociado a quien lo invitó y aparece en la
  lista «Registrados» de esa persona, que la ve pero no la edita.
*/
const resumenLink = (l) => {
    const vence = getRegistroLinkExpiry(l);
    return { _id: String(l._id), token: l.token, expiresAt: new Date(vence).toISOString(), diasRestantes: Math.max(0, Math.ceil((vence - Date.now()) / DIA_MS)), usageCount: l.usageCount || 0 };
};
// POST /registro-links/mio - Mi link de registro vigente; si no hay o venció, uno nuevo de 7 días.
router.post("/mio", requireTenant, authenticateToken, requirePermission(MOBILE_REGISTRO), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!tenantId) {
            res.status(400).json({ error: "Invalid tenant ID" });
            return;
        }
        // Uno por persona: el link general de quien lo comparte. Los links viejos con proyecto/área/turno
        // (de antes de que el link fuera sólo para registrarse) no se reusan.
        const creador = new Types.ObjectId(String(req.user.userId));
        let link = await RegistroLink.findOne({ tenantId, createdBy: creador, origen: "mobile", projectId: { $exists: false }, active: true, expiresAt: { $gt: new Date() } })
            .sort({ expiresAt: -1 })
            .lean();
        if (!link) {
            const tenant = await Tenant.findById(tenantId).select("slug").lean();
            const creado = await RegistroLink.create({
                tenantId,
                tenantSlug: tenant?.slug || "",
                token: crypto.randomBytes(32).toString("base64url"),
                createdBy: creador,
                origen: "mobile",
                active: true,
                expiresAt: new Date(Date.now() + DIAS_LINK_MOVIL * DIA_MS),
            });
            link = creado.toObject();
        }
        res.json({ link: resumenLink(link) });
    }
    catch (error) {
        console.error("Mi registro-link error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /registro-links/mis-registrados - Quiénes se registraron con mis links.
router.get("/mis-registrados", requireTenant, authenticateToken, requirePermission(MOBILE_REGISTRO), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!tenantId) {
            res.status(400).json({ error: "Invalid tenant ID" });
            return;
        }
        const yo = new Types.ObjectId(String(req.user.userId));
        const usuarios = await User.find({ tenantId, "metadata.registro.invitadoPor": yo })
            .select("firstName lastName email createdAt metadata.activo metadata.registro metadata.nombreValidadoArcaAt")
            .sort({ createdAt: -1 })
            .limit(500)
            .lean();
        const unicos = (campo) => [...new Set(usuarios.map((u) => u.metadata?.registro?.[campo]).filter(Boolean).map(String))];
        const [projects, areas, shifts] = await Promise.all([
            Project.find({ _id: { $in: unicos("projectId") } }).select("name").lean(),
            Area.find({ _id: { $in: unicos("areaId") } }).select("name").lean(),
            Shift.find({ _id: { $in: unicos("shiftId") } }).select("name").lean(),
        ]);
        const nombre = new Map([...projects, ...areas, ...shifts].map((x) => [String(x._id), x.name]));
        res.json({
            registrados: usuarios.map((u) => {
                const r = u.metadata?.registro || {};
                return {
                    _id: String(u._id),
                    nombre: nombreDe(u),
                    email: u.email,
                    registradoAt: r.registradoAt || u.createdAt,
                    activo: u.metadata?.activo !== false,
                    validadoEnArca: !!u.metadata?.nombreValidadoArcaAt,
                    proyecto: r.projectId ? nombre.get(String(r.projectId)) || null : null,
                    area: r.areaId ? nombre.get(String(r.areaId)) || null : null,
                    turno: r.shiftId ? nombre.get(String(r.shiftId)) || null : null,
                };
            }),
        });
    }
    catch (error) {
        console.error("Mis registrados error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /registro-links/mis-registrados/:userId - Cómo se registró (sólo lectura, sólo si lo invité yo).
router.get("/mis-registrados/:userId", requireTenant, authenticateToken, requirePermission(MOBILE_REGISTRO), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        const userId = toObjectIdOrNull(req.params.userId);
        if (!tenantId || !userId) {
            res.status(400).json({ error: "Datos inválidos" });
            return;
        }
        const yo = new Types.ObjectId(String(req.user.userId));
        const u = await User.findOne({ _id: userId, tenantId, "metadata.registro.invitadoPor": yo }).select("firstName lastName email createdAt metadata").lean();
        if (!u) {
            res.status(404).json({ error: "No encontré ese registro entre los tuyos." });
            return;
        }
        const m = u.metadata || {};
        const r = m.registro || {};
        const infoPorTipo = async (tipo, id) => (id != null ? (await Info.findOne({ type: tipo, "data.id": Number(id) }).select("name").lean())?.name || null : null);
        const [proyecto, area, turno, genero, nivelEstudio, nacionalidad, tipoDocumento, banco, rolesFrame] = await Promise.all([
            r.projectId ? Project.findById(r.projectId).select("name").lean() : null,
            r.areaId ? Area.findById(r.areaId).select("name").lean() : null,
            r.shiftId ? Shift.findById(r.shiftId).select("name").lean() : null,
            infoPorTipo("genero", m.generoId),
            infoPorTipo("nivel-estudio", m.nivelEstudioId),
            infoPorTipo("nacionalidad", m.nacionalidadId).then((n) => n || infoPorTipo("pais", m.nacionalidadId)),
            infoPorTipo("tipo-documento", m.tipoDocumentoId),
            m.bancoId != null ? Banco.findOne({ "data.id": Number(m.bancoId) }).select("name").lean() : null,
            Array.isArray(m.roles_frame) && m.roles_frame.length ? RoleFrame.find({ _id: { $in: m.roles_frame } }).select("name").lean() : [],
        ]);
        // Los datos bancarios completos no se muestran a quien invitó: alcanza con saber que los cargó.
        const ultimos4 = (v) => (v ? `•••• ${String(v).slice(-4)}` : null);
        res.json({
            _id: String(u._id),
            registradoAt: r.registradoAt || u.createdAt,
            proyecto: proyecto?.name || null,
            area: area?.name || null,
            turno: turno?.name || null,
            personales: {
                nombre: u.firstName || "",
                apellido: u.lastName || "",
                email: u.email,
                telefono: m.telefono || null,
                cuit: m.cuit || null,
                sinCuit: !!m.sinCuit,
                validadoEnArca: !!m.nombreValidadoArcaAt,
                tipoDocumento,
                documento: m.documento || null,
                fechaNac: m.fechaNac || null,
                genero,
                nacionalidad,
                nivelEstudio,
                estadoCivil: m.estadoCivil || null,
                rolesEmpresa: (rolesFrame || []).map((x) => x.name),
            },
            domicilio: { pais: m.pais || null, localidad: m.localidad || null, calle: m.calle || null, altura: m.altura || null, pisoDepto: m.pisoDepto || null, codigoPostal: m.codigoPostal || null },
            bancarios: {
                solicitaCreacionCuenta: !!m.solicitaCreacionCuenta,
                tipoEntidad: m.tipoEntidadFinanciera || null,
                banco: banco?.name || null,
                tipoDeCuenta: m.tipoDeCuentaBancaria || null,
                cbu: ultimos4(m.cbu),
                alias: m.aliasBancario || null,
            },
        });
    }
    catch (error) {
        console.error("Detalle de registrado error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /registro-links/:id/revoke - Revocar (desactivar) un link
router.patch("/:id/revoke", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!tenantId) {
            res.status(400).json({ error: "Invalid tenant ID" });
            return;
        }
        const link = await RegistroLink.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: { active: false } }, { new: true });
        if (!link) {
            res.status(404).json({ error: "Link no encontrado" });
            return;
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error("Revoke registro-link error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /registro-links/:id - Eliminar un link
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const tenantId = toObjectIdOrNull(req.tenantObjectId);
        if (!tenantId) {
            res.status(400).json({ error: "Invalid tenant ID" });
            return;
        }
        const link = await RegistroLink.findOneAndDelete({ _id: req.params.id, tenantId });
        if (!link) {
            res.status(404).json({ error: "Link no encontrado" });
            return;
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error("Delete registro-link error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as registroLinkRoutes };
