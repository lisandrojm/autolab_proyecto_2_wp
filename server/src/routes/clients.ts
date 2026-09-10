import { Router } from "express";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";
import { z } from "zod";
import { Client } from "../models/Client.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Tenant } from "../models/Tenant.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";
import { Types } from "mongoose";
import { toObjectIdOrNull } from "../utils/mongoIds.js";

const router = Router();

/** ✅ Global: exigir tenant + token + al menos un rol */
router.use(requireTenant, authenticateToken, requireAnyRole);

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  socialMedia: z
    .object({
      facebook: z.string().optional(),
      instagram: z.string().optional(),
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
      tiktok: z.string().optional(),
      youtube: z.string().optional(),
    })
    .default({}),

  costCenters: z
    .array(
      z.object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        budget: z.object({
          total: z.number().min(0),
          allocated: z.number().min(0).default(0),
          spent: z.number().min(0).default(0),
          currency: z.enum(["EUR", "USD", "GBP", "MXN", "ARS"]).default("EUR"),
        }),
        isActive: z.boolean().default(true),
      }),
    )
    .default([]),
  externalId: z.string().optional(),
  cuit: z.string().optional(),
  brief: z
    .object({
      objectives: z.array(z.string()).optional(),
      targetAudience: z.string().optional(),
      budget: z.number().optional(),
      timeline: z.string().optional(),
      preferences: z.string().optional(),
    })
    .optional(),
  brandKit: z
    .object({
      logos: z.array(z.any()).optional(),
      documents: z.array(z.any()).optional(),
      colors: z.array(z.string()).optional(),
      fonts: z.array(z.string()).optional(),
      guidelines: z.string().optional(),
    })
    .optional(),
});

// ✅ GET /clients
router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) return res.status(400).json({ error: "Invalid tenant ID" });

    const filter: any = { tenantId };

    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isContextAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    // Verificar si el usuario pertenece al tenant 'superadmin' para dar acceso global
    let isGlobalSuperAdmin = false;
    if (req.user?.tenantId) {
      const userHomeTenant = await Tenant.findById(req.user.tenantId).select("slug");
      if (userHomeTenant?.slug === "superadmin") {
        isGlobalSuperAdmin = true;
      }
    }

    if (isGlobalSuperAdmin) {
      // Superadmin ve todo (sin filtro de tenantId forzado)
      delete filter.tenantId;
    } else {
      // Si no es superadmin global, respetar el tenant actual
      if (!isContextAdmin) {
        // Se ve lo asignado Y los clientes de los proyectos que la persona tiene a cargo como
        // Responsable de Proyecto (ver `alcanceDeResponsable`): sin esto, ese rol abría el escritorio
        // sin un solo cliente y toda la navegación quedaba trabada en el primer paso.
        const { clientes } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
        if (clientes.length > 0) filter.$or = [{ assignedUsers: req.user!.userId }, { _id: { $in: clientes } }];
        else filter.assignedUsers = req.user!.userId;
      }
    }

    // Populate tenantId para mostrar badge
    const clients = await Client.find(filter).sort({ createdAt: -1 }).populate("tenantId", "name slug");
    res.json(clients);
  } catch (error) {
    console.error("Get clients error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /clients/count
router.get("/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) return res.status(400).json({ error: "Invalid tenant ID" });

    const filter: any = { tenantId };
    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isContextAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    let isGlobalSuperAdmin = false;
    if (req.user?.tenantId) {
      const userHomeTenant = await Tenant.findById(req.user.tenantId).select("slug");
      if (userHomeTenant?.slug === "superadmin") {
        isGlobalSuperAdmin = true;
      }
    }

    if (isGlobalSuperAdmin) {
      delete filter.tenantId;
    } else {
      if (!isContextAdmin) {
        // El mismo alcance que la lista: si contara distinto, el número del menú no coincidiría con
        // las filas de la pantalla.
        const { clientes } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
        if (clientes.length > 0) filter.$or = [{ assignedUsers: req.user!.userId }, { _id: { $in: clientes } }];
        else filter.assignedUsers = req.user!.userId;
      }
    }

    const count = await Client.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count clients error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /clients/:id
router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const filter: any = {
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    };

    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      // El mismo alcance que la lista: si el listado lo muestra y el detalle contesta 404, el cliente
      // aparece en pantalla y no se puede abrir.
      const { clientes } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
      if (clientes.length > 0) filter.$or = [{ assignedUsers: req.user!.userId }, { _id: { $in: clientes } }];
      else filter.assignedUsers = req.user!.userId;
    }

    const client = await Client.findOne(filter).populate("assignedUsers", "email firstName lastName roles isActive").lean();

    if (!client) return res.status(404).json({ error: "Client not found" });

    // En el frontend se espera assignedUsersResolved o similar para mostrar la lista
    const assignedUsersResolved = (client.assignedUsers || []).map((u: any) => ({
      _id: String(u._id || ""),
      id: String(u._id || ""),
      email: u.email || "Sin email",
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      isActive: u.isActive ?? true,
    }));

    res.json({ ...client, assignedUsersResolved });
  } catch (error) {
    console.error("Get client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST /clients
router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createClientSchema.parse(req.body);

    const existingClient = await Client.findOne({
      email: data.email,
      tenantId: req.tenantObjectId,
    });
    if (existingClient) return res.status(409).json({ error: "Client with this email already exists" });

    const client = new Client({
      ...data,
      tenantId: req.tenantObjectId,
      createdBy: req.user!.userId,
      assignedUsers: [new Types.ObjectId(req.user!.userId)], // El creador se asigna por defecto
      status: "onboarding",
    });

    await client.save();
    res.status(201).json(client);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });

    if (error.code === 11000) {
      return res.status(409).json({ error: "Ya existe un cliente con este email en este tenant" });
    }

    console.error("Create client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PATCH /clients/:id
router.patch("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const updateData = createClientSchema.partial().parse(req.body);
    const filter: any = { _id: req.params.id, tenantId: req.tenantObjectId };
    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const client = await Client.findOneAndUpdate(filter, updateData, { new: true, runValidators: true });

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Update client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ DELETE /clients/:id
router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const filter: any = {
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    };

    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const client = await Client.findOneAndDelete(filter);

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    console.error("Delete client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PATCH /clients/:id/favorite - Toggle favorite status
router.patch("/:id/favorite", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);
    const filter: any = { _id: req.params.id, tenantId: req.tenantObjectId };
    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const client = await Client.findOneAndUpdate(filter, { favorite }, { new: true });

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Update client favorite error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as clientRoutes };
