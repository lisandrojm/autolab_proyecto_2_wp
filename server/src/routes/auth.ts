import { Router } from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Client } from "../models/Client.js";
import { Tenant } from "../models/Tenant.js";
import { Info } from "../models/Info.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { RegistroLink } from "../models/RegistroLink.js";
import crypto from "crypto";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema } from "../validators/authSchemas.js";
import { register, checkEmailAvailability } from "../controllers/authController.js";
import { signJwt } from "../utils/jwt.js";
import { addUserToClientUsuarios } from "../services/clientUsuariosService.js";
import { ensureDefaultRoles } from "../services/roleInitService.js";
import { env } from "../config/env.js";
import { z } from "zod";
import { Types } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

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

    // Calcular redirectTo basado en permisos
    let redirectTo = "/orders"; // Ruta por defecto
    if (primaryRoleName.toLowerCase() === "superadmin") {
      redirectTo = "/tenants";
    } else if (permissions.includes("mobile_collaborator:view") || permissions.includes("mobile_coordinator:view")) {
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
    return {
      purpose: REGISTRO_TOKEN_PURPOSE,
      tenantId: String(link.tenantId),
      tenantSlug: link.tenantSlug,
      ...(link.clientId ? { clientId: String(link.clientId) } : {}),
      linkId: String(link._id),
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

    const { clientId } = req.body || {};
    let validClientId: string | undefined;
    if (clientId && Types.ObjectId.isValid(clientId)) {
      const client = await Client.findOne({ _id: clientId, tenantId: tenant._id }).select("_id");
      if (client) validClientId = String(client._id);
    }

    // Token aleatorio URL-safe, persistente y revocable (no vence)
    const token = crypto.randomBytes(32).toString("base64url");

    await RegistroLink.create({
      tenantId: tenant._id,
      tenantSlug: tenant.slug,
      token,
      ...(validClientId ? { clientId: validClientId } : {}),
      createdBy: req.user?.userId,
      active: true,
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

    const types = ["genero", "tipo-documento", "nivel-estudio", "nacionalidad", "pais", "obra-social", "banco"];
    const items = await Info.find({ type: { $in: types } }).sort({ name: 1 }).lean();
    const pick = (t: string) => items.filter((i) => i.type === t).map((i) => ({ id: i.data?.id, name: i.name }));
    const nacionalidades = pick("nacionalidad").length > 0 ? pick("nacionalidad") : pick("pais");
    const rolesFrame = (await RoleFrame.find().select("name").sort({ name: 1 }).lean()).map((r) => ({ id: String(r._id), name: r.name }));

    res.json({
      tenantSlug: payload.tenantSlug,
      generos: pick("genero"),
      tiposDocumento: pick("tipo-documento"),
      nivelesEstudio: pick("nivel-estudio"),
      nacionalidades,
      obrasSociales: pick("obra-social"),
      bancos: pick("banco"),
      rolesFrame,
    });
  } catch (error) {
    console.error("registro-info error:", error);
    res.status(500).json({ error: "Internal server error" });
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
    const password = String(body.password || "");

    if (!firstName || !lastName || !email || !password) {
      res.status(400).json({ error: "Faltan campos obligatorios" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
      return;
    }

    const existingUser = await User.findOne({ email, tenantId });
    if (existingUser) {
      res.status(409).json({ error: "El email ya se encuentra registrado" });
      return;
    }

    // Rol por defecto: únicamente mobile-colaborador
    const mobileRole = await Role.findOne({ tenantId, name: { $regex: /^mobile-colaborador$/i } }).select("_id");
    const roles = [mobileRole?._id].filter(Boolean) as Types.ObjectId[];

    const num = (v: any) => (v != null && v !== "" ? Number(v) : undefined);
    const rolFrameId = body.rolFrameId && Types.ObjectId.isValid(body.rolFrameId) ? String(body.rolFrameId) : undefined;

    const metadata: Record<string, any> = {
      activo: true,
      cuit: body.cuit || undefined,
      tipoDocumentoId: num(body.tipoDocumentoId),
      documento: body.documento || undefined,
      fechaNac: body.fechaNac || undefined,
      generoId: num(body.generoId),
      nivelEstudioId: num(body.nivelEstudioId),
      nacionalidadId: num(body.nacionalidadId),
      osId: num(body.osId),
      estadoCivil: body.estadoCivil || undefined,
      roles_frame: rolFrameId ? [rolFrameId] : [],
      rolesFrameIds: rolFrameId ? [rolFrameId] : [],
      // Domicilio
      pais: body.pais || undefined,
      localidad: body.localidad || undefined,
      calle: body.calle || undefined,
      altura: body.altura || undefined,
      pisoDepto: body.pisoDepto || undefined,
      codigoPostal: body.codigoPostal || undefined,
      telefono: body.telefono || undefined,
      telefono2: body.telefono2 || undefined,
      visa: !!body.visa,
      // Datos bancarios
      bancoId: num(body.bancoId),
      tipoDeCuentaBancaria: body.tipoDeCuentaBancaria || undefined,
      cbu: body.cbu || undefined,
      aliasBancario: body.aliasBancario || undefined,
      nroDeCuentaBancaria: body.nroDeCuentaBancaria || undefined,
    };

    const clientIds = payload.clientId && Types.ObjectId.isValid(payload.clientId) ? [new Types.ObjectId(payload.clientId)] : [];

    const user = new User({
      tenantId,
      email,
      password,
      firstName,
      lastName,
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
