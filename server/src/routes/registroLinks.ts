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
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";
import { MOBILE_REGISTRO } from "../utils/permisosMobile.js";

const router = Router();

/*
  CUÁNTO DURAN LOS LINKS DEL MÓVIL: lo decide cada tenant (Usuarios → Link → Links), 7 días si nunca se tocó.

  Vive en `settings` del Tenant y no en una colección propia: el cluster de Atlas está en su tope de
  colecciones. Cambiarlo afecta sólo a los links que se generen después: los vigentes conservan su
  vencimiento, igual que los del panel, cuya duración tampoco se cambia una vez creados. Si hace falta
  cortar uno antes, se revoca.
*/
const DIAS_LINK_MOVIL_DEFAULT = 7;
const DIAS_LINK_MIN = 1;
const DIAS_LINK_MAX = 365;
const DIA_MS = 24 * 60 * 60 * 1000;

const diasLinkMovilDe = (tenant: any): number => {
  const n = Number(tenant?.settings?.registroDiasLinkMovil);
  return Number.isInteger(n) && n >= DIAS_LINK_MIN && n <= DIAS_LINK_MAX ? n : DIAS_LINK_MOVIL_DEFAULT;
};

const nombreDe = (u: any): string => [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || u?.email || "";

// GET /registro-links - Listar links de registro del tenant (activos y revocados)
router.get("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) {
      res.status(400).json({ error: "Invalid tenant ID" });
      return;
    }

    const links = await RegistroLink.find({ tenantId }).sort({ createdAt: -1 }).lean();

    // Etiquetas de cliente, creador y —para los links del móvil— proyecto, área y turno.
    const unicos = (campo: "clientId" | "createdBy" | "projectId" | "areaId" | "shiftId") => [...new Set(links.filter((l: any) => l[campo]).map((l: any) => String(l[campo])))];
    const [clients, users, projects, areas, shifts] = await Promise.all([
      unicos("clientId").length ? Client.find({ _id: { $in: unicos("clientId") } }).select("name").lean() : Promise.resolve([]),
      unicos("createdBy").length ? User.find({ _id: { $in: unicos("createdBy") } }).select("firstName lastName email").lean() : Promise.resolve([]),
      unicos("projectId").length ? Project.find({ _id: { $in: unicos("projectId") } }).select("name").lean() : Promise.resolve([]),
      unicos("areaId").length ? Area.find({ _id: { $in: unicos("areaId") } }).select("name").lean() : Promise.resolve([]),
      unicos("shiftId").length ? Shift.find({ _id: { $in: unicos("shiftId") } }).select("name").lean() : Promise.resolve([]),
    ]);

    const clientMap = new Map(clients.map((c: any) => [String(c._id), c.name]));
    const userMap = new Map(users.map((u: any) => [String(u._id), nombreDe(u)]));
    const projectMap = new Map(projects.map((p: any) => [String(p._id), p.name]));
    const areaMap = new Map(areas.map((a: any) => [String(a._id), a.name]));
    const shiftMap = new Map(shifts.map((s: any) => [String(s._id), s.name]));

    const result = links.map((l: any) => ({
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
  } catch (error) {
    console.error("Get registro-links error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /registro-links/config - Cuántos días duran los links del móvil.
router.get("/config", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenant: any = await Tenant.findById(req.tenantObjectId).select("settings.registroDiasLinkMovil").lean();
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    res.json({ diasLinkMovil: diasLinkMovilDe(tenant) });
  } catch (error) {
    console.error("Get registro config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /registro-links/config { diasLinkMovil } - Aplica a los links que se generen desde ahora.
router.put("/config", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const n = Number(req.body?.diasLinkMovil);
    if (!Number.isInteger(n) || n < DIAS_LINK_MIN || n > DIAS_LINK_MAX) {
      res.status(400).json({ error: `La duración debe ser un número entero entre ${DIAS_LINK_MIN} y ${DIAS_LINK_MAX} días` });
      return;
    }
    const r = await Tenant.updateOne({ _id: req.tenantObjectId }, { $set: { "settings.registroDiasLinkMovil": n } });
    if (!r.matchedCount) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }
    res.json({ diasLinkMovil: n });
  } catch (error) {
    console.error("Put registro config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
  GET /registro-links/registrados - Todos los que se registraron con un link: cuándo, con cuál y quién se
  lo compartió.

  «Quién lo compartió» es quien generó el link —un supervisor o coordinador desde el móvil, o alguien del
  panel—. Se guarda en la persona al registrarse (`metadata.registro`) y no se deduce después, porque un
  link se puede borrar. Los registros anteriores a que se guardara ese dato no aparecen: no hay forma
  confiable de saber con qué link vinieron.
*/
router.get("/registrados", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) {
      res.status(400).json({ error: "Invalid tenant ID" });
      return;
    }

    const usuarios: any[] = await User.find({ tenantId, "metadata.registro.linkId": { $exists: true } })
      .select("firstName lastName email createdAt metadata.activo metadata.cuit metadata.registro metadata.nombreValidadoArcaAt")
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean();

    const linkIds = [...new Set(usuarios.map((u) => String(u.metadata.registro.linkId)))];
    const links: any[] = linkIds.length ? await RegistroLink.find({ _id: { $in: linkIds }, tenantId }).select("origen createdBy clientId createdAt").lean() : [];
    const linkMap = new Map(links.map((l) => [String(l._id), l]));

    // Quien invitó quedó guardado en la persona; si no (registros viejos de links del panel), el creador del link.
    const compartidoPorDe = (u: any): string | null => {
      const r = u.metadata.registro;
      if (r.invitadoPor) return String(r.invitadoPor);
      const creador = linkMap.get(String(r.linkId))?.createdBy;
      return creador ? String(creador) : null;
    };
    const personaIds = [...new Set(usuarios.map(compartidoPorDe).filter(Boolean))] as string[];
    const clientIds = [...new Set(links.filter((l) => l.clientId).map((l) => String(l.clientId)))];
    const [personas, clientes]: any[][] = await Promise.all([
      personaIds.length ? User.find({ _id: { $in: personaIds } }).select("firstName lastName email").lean() : Promise.resolve([]),
      clientIds.length ? Client.find({ _id: { $in: clientIds } }).select("name").lean() : Promise.resolve([]),
    ]);
    const personaMap = new Map(personas.map((p) => [String(p._id), nombreDe(p)]));
    const clienteMap = new Map(clientes.map((c) => [String(c._id), c.name]));

    const registrados = usuarios
      .map((u) => {
        const r = u.metadata.registro;
        const link = linkMap.get(String(r.linkId));
        const compartidoPorId = compartidoPorDe(u);
        return {
          _id: String(u._id),
          nombre: nombreDe(u),
          email: u.email,
          cuit: u.metadata?.cuit || null,
          registradoAt: r.registradoAt || u.createdAt,
          activo: u.metadata?.activo !== false,
          validadoEnArca: !!u.metadata?.nombreValidadoArcaAt,
          linkId: String(r.linkId),
          // Sin el link (se borró) no se sabe el origen: se muestra como del panel, que es lo que eran todos antes del móvil.
          origen: link?.origen === "mobile" ? "mobile" : "web",
          linkBorrado: !link,
          compartidoPorId,
          compartidoPor: compartidoPorId ? personaMap.get(compartidoPorId) || null : null,
          clientName: link?.clientId ? clienteMap.get(String(link.clientId)) || null : null,
        };
      })
      .sort((a, b) => new Date(b.registradoAt).getTime() - new Date(a.registradoAt).getTime());

    res.json({ registrados });
  } catch (error) {
    console.error("Get registrados error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
  ═══════════════════════════════════════════════════════════════════════
  SECCIÓN «REGISTRO» DEL MÓVIL
  ═══════════════════════════════════════════════════════════════════════

  Un supervisor o coordinador comparte un link (por WhatsApp, por ejemplo) para que la gente se registre
  sola. El link SÓLO registra al usuario: no lo asigna a ningún proyecto, área ni turno —eso se decide
  después, como con cualquier alta—. Dura lo que configure el tenant (7 días por defecto); vencido, el próximo pedido genera uno nuevo, así nunca
  hay que ir a renovarlo a mano. Quien se registra queda asociado a quien lo invitó y aparece en la
  lista «Registrados» de esa persona, que la ve pero no la edita.
*/

const resumenLink = (l: any) => {
  const vence = getRegistroLinkExpiry(l);
  return { _id: String(l._id), token: l.token, expiresAt: new Date(vence).toISOString(), diasRestantes: Math.max(0, Math.ceil((vence - Date.now()) / DIA_MS)), usageCount: l.usageCount || 0 };
};

// POST /registro-links/mio - Mi link de registro vigente; si no hay o venció, uno nuevo con la duración del tenant.
router.post("/mio", requireTenant, authenticateToken, requirePermission(MOBILE_REGISTRO), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) {
      res.status(400).json({ error: "Invalid tenant ID" });
      return;
    }

    // Uno por persona: el link general de quien lo comparte. Los links viejos con proyecto/área/turno
    // (de antes de que el link fuera sólo para registrarse) no se reusan.
    const creador = new Types.ObjectId(String(req.user!.userId));
    let link: any = await RegistroLink.findOne({ tenantId, createdBy: creador, origen: "mobile", projectId: { $exists: false }, active: true, expiresAt: { $gt: new Date() } })
      .sort({ expiresAt: -1 })
      .lean();

    if (!link) {
      const tenant: any = await Tenant.findById(tenantId).select("slug settings.registroDiasLinkMovil").lean();
      const creado = await RegistroLink.create({
        tenantId,
        tenantSlug: tenant?.slug || "",
        token: crypto.randomBytes(32).toString("base64url"),
        createdBy: creador,
        origen: "mobile",
        active: true,
        expiresAt: new Date(Date.now() + diasLinkMovilDe(tenant) * DIA_MS),
      });
      link = creado.toObject();
    }

    res.json({ link: resumenLink(link) });
  } catch (error) {
    console.error("Mi registro-link error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /registro-links/mis-registrados - Quiénes se registraron con mis links.
router.get("/mis-registrados", requireTenant, authenticateToken, requirePermission(MOBILE_REGISTRO), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) {
      res.status(400).json({ error: "Invalid tenant ID" });
      return;
    }
    const yo = new Types.ObjectId(String(req.user!.userId));
    const usuarios: any[] = await User.find({ tenantId, "metadata.registro.invitadoPor": yo })
      .select("firstName lastName email createdAt metadata.activo metadata.registro metadata.nombreValidadoArcaAt")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const unicos = (campo: "projectId" | "areaId" | "shiftId") => [...new Set(usuarios.map((u) => u.metadata?.registro?.[campo]).filter(Boolean).map(String))];
    const [projects, areas, shifts] = await Promise.all([
      Project.find({ _id: { $in: unicos("projectId") } }).select("name").lean(),
      Area.find({ _id: { $in: unicos("areaId") } }).select("name").lean(),
      Shift.find({ _id: { $in: unicos("shiftId") } }).select("name").lean(),
    ]);
    const nombre = new Map([...projects, ...areas, ...shifts].map((x: any) => [String(x._id), x.name]));

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
  } catch (error) {
    console.error("Mis registrados error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /registro-links/mis-registrados/:userId - Cómo se registró (sólo lectura, sólo si lo invité yo).
router.get("/mis-registrados/:userId", requireTenant, authenticateToken, requirePermission(MOBILE_REGISTRO), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    const userId = toObjectIdOrNull(req.params.userId);
    if (!tenantId || !userId) {
      res.status(400).json({ error: "Datos inválidos" });
      return;
    }
    const yo = new Types.ObjectId(String(req.user!.userId));
    const u: any = await User.findOne({ _id: userId, tenantId, "metadata.registro.invitadoPor": yo }).select("firstName lastName email createdAt metadata").lean();
    if (!u) {
      res.status(404).json({ error: "No encontré ese registro entre los tuyos." });
      return;
    }
    const m = u.metadata || {};
    const r = m.registro || {};

    const infoPorTipo = async (tipo: string, id: any) => (id != null ? ((await Info.findOne({ type: tipo, "data.id": Number(id) }).select("name").lean()) as any)?.name || null : null);
    const [proyecto, area, turno, genero, nivelEstudio, nacionalidad, tipoDocumento, banco, rolesFrame]: any[] = await Promise.all([
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
    const ultimos4 = (v?: string) => (v ? `•••• ${String(v).slice(-4)}` : null);

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
        rolesEmpresa: (rolesFrame || []).map((x: any) => x.name),
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
  } catch (error) {
    console.error("Detalle de registrado error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /registro-links/:id/revoke - Revocar (desactivar) un link
router.patch("/:id/revoke", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
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
  } catch (error) {
    console.error("Revoke registro-link error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /registro-links/:id - Eliminar un link
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
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
  } catch (error) {
    console.error("Delete registro-link error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as registroLinkRoutes };
