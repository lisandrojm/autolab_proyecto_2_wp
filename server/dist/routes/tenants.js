import { Router } from "express";
import { z } from "zod";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import { requirePlatform } from "../middleware/requirePlatform.js";
import { ensureDefaultRoles } from "../services/roleInitService.js";
import { env } from "../config/env.js";
const router = Router();
const createTenantSchema = z.object({
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
    domain: z.string().optional(),
    company: z.object({
        legalName: z.string().min(1),
        taxId: z.string().optional(),
        industry: z.string().optional(),
        address: z.object({
            street: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            postalCode: z.string().optional(),
            country: z.string().optional(),
        }).optional(),
        website: z.string().optional(),
        description: z.string().optional(),
    }),
    contact: z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        email: z.string().email(),
        phone: z.string().optional(),
        position: z.string().optional(),
        department: z.string().optional(),
        password: z.string().min(8, "Password must be at least 8 characters").optional(),
    }),
    settings: z.object({
        timezone: z.string().default("UTC"),
        currency: z.string().default("USD"),
        language: z.string().default("en"),
        features: z.array(z.string()).default([]),
    }).optional(),
    subscription: z.object({
        plan: z.enum(["free", "basic", "pro", "enterprise"]).default("free"),
        status: z.enum(["active", "suspended", "cancelled"]).default("active"),
        expiresAt: z.string().optional(),
    }).optional(),
    usage: z.object({
        users: z.object({ current: z.number().default(0), limit: z.number().default(10) }).optional(),
        clients: z.object({ current: z.number().default(0), limit: z.number().default(50) }).optional(),
        campaigns: z.object({ current: z.number().default(0), limit: z.number().default(100) }).optional(),
        storage: z.object({ usedMB: z.number().default(0), limitMB: z.number().default(1024) }).optional(),
        apiCalls: z.object({ current: z.number().default(0), limit: z.number().default(10000), resetDate: z.string().optional() }).optional(),
    }).optional(),
    isActive: z.boolean().default(true),
});
const updateTenantSchema = createTenantSchema.partial();
router.get("/count", authenticateToken, requirePlatform(), async (req, res) => {
    try {
        const count = await Tenant.countDocuments();
        res.json({ count });
    }
    catch (error) {
        console.error("Error counting tenants:", error);
        res.status(500).json({ error: "Error counting tenants" });
    }
});
router.get("/", authenticateToken, requirePlatform(), async (req, res) => {
    try {
        const { page = 1, limit = 20, name, status } = req.query;
        const filter = {};
        if (name) {
            filter.$or = [
                { name: { $regex: name, $options: 'i' } },
                { slug: { $regex: name, $options: 'i' } },
                { 'company.legalName': { $regex: name, $options: 'i' } }
            ];
        }
        if (status === 'active' || status === 'inactive') {
            filter.isActive = status === 'active';
        }
        const skip = (Number(page) - 1) * Number(limit);
        const [tenants, total] = await Promise.all([
            Tenant.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit)),
            Tenant.countDocuments(filter)
        ]);
        // Sincronizar usage.users.current con userIds.length
        const tenantsWithSyncedUsage = tenants.map(tenant => {
            const tenantObj = tenant.toObject();
            if (tenantObj.userIds && Array.isArray(tenantObj.userIds)) {
                tenantObj.usage.users.current = tenantObj.userIds.length;
            }
            return tenantObj;
        });
        res.json({
            tenants: tenantsWithSyncedUsage,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    }
    catch (error) {
        console.error("Get tenants error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/", authenticateToken, requirePlatform(), async (req, res) => {
    try {
        const data = createTenantSchema.parse(req.body);
        const existingTenant = await Tenant.findOne({ slug: data.slug });
        if (existingTenant) {
            res.status(409).json({ error: "Tenant slug already exists" });
            return;
        }
        const now = new Date();
        const endOfPeriod = new Date(now);
        endOfPeriod.setMonth(endOfPeriod.getMonth() + 1);
        const tenant = new Tenant({
            ...data,
            billing: {
                currentPeriod: {
                    startDate: now,
                    endDate: endOfPeriod,
                    amount: 0,
                    currency: data.settings?.currency || "USD",
                },
                invoices: [],
                autoRenew: true,
            }
        });
        await tenant.save();
        // Crear usuario administrador por defecto
        const adminPassword = data.contact.password || env.DEFAULT_TENANT_USER_PASSWORD || "tenant123";
        console.log(`[Tenant Creation] Ensuring default roles for tenant: ${tenant._id}`);
        // Los roles se crean automáticamente mediante el hook post-save del modelo Tenant
        // Esperar un momento para que se complete el hook
        await new Promise(resolve => setTimeout(resolve, 100));
        // Obtener o crear los roles usando el servicio centralizado
        const { adminRole, userRole } = await ensureDefaultRoles(tenant._id);
        console.log(`[Tenant Creation] ✅ Roles ready - User: ${userRole._id}, Admin: ${adminRole._id}`);
        // Crear usuario administrador
        const adminUser = new User({
            tenantId: tenant._id,
            email: data.contact.email,
            password: adminPassword,
            firstName: data.contact.firstName,
            lastName: data.contact.lastName,
            roles: [adminRole._id],
            isActive: true,
        });
        await adminUser.save();
        // Agregar usuario al tenant
        await Tenant.findByIdAndUpdate(tenant._id, {
            $addToSet: { userIds: adminUser._id },
            $inc: { 'usage.users.current': 1 }
        });
        res.status(201).json(tenant);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Create tenant error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/:id", authenticateToken, requirePlatform(), async (req, res) => {
    try {
        // Validar que el ID es un ObjectId válido
        const { Types } = await import('mongoose');
        if (!Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ error: "Invalid tenant ID format" });
            return;
        }
        const tenant = await Tenant.findById(req.params.id);
        if (!tenant) {
            res.status(404).json({ error: "Tenant not found" });
            return;
        }
        // Sincronizar usage.users.current con userIds.length
        const tenantObj = tenant.toObject();
        if (tenantObj.userIds && Array.isArray(tenantObj.userIds)) {
            tenantObj.usage.users.current = tenantObj.userIds.length;
        }
        res.json(tenantObj);
    }
    catch (error) {
        console.error("Get tenant error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.patch("/:id", authenticateToken, requirePlatform(), async (req, res) => {
    try {
        // Validar que el ID es un ObjectId válido
        const { Types } = await import('mongoose');
        if (!Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ error: "Invalid tenant ID format" });
            return;
        }
        // Verificar que no sea el tenant system
        const targetTenant = await Tenant.findById(req.params.id);
        if (targetTenant?.isSystem) {
            res.status(403).json({ error: "Cannot edit system tenant" });
            return;
        }
        const data = updateTenantSchema.parse(req.body);
        if (data.slug) {
            const existingTenant = await Tenant.findOne({
                slug: data.slug,
                _id: { $ne: req.params.id }
            });
            if (existingTenant) {
                res.status(409).json({ error: "Tenant slug already exists" });
                return;
            }
        }
        // Si se proporciona una nueva contraseña, actualizar el usuario admin del tenant
        if (data.contact?.password && data.contact.email) {
            const adminUser = await User.findOne({
                tenantId: req.params.id,
                email: data.contact.email
            });
            if (adminUser) {
                adminUser.password = data.contact.password;
                await adminUser.save();
            }
        }
        const tenant = await Tenant.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
        if (!tenant) {
            res.status(404).json({ error: "Tenant not found" });
            return;
        }
        res.json(tenant);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Update tenant error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.delete("/:id", authenticateToken, requirePlatform(), async (req, res) => {
    try {
        // Validar que el ID es un ObjectId válido
        const { Types } = await import('mongoose');
        if (!Types.ObjectId.isValid(req.params.id)) {
            res.status(400).json({ error: "Invalid tenant ID format" });
            return;
        }
        // Verificar que no sea el tenant system
        const tenant = await Tenant.findById(req.params.id);
        if (!tenant) {
            res.status(404).json({ error: "Tenant not found" });
            return;
        }
        if (tenant.isSystem) {
            res.status(403).json({ error: "Cannot delete system tenant" });
            return;
        }
        await Tenant.findByIdAndDelete(req.params.id);
        res.json({ message: "Tenant deleted successfully" });
    }
    catch (error) {
        console.error("Delete tenant error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as tenantRoutes };
