import { Router } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Client } from "../models/Client.js";
import { Tenant } from "../models/Tenant.js";
import { getTenantAfipConfig, consultarPadron } from "../services/afipService.js";
import { consultarCuitEnArca, ErrorConsultaCuit, usuarioExistenteConCuit } from "../services/arca/consultaCuit.js";
import { cuitEsValido, normalizarCuit } from "../utils/constanciaPdf.js";
import { Info } from "../models/Info.js";
import { Banco } from "../models/Banco.js";
import { listarTipos } from "../utils/tiposEntidadFinanciera.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { RegistroLink, getRegistroLinkExpiry } from "../models/RegistroLink.js";
import crypto from "crypto";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema } from "../validators/authSchemas.js";
import { register, checkEmailAvailability } from "../controllers/authController.js";
import { signJwt } from "../utils/jwt.js";
import { addUserToClientUsuarios } from "../services/clientUsuariosService.js";
import { esPermisoMobile, esPermisoPlataforma } from "../utils/permisosMobile.js";
import { celularValido } from "../utils/telefono.js";
import { PaisResidencia } from "../models/PaisResidencia.js";
import { ensureDefaultRoles } from "../services/roleInitService.js";
import { env } from "../config/env.js";
import { z } from "zod";
import { Types } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { NOVEDAD_REGISTRO, nombreDePersona, notificar, responsablesDeQuienSupervisa } from "../services/novedadesNotificaciones.js";

const registerClientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  company: z.string().min(1, "Company is required"),
  phone: z.string().optional(),
});

const loginWithClientSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  tenantSlug: z.string().optional(),
  clientId: z.string().optional(),
});
const router = Router();

