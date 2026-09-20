import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { LeaveAccount } from "../models/LeaveAccount.js";
import { LeaveLedger } from "../models/LeaveLedger.js";
import { User } from "../models/User.js";
import { periodoDe, saldosDe } from "../services/bancoDeDias.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL BANCO DE DÍAS: cuentas, saldos y movimientos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tres routers con tres nombres distintos porque son tres cosas distintas: la DEFINICIÓN de las
 * cuentas, el SALDO (que se calcula) y los MOVIMIENTOS (que son el registro de lo que pasó).
 *
 * Ninguno lee ni escribe un campo «saldo»: el saldo sale de sumar el ledger. Ver `models/LeaveLedger.ts`.
 */

/* ─────────────────────────── Cuentas ─────────────────────────── */

export const leaveAccountsRouter = Router();
leaveAccountsRouter.use(requireTenant, authenticateToken);

const tramoSchema = z.object({ desdeAnios: z.number(), hastaAnios: z.number().nullable().optional(), dias: z.number() });
const cuentaSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.number().optional(),
  isActive: z.boolean().optional(),
  unit: z.enum(["dias", "horas"]).optional(),
  accrual: z.object({
    mode: z.enum(["anual_fijo", "por_antiguedad", "por_evento", "manual"]),
    diasAnuales: z.number().optional(),
    antiguedadTramos: z.array(tramoSchema).optional(),
    periodo: z.enum(["calendario", "aniversario_ingreso"]).optional(),
  }),
  carryover: z.object({ permite: z.boolean(), maxDias: z.number().optional(), venceEnMeses: z.number().optional() }).optional(),
  allowNegative: z.boolean().optional(),
});

