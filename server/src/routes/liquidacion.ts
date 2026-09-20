import { Router } from "express";
import { Types } from "mongoose";
import { z } from "zod";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { MemosoftConcepto } from "../models/MemosoftConcepto.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { efectosVigentesEn, validarEfecto, reemplazarVigentes } from "../utils/liquidacion/efectos.js";
import { armarPadron, FiltrosPadron } from "../services/liquidacion/padron.js";
import { correrLiquidacion } from "../services/liquidacion/corrida.js";
import { LiquidacionCorrida } from "../models/LiquidacionCorrida.js";
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

/* ═══════════════════════ El mapeo motivo → concepto ═══════════════════════ */

/**
 * Se configura desde Novedades y por eso pide su permiso, no el de contratos: quien define qué
 * significa "Enfermedad" es la misma persona que administra los motivos.
 */
const PERMISO_MAPEO = "config_activity_logs:view";

const efectoSchema = z.object({
  conceptoCodigo: z.string().min(1),
  param: z.enum(["par1", "par2"]),
  unidad: z.enum(["cantidad", "importe"]),
  fuente: z.enum(["jornadas", "horas50", "horas100", "fijo", "manual"]),
  valorFijo: z.number().optional(),
  aplicaA: z.enum(["titular", "reemplazante"]),
  soloRegimen: z.enum(["mensual", "jornalero"]).nullable().optional(),
  empresaId: z.string().nullable().optional(),
  nota: z.string().optional(),
});

/**
 * EL MAPEO COMPLETO: cada motivo con lo que genera.
 *
 * Con `?fecha=` devuelve lo que regía ese día; sin fecha, lo que rige hoy. El historial entero
 * viaja siempre en `historial`, porque es lo que hace auditable un cambio y no pesa nada.
 */