// POST /auth/check-tenants - Obtener tenants disponibles para un email
router.post("/check-tenants", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const users = await User.find({ email, "metadata.activo": true }).select("tenantId").populate("tenantId", "name slug");

    if (users.length === 0) {
      res.status(404).json({ error: "No account found with this email" });
      return;
    }

    const tenants = users.map((u) => {
      const tenant = u.tenantId as any;
      return {
        _id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
      };
    });

    res.json({ tenants });
  } catch (error) {
    console.error("Check tenants error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/check-status - Verificar si es la primera vez que ingresa
router.post("/check-status", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const users = await User.find({ email: email.toLowerCase(), "metadata.activo": true }).select("lastLoginAt");

    if (users.length === 0) {
      res.json({ exists: false, isFirstLogin: false });
      return;
    }

    // Si el usuario existe pero nunca se ha logueado (lastLoginAt es nulo o undefined)
    // Verificamos si CUALQUIERA de las cuentas asociadas a este email nunca se ha logueado.
    // O mejor, si TODAS las cuentas tienen lastLoginAt null/undefined.
    // Asumiremos que si no se ha logueado en ninguna, es first login.
    const isFirstLogin = users.every((u) => !u.lastLoginAt);

    res.json({ exists: true, isFirstLogin });
  } catch (error) {
    console.error("Check status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", validate(loginWithClientSchema), async (req, res) => {
  try {
    const { email, password, tenantSlug, clientId } = req.body;

    // Buscar usuarios con este email
    const users = await User.find({ email, "metadata.activo": true }).populate("roles", "name permissions").populate("tenantId", "_id name slug");

    if (users.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // Si hay múltiples tenants y no se especificó uno
    if (users.length > 1 && !tenantSlug) {
      const tenants = users.map((u) => {
        const tenant = u.tenantId as any;
        return { _id: tenant._id, name: tenant.name, slug: tenant.slug };
      });
      res.status(300).json({
        error: "Multiple tenants found",
        requiresTenantSelection: true,
        tenants,
      });
      return;
    }

    // Seleccionar el usuario correcto
    let user;
    if (tenantSlug) {
      user = users.find((u) => (u.tenantId as any).slug === tenantSlug);
      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
    } else {
      user = users[0];
    }

    // Verificar password
    if (!(await user.comparePassword(password))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const tenantId = (user.tenantId as any)._id;

    // Actualizar último login
    user.lastLoginAt = new Date();
    await user.save();

    // Obtener el nombre del primer rol para compatibilidad
    const primaryRoleName = user.roles && user.roles.length > 0 ? (user.roles[0] as any).name || "" : "";

    // Si es cliente, validar clientId
    if (primaryRoleName === "client") {
      if (!clientId) {
        // Si no se proporciona clientId, usar el primero disponible
        if (user.clientIds && user.clientIds.length > 0) {
          // Auto-asignar el primer cliente
        } else {
          res.status(400).json({ error: "No clients assigned to this user" });
          return;
        }
      } else {
        const userClientIds = user.clientIds.map((id) => id.toString());
        if (!userClientIds.includes(clientId)) {
          res.status(403).json({ error: "Access denied to this client" });
          return;
        }
      }
    }

    // Obtener permisos agregados de todos los roles del usuario
    const rolePermissions = user.roles ? (user.roles as any[]).flatMap((role) => role.permissions || []) : [];

    // Eliminar duplicados
    const permissions = [...new Set(rolePermissions)];

    /*
      A dónde entra.

      El criterio salió de dos roles con nombre fijo y pasó a los permisos: si sólo tiene tarjetas del
      móvil, va derecho a la app; si además tiene algo de la plataforma, el front le muestra el
      selector de portal y decide la persona (ver `LoginPage.tsx`).
    */
    const tienePermisosMobile = permissions.some((p) => esPermisoMobile(p));
    // Supervisor / Coordinador (`:eligible`) no abren la plataforma: ver `esPermisoPlataforma`.
    const tienePermisosPlataforma = permissions.some((p) => esPermisoPlataforma(p));

    let redirectTo = "/orders"; // Ruta por defecto
    if (primaryRoleName.toLowerCase() === "superadmin") {
      redirectTo = "/tenants";
    } else if (tienePermisosMobile && !tienePermisosPlataforma) {
      redirectTo = "/mobile";
    }

    const payload = {
      sub: String(user._id),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      primaryRole: primaryRoleName || null,
      roles: user.roles ? user.roles.map((r: any) => r.name || "user") : [],
      clientIds: user.clientIds ? user.clientIds.map((c: any) => c.toString()) : [],
      tenantId: String(tenantId),
      tenantSlug: (user.tenantId as any).slug,
    };

    const token = signJwt(payload);

    res.json({
      token,
      redirectTo,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles ? user.roles.map((r: any) => r.name || "user") : [],
        primaryRole: primaryRoleName || null,
        clientIds: user.clientIds ? user.clientIds.map((c: any) => c.toString()) : [],
        permissions,
        tenantId,
        tenantSlug: (user.tenantId as any).slug,
        ...(clientId || (user.clientIds && user.clientIds.length > 0)
          ? {
              clientId: clientId || user.clientIds[0].toString(),
            }
          : {}),
      },
    });
    return;
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
    return;
  }
});

// GET /auth/me - Obtener datos del usuario autenticado
router.get("/me", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user?.userId;
    const tenantId = req.tenantObjectId!;

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await User.findOne({ _id: userId, tenantId, "metadata.activo": true }).populate("roles", "name permissions").populate("tenantId", "_id name slug");

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Obtener permisos agregados de todos los roles del usuario
    const rolePermissions = user.roles ? (user.roles as any[]).flatMap((role) => role.permissions || []) : [];
    const permissions = [...new Set(rolePermissions)];

    // Obtener nombre del primer rol
    const primaryRoleName = user.roles && user.roles.length > 0 ? (user.roles[0] as any).name || "" : "";

    res.json({
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles ? user.roles.map((r: any) => r.name || "user") : [],
        primaryRole: primaryRoleName || null,
        clientIds: user.clientIds ? user.clientIds.map((c: any) => c.toString()) : [],
        permissions,
        tenantId: (user.tenantId as any)._id,
        tenantSlug: (user.tenantId as any).slug,
      },
    });
  } catch (err) {
    console.error("Get current user error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /auth/demo-users - Obtener lista de usuarios de todos los tenants (público)
router.get("/demo-users", async (req, res) => {
  try {
    // Definir los emails de los usuarios seed que queremos mostrar
    const seedEmails = ["superadmin@example.com", env.SEED_ADMIN_EMAIL, "user@example.com", "colaborador@mobile.com", "coordinador@mobile.com"];

    // Traer usuarios de todos los tenants filtering by seed emails
    const users = await User.find({
      "metadata.activo": true,
      email: { $in: seedEmails },
    })
      .select("email firstName lastName role metadata tenantId")
      .populate("roles", "name description")
      .populate("tenantId", "name slug")
      .sort({ "tenantId.name": 1, email: 1 })
      .limit(200);

    const demoUsers = users.map((user) => {
      const tenant = user.tenantId as any;
      return {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: user.roles || [],
        metadata: {
          activo: user.metadata?.activo ?? true,
        },
        tenant: {
          _id: tenant?._id || "",
          name: tenant?.name || "Unknown",
          slug: tenant?.slug || "",
        },
      };
    });

    res.json({ users: demoUsers });
  } catch (error) {
    console.error("Get demo users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /auth/clients-for-email
router.get("/clients-for-email", requireTenant, async (req: TenantRequest, res) => {
  try {
    const { email } = req.query;
    const tenantId = req.tenantObjectId!;

    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const user = await User.findOne({ email, tenantId, "metadata.activo": true }).populate("clientIds", "name slug").populate("roles", "name");

    const primaryRoleName = user?.roles && user.roles.length > 0 ? (user.roles[0] as any).name : "";
    if (!user || primaryRoleName !== "client") {
      res.json({ clients: [] });
      return;
    }

    const clients = (user.clientIds as any[]).map((client) => ({
      _id: client._id,
      name: client.name,
      slug: client.slug,
    }));

    res.json({ clients });
  } catch (error) {
    console.error("Get clients for email error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/register-client
router.post("/register-client", requireTenant, validate(registerClientSchema), async (req: TenantRequest, res) => {
  try {
    const { name, email, password, company, phone } = req.body;
    const tenantId = req.tenantObjectId!;

    // Verificar que no existe usuario con el mismo email
    const existingUser = await User.findOne({ email, tenantId });
    if (existingUser) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // Crear cliente
    const client = await Client.create({
      tenantId,
      name: company,
      slug: company.toLowerCase().replace(/[^a-z0-9]/g, "-"),
      email,
      phone,
      company,
      contacts: [{ name, email, phone, role: "owner" }],
      status: "onboarding",
    });

    // Obtener rol cliente por defecto
    const clientRole = await Role.findOne({
      tenantId,
      name: { $regex: /^(client|cliente)$/i },
    });

    // Crear usuario cliente
    const user = await User.create({
      tenantId,
      email,
      password,
      role: "client",
      roles: clientRole ? [clientRole._id] : [],
      clientIds: [client._id],
      firstName: name.split(" ")[0],
      lastName: name.split(" ").slice(1).join(" ") || undefined,
      metadata: { activo: true },
      hireDate: new Date(),
    });

    // Vincular usuario con cliente en Client.usuarios
    await addUserToClientUsuarios({
      tenantId,
      clientId: client._id as any,
      userId: user._id as any,
      permiso: "editar",
    });

    // Actualizar cliente con owner
    client.ownerUserId = user._id as any;
    await client.save();

    // Obtener nombre del rol para JWT
    const roleNames = clientRole ? [clientRole.name] : ["client"];
    const primaryRole = roleNames[0] || "client";

    // Generar token
    const payload = {
      sub: String(user._id),
      email: user.email,
      primaryRole,
      roles: roleNames,
      clientIds: [client._id.toString()],
      tenantId: String(tenantId),
    };

    const token = signJwt(payload);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        primaryRole,
        roles: roleNames,
        clientIds: [client._id.toString()],
        tenantId,
        clientId: client._id.toString(),
      },
      client: {
        _id: client._id,
        name: client.name,
        slug: client.slug,
      },
    });
  } catch (error: any) {
    console.error("Register client error:", error);

    if (error.code === 11000) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
});
// POST /auth/register - Registro con tenantSlug
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, tenantSlug } = req.body;

    if (!email || !password || !firstName || !tenantSlug) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Resolver tenant desde slug
    const tenant = await Tenant.findOne({ slug: tenantSlug });
    if (!tenant) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const tenantId = tenant._id;

    // Verificar email único en el tenant
    const existingUser = await User.findOne({ email, tenantId });
    if (existingUser) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // Obtener rol por defecto
    const defaultRole = await Role.findOne({
      tenantId,
      name: { $regex: /^user$/i },
    });

    // Crear usuario
    const user = await User.create({
      tenantId,
      email,
      password,
      firstName,
      lastName,
      role: "user",
      roles: defaultRole ? [defaultRole._id] : [],
      metadata: { activo: true },
      hireDate: new Date(),
    });

    // Obtener permisos
    const rolePermissions = defaultRole?.permissions || [];
    const permissions = [...new Set(rolePermissions)];

    // Obtener nombres de roles para JWT
    const roleNames = defaultRole ? [defaultRole.name] : ["user"];
    const primaryRole = roleNames[0] || "user";

    // Generar token
    const payload = {
      sub: String(user._id),
      email: user.email,
      primaryRole,
      roles: roleNames,
      tenantId: String(tenantId),
      tenantSlug,
    };

    const token = signJwt(payload);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        primaryRole,
        roles: roleNames,
        permissions,
        tenantId: String(tenantId),
        tenantSlug,
      },
    });
  } catch (error: any) {
    console.error("Register error:", error);

    if (error.code === 11000) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

// ───────────────────────── Registro público con token de invitación ─────────────────────────

const REGISTRO_TOKEN_PURPOSE = "registro";

interface RegistroTokenPayload {
  purpose: string;
  tenantId: string;
  tenantSlug?: string;
  clientId?: string;
  /** Presente solo cuando el token proviene de un RegistroLink en BD */
  linkId?: string;
  /** Links del móvil: quién invitó y para qué proyecto, área y turno. */
  createdBy?: string;
  projectId?: string;
  areaId?: string;
  shiftId?: string;
}

/**
 * Valida un token de registro. Primero busca un RegistroLink activo en BD
 * (links persistentes y revocables). Si no existe, cae al JWT legacy (30d)
 * por compatibilidad con links generados antes de la migración.
 */
async function verifyRegistroToken(token: string): Promise<RegistroTokenPayload | null> {
  if (!token) return null;

  // 1. Link persistente en BD
  const link = await RegistroLink.findOne({ token, active: true });
  if (link) {
    // Vence a los 30 días de creado → tratar como inválido (misma landing que revocado)
    if (Date.now() > getRegistroLinkExpiry(link)) return null;
    return {
      purpose: REGISTRO_TOKEN_PURPOSE,
      tenantId: String(link.tenantId),
      tenantSlug: link.tenantSlug,
      ...(link.clientId ? { clientId: String(link.clientId) } : {}),
      linkId: String(link._id),
      ...(link.createdBy ? { createdBy: String(link.createdBy) } : {}),
      ...(link.projectId ? { projectId: String(link.projectId) } : {}),
      ...(link.areaId ? { areaId: String(link.areaId) } : {}),
      ...(link.shiftId ? { shiftId: String(link.shiftId) } : {}),
    };
  }

  // 2. Fallback: JWT legacy
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as RegistroTokenPayload;
    if (!payload || payload.purpose !== REGISTRO_TOKEN_PURPOSE || !payload.tenantId) return null;
    return payload;
  } catch {
    return null;
  }
}

// POST /auth/registro-link - Generar token de invitación de registro (requiere auth)
router.post("/registro-link", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantObjectId).select("_id slug");
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    const { clientId, durationDays } = req.body || {};
    let validClientId: string | undefined;
    if (clientId && Types.ObjectId.isValid(clientId)) {
      const client = await Client.findOne({ _id: clientId, tenantId: tenant._id }).select("_id");
      if (client) validClientId = String(client._id);
    }

    // Duración elegida al crear (inmutable). Default 30 si no viene; 400 si viene inválida.
    const MIN_LINK_DAYS = 1;
    const MAX_LINK_DAYS = 365;
    let days = 30;
    if (durationDays !== undefined && durationDays !== null && durationDays !== "") {
      const n = Number(durationDays);
      if (!Number.isInteger(n) || n < MIN_LINK_DAYS || n > MAX_LINK_DAYS) {
        res.status(400).json({ error: `La duración debe ser un número entero entre ${MIN_LINK_DAYS} y ${MAX_LINK_DAYS} días` });
        return;
      }
      days = n;
    }

    // Token aleatorio URL-safe, persistente y revocable.
    const token = crypto.randomBytes(32).toString("base64url");

    await RegistroLink.create({
      tenantId: tenant._id,
      tenantSlug: tenant.slug,
      token,
      ...(validClientId ? { clientId: validClientId } : {}),
      createdBy: req.user?.userId,
      active: true,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    });

    res.json({ token });
  } catch (error) {
    console.error("registro-link error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /auth/registro-info?token=... - Catálogos públicos para el formulario de registro
router.get("/registro-info", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    const payload = await verifyRegistroToken(token);
    if (!payload) {
      res.status(401).json({ error: "Link inválido o expirado" });
      return;
    }

    const types = ["genero", "tipo-documento", "nivel-estudio", "nacionalidad", "pais", "obra-social"];
    const items = await Info.find({ type: { $in: types } }).sort({ name: 1 }).lean();
    const pick = (t: string) => items.filter((i) => i.type === t).map((i) => ({ id: i.data?.id, name: i.name }));
    const nacionalidades = pick("nacionalidad").length > 0 ? pick("nacionalidad") : pick("pais");
    // País de NACIMIENTO: catálogo aparte, para quien se declara nacionalizado/a. Antes `pick("pais")`
    // se pedía solo como fallback de `nacionalidades` y nunca viajaba al front por su cuenta.
    const paises = pick("pais");
    /*
      País del DOMICILIO: sale del ABM de Países de residencia, sólo los activos. Es otra lista que la de
      arriba (nacimiento/nacionalidad, de FRAME). Si el catálogo todavía no tiene nada —un server recién
      desplegado antes de su primera carga—, se ofrecen los de FRAME para que el formulario no quede sin
      opciones: comparten ids, así que lo elegido sigue siendo válido.
    */
    const residenciaDocs: any[] = await PaisResidencia.find({ activo: { $ne: false } }).sort({ name: 1 }).lean();
    const paisesResidencia = residenciaDocs.length > 0 ? residenciaDocs.filter((d) => d.data?.id != null).map((d) => ({ id: d.data.id, name: d.name })) : paises;
    const rolesFrame = (await RoleFrame.find().select("name").sort({ name: 1 }).lean()).map((r) => ({ id: String(r._id), name: r.name }));

    // Entidades financieras desde el catálogo del ABM (colección `bancos`), con su tipoEntidad
    // para permitir el filtrado en cascada del formulario de registro. Sólo las activas: las
    // inactivas se apagan en el ABM justamente para que nadie nuevo las elija.
    const bancos = (await Banco.find({ activo: { $ne: false } }).sort({ name: 1 }).lean()).map((b) => ({
      id: b.data?.id,
      name: b.name,
      tipoEntidad: b.tipoEntidad || "banco",
    }));
    // Los tipos activos, con qué datos pide cada uno: arman la cascada de datos bancarios del formulario.
    const tiposEntidad = (await listarTipos(true)).map((t) => ({ clave: t.clave, nombre: t.nombre, pideTipoCuenta: t.pideTipoCuenta, pideNroCuenta: t.pideNroCuenta, rotuloCbu: t.rotuloCbu }));

    /*
      EL LINK MISMO: cuántos días le quedan y, si lo generó alguien desde el móvil, quién invita y para
      qué proyecto, área y turno. La página lo muestra arriba, así quien se registra sabe hasta cuándo
      tiene y dónde va a trabajar.
    */
    let link: { expiresAt: string; diasRestantes: number; proyecto: string | null; area: string | null; turno: string | null; invitadoPor: string | null } | null = null;
    if (payload.linkId) {
      const l: any = await RegistroLink.findById(payload.linkId).lean();
      if (l) {
        const vence = getRegistroLinkExpiry(l);
        const [{ Project }, { Area }, { Shift }] = await Promise.all([import("../models/Project.js"), import("../models/Area.js"), import("../models/Shift.js")]);
        const [proyecto, area, turno, invitador]: any[] = await Promise.all([
          l.projectId ? Project.findById(l.projectId).select("name").lean() : null,
          l.areaId ? Area.findById(l.areaId).select("name").lean() : null,
          l.shiftId ? Shift.findById(l.shiftId).select("name").lean() : null,
          l.createdBy ? User.findById(l.createdBy).select("firstName lastName").lean() : null,
        ]);
        link = {
          expiresAt: new Date(vence).toISOString(),
          diasRestantes: Math.max(0, Math.ceil((vence - Date.now()) / 86400000)),
          proyecto: proyecto?.name || null,
          area: area?.name || null,
          turno: turno?.name || null,
          invitadoPor: invitador ? `${invitador.firstName || ""} ${invitador.lastName || ""}`.trim() || null : null,
        };
      }
    }

    res.json({
      tenantSlug: payload.tenantSlug,
      link,
      generos: pick("genero"),
      tiposDocumento: pick("tipo-documento"),
      nivelesEstudio: pick("nivel-estudio"),
      nacionalidades,
      paises,
      paisesResidencia,
      // Sin `obrasSociales`: el registro dejó de pedirla. Quien se registra no puede saber qué RNOS
      // le corresponde ante ARCA —se constata en el padrón de la SSS al hacer el contrato—, y eran
      // 496 registros viajando en un endpoint público sin que nadie los usara.
      bancos,
      tiposEntidad,
      rolesFrame,
    });
  } catch (error) {
    console.error("registro-info error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /auth/registro/validar-cuit { token, cuit } — el mismo «Validar CUIT» del alta, para el registro.
 *
 * ES PÚBLICO, PERO NO ABIERTO: exige el token de invitación, igual que el resto del formulario. Sin
 * eso sería un consultor de nombres por CUIT gratis para cualquiera que descubra la URL. Con el token,
 * el alcance es el de las personas efectivamente invitadas.
 *
 * No toca la base ni escribe sellos: solo devuelve lo que ARCA tiene para ese CUIT. El sello se pone
 * en `POST /auth/registro`, donde el servidor vuelve a consultar y recién ahí lo escribe.
 */
router.post("/registro/validar-cuit", async (req, res) => {
  try {
    const payload = await verifyRegistroToken(String(req.body?.token || ""));
    if (!payload) {
      res.status(401).json({ error: "Link inválido o expirado" });
      return;
    }
    const datos = await consultarCuitEnArca(payload.tenantId, String(req.body?.cuit || ""));
    res.json({ ...datos, yaExiste: await usuarioExistenteConCuit(payload.tenantId, datos.cuit) });
  } catch (error: any) {
    if (error instanceof ErrorConsultaCuit) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("registro validar-cuit error:", error);
    res.status(500).json({ error: "No se pudo consultar el Padrón." });
  }
});

// POST /auth/registro - Registro público de usuario validando token de invitación
router.post("/registro", async (req, res) => {
  try {
    const { token, ...body } = req.body || {};
    const payload = await verifyRegistroToken(token);
    if (!payload) {
      res.status(401).json({ error: "Link inválido o expirado" });
      return;
    }

    const tenant = await Tenant.findById(payload.tenantId).select("_id slug");
    if (!tenant) {
      res.status(404).json({ error: "Organización no encontrada" });
      return;
    }
    const tenantId = tenant._id as Types.ObjectId;

    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const documento = String(body.documento || "").trim();
    /*
      LA CONTRASEÑA LA ELIGE LA PERSONA. El DNI queda solo como respaldo.

      Antes era SIEMPRE el documento: un dato que figura en el contrato, en el CUIT y en cualquier
      planilla del proyecto, o sea que la credencial de cada quien era pública dentro de la propia
      organización. Ahora el formulario pide una y ofrece generarla.

      El fallback al documento se mantiene a propósito, para que un link de registro que ya estaba
      abierto —con el formulario viejo, sin el campo— siga funcionando en vez de romper con un 400.
    */
    const passwordElegida = String(body.password || "");
    const password = passwordElegida.length >= 6 ? passwordElegida : documento;

    if (!firstName || !lastName || !email || !documento) {
      res.status(400).json({ error: "Faltan campos obligatorios" });
      return;
    }

    /*
      EL CELULAR SE VALIDA ACÁ TAMBIÉN, no sólo en el formulario.

      Este alta es pública —alcanza con tener el link— y el formulario es sólo la primera puerta: antes
      se guardaba lo que llegara, letras y dígitos de más incluidos, y el número roto aparecía recién
      cuando alguien intentaba llamar. La regla es la misma que la del formulario (`utils/telefono.ts`).

      Si NO vino, no se exige: un link abierto con un formulario viejo tiene que seguir andando, igual
      que con la contraseña de arriba.
    */
    if (body.telefono && !celularValido(String(body.telefono))) {
      res.status(400).json({ error: "El teléfono no es un celular válido: tienen que ser 10 dígitos, con el código de área sin 0 y el número sin 15 (ej: 11 1234-5678)." });
      return;
    }

    // Altura y código postal, sólo números: mismo criterio que el formulario, por el mismo motivo que el celular.
    if (body.altura && !/^\d+$/.test(String(body.altura).trim())) {
      res.status(400).json({ error: "La altura tiene que ser sólo números." });
      return;
    }
    if (body.codigoPostal && !/^\d+$/.test(String(body.codigoPostal).trim())) {
      res.status(400).json({ error: "El código postal tiene que ser sólo números." });
      return;
    }

    const existingUser = await User.findOne({ email, tenantId });
    if (existingUser) {
      res.status(409).json({ error: "El email ya se encuentra registrado" });
      return;
    }

    /*
      Y TAMPOCO SI YA EXISTE ESE CUIT, aunque el email sea otro.

      El email no identifica a una persona: la misma podía registrarse dos veces con dos correos y
      quedar duplicada. Eso recién se descubría cuando dos contratos apuntaban a legajos distintos del
      mismo CUIL, con la mitad de los datos en cada uno.
    */
    const duplicado = await usuarioExistenteConCuit(tenantId, String(body.cuit || ""));
    if (duplicado) {
      res.status(409).json({ error: `Ese CUIT ya figura a nombre de ${duplicado.nombre}. Si sos vos, entrá con tu cuenta o escribile a la productora. Si no, revisá el número.` });
      return;
    }

    /*
      Rol por defecto: el que el tenant tenga marcado como tal.

      Antes se buscaba literalmente el rol "Mobile-Colaborador" por nombre —con un regex distinto del
      que usaba el import de FRAME, que hacía lo mismo—. Ese rol dejó de ser especial: lo que define
      qué ve una persona recién registrada es el rol por defecto del tenant, que se elige desde
      Usuarios → Roles y que la migración se encarga de que abra la app.
    */
    const rolPorDefecto = await Role.findOne({ tenantId, isDefault: true }).select("_id");
    if (!rolPorDefecto) {
      console.warn(`[registro] El tenant ${tenantId} no tiene rol por defecto: el alta queda sin permisos.`);
    }
    const roles = [rolPorDefecto?._id].filter(Boolean) as Types.ObjectId[];

    const num = (v: any) => (v != null && v !== "" ? Number(v) : undefined);
    /*
      VARIOS roles empresa, no uno.

      Una misma persona puede ser Asistente de Cámara en un proyecto y Foquista en otro; obligarla a
      elegir uno hacía que el dato entrara incompleto desde el registro y hubiera que arreglarlo a
      mano después. Se sigue aceptando `rolFrameId` en singular para no romper links ya abiertos.
    */
    const rolesFrameIds: string[] = Array.isArray(body.rolesFrameIds)
      ? body.rolesFrameIds.filter((r: any) => Types.ObjectId.isValid(String(r))).map(String)
      : body.rolFrameId && Types.ObjectId.isValid(body.rolFrameId)
        ? [String(body.rolFrameId)]
        : [];

    /*
      «NO TENGO BANCO» TRAE CUÁL DE LAS TRES SITUACIONES ES: le abren una cuenta, trae la suya, u otra
      cosa (con su detalle). `solicitaCreacionCuenta` se sigue guardando porque de él cuelga el aviso
      de «hay que abrirle la cuenta»; un formulario viejo abierto que sólo mande la casilla sigue andando.
    */
    const MOTIVOS_SIN_BANCO = ["crear_cuenta", "proveera_cuenta", "otro"];
    const motivoSinBanco = body.tipoEntidadFinanciera === "sin_banco" && MOTIVOS_SIN_BANCO.includes(String(body.sinBancoMotivo)) ? String(body.sinBancoMotivo) : undefined;

    /*
      EL PAÍS DEL DOMICILIO: se guarda su id en el ABM de Países de residencia Y su nombre.

      El id es lo que usan los formularios (ficha del usuario, Mi Perfil, la app). El nombre es lo que ya
      leían el perfil del móvil y el detalle de registrados, que se armaron cuando esto era texto libre.
      Se resuelve ACÁ contra el catálogo y no se toma del body: el nombre lo pone el catálogo, no el
      cliente. Un formulario viejo que todavía mande `pais` como texto sigue andando.
    */
    const paisIdNum = num(body.paisId);
    const paisResidencia: any = paisIdNum !== undefined ? await PaisResidencia.findOne({ "data.id": paisIdNum }).select("name").lean() : null;
    if (paisIdNum !== undefined && !paisResidencia) {
      res.status(400).json({ error: "El país elegido no está en la lista de países de residencia. Recargá la página y elegilo de nuevo." });
      return;
    }

    const metadata: Record<string, any> = {
      activo: true,
      cuit: body.cuit || undefined,
      // Declaración explícita de "no tiene CUIT/CUIL argentino" (extranjeros): distinto de "no se
      // cargó todavía". Habilita el circuito de documentos sin AFIP (ver afip.ts -> habilitar-firma).
      sinCuit: body.sinCuit === true || body.sinCuit === "true" ? true : undefined,
      tipoDocumentoId: num(body.tipoDocumentoId),
      documento: documento || undefined,
      fechaNac: body.fechaNac || undefined,
      generoId: num(body.generoId),
      nivelEstudioId: num(body.nivelEstudioId),
      nacionalidadId: num(body.nacionalidadId),
      // Ver `esCuilObligatorio` en el frontend: solo cambia algo cuando nacionalidadId es Argentina.
      nacionalizado: body.nacionalizado === true || body.nacionalizado === "true" ? true : undefined,
      paisNacimientoId: num(body.paisNacimientoId),
      // Sin `osId`: la obra social se declara en el contrato, no en la persona. Aunque un cliente
      // viejo la siga mandando en el body, acá se ignora.
      estadoCivil: body.estadoCivil || undefined,
      roles_frame: rolesFrameIds,
      rolesFrameIds,
      // Domicilio
      pais: paisResidencia?.name || body.pais || undefined,
      paisId: paisResidencia ? paisIdNum : undefined,
      localidad: body.localidad || undefined,
      calle: body.calle || undefined,
      altura: body.altura || undefined,
      pisoDepto: body.pisoDepto || undefined,
      codigoPostal: body.codigoPostal || undefined,
      telefono: body.telefono || undefined,
      // Datos bancarios
      tipoEntidadFinanciera: body.tipoEntidadFinanciera || undefined,
      solicitaCreacionCuenta: motivoSinBanco ? motivoSinBanco === "crear_cuenta" : !!body.solicitaCreacionCuenta,
      sinBancoMotivo: motivoSinBanco,
      sinBancoDetalle: motivoSinBanco === "otro" ? String(body.sinBancoDetalle || "").trim().slice(0, 300) || undefined : undefined,
      bancoId: num(body.bancoId),
      tipoDeCuentaBancaria: body.tipoDeCuentaBancaria || undefined,
      cbu: body.cbu || undefined,
      aliasBancario: body.aliasBancario || undefined,
      nroDeCuentaBancaria: body.nroDeCuentaBancaria || undefined,
    };

    /*
      DE QUÉ LINK VINO. Con un link del móvil queda quién invitó y para qué proyecto, área y turno: es lo
      que arma la lista «Registrados» de esa persona. Sale del link en la base, nunca del body.
    */
    if (payload.linkId) {
      const oid = (id?: string) => (id && Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : undefined);
      metadata.registro = {
        linkId: oid(payload.linkId),
        invitadoPor: oid(payload.createdBy),
        projectId: oid(payload.projectId),
        areaId: oid(payload.areaId),
        shiftId: oid(payload.shiftId),
        registradoAt: new Date(),
      };
    }

    const clientIds = payload.clientId && Types.ObjectId.isValid(payload.clientId) ? [new Types.ObjectId(payload.clientId)] : [];

    /*
      EL SELLO LO PONE EL SERVIDOR, también acá — y con más razón que en el alta interna.

      Este endpoint es público: cualquiera con un link de invitación manda el body que quiera. Aceptar
      un `nombreValidadoArcaAt` desde afuera sería dejar que la persona se autocertifique el nombre.
      Si el formulario dice haber validado, este proceso vuelve a consultar el Padrón y escribe el
      nombre que devuelve ARCA, no el que vino tipeado.
    */
    let nombreArca = { firstName, lastName };
    if (req.body?.validarConArca === true) {
      const cuitReg = normalizarCuit(String(metadata.cuit || ""));
      const cfgReg = getTenantAfipConfig(await Tenant.findById(tenantId).lean());
      if (cuitEsValido(cuitReg) && cfgReg) {
        try {
          const r = await consultarPadron(String(tenantId), cfgReg, cuitReg);
          if (r.encontrado && r.nombre && r.apellido) {
            nombreArca = { firstName: r.nombre, lastName: r.apellido };
            metadata.nombreValidadoArcaAt = new Date();
          }
        } catch {
          // Sin sello: el registro sigue igual y la persona queda "sin validar", que es lo que es.
        }
      }
    }

    const user = new User({
      tenantId,
      email,
      password,
      firstName: nombreArca.firstName,
      lastName: nombreArca.lastName,
      roles,
      clientIds,
      hireDate: new Date(),
      metadata,
    });

    await user.save();

    await Tenant.findByIdAndUpdate(tenantId, {
      $addToSet: { userIds: user._id },
      $inc: { "usage.users.current": 1 },
    });

    if (clientIds.length > 0) {
      try {
        await addUserToClientUsuarios({ tenantId, clientId: clientIds[0], userId: user._id as Types.ObjectId });
      } catch (e) {
        console.warn("registro: no se pudo agregar el usuario al cliente:", e);
      }
    }

    // Registrar uso del link persistente (si el token provino de BD)
    if (payload.linkId) {
      try {
        await RegistroLink.updateOne({ _id: payload.linkId }, { $inc: { usageCount: 1 }, $set: { lastUsedAt: new Date() } });
      } catch (e) {
        console.warn("registro: no se pudo actualizar el uso del link:", e);
      }
    }

    /*
      AVISAR QUE SE REGISTRÓ ALGUIEN.

      Le llega a quien compartió el link —es su gente— y al coordinador del proyecto donde esa persona
      supervisa áreas o turnos, que es quien responde por lo que se suma al equipo. Es el mismo criterio
      con el que la app decide de quiénes ve los registrados, así que nadie recibe un aviso de alguien
      que después no puede mirar.

      Sin `linkId` no se avisa: ese registro no vino de un link de nadie y no hay a quién avisarle.
    */
    if (payload.linkId && payload.createdBy) {
      const nombre = nombreDePersona({ firstName: nombreArca.firstName, lastName: nombreArca.lastName });
      const invitador: any = await User.findById(payload.createdBy).select("firstName lastName metadata.fullName").lean();
      await notificar({
        tenantId,
        destinatarios: [payload.createdBy],
        type: NOVEDAD_REGISTRO,
        title: "Nuevo registro",
        message: `${nombre} se registró con tu link.`,
        refId: user._id as Types.ObjectId,
      });
      const responsables = await responsablesDeQuienSupervisa(tenantId, String(payload.createdBy));
      await notificar({
        tenantId,
        destinatarios: responsables,
        type: NOVEDAD_REGISTRO,
        title: "Nuevo registro",
        message: `${nombre} se registró con el link de ${nombreDePersona(invitador)}.`,
        refId: user._id as Types.ObjectId,
        excepto: payload.createdBy,
      });
    }

    res.status(201).json({ success: true, message: "Registro completado correctamente" });
  } catch (error: any) {
    console.error("registro error:", error);
    if (error?.code === 11000) {
      res.status(409).json({ error: "El email ya se encuentra registrado" });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/check-email", requireTenant, checkEmailAvailability);

// POST /auth/register-tenant - Registro público de tenant con usuario admin
const registerTenantSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/register-tenant", async (req, res) => {
  try {
    const data = registerTenantSchema.parse(req.body);

    // Verificar que el email no esté registrado
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    // Generar slug único si el propuesto ya existe
    let finalSlug = data.slug;
    let slugExists = await Tenant.findOne({ slug: finalSlug });
    let counter = 1;

    while (slugExists) {
      finalSlug = `${data.slug}-${counter}`;
      slugExists = await Tenant.findOne({ slug: finalSlug });
      counter++;

      // Límite de seguridad para evitar loops infinitos
      if (counter > 999) {
        res.status(500).json({ error: "Unable to generate unique slug" });
        return;
      }
    }

    const now = new Date();
    const endOfPeriod = new Date(now);
    endOfPeriod.setMonth(endOfPeriod.getMonth() + 1);

    // Crear tenant
    const tenant = new Tenant({
      name: data.companyName,
      slug: finalSlug,
      company: {
        legalName: data.companyName,
        description: "New tenant",
      },
      contact: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
      },
      settings: {
        timezone: "UTC",
        currency: "USD",
        language: "en",
        features: [],
      },
      subscription: {
        plan: "free",
        status: "active",
      },
      usage: {
        users: { current: 0, limit: 10 },
        clients: { current: 0, limit: 50 },
        campaigns: { current: 0, limit: 100 },
        storage: { usedMB: 0, limitMB: 1024 },
        apiCalls: { current: 0, limit: 10000, resetDate: endOfPeriod },
      },
      billing: {
        currentPeriod: {
          startDate: now,
          endDate: endOfPeriod,
          amount: 0,
          currency: "USD",
        },
        invoices: [],
        autoRenew: true,
      },
      isActive: true,
    });

    await tenant.save();

    // Los roles se crean automáticamente mediante el hook post-save del modelo Tenant
    // Esperar un momento para que se complete el hook
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Obtener el rol admin creado automáticamente
    const { adminRole } = await ensureDefaultRoles(tenant._id as Types.ObjectId);

    // Crear usuario administrador
    const adminUser = new User({
      tenantId: tenant._id,
      email: data.email,
      password: data.password,
      firstName: data.firstName,
      lastName: data.lastName,
      roles: [adminRole._id],
      metadata: { activo: true },
      hireDate: new Date(),
    });

    await adminUser.save();

    // Agregar usuario al tenant
    await Tenant.findByIdAndUpdate(tenant._id, {
      $addToSet: { userIds: adminUser._id },
      $inc: { "usage.users.current": 1 },
    });

    // Auto-login
    const token = signJwt({
      sub: adminUser._id.toString(),
      email: adminUser.email,
      tenantId: tenant._id.toString(),
      tenantSlug: tenant.slug,
    });

    await User.findByIdAndUpdate(adminUser._id, {
      lastLoginAt: new Date(),
    });

    res.status(201).json({
      message: "Tenant and admin user created successfully",
      token,
      user: {
        id: adminUser._id,
        email: adminUser.email,
        firstName: adminUser.firstName,
        lastName: adminUser.lastName,
        roles: [{ _id: adminRole._id, name: adminRole.name }],
      },
      tenant: {
        id: tenant._id,
        name: tenant.name,
        slug: tenant.slug,
      },
    });
  } catch (error: any) {
    console.error("Register tenant error:", error);

    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }

    if (error.code === 11000) {
      res.status(409).json({ error: "Tenant or email already exists" });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as authRoutes };