leaveAccountsRouter.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cuentas = await LeaveAccount.find({ tenantId: req.tenantObjectId }).sort({ order: 1, name: 1 }).lean();
    res.json(cuentas);
  } catch (error) {
    console.error("Get leave accounts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

leaveAccountsRouter.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = cuentaSchema.parse(req.body);
    const cuenta = await LeaveAccount.create({ ...data, tenantId: req.tenantObjectId });
    res.status(201).json(cuenta);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    if (error?.code === 11000) return res.status(409).json({ error: "Ya existe una cuenta con ese código." });
    console.error("Create leave account error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

leaveAccountsRouter.patch("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = cuentaSchema.partial().parse(req.body);
    /*
      EL CÓDIGO NO SE CAMBIA. Es con lo que la nombran el código y los movimientos ya emitidos:
      renombrarlo los dejaría apuntando a una cuenta que no existe. El nombre visible sí se cambia.
    */
    delete (data as any).code;

    const cuenta = await LeaveAccount.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, { $set: data }, { new: true });
    if (!cuenta) return res.status(404).json({ error: "Cuenta no encontrada" });
    res.json(cuenta);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    console.error("Update leave account error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─────────────────────────── Saldos ─────────────────────────── */

export const leaveBalancesRouter = Router();
leaveBalancesRouter.use(requireTenant, authenticateToken);

/**
 * LA GRILLA DE SALDOS, PAGINADA Y PROYECTADA DESDE EL PRIMER DÍA.
 *
 * Se declara antes que `/` para que `/users` no lo capture una ruta con parámetro.
 *
 * Va paginada porque el tenant tiene 1576 personas y ya sabemos cómo termina traerlas todas: la
 * pantalla vieja de vacaciones pedía los usuarios con sus contratos poblados y no llegaba a
 * responder. De cada persona viajan cinco campos y sus saldos, nada más.
 */
leaveBalancesRouter.get("/users", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const periodo = req.query.periodo ? String(req.query.periodo) : undefined;

    const filtro: any = { tenantId: req.tenantObjectId, isSystem: { $ne: true } };
    if (req.query.search) {
      const texto = String(req.query.search).trim();
      if (texto) {
        const regex = { $regex: texto, $options: "i" };
        filtro.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
      }
    }

    const [usuarios, total] = await Promise.all([
      User.find(filtro).select("firstName lastName email metadata.activo").sort({ lastName: 1, firstName: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(filtro),
    ]);

    // Los saldos sólo de los que se van a mostrar: una agregación acotada a 25 personas.
    const saldos = await saldosDe(req.tenantObjectId!, usuarios.map((u: any) => u._id), periodo);

    res.json({
      rows: usuarios.map((u: any) => ({
        userId: String(u._id),
        firstName: u.firstName || "",
        lastName: u.lastName || "",
        email: u.email,
        activo: u.metadata?.activo !== false,
        cuentas: Object.fromEntries(saldos.get(String(u._id)) || new Map()),
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("Get leave balances grid error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Todas las cuentas de UNA persona: lo que muestra el «Banco de días» de su legajo. */
leaveBalancesRouter.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = String(req.query.userId || "");
    if (!Types.ObjectId.isValid(userId)) return res.status(400).json({ error: "Falta indicar la persona." });

    const periodo = req.query.periodo ? String(req.query.periodo) : undefined;
    const [cuentas, saldos] = await Promise.all([
      LeaveAccount.find({ tenantId: req.tenantObjectId, isActive: true }).sort({ order: 1, name: 1 }).lean(),
      saldosDe(req.tenantObjectId!, [userId], periodo),
    ]);

    const suyos = saldos.get(String(userId)) || new Map();
    res.json(
      cuentas.map((c: any) => {
        const s = suyos.get(String(c._id)) || { acreditado: 0, consumido: 0, saldo: 0 };
        return { accountId: String(c._id), code: c.code, name: c.name, unit: c.unit, ...s };
      }),
    );
  } catch (error) {
    console.error("Get leave balances error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ─────────────────────────── Movimientos ─────────────────────────── */

export const leaveLedgerRouter = Router();
leaveLedgerRouter.use(requireTenant, authenticateToken);

leaveLedgerRouter.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));

    const filtro: any = { tenantId: req.tenantObjectId };
    if (Types.ObjectId.isValid(String(req.query.userId))) filtro.userId = new Types.ObjectId(String(req.query.userId));
    if (Types.ObjectId.isValid(String(req.query.accountId))) filtro.accountId = new Types.ObjectId(String(req.query.accountId));
    if (req.query.periodo) filtro.periodo = String(req.query.periodo);

    const [movimientos, total] = await Promise.all([
      LeaveLedger.find(filtro).sort({ date: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("createdBy", "firstName lastName").lean(),
      LeaveLedger.countDocuments(filtro),
    ]);

    res.json({ rows: movimientos, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    console.error("Get leave ledger error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const ajusteSchema = z.object({
  userId: z.string(),
  accountId: z.string(),
  direction: z.enum(["debit", "credit"]),
  amount: z.number().positive(),
  // Sin motivo no se puede auditar un ajuste, así que no es opcional.
  motivo: z.string().min(1),
  date: z.string().optional(),
  periodo: z.string().optional(),
});

/**
 * UN AJUSTE A MANO.
 *
 * Es la puerta para corregir lo que el sistema no puede saber. Queda como un movimiento más —con
 * autor, fecha y motivo—, nunca como una edición de lo que ya estaba: el historial no se toca.
 */
leaveLedgerRouter.post("/adjust", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = ajusteSchema.parse(req.body);
    if (!Types.ObjectId.isValid(data.userId) || !Types.ObjectId.isValid(data.accountId)) {
      return res.status(400).json({ error: "Persona o cuenta inválidas." });
    }

    const cuenta = await LeaveAccount.findOne({ _id: data.accountId, tenantId: req.tenantObjectId }).lean();
    if (!cuenta) return res.status(404).json({ error: "Cuenta no encontrada" });

    const fecha = data.date ? new Date(`${String(data.date).slice(0, 10)}T00:00:00.000Z`) : new Date();
    const movimiento = await LeaveLedger.create({
      tenantId: req.tenantObjectId,
      userId: new Types.ObjectId(data.userId),
      accountId: new Types.ObjectId(data.accountId),
      date: fecha,
      periodo: data.periodo || periodoDe(fecha, (cuenta as any).accrual?.periodo),
      direction: data.direction,
      amount: data.amount,
      source: { kind: "ajuste" },
      motivo: data.motivo,
      createdBy: req.user!.userId,
    });

    res.status(201).json(movimiento);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    console.error("Create leave adjustment error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
