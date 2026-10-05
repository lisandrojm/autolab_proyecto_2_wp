import { Router } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Order } from "../models/Order.js";
import { OrderConfig } from "../models/OrderConfig.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { UserOrderBalance } from "../models/UserOrderBalance.js";
import { Holiday } from "../models/Holiday.js";
import { OrderGeneralConfig } from "../models/OrderGeneralConfig.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { getPlainOrderNumber, getOrderRemainingCost, recalculateUserOrderBalance } from "../utils/orderHelpers.js";
import { sanitizePersonalData } from "../utils/personalDataFields.js";
const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
router.use(requireTenant, authenticateToken);
async function ensureDir(dir) {
    try {
        await fs.promises.mkdir(dir, { recursive: true });
    }
    catch (err) {
        console.error("Error creating directory:", dir, err);
        throw err;
    }
}
const orderStorage = multer.diskStorage({
    destination: async (req, _file, cb) => {
        try {
            const tenantId = req.tenantId || "unknown_tenant";
            const userId = req.user?.userId || "unknown_user";
            const dir = path.join(__dirname, "../../storage", tenantId, userId, "orders");
            await ensureDir(dir);
            cb(null, dir);
        }
        catch (err) {
            console.error("Error in multer destination:", err);
            cb(err, "");
        }
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const orderId = new mongoose.Types.ObjectId();
        const filename = `order_${orderId}${ext}`;
        cb(null, filename);
    },
});
const uploadOrderImage = multer({
    storage: orderStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const isImage = file.mimetype.startsWith("image/");
        if (isImage || extname) {
            return cb(null, true);
        }
        cb(new Error("Solo se permiten imágenes (jpeg, jpg, png, gif, webp, heic, etc)"));
    },
}).single("photo");
const documentStorage = multer.diskStorage({
    destination: async (req, _file, cb) => {
        try {
            const tenantId = req.tenantId || "unknown_tenant";
            const userId = req.user?.userId || "unknown_user";
            const dir = path.join(__dirname, "../../storage", tenantId, userId, "documents");
            await ensureDir(dir);
            cb(null, dir);
        }
        catch (err) {
            console.error("Error in multer destination:", err);
            cb(err, "");
        }
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const docId = new mongoose.Types.ObjectId();
        const filename = `document_${docId}${ext}`;
        cb(null, filename);
    },
});
const uploadDocument = multer({
    storage: documentStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const isImage = file.mimetype.startsWith("image/");
        const isPdf = file.mimetype === "application/pdf";
        if (isImage || isPdf || extname) {
            return cb(null, true);
        }
        cb(new Error("Solo se permiten imágenes y archivos PDF"));
    },
}).single("document");
const createOrderSchema = z.object({
    description: z.string().default(""),
    category: z.string().default("other"),
    categoryId: z.string().optional(),
    subcategories: z.array(z.string()).default([]),
    actionCompleted: z.boolean().optional(),
    dynamicValue: z.any().optional(),
    amount: z.number().min(0).optional(),
    installments: z.number().min(1).optional(),
    photoUrl: z.string().optional(),
    documentoUrl: z.string().optional(),
    futureActionPlazoDias: z.number().min(1).max(365).optional(),
    futureActionFechaLimite: z.string().optional(),
    futureActionDocumento: z.string().optional(),
    daysRequested: z.number().optional(),
});
const updateOrderSchema = z.object({
    description: z.string().min(1).optional(),
    category: z.string().optional(),
    amount: z.number().min(0).optional(),
    installments: z.number().min(1).optional(),
    status: z.enum(["pending", "approved", "rejected", "delivered", "cancelled"]).optional(),
    photoUrl: z.string().optional(),
});
router.get("/", async (req, res) => {
    try {
        const userId = req.user.userId;
        const orders = await Order.find({
            tenantId: req.tenantObjectId,
            userId,
        })
            .sort({ requestedAt: -1 })
            .populate({
            path: "userId",
            select: "firstName lastName email metadata",
            populate: [
                { path: "metadata.projects", model: "UserProject" },
            ],
        })
            .populate("approvedBy", "firstName lastName email")
            .populate("categoryId");
        res.json(orders);
    }
    catch (error) {
        console.error("Get orders error:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});
// GET /api/v1/orders/users-balance - Get user balances (calculated & overrides) for a specific year and category
router.get("/users-balance", async (req, res) => {
    try {
        const tenantId = req.tenantObjectId;
        const yearStr = req.query.year;
        const categoryId = req.query.categoryId;
        let subtypeId = req.query.subtypeId;
        const selectedYear = yearStr ? parseInt(yearStr) : new Date().getFullYear();
        if (isNaN(selectedYear)) {
            return res.status(400).json({ error: "Año inválido" });
        }
        if (!categoryId) {
            return res.status(400).json({ error: "categoryId es requerido" });
        }
        const orderConfig = await OrderConfig.findOne({ _id: categoryId, tenantId });
        if (!orderConfig) {
            return res.status(404).json({ error: "Configuración de pedido no encontrada" });
        }
        // Default to the first subtype if the category has subtypes and none was requested
        if (!subtypeId && orderConfig.config?.subtipos && orderConfig.config.subtipos.length > 0) {
            subtypeId = orderConfig.config.subtipos[0].id;
        }
        // 1. Get all active, non-system users in the tenant
        const users = await User.find({ tenantId, isSystem: { $ne: true } })
            .select("firstName lastName email hireDate extraVacationDays carryOverVacationDays metadata projectIds")
            .populate({
            path: "metadata.projects",
            populate: {
                path: "projectId",
                select: "name",
            }
        });
        // 2. Fetch all overrides for the selected year and category/subtype
        const overrideQuery = { tenantId, year: selectedYear, orderConfigId: categoryId };
        if (subtypeId) {
            overrideQuery.subtypeId = subtypeId;
        }
        else {
            overrideQuery.subtypeId = { $in: [null, undefined] };
        }
        const overrides = await UserOrderBalance.find(overrideQuery).lean();
        const overridesMap = new Map(overrides.map((o) => [o.userId.toString(), o]));
        // 3. Fetch all active orders for the selected year and category to compute used/pending
        const startOfYear = new Date(selectedYear, 0, 1);
        const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
        const orderQueryConditions = {
            tenantId,
            categoryId,
            status: { $nin: ["rejected", "cancelled"] },
            requestedAt: { $gte: startOfYear, $lte: endOfYear }
        };
        if (subtypeId) {
            orderQueryConditions.subcategories = subtypeId;
        }
        const allOrders = await Order.find(orderQueryConditions).lean();
        // Map orders by user
        const userOrdersMap = new Map();
        for (const o of allOrders) {
            const uIdStr = o.userId.toString();
            if (!userOrdersMap.has(uIdStr)) {
                userOrdersMap.set(uIdStr, []);
            }
            userOrdersMap.get(uIdStr).push(o);
        }
        // Helper: calculate seniority text
        const { differenceInYears, differenceInMonths, differenceInDays } = await import("date-fns");
        const calculateSeniorityText = (hireDate, contractsDays = 0) => {
            if (contractsDays > 0) {
                const years = Math.floor(contractsDays / 365);
                const remainingAfterYears = contractsDays % 365;
                const months = Math.floor(remainingAfterYears / 30);
                const days = remainingAfterYears % 30;
                const parts = [];
                if (years > 0)
                    parts.push(`${years} ${years === 1 ? "año" : "años"}`);
                if (months > 0)
                    parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
                if (days > 0)
                    parts.push(`${days} ${days === 1 ? "día" : "días"}`);
                return parts.length > 0 ? parts.join(", ") : "0 días";
            }
            if (!hireDate)
                return "—";
            const now = new Date();
            const years = differenceInYears(now, hireDate);
            const months = differenceInMonths(now, hireDate) % 12;
            const tempDate = new Date(hireDate);
            tempDate.setFullYear(tempDate.getFullYear() + years);
            tempDate.setMonth(tempDate.getMonth() + months);
            const days = differenceInDays(now, tempDate);
            const parts = [];
            if (years > 0)
                parts.push(`${years} ${years === 1 ? "año" : "años"}`);
            if (months > 0)
                parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
            if (days > 0)
                parts.push(`${days} ${days === 1 ? "día" : "días"}`);
            return parts.length > 0 ? parts.join(", ") : "0 días";
        };
        const responseData = [];
        for (const user of users) {
            const uIdStr = user._id.toString();
            // A. Calculate seniority days from contracts (if any)
            let contractsDays = 0;
            if (user.metadata?.projects && Array.isArray(user.metadata.projects)) {
                contractsDays = user.metadata.projects.reduce((acc, p) => {
                    if (!p || !p.contracts || !Array.isArray(p.contracts))
                        return acc;
                    return (acc +
                        p.contracts.reduce((cAcc, c) => {
                            if (!c.fecha_alta_contrato)
                                return cAcc;
                            const start = new Date(c.fecha_alta_contrato);
                            const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
                            end.setHours(23, 59, 59, 999);
                            const diffTime = end.getTime() - start.getTime();
                            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            return cAcc + Math.max(0, days);
                        }, 0));
                }, 0);
            }
            // B. Seniority Text (relative to today)
            const seniorityText = calculateSeniorityText(user.hireDate, contractsDays);
            // C. Total Dynamic allowed: from OrderConfig or subtype config
            let calculatedTotalAnnual = 0;
            if (orderConfig.categoryType === "dinero") {
                const effectiveLimitType = orderConfig.limitType || (orderConfig.montoMaximo ? "monto" : null);
                if (effectiveLimitType === "monto") {
                    calculatedTotalAnnual = orderConfig.montoMaximo || 0;
                    if (subtypeId && orderConfig.config?.subtipos) {
                        const subtype = orderConfig.config.subtipos.find((st) => st.id === subtypeId);
                        calculatedTotalAnnual = subtype?.montoMaximo ?? orderConfig.montoMaximo ?? 0;
                    }
                }
                else if (effectiveLimitType === "porcentaje") {
                    let sueldoMano = 0;
                    if (user.metadata?.projects && Array.isArray(user.metadata.projects)) {
                        for (const up of user.metadata.projects) {
                            if (up && Array.isArray(up.contracts)) {
                                const sortedContracts = [...up.contracts].sort((a, b) => {
                                    const endA = a.fecha_baja_contrato ? new Date(a.fecha_baja_contrato).getTime() : Infinity;
                                    const endB = b.fecha_baja_contrato ? new Date(b.fecha_baja_contrato).getTime() : Infinity;
                                    const now = Date.now();
                                    const activeA = endA >= now;
                                    const activeB = endB >= now;
                                    if (activeA && !activeB)
                                        return -1;
                                    if (!activeA && activeB)
                                        return 1;
                                    return 0;
                                });
                                for (const c of sortedContracts) {
                                    const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                                    if (endDate)
                                        endDate.setHours(23, 59, 59, 999);
                                    const isActive = !endDate || endDate.getTime() >= Date.now();
                                    if (isActive && c.sueldo_mano) {
                                        const rawSalary = String(c.sueldo_mano).replace(/[,.]/g, "");
                                        const num = parseFloat(rawSalary);
                                        if (!isNaN(num)) {
                                            sueldoMano = num;
                                            break;
                                        }
                                    }
                                }
                            }
                            if (sueldoMano > 0)
                                break;
                        }
                    }
                    const percentage = orderConfig.porcentajeMaximo || 0;
                    calculatedTotalAnnual = Math.floor(((sueldoMano * percentage) / 100) / 50000) * 50000;
                }
                else {
                    calculatedTotalAnnual = 0;
                }
            }
            else {
                calculatedTotalAnnual = orderConfig.maxDays || 0;
                if (subtypeId && orderConfig.config?.subtipos) {
                    const subtype = orderConfig.config.subtipos.find((st) => st.id === subtypeId);
                    calculatedTotalAnnual = subtype?.maxDays || 0;
                }
            }
            // D. Taken / Pending from orders list
            let calculatedTaken = 0;
            let calculatedPending = 0;
            const userOrders = userOrdersMap.get(uIdStr) || [];
            for (const o of userOrders) {
                const cost = getOrderRemainingCost(o, orderConfig);
                const isSigned = o.signatureStatus === "signed";
                const isDelivered = o.status === "delivered";
                if (isDelivered || isSigned || (o.status === "approved" && (o.signatureStatus === "not_required" || !o.signatureStatus))) {
                    calculatedTaken += cost;
                }
                else {
                    calculatedPending += cost;
                }
            }
            // D2. Calculate installments information if categoryType === "dinero"
            let installmentsInfo = undefined;
            if (orderConfig.categoryType === "dinero") {
                let totalInst = 0;
                let passedInst = 0;
                let remainingInst = 0;
                for (const o of userOrders) {
                    let inst = o.installments;
                    if (!inst) {
                        if (o.subcategories && o.subcategories.length > 0 && orderConfig.config?.subtipos) {
                            const subId = o.subcategories[0];
                            const subtype = orderConfig.config.subtipos.find((st) => st.id === subId);
                            if (subtype?.repayment?.installments) {
                                inst = subtype.repayment.installments;
                            }
                        }
                        if (!inst && orderConfig.config?.repayment?.installments) {
                            inst = orderConfig.config.repayment.installments;
                        }
                    }
                    const numInstallments = inst || 1;
                    const baseDateStr = o.approvedAt || o.preApprovedAt || o.deliveredAt || o.requestedAt;
                    if (baseDateStr) {
                        const baseDate = new Date(baseDateStr);
                        if (!isNaN(baseDate.getTime())) {
                            const startYear = baseDate.getFullYear();
                            const startMonth = baseDate.getMonth();
                            totalInst += numInstallments;
                            const now = new Date();
                            for (let i = 0; i < numInstallments; i++) {
                                const discountDate = new Date(startYear, startMonth + i + 1, 0); // last day of month
                                discountDate.setHours(23, 59, 59, 999);
                                if (discountDate.getTime() <= now.getTime()) {
                                    passedInst++;
                                }
                                else {
                                    remainingInst++;
                                }
                            }
                        }
                    }
                }
                installmentsInfo = {
                    total: totalInst,
                    passed: passedInst,
                    remaining: remainingInst
                };
            }
            const calculatedAvailable = Math.max(0, calculatedTotalAnnual - calculatedTaken - calculatedPending);
            // E. Fetch overrides
            const override = overridesMap.get(uIdStr);
            const displayTotalAnnual = override?.totalAnnual ?? calculatedTotalAnnual;
            const displayTaken = override?.taken ?? calculatedTaken;
            const displayPending = override?.pending ?? calculatedPending;
            const displayAvailable = override?.available ?? Math.max(0, displayTotalAnnual - displayTaken - displayPending);
            responseData.push({
                userId: uIdStr,
                firstName: user.firstName || "",
                lastName: user.lastName || "",
                email: user.email,
                hireDate: user.hireDate ? user.hireDate.toISOString().split("T")[0] : null,
                seniority: seniorityText,
                calculated: {
                    totalAnnual: calculatedTotalAnnual,
                    taken: calculatedTaken,
                    pending: calculatedPending,
                    available: calculatedAvailable,
                },
                override: override
                    ? {
                        totalAnnual: override.totalAnnual,
                        taken: override.taken,
                        pending: override.pending,
                        available: override.available,
                    }
                    : undefined,
                display: {
                    totalAnnual: displayTotalAnnual,
                    taken: displayTaken,
                    pending: displayPending,
                    available: displayAvailable,
                },
                installmentsInfo,
                // Meta field for filters in frontend
                projectIds: user.projectIds?.map((p) => (p._id || p).toString()) || [],
                metadata: user.metadata,
            });
        }
        res.json(responseData);
    }
    catch (error) {
        console.error("Error fetching users order balance:", error);
        res.status(500).json({ error: "Error al obtener la gestión de pedidos de los usuarios" });
    }
});
// POST /api/v1/orders/users-balance - Save/override user order balances
router.post("/users-balance", async (req, res) => {
    try {
        const tenantId = req.tenantObjectId;
        const { updates } = req.body;
        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: "Formato de actualización inválido" });
        }
        const promises = updates.map(async (update) => {
            const { userId, orderConfigId, subtypeId, year, totalAnnual, taken, pending, available } = update;
            if (!userId || !orderConfigId || !year) {
                throw new Error("userId, orderConfigId y year son requeridos para cada actualización");
            }
            const queryConditions = { tenantId, userId, orderConfigId, year };
            const updateFields = {
                totalAnnual,
                taken,
                pending,
                available,
            };
            if (subtypeId) {
                queryConditions.subtypeId = subtypeId;
                updateFields.subtypeId = subtypeId;
            }
            else {
                queryConditions.subtypeId = null;
                updateFields.subtypeId = null;
            }
            // Upsert the override record
            return UserOrderBalance.findOneAndUpdate(queryConditions, {
                $set: updateFields,
            }, { new: true, upsert: true });
        });
        await Promise.all(promises);
        res.json({ message: "Balances de pedidos guardados correctamente" });
    }
    catch (error) {
        console.error("Error saving user order balances:", error);
        res.status(500).json({ error: "Error al guardar los balances de pedidos", details: error.message });
    }
});
// POST /api/v1/orders/users-balance/reset - Reset user order balance and cancel orders
router.post("/users-balance/reset", async (req, res) => {
    try {
        const tenantId = req.tenantObjectId;
        const { userId, orderConfigId, subtypeId, year } = req.body;
        if (!userId || !orderConfigId || !year) {
            return res.status(400).json({ error: "userId, orderConfigId y year son requeridos" });
        }
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
        const orderQuery = {
            tenantId,
            userId,
            categoryId: orderConfigId,
            requestedAt: { $gte: startOfYear, $lte: endOfYear }
        };
        if (subtypeId) {
            orderQuery.subcategories = subtypeId;
        }
        // Cancel all orders of this user/category/year
        await Order.updateMany(orderQuery, {
            $set: { status: "cancelled" }
        });
        // Recalculate balance for override if exists
        await recalculateUserOrderBalance(tenantId, userId, orderConfigId, year, subtypeId);
        res.json({ message: "Balance y cuotas reiniciados a cero correctamente" });
    }
    catch (error) {
        console.error("Error resetting user order balance:", error);
        res.status(500).json({ error: "Error al reiniciar el balance de pedidos", details: error.message });
    }
});
router.get("/stats", async (req, res) => {
    try {
        const userId = req.user.userId;
        const orders = await Order.find({
            tenantId: req.tenantObjectId,
            userId,
        });
        const stats = orders.reduce((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            if (order.futureActions && order.futureActions.length > 0) {
                const mainAction = order.futureActions[0];
                if (mainAction.tipoAccionFutura === "documento" && mainAction.estadoAccion === "pendiente_documento") {
                    acc.pendingDocuments = (acc.pendingDocuments || 0) + 1;
                }
            }
            return acc;
        }, { pending: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0, pendingDocuments: 0 });
        res.json(stats);
    }
    catch (error) {
        console.error("Get order stats error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/usage", async (req, res) => {
    try {
        const userId = req.user.userId;
        const { categoryId, subcategory } = req.query;
        const now = new Date();
        const startOfYear = new Date(Date.UTC(now.getFullYear(), 0, 1));
        const endOfYear = new Date(Date.UTC(now.getFullYear(), 11, 31, 23, 59, 59));
        const query = {
            tenantId: req.tenantObjectId,
            userId,
            status: { $in: ["pending", "approved", "delivered", "pre_approved"] },
            requestedAt: { $gte: startOfYear, $lte: endOfYear },
        };
        if (categoryId)
            query.categoryId = categoryId;
        if (subcategory)
            query.subcategories = subcategory;
        const orders = await Order.find(query).select("daysRequested categoryId subcategories");
        // Group by category/subcategory if needed, or just return total for the query
        const usedDays = orders.reduce((sum, o) => sum + (o.daysRequested || 0), 0);
        res.json({ usedDays });
    }
    catch (error) {
        console.error("Get order usage error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
            userId,
        })
            .populate({
            path: "userId",
            select: "firstName lastName email metadata",
            populate: [
                { path: "metadata.projects", model: "UserProject" },
            ],
        })
            .populate("approvedBy", "firstName lastName email")
            .populate("categoryId");
        if (!order) {
            res.status(404).json({ error: "Order not found" });
            return;
        }
        res.json(order);
    }
    catch (error) {
        console.error("Get order error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
async function calculateDaysRequestedBackend(tenantId, userId, category, dynamicValue) {
    if (!category || category.categoryType !== "fecha" || !dynamicValue) {
        return 0;
    }
    // 1. Fetch user to find active contract
    const user = await User.findById(userId).populate("metadata.projects").lean();
    let userContractTypeId = null;
    if (user?.metadata?.projects) {
        for (const up of user.metadata.projects) {
            if (up && Array.isArray(up.contracts)) {
                const sorted = [...up.contracts].sort((a, b) => {
                    const endA = a.fecha_baja_contrato ? new Date(a.fecha_baja_contrato).getTime() : Infinity;
                    const endB = b.fecha_baja_contrato ? new Date(b.fecha_baja_contrato).getTime() : Infinity;
                    const now = Date.now();
                    const activeA = endA >= now;
                    const activeB = endB >= now;
                    if (activeA && !activeB)
                        return -1;
                    if (!activeA && activeB)
                        return 1;
                    return 0;
                });
                for (const c of sorted) {
                    const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                    if (endDate)
                        endDate.setHours(23, 59, 59, 999);
                    const isActive = !endDate || endDate.getTime() >= Date.now();
                    if (isActive && c.tipo_contrato_id) {
                        userContractTypeId = c.tipo_contrato_id;
                        break;
                    }
                }
            }
            if (userContractTypeId)
                break;
        }
    }
    // 2. Fetch contract rule
    let rule = null;
    const config = await OrderGeneralConfig.getOrCreateDefault(tenantId);
    if (config && userContractTypeId !== null) {
        rule = config.contractRules?.find((r) => r.contractId === userContractTypeId);
    }
    // Helper to check if a UTC date is holiday
    const holidays = await Holiday.find({ tenantId }).lean();
    const holidaySet = new Set(holidays.map((h) => {
        const d = new Date(h.date);
        const month = (d.getUTCMonth() + 1).toString().padStart(2, "0");
        const day = d.getUTCDate().toString().padStart(2, "0");
        return `${month}-${day}`;
    }));
    const isHoliday = (date) => {
        const month = (date.getUTCMonth() + 1).toString().padStart(2, "0");
        const day = date.getUTCDate().toString().padStart(2, "0");
        const formatted = `${month}-${day}`;
        return holidaySet.has(formatted);
    };
    const validateDate = (date) => {
        const day = date.getUTCDay();
        const isSat = day === 6;
        const isSun = day === 0;
        const isHol = isHoliday(date);
        if (rule) {
            if (isSat && !rule.saturday)
                return false;
            if (isSun && !rule.sunday)
                return false;
            if (isHol && !rule.holiday)
                return false;
        }
        else {
            // Default: Block weekends and holidays
            if (isSat)
                return false;
            if (isSun)
                return false;
            if (isHol)
                return false;
        }
        return true;
    };
    const parseUTCDate = (dateStr) => {
        const [year, month, day] = dateStr.split("-").map(Number);
        return new Date(Date.UTC(year, month - 1, day));
    };
    const isRange = category.dateMode === "range" || (dynamicValue && typeof dynamicValue === "object" && "fechaDesde" in dynamicValue && "fechaHasta" in dynamicValue);
    if (isRange) {
        const fechaDesde = dynamicValue?.fechaDesde;
        const fechaHasta = dynamicValue?.fechaHasta;
        if (!fechaDesde || !fechaHasta)
            return 0;
        const start = parseUTCDate(fechaDesde);
        const end = parseUTCDate(fechaHasta);
        let count = 0;
        let curr = new Date(start);
        const MAX_DAYS = 365;
        let loops = 0;
        while (curr <= end && loops < MAX_DAYS) {
            if (validateDate(curr)) {
                count++;
            }
            curr.setUTCDate(curr.getUTCDate() + 1);
            loops++;
        }
        return count;
    }
    else {
        // Single or Multiple discrete dates
        if (Array.isArray(dynamicValue)) {
            let count = 0;
            for (const d of dynamicValue) {
                if (typeof d !== "string")
                    continue;
                const dt = parseUTCDate(d);
                if (!isNaN(dt.getTime()) && validateDate(dt)) {
                    count++;
                }
            }
            return count;
        }
        else if (typeof dynamicValue === "string") {
            const dt = parseUTCDate(dynamicValue);
            return (!isNaN(dt.getTime()) && validateDate(dt)) ? 1 : 0;
        }
    }
    return 0;
}
router.post("/", uploadOrderImage, async (req, res) => {
    try {
        const userId = req.user.userId;
        let photoUrl;
        let documentoUrl;
        if (req.file) {
            const tenantId = req.tenantId || "unknown_tenant";
            const fieldName = req.file.fieldname;
            if (fieldName === "photo") {
                photoUrl = `/storage/${tenantId}/${userId}/orders/${req.file.filename}`;
            }
            else if (fieldName === "document") {
                documentoUrl = `/storage/${tenantId}/${userId}/documents/${req.file.filename}`;
            }
        }
        let parsedDynamicValue = req.body.dynamicValue;
        if (typeof parsedDynamicValue === "string") {
            try {
                parsedDynamicValue = JSON.parse(parsedDynamicValue);
            }
            catch (e) {
                console.error("Error parsing dynamicValue:", e);
            }
        }
        let parsedSubcategories = req.body.subcategories || [];
        if (typeof parsedSubcategories === "string") {
            try {
                parsedSubcategories = JSON.parse(parsedSubcategories);
            }
            catch (e) {
                console.error("Error parsing subcategories:", e);
                parsedSubcategories = [];
            }
        }
        const data = createOrderSchema.parse({
            ...req.body,
            amount: req.body.amount ? parseFloat(req.body.amount) : undefined,
            installments: req.body.installments ? parseInt(req.body.installments) : undefined,
            actionCompleted: req.body.actionCompleted === "true" || req.body.actionCompleted === true,
            futureActionPlazoDias: req.body.futureActionPlazoDias ? parseInt(req.body.futureActionPlazoDias) : undefined,
            dynamicValue: parsedDynamicValue,
            subcategories: parsedSubcategories,
            photoUrl,
            documentoUrl,
            daysRequested: req.body.daysRequested ? parseFloat(req.body.daysRequested) : 0,
        });
        if (data.categoryId) {
            const category = await OrderConfig.findOne({
                _id: data.categoryId,
                tenantId: req.tenantObjectId,
                isActive: true,
            });
            if (!category) {
                res.status(400).json({ error: "Invalid or inactive category" });
                return;
            }
            if (category.categoryType === "fecha" && (!data.daysRequested || data.daysRequested === 0)) {
                data.daysRequested = await calculateDaysRequestedBackend(req.tenantObjectId, userId, category, data.dynamicValue);
            }
            if (data.subcategories && data.subcategories.length > 0 && category.config?.subtipos) {
                const validSubtypes = category.config.subtipos.map((st) => st.id);
                const invalidSubs = data.subcategories.filter((sub) => !validSubtypes.includes(sub));
                if (invalidSubs.length > 0) {
                    res.status(400).json({ error: `Invalid subcategories: ${invalidSubs.join(", ")}` });
                    return;
                }
            }
            // --- Validation for Max Days ---
            // --- Validation for Max Days ---
            if (category.categoryType === "fecha" && data.daysRequested && data.daysRequested > 0) {
                const now = new Date();
                const startOfYear = new Date(Date.UTC(now.getFullYear(), 0, 1));
                const endOfYear = new Date(Date.UTC(now.getFullYear(), 11, 31, 23, 59, 59));
                const requestYear = now.getFullYear();
                const subId = data.subcategories && data.subcategories.length > 0 ? data.subcategories[0] : null;
                // 1. Check specific subtype limit first (if a subtype is requested)
                if (subId) {
                    const subtypeOverride = await UserOrderBalance.findOne({
                        tenantId: req.tenantObjectId,
                        userId,
                        orderConfigId: data.categoryId,
                        subtypeId: subId,
                        year: requestYear
                    }).lean();
                    if (subtypeOverride && subtypeOverride.available !== undefined) {
                        if (data.daysRequested > subtypeOverride.available) {
                            res.status(400).json({ error: `El pedido excede el límite de días disponibles para esta opción. Disponibles: ${subtypeOverride.available}, Solicitados: ${data.daysRequested}` });
                            return;
                        }
                    }
                    else {
                        // Check subtype default limit
                        if (category.config?.subtipos) {
                            const subtype = category.config.subtipos.find((st) => st.id === subId);
                            if (subtype && subtype.maxDays) {
                                const existingOrders = await Order.find({
                                    tenantId: req.tenantObjectId,
                                    userId,
                                    categoryId: data.categoryId,
                                    subcategories: subId,
                                    status: { $in: ["pending", "approved", "delivered", "pre_approved"] },
                                    requestedAt: { $gte: startOfYear, $lte: endOfYear }
                                }).select("daysRequested");
                                const used = existingOrders.reduce((sum, o) => sum + (o.daysRequested || 0), 0);
                                if (used + data.daysRequested > subtype.maxDays) {
                                    res.status(400).json({
                                        error: `El pedido excede el límite de días para "${subtype.label}". Máximo: ${subtype.maxDays}, Usados: ${used}, Solicitados: ${data.daysRequested}`
                                    });
                                    return;
                                }
                            }
                        }
                    }
                }
                // 2. Check global category limit
                const globalOverride = await UserOrderBalance.findOne({
                    tenantId: req.tenantObjectId,
                    userId,
                    orderConfigId: data.categoryId,
                    subtypeId: { $in: [null, undefined] },
                    year: requestYear
                }).lean();
                if (globalOverride && globalOverride.available !== undefined) {
                    if (data.daysRequested > globalOverride.available) {
                        res.status(400).json({ error: `El pedido excede el límite total de días disponibles. Disponibles: ${globalOverride.available}, Solicitados: ${data.daysRequested}` });
                        return;
                    }
                }
                else {
                    // Check global default limit
                    if (category.maxDays) {
                        const existingOrders = await Order.find({
                            tenantId: req.tenantObjectId,
                            userId,
                            categoryId: data.categoryId,
                            status: { $in: ["pending", "approved", "delivered", "pre_approved"] },
                            requestedAt: { $gte: startOfYear, $lte: endOfYear }
                        }).select("daysRequested");
                        const used = existingOrders.reduce((sum, o) => sum + (o.daysRequested || 0), 0);
                        if (used + data.daysRequested > category.maxDays) {
                            res.status(400).json({
                                error: `El pedido excede el límite total de días para "${category.name}". Máximo: ${category.maxDays}, Usados: ${used}, Solicitados: ${data.daysRequested}`
                            });
                            return;
                        }
                    }
                }
            }
            // -------------------------------
            if (category.categoryType === "fecha" && category.dateMode === "range") {
                const actionType = category.futureActionType || "sinVencimiento";
                if (actionType !== "sinVencimiento") {
                    if (!data.dynamicValue || !data.dynamicValue.fechaDesde || !data.dynamicValue.fechaHasta) {
                        res.status(400).json({ error: "Date range categories require both 'fechaDesde' and 'fechaHasta'" });
                        return;
                    }
                    const fechaDesde = new Date(data.dynamicValue.fechaDesde);
                    const fechaHasta = new Date(data.dynamicValue.fechaHasta);
                    if (fechaDesde > fechaHasta) {
                        res.status(400).json({ error: "The 'fechaHasta' must be greater than or equal to 'fechaDesde'" });
                        return;
                    }
                }
            }
            if (category.categoryType === "dinero") {
                const montoSolicitado = data.amount || 0;
                if (category.montoMaximo && montoSolicitado > category.montoMaximo) {
                    res.status(400).json({ error: `El monto solicitado ($${montoSolicitado.toLocaleString("es-ES")}) excede el máximo permitido ($${category.montoMaximo.toLocaleString("es-ES")})` });
                    return;
                }
                const now = new Date();
                const startOfYear = new Date(Date.UTC(now.getFullYear(), 0, 1));
                const endOfYear = new Date(Date.UTC(now.getFullYear(), 11, 31, 23, 59, 59));
                const requestYear = now.getFullYear();
                const globalOverride = await UserOrderBalance.findOne({
                    tenantId: req.tenantObjectId,
                    userId,
                    orderConfigId: data.categoryId,
                    subtypeId: { $in: [null, undefined] },
                    year: requestYear
                }).lean();
                let available = 0;
                if (globalOverride && globalOverride.available !== undefined) {
                    available = globalOverride.available;
                }
                else {
                    let limit = 0;
                    const effectiveLimitType = category.limitType || (category.montoMaximo ? "monto" : null);
                    if (effectiveLimitType === "monto") {
                        limit = category.montoMaximo || 0;
                    }
                    else if (effectiveLimitType === "porcentaje") {
                        let sueldoMano = 0;
                        const user = await User.findById(userId).populate("metadata.projects").lean();
                        if (user?.metadata?.projects && Array.isArray(user.metadata.projects)) {
                            for (const up of user.metadata.projects) {
                                const typedUp = up;
                                if (typedUp && Array.isArray(typedUp.contracts)) {
                                    for (const c of typedUp.contracts) {
                                        const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                                        if (endDate)
                                            endDate.setHours(23, 59, 59, 999);
                                        const isActive = !endDate || endDate.getTime() >= Date.now();
                                        if (isActive && c.sueldo_mano) {
                                            const rawSalary = String(c.sueldo_mano).replace(/[,.]/g, "");
                                            const num = parseFloat(rawSalary);
                                            if (!isNaN(num)) {
                                                sueldoMano = num;
                                                break;
                                            }
                                        }
                                    }
                                }
                                if (sueldoMano > 0)
                                    break;
                            }
                        }
                        const percentage = category.porcentajeMaximo || 0;
                        limit = Math.floor(((sueldoMano * percentage) / 100) / 50000) * 50000;
                    }
                    const existingOrders = await Order.find({
                        tenantId: req.tenantObjectId,
                        userId,
                        categoryId: data.categoryId,
                        status: { $nin: ["rejected", "cancelled"] },
                        requestedAt: { $gte: startOfYear, $lte: endOfYear }
                    }).lean();
                    let taken = 0;
                    let pending = 0;
                    for (const o of existingOrders) {
                        const cost = getOrderRemainingCost(o, category);
                        const isSigned = o.signatureStatus === "signed";
                        const isDelivered = o.status === "delivered";
                        if (isDelivered || isSigned || (o.status === "approved" && (o.signatureStatus === "not_required" || !o.signatureStatus))) {
                            taken += cost;
                        }
                        else {
                            pending += cost;
                        }
                    }
                    available = Math.max(0, limit - taken - pending);
                }
                if (montoSolicitado > available) {
                    res.status(400).json({
                        error: `El pedido excede el monto disponible. Disponible: $${available.toLocaleString("es-ES")}, Solicitado: $${montoSolicitado.toLocaleString("es-ES")}`
                    });
                    return;
                }
            }
        }
        let orderData = {
            tenantId: req.tenantObjectId,
            userId,
            ...data,
            subcategories: data.subcategories || [],
            status: "pending",
            requestedAt: new Date(),
        };
        if (data.categoryId) {
            const category = await OrderConfig.findById(data.categoryId);
            if (category?.requiresSignature) {
                orderData.signatureStatus = "pending";
            }
            // Datos personales: sanitizar la propuesta contra la allowlist configurada y
            // guardarla en metadata.proposedUserData (se aplica al User al aprobar).
            if (category?.categoryType === "datos_personales") {
                const enabled = category.config?.camposEditables || [];
                const sanitized = sanitizePersonalData(data.dynamicValue, enabled);
                orderData.metadata = { ...(orderData.metadata || {}), proposedUserData: sanitized };
            }
        }
        let order;
        try {
            order = new Order(orderData);
            if (data.categoryId) {
                const category = await OrderConfig.findById(data.categoryId);
                const shouldCreateOrderFutureAction = category?.requiresAction && (!category.requiresUserConfirmation || data.actionCompleted);
                if (shouldCreateOrderFutureAction) {
                    const actionType = category.futureActionType || "otra";
                    const futureActionData = {
                        requiereAccionFutura: true,
                        tipoAccionFutura: actionType,
                        descripcionAccion: category.actionText || "Acción requerida por categoría",
                        responsableAccion: "usuario",
                        estadoAccion: "pendiente",
                        fechaCreacionAccion: new Date(),
                    };
                    switch (actionType) {
                        case "documento":
                            if (category.documentoRequerido) {
                                futureActionData.documentoRequerido = category.documentoRequerido;
                            }
                            if (data.futureActionDocumento) {
                                futureActionData.documentoRequerido = data.futureActionDocumento;
                            }
                            if (documentoUrl) {
                                futureActionData.documentoUrl = documentoUrl;
                                futureActionData.estadoAccion = "documento_presentado";
                            }
                            else {
                                futureActionData.estadoAccion = "pendiente_documento";
                            }
                            if (category.deadlineMode === "plazoDias" && category.plazoDias) {
                                futureActionData.plazoDias = category.plazoDias;
                                futureActionData.deadlineMode = "plazoDias";
                            }
                            else if (category.deadlineMode === "fechaEspecifica" && category.fechaLimite) {
                                futureActionData.fechaLimite = new Date(category.fechaLimite);
                                futureActionData.deadlineMode = "fechaEspecifica";
                            }
                            else if (data.futureActionPlazoDias) {
                                futureActionData.plazoDias = data.futureActionPlazoDias;
                                futureActionData.deadlineMode = "plazoDias";
                            }
                            else if (data.futureActionFechaLimite) {
                                futureActionData.fechaLimite = new Date(data.futureActionFechaLimite);
                                futureActionData.deadlineMode = "fechaEspecifica";
                            }
                            break;
                        case "otra":
                            if (category.tituloAccion) {
                                futureActionData.descripcionAccion = category.tituloAccion;
                            }
                            if (category.deadlineMode === "plazoDias" && category.plazoDias) {
                                futureActionData.plazoDias = category.plazoDias;
                                futureActionData.deadlineMode = "plazoDias";
                            }
                            else if (category.deadlineMode === "fechaEspecifica" && category.fechaLimite) {
                                futureActionData.fechaLimite = new Date(category.fechaLimite);
                                futureActionData.deadlineMode = "fechaEspecifica";
                            }
                            else if (data.futureActionPlazoDias) {
                                futureActionData.plazoDias = data.futureActionPlazoDias;
                                futureActionData.deadlineMode = "plazoDias";
                            }
                            else if (data.futureActionFechaLimite) {
                                futureActionData.fechaLimite = new Date(data.futureActionFechaLimite);
                                futureActionData.deadlineMode = "fechaEspecifica";
                            }
                            else {
                                futureActionData.deadlineMode = "none";
                            }
                            break;
                    }
                    order.futureActions.push(futureActionData);
                }
            }
            await order.save();
        }
        catch (saveError) {
            console.error("Error saving order:", saveError);
            throw saveError;
        }
        const categoryDoc = data.categoryId ? await OrderConfig.findById(data.categoryId) : null;
        const categoryName = categoryDoc?.name || data.category;
        let subcategoryText = "";
        if (data.subcategories && data.subcategories.length > 0 && categoryDoc?.config?.subtipos) {
            const subcategoryLabels = data.subcategories.map((subId) => {
                const subtipo = categoryDoc.config.subtipos?.find((s) => s.id === subId);
                return subtipo?.label || subId;
            });
            subcategoryText = ` - ${subcategoryLabels.join(", ")}`;
        }
        else if (data.subcategories && data.subcategories.length > 0) {
            subcategoryText = ` - ${data.subcategories.join(", ")}`;
        }
        const populatedOrder = await Order.findById(order._id)
            .populate({
            path: "userId",
            select: "firstName lastName email metadata",
            populate: [
                { path: "metadata.projects", model: "UserProject" },
            ],
        })
            .populate("approvedBy", "firstName lastName email")
            .populate("categoryId");
        res.status(201).json(populatedOrder);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        if (error.name === "ValidationError") {
            res.status(400).json({ error: "Validation Error", details: error.message });
            return;
        }
        console.error("Create order error:", error);
        res.status(500).json({ error: error.message || "Internal server error" });
    }
});
router.put("/:id", uploadOrderImage, async (req, res) => {
    try {
        const userId = req.user.userId;
        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
            userId,
        });
        if (!order) {
            res.status(404).json({ error: "Order not found" });
            return;
        }
        if (req.body.status === "cancelled" && ["approved", "rejected", "cancelled", "delivered"].includes(order.status)) {
            res.status(400).json({ error: "No puedes cancelar un pedido que ya fue aprobado, rechazado, entregado o cancelado" });
            return;
        }
        if (req.body.status && req.body.status !== "cancelled") {
            res.status(403).json({ error: "Solo puedes cancelar tus propios pedidos. Otros cambios de estado están restringidos" });
            return;
        }
        if (order.status !== "pending" && !req.body.status) {
            res.status(400).json({ error: "Only pending orders can be updated" });
            return;
        }
        let photoUrl = order.photoUrl;
        if (req.file) {
            if (order.photoUrl) {
                const oldPath = path.join(__dirname, "../../", order.photoUrl);
                try {
                    await fs.promises.unlink(oldPath);
                }
                catch (err) {
                    console.error("Error deleting old photo:", err);
                }
            }
            const tenantId = req.tenantId || "unknown_tenant";
            photoUrl = `/storage/${tenantId}/${userId}/orders/${req.file.filename}`;
        }
        const data = updateOrderSchema.parse({
            ...req.body,
            amount: req.body.amount ? parseFloat(req.body.amount) : undefined,
            photoUrl,
        });
        Object.assign(order, data);
        await order.save();
        if (req.body.status === "cancelled") {
            const categoryName = order.categoryId ? (await OrderConfig.findById(order.categoryId))?.name || order.category : order.category;
            const subcategoryText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
            const orderDisplayName = `${categoryName}${subcategoryText}`;
        }
        const populatedOrder = await Order.findById(order._id)
            .populate({
            path: "userId",
            select: "firstName lastName email metadata",
            populate: [
                { path: "metadata.projects", model: "UserProject" },
            ],
        })
            .populate("approvedBy", "firstName lastName email")
            .populate("categoryId");
        res.json(populatedOrder);
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Update order error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.patch("/:id/upload-document", uploadDocument, async (req, res) => {
    try {
        const userId = req.user.userId;
        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
            userId,
        });
        if (!order) {
            res.status(404).json({ error: "Order not found" });
            return;
        }
        if (!req.file) {
            res.status(400).json({ error: "No document file provided" });
            return;
        }
        const tenantId = req.tenantId || "unknown_tenant";
        const documentoUrl = `/storage/${tenantId}/${userId}/documents/${req.file.filename}`;
        order.documentoUrl = documentoUrl;
        await order.save();
        if (order.futureActions && order.futureActions.length > 0) {
            const futureAction = order.futureActions[0]; // Assuming one future action per order for now
            if (futureAction.tipoAccionFutura === "documento") {
                futureAction.documentoUrl = documentoUrl;
                futureAction.estadoAccion = "documento_presentado";
                order.markModified("futureActions");
                await order.save();
            }
        }
        const populatedOrder = await Order.findById(order._id)
            .populate({
            path: "userId",
            select: "firstName lastName email metadata",
            populate: [
                { path: "metadata.projects", model: "UserProject" },
            ],
        })
            .populate("approvedBy", "firstName lastName email")
            .populate("categoryId");
        res.json(populatedOrder);
    }
    catch (error) {
        console.error("Upload document error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/:id/notify-signature-completed", async (req, res) => {
    try {
        const userId = req.user.userId;
        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
            userId,
        })
            .populate({ path: "userId", select: "firstName lastName email" })
            .populate("categoryId");
        if (!order) {
            res.status(404).json({ error: "Pedido no encontrado" });
            return;
        }
        const categoryInfo = order.categoryId;
        if (!categoryInfo?.requiresSignature) {
            res.status(400).json({ error: "Este pedido no requiere firma" });
            return;
        }
        if (order.signatureStatus !== "sent") {
            res.status(400).json({ error: "Solo se puede notificar cuando el estado es 'Firma Enviada'" });
            return;
        }
        if (order.signatureNotifiedAt) {
            console.log(`Order ${order.orderNumber} already notified at:`, order.signatureNotifiedAt);
            res.status(400).json({ error: "Ya notificaste que completaste la firma" });
            return;
        }
        console.log(`Setting signatureNotifiedAt for order ${order.orderNumber}`);
        order.signatureNotifiedAt = new Date();
        await order.save();
        console.log(`Saved order with signatureNotifiedAt:`, order.signatureNotifiedAt);
        const userInfo = order.userId;
        const userName = userInfo ? `${userInfo.firstName} ${userInfo.lastName}` : "Usuario";
        const categoryName = categoryInfo?.name || order.category || "pedido";
        const subcategoriesText = order.subcategories && order.subcategories.length > 0 ? ` - ${order.subcategories.join(", ")}` : "";
        const orderDisplayName = `${categoryName}${subcategoriesText}`;
        const supervisorRoles = await Role.find({
            tenantId: req.tenantObjectId,
            name: { $in: ["admin", "manager", "superadmin"] },
        });
        console.log(`Found ${supervisorRoles.length} supervisor roles:`, supervisorRoles.map((r) => r.name));
        if (supervisorRoles.length === 0) {
            console.warn("No supervisor roles found in database for signature notification");
            return res.json({ success: true, message: "Notificación registrada (sin coordinadores configurados)" });
        }
        const supervisorRoleIds = supervisorRoles.map((r) => r._id);
        console.log(`Supervisor role IDs:`, supervisorRoleIds);
        const supervisors = await User.find({
            tenantId: req.tenantObjectId,
            roles: { $in: supervisorRoleIds },
            isActive: true,
        });
        console.log(`Found ${supervisors.length} active supervisors to notify`);
        if (supervisors.length === 0) {
            console.warn("No active supervisors found to notify about signature completion");
            return res.json({ success: true, message: "Notificación registrada (sin coordinadores activos)" });
        }
        const notificationPromises = supervisors.map((supervisor) => Notification.create({
            tenantId: req.tenantObjectId,
            userId: supervisor._id,
            type: "order_signature_notification",
            title: "Usuario indica firma completada",
            message: `El usuario ${userName} indica que completó la firma del documento del pedido ${orderDisplayName} N°: ${getPlainOrderNumber(order.orderNumber)}. Por favor verificá antes de confirmar.`,
            linkUrl: `/hr-management/orders`,
        }).catch((err) => {
            console.error(`Error creating notification for user ${supervisor._id}:`, err);
            return null;
        }));
        const results = await Promise.all(notificationPromises);
        const successCount = results.filter((r) => r !== null).length;
        console.log(`Created ${successCount}/${supervisors.length} notifications successfully`);
        res.json({
            success: true,
            message: `Notificación enviada a ${successCount} coordinador(es) correctamente`,
            notifiedCount: successCount,
        });
    }
    catch (error) {
        console.error("Notify signature error:", error);
        res.status(500).json({ error: "Error al enviar la notificación" });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        const userId = req.user.userId;
        const order = await Order.findOne({
            _id: req.params.id,
            tenantId: req.tenantObjectId,
            userId,
        });
        if (!order) {
            res.status(404).json({ error: "Order not found" });
            return;
        }
        if (order.status !== "pending") {
            res.status(400).json({ error: "Only pending orders can be deleted" });
            return;
        }
        if (order.photoUrl) {
            const photoPath = path.join(__dirname, "../../", order.photoUrl);
            try {
                await fs.promises.unlink(photoPath);
            }
            catch (err) {
                console.error("Error deleting photo:", err);
            }
        }
        await Order.findByIdAndDelete(order._id);
        res.json({ message: "Order deleted successfully" });
    }
    catch (error) {
        console.error("Delete order error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as orderRoutes };
