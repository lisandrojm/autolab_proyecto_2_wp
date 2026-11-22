import { Router } from "express";
import { Types } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { ArcaAltasLog } from "../models/ArcaAltasLog.js";
import { CandadoArcaOcupado, quienTiene } from "../services/arca/candadoArca.js";
import { enSecoForzado } from "../services/arca/corridaAltas.js";
import { arrancarOperacionRelacion, corridaOperacionDe, detenerOperacion } from "../services/arca/corridaOperacionRelacion.js";
import { OperacionInvalida, contextoDeOperacion, planOperacion, situacionesDeBaja } from "../services/arca/operacionRelacion.js";
import { CAMPOS_MODIFICABLES, ETIQUETA_CAMPO, type TipoOperacion } from "../services/arca/reglasOperacionRelacion.js";
import { relacionesOperables } from "../services/arca/relacionesOperables.js";

/**
 * BAJA, MODIFICACIÓN Y ANULACIÓN DE UNA RELACIÓN LABORAL EN ARCA (Relaciones Laborales → Modificaciones y Bajas,
 * 20/11/2026). Ver `services/arca/corridaOperacionRelacion.ts`. Mismo permiso que las altas.
 *
 *   GET  /arca/operaciones/relacion?userProjectId=&contratoKey=|contractIndex=   el contrato, sus marcas, el espejo y las situaciones de baja
 *   POST /arca/operaciones/plan      { op, userProjectId, contratoKey?, contractIndex?, datos }   qué se mandaría, sin tocar ARCA
 *   POST /arca/operaciones/corrida   { …lo mismo…, confirmar?: boolean }   en seco salvo `confirmar: true` (y el server lo permita)
 *   GET  /arca/operaciones/corrida   estado y eventos de la operación en curso (o la última)
 *   POST /arca/operaciones/corrida/detener
 *   GET  /arca/operaciones/historial?userProjectId=&contratoKey=&limit=
 */
const router = Router();
const permiso = requirePermission("admin_contracts:view");
const OPERACIONES: TipoOperacion[] = ["baja", "modificacion", "anulacion"];

const errorDe = (res: any, e: any) => {
  if (e instanceof OperacionInvalida) return res.status(e.status).json({ error: e.message, plan: e.plan || undefined });
  if (e instanceof CandadoArcaOcupado) return res.status(409).json({ error: e.message, ocupadaPor: e.tipo });
  return res.status(e?.status || 400).json({ error: String(e?.message || e) });
};

/** La relación de ARCA misma (modo «sin contrato»): en el cuerpo como `relacion`, o en la query como relCuit/relCuil/relInicio. */
const relacionDe = (src: any) => {
  const r = src?.relacion && typeof src.relacion === "object" ? src.relacion : src?.relCuit ? { empleadoraCuit: src.relCuit, cuil: src.relCuil, fechaInicio: src.relInicio } : null;
  return r ? { empleadoraCuit: String(r.empleadoraCuit || ""), cuil: String(r.cuil || ""), fechaInicio: String(r.fechaInicio || "") } : null;
};

const refDe = (src: any) => ({
  relacion: relacionDe(src),
  userProjectId: String(src?.userProjectId || ""),
  contratoKey: src?.contratoKey ? String(src.contratoKey) : null,
  contractIndex: src?.contractIndex === undefined || src?.contractIndex === null || src?.contractIndex === "" ? null : Number(src.contractIndex),
});

const opDe = (v: unknown): TipoOperacion => {
  const op = String(v || "") as TipoOperacion;
  if (!OPERACIONES.includes(op)) throw new OperacionInvalida(`Operación desconocida: «${String(v || "")}». Son: ${OPERACIONES.join(", ")}.`);
  return op;
};

/** El contrato como lo necesita la pantalla antes de elegir qué hacer: marcas, espejo, catálogo y campos modificables. */
router.get("/relacion", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const ctx = await contextoDeOperacion(req.tenantObjectId as Types.ObjectId, refDe(req.query));
    res.json({
      persona: ctx.persona,
      empresa: ctx.empresa,
      contrato: ctx.resumen,
      espejo: ctx.espejo,
      // La relación no tiene contrato en WeProdu: el panel lo avisa bien visible.
      sinContrato: ctx.sinContrato,
      situacionesBaja: await situacionesDeBaja(),
      camposModificables: CAMPOS_MODIFICABLES.map((c) => ({ campo: c, etiqueta: ETIQUETA_CAMPO[c] })),
      enSecoForzado: enSecoForzado(),
      ocupadaPor: quienTiene(String(req.tenantObjectId))?.tipo || null,
    });
  } catch (e) {
    errorDe(res, e);
  }
});

/** El plan: exactamente lo que se mandaría a ARCA y si se puede. No abre ARCA. */
router.post("/plan", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const op = opDe(req.body?.op);
    const { plan, hoy, contexto } = await planOperacion(req.tenantObjectId as Types.ObjectId, { op, ref: refDe(req.body), datos: req.body?.datos || {} });
    res.json({ plan, hoy, contexto, enSecoForzado: enSecoForzado() });
  } catch (e) {
    errorDe(res, e);
  }
});