liquidacionRouter.get("/mapeo", requirePermission(PERMISO_MAPEO), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const fecha = String(req.query.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);

    const [motivos, conceptos] = await Promise.all([
      RequestConfig.find({ tenantId: req.tenantObjectId }).select("name order isActive requiresReplacement memosoftEffects memosoftNoLiquida").sort({ order: 1 }).lean(),
      MemosoftConcepto.find({ tenantId: req.tenantObjectId }).select("empresaId codigo descripcion usaPar1 usaPar2 unidadPar1 unidadPar2 activo").lean(),
    ]);

    res.json({
      fecha,
      motivos: motivos.map((m: any) => ({
        _id: String(m._id),
        name: m.name,
        isActive: m.isActive !== false,
        requiresReplacement: !!m.requiresReplacement,
        noLiquida: !!m.memosoftNoLiquida,
        vigentes: efectosVigentesEn(m.memosoftEffects || [], fecha),
        historial: m.memosoftEffects || [],
      })),
      conceptos,
    });
  } catch (error) {
    console.error("Get mapeo de liquidación error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * CAMBIAR LO QUE GENERA UN MOTIVO.
 *
 * Reemplaza el conjunto vigente: lo anterior queda cerrado el día previo, no se borra. Si algún
 * efecto no pasa la validación contra el catálogo NO SE GUARDA NINGUNO —guardar la mitad dejaría un
 * mapeo a medias que igual se liquida—, y la respuesta dice cuál y por qué.
 */
liquidacionRouter.put("/mapeo/:motivoId", requirePermission(PERMISO_MAPEO), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cuerpo = z.object({ efectos: z.array(efectoSchema), desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() , noLiquida: z.boolean().optional() }).parse(req.body);
    const desde = cuerpo.desde || new Date().toISOString().slice(0, 10);

    const motivo = await RequestConfig.findOne({ _id: req.params.motivoId, tenantId: req.tenantObjectId });
    if (!motivo) return res.status(404).json({ error: "Motivo no encontrado" });

    const conceptos: any[] = await MemosoftConcepto.find({ tenantId: req.tenantObjectId }).lean();
    /* El catálogo es POR EMPRESA, así que un efecto sin empresa se valida contra cualquiera que tenga ese código. */
    const buscarConcepto = (codigo: string, empresaId?: string | null) =>
      conceptos.find((c: any) => c.codigo === codigo && (!empresaId || String(c.empresaId) === String(empresaId))) ||
      (empresaId ? undefined : conceptos.find((c: any) => c.codigo === codigo));

    const nuevos = cuerpo.efectos.map((e) => ({
      ...e,
      empresaId: e.empresaId ? new Types.ObjectId(e.empresaId) : null,
      soloRegimen: e.soloRegimen ?? null,
      vigenteDesde: desde,
      vigenteHasta: null,
    })) as any[];

    const problemas = nuevos
      .map((e) => ({ codigo: e.conceptoCodigo, problema: validarEfecto(e, buscarConcepto(e.conceptoCodigo, e.empresaId ? String(e.empresaId) : null)) }))
      .filter((x) => x.problema);
    if (problemas.length) return res.status(400).json({ error: "El mapeo no se puede guardar", problemas });

    motivo.memosoftEffects = reemplazarVigentes((motivo.memosoftEffects || []) as any, nuevos, desde) as any;
    // Sólo si vino: no mandarla no significa desmarcarla.
    if (cuerpo.noLiquida !== undefined) (motivo as any).memosoftNoLiquida = cuerpo.noLiquida;
    await motivo.save();

    res.json({ _id: String(motivo._id), name: motivo.name, noLiquida: !!(motivo as any).memosoftNoLiquida, vigentes: efectosVigentesEn(motivo.memosoftEffects as any, desde), historial: motivo.memosoftEffects });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", details: error.errors });
    console.error("Update mapeo de liquidación error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* ═══════════════════════════ Las corridas ═══════════════════════════ */

/**
 * CALCULAR EL PERÍODO.
 *
 * Con `?previsualizar=1` calcula y devuelve sin guardar. Sin eso, queda una corrida nueva: nunca se
 * pisa la anterior, así que reliquidar no borra lo que se mandó el mes pasado.
 */
liquidacionRouter.post("/corridas", requirePermission("admin_contracts:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const q = filtrosSchema.extend({ versionMapeo: z.string().optional() }).parse({ ...req.body, ...req.query });
    const previsualizar = String(req.query.previsualizar || req.body?.previsualizar || "") === "1";

    const corrida = await correrLiquidacion(req.tenantObjectId!, q.periodo, new Types.ObjectId(req.user!.userId), {
      empresaId: q.empresaId,
      ccCodigo: q.ccCodigo,
      tipoContratoId: q.tipoContratoId,
      projectId: q.projectId,
      rolFrame: q.rolFrame,
      regimen: q.regimen as Regimen | undefined,
      versionMapeo: q.versionMapeo,
      persistir: !previsualizar,
    });

    res.status(previsualizar ? 200 : 201).json(corrida);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Filtros inválidos", details: error.errors });
    console.error("Correr liquidación error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** El listado: sólo el resumen de cada corrida. Las líneas se piden una por una. */
liquidacionRouter.get("/corridas", requirePermission("admin_contracts:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const filtro: any = { tenantId: req.tenantObjectId };
    if (req.query.periodo) filtro.periodo = String(req.query.periodo);

    const corridas = await LiquidacionCorrida.find(filtro)
      .select("periodo versionMapeo filtros resumen hashLineas createdBy createdAt")
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Number(req.query.limit) || 25))
      .populate("createdBy", "firstName lastName")
      .lean();

    res.json(corridas);
  } catch (error) {
    console.error("Listar corridas error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * UNA CORRIDA ENTERA, con sus líneas y sus excepciones.
 *
 * Con `?hoja=` devuelve sólo una hoja, que es como se la mira cuando hay que revisar un centro de
 * costo puntual sin bajarse las mil líneas del período.
 */
liquidacionRouter.get("/corridas/:id", requirePermission("admin_contracts:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const corrida: any = await LiquidacionCorrida.findOne({ _id: req.params.id, tenantId: req.tenantObjectId })
      .populate("createdBy", "firstName lastName")
      .lean();
    if (!corrida) return res.status(404).json({ error: "Corrida no encontrada" });

    if (req.query.hoja) {
      const hoja = String(req.query.hoja);
      corrida.lineas = (corrida.lineas || []).filter((l: any) => l.hoja === hoja);
    }

    res.json(corrida);
  } catch (error) {
    console.error("Ver corrida error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
