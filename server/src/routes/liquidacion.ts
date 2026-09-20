import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { MemosoftConcepto } from "../models/MemosoftConcepto.js";
import { armarPadron, FiltrosPadron } from "../services/liquidacion/padron.js";
import { Regimen } from "../utils/liquidacion/contratos.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LIQUIDACIÓN — fase 0: el padrón y el catálogo de conceptos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Todavía no calcula un solo concepto. Lo que contesta es la pregunta previa: para este período,
 * quién entra, con qué legajo, en qué empresa, en qué centro de costo y bajo qué régimen —y qué
 * queda sin resolver.
 *
 * Pide `admin_contracts:view` porque de eso habla: son contratos, empresas y sueldos. Que el
 * permiso sea el mismo que el de Gestión de Contratos no es pereza, es que quien puede ver un
 * contrato puede ver de qué empresa es.
 */

export const liquidacionRouter = Router();
liquidacionRouter.use(requireTenant, authenticateToken);

const filtrosSchema = z.object({
  periodo: z.string().regex(/^\d{4}-\d{2}$/, "El período va como AAAA-MM."),
  empresaId: z.string().optional(),
  ccCodigo: z.string().optional(),
  tipoContratoId: z.coerce.number().optional(),
  projectId: z.string().optional(),
  rolFrame: z.string().optional(),
  regimen: z.enum(["mensual", "jornalero"]).optional(),
});

/**
 * EL PADRÓN DEL PERÍODO.
 *
 * Devuelve las filas resueltas y, por separado, lo que no se pudo resolver. Las dos cosas siempre:
 * un padrón que sólo muestra lo que salió bien esconde exactamente lo que hay que ir a arreglar.
 */
liquidacionRouter.get("/padron", requirePermission("admin_contracts:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const q = filtrosSchema.parse(req.query);
    const filtros: FiltrosPadron = {
      empresaId: q.empresaId,
      ccCodigo: q.ccCodigo,
      tipoContratoId: q.tipoContratoId,
      projectId: q.projectId,
      rolFrame: q.rolFrame,
      regimen: q.regimen as Regimen | undefined,
    };

    const padron = await armarPadron(req.tenantObjectId!, q.periodo, filtros);
    res.json(padron);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Filtros inválidos", details: error.errors });
    console.error("Get padrón de liquidación error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * SÓLO LAS EXCEPCIONES: el validador de integridad del período.
 *
 * Es el mismo cálculo que el padrón, agrupado por tipo. Está separado porque es lo que se mira
 * antes de liquidar, y pedirlo no debería obligar a bajarse las 578 filas.
 */
liquidacionRouter.get("/validacion", requirePermission("admin_contracts:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const q = filtrosSchema.parse(req.query);
    const padron = await armarPadron(req.tenantObjectId!, q.periodo, { ...q, regimen: q.regimen as Regimen | undefined });

    const porTipo = new Map<string, typeof padron.excepciones>();
    padron.excepciones.forEach((e) => porTipo.set(e.tipo, [...(porTipo.get(e.tipo) || []), e]));

    res.json({
      periodo: padron.periodo,
      resumen: padron.resumen,
      // Ordenado por cantidad: lo que más duele, arriba.
      porTipo: [...porTipo.entries()].sort((a, b) => b[1].length - a[1].length).map(([tipo, casos]) => ({ tipo, cantidad: casos.length, casos })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Filtros inválidos", details: error.errors });
    console.error("Get validación de liquidación error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** El catálogo de conceptos de Memosoft, por empresa. */
liquidacionRouter.get("/conceptos", requirePermission("admin_contracts:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const filtro: any = { tenantId: req.tenantObjectId };
    if (Types.ObjectId.isValid(String(req.query.empresaId))) filtro.empresaId = new Types.ObjectId(String(req.query.empresaId));
    if (req.query.soloActivos === "1") filtro.activo = true;

    const conceptos = await MemosoftConcepto.find(filtro).sort({ empresaId: 1, codigo: 1 }).lean();
    res.json(conceptos);
  } catch (error) {
    console.error("Get conceptos Memosoft error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