/** Arranca la operación. Sin `confirmar: true` corre en seco: entra, completa, informa y cancela. */
router.post("/corrida", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const op = opDe(req.body?.op);
    const r = await arrancarOperacionRelacion({
      tenantId: String(req.tenantObjectId),
      tenantObjectId: req.tenantObjectId as Types.ObjectId,
      usuarioId: req.user?.userId,
      op,
      ref: refDe(req.body),
      datos: req.body?.datos || {},
      confirmar: req.body?.confirmar === true,
    });
    res.json(r);
  } catch (e) {
    errorDe(res, e);
  }
});

router.get("/corrida", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  const tenantId = String(req.tenantObjectId);
  const c = corridaOperacionDe(tenantId);
  const ocupada = quienTiene(tenantId);
  if (!c) {
    res.json({ hay: false, corriendo: false, eventos: [], enSecoForzado: enSecoForzado(), ocupadaPor: ocupada?.tipo || null });
    return;
  }
  const { señal: _s, ...resto } = c as any;
  res.json({ hay: true, corriendo: !c.terminada, ...resto, enSecoForzado: enSecoForzado(), ocupadaPor: ocupada?.tipo || null });
});

router.post("/corrida/detener", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  const r = detenerOperacion(String(req.tenantObjectId));
  res.status(r.detenida ? 200 : 409).json(r);
});

/**
 * GET /arca/operaciones/cola — LA COLA DE A.R.C.A BAJAS: las relaciones de ARCA abiertas, las que terminan de hoy en
 * adelante y las cerradas en los últimos 30 días, cada una con cómo se opera (`relacionesOperables.ts`). La pantalla
 * las reparte: «Pendientes» (un contrato terminado en WeProdu con la relación abierta en ARCA) y «Para revisar» (sin
 * contrato, o con varios). Sólo lee el espejo: no abre ARCA.
 */
router.get("/cola", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    res.json(await relacionesOperables(req.tenantObjectId as Types.ObjectId));
  } catch (e) {
    errorDe(res, e);
  }
});

/** El registro de las operaciones (bajas, modificaciones, anulaciones), las últimas 200, de un contrato si se pide. El HTML no viaja. */
router.get("/historial", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const filtro: Record<string, unknown> = { tenantId: req.tenantObjectId, tipo: { $in: OPERACIONES } };
    const up = String(req.query?.userProjectId || "");
    const key = String(req.query?.contratoKey || "");
    if (Types.ObjectId.isValid(up)) filtro["contratos.userProjectId"] = new Types.ObjectId(up);
    if (Types.ObjectId.isValid(key)) filtro["contratos.contratoKey"] = new Types.ObjectId(key);
    const limite = Math.min(Math.max(Number(req.query?.limit) || 200, 1), 500);
    const logs: any[] = await ArcaAltasLog.find(filtro)
      .sort({ createdAt: -1 })
      .limit(limite)
      .select("tipo createdAt usuarioId empresaId empresaCuit empresaRazonSocial enSeco resultado irreversible error textoArca contratos duracionMs operacion.que operacion.payload operacion.relacion operacion.acuse operacion.clase operacion.cambios operacion.leidoDe operacion.pantallaDesconocida operacion.textoNuevo operacion.enRojo")
      .populate("usuarioId", "firstName lastName")
      .lean();
    res.json(
      logs.map((l) => ({
        _id: String(l._id),
        tipo: l.tipo,
        fecha: l.createdAt,
        quien: l.usuarioId ? `${l.usuarioId.firstName || ""} ${l.usuarioId.lastName || ""}`.trim() : "",
        empresaRazonSocial: l.empresaRazonSocial || "",
        enSeco: !!l.enSeco,
        resultado: l.resultado,
        irreversible: !!l.irreversible,
        error: l.error || "",
        textoArca: l.textoArca || "",
        contrato: l.contratos?.[0] ? { userProjectId: String(l.contratos[0].userProjectId || ""), contractIndex: l.contratos[0].contractIndex, contratoKey: l.contratos[0].contratoKey ? String(l.contratos[0].contratoKey) : null, cuil: l.contratos[0].cuil, nombre: l.contratos[0].nombre, resultado: l.contratos[0].resultado, motivo: l.contratos[0].motivo || "" } : null,
        operacion: l.operacion || {},
        duracionMs: l.duracionMs,
      })),
    );
  } catch (e) {
    errorDe(res, e);
  }
});

/** La pantalla de ARCA tal como quedó en una operación (anonimizada). Pesa: se baja aparte. */
router.get("/historial/:logId/html", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  if (!Types.ObjectId.isValid(req.params.logId)) return res.status(400).send("Id inválido");
  const l: any = await ArcaAltasLog.findOne({ _id: req.params.logId, tenantId: req.tenantObjectId, tipo: { $in: OPERACIONES } }).select("htmlResultado").lean();
  if (!l) return res.status(404).send("No existe");
  res.type("text/html").send(l.htmlResultado || "<p>Esta operación no guardó la pantalla de ARCA.</p>");
});

export { router as arcaOperacionesRoutes };
