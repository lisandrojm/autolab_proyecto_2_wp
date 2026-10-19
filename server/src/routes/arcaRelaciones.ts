import { Router, Response } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { Tenant } from "../models/Tenant.js";
import { Company } from "../models/Company.js";
import { AntiguedadArca } from "../models/AntiguedadArca.js";
import { RelacionLaboralArca } from "../models/RelacionLaboralArca.js";
import { CandadoArcaOcupado, NOMBRE_CORRIDA, quienTiene } from "../services/arca/candadoArca.js";
import { credencialesDe } from "../services/arca/navegador.js";
import { sincronizarRelacionesTenant, syncEnCurso } from "../services/arca/sincronizarRelaciones.js";
import { configSyncDe, horaDe } from "../services/arca/sincronizacionRelacionesCronService.js";
import { yaPasoLaHora } from "../services/arca/horarioAltasAutomaticas.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { isoDe } from "../services/arca/relacionesArcaStore.js";

/**
 * RELACIONES LABORALES DE ARCA Y ANTIGÜEDAD: lo que se lee en la pestaña «Antigüedad ARCA» de
 * Documentos y lo que la hace sincronizar. Nada de acá escribe en ARCA; la sincronización sólo lee.
 * Mismo permiso que las altas automáticas (`/contratos/altas-arca/*`).
 */
const router = Router();
const permiso = requirePermission(["admin_contracts:view", "config_afip:view"]);
const BASE = "integrations.arcaSimplificacion.sincronizacionRelaciones";
const soloDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const errorDe = (res: Response, e: any) => {
  if (e instanceof CandadoArcaOcupado) return res.status(409).json({ error: e.message, ocupadaPor: e.tipo });
  return res.status(e?.status || 500).json({ error: String(e?.message || e) });
};

/** Las empresas con CUIT, como las ve la pantalla (filtro y rótulos). */
async function empresasConCuit(): Promise<Array<{ _id: string; cuit: string; razonSocial: string }>> {
  const docs: any[] = await Company.find({ cuit: { $exists: true, $ne: "" } }).select("cuit razonSocial").sort({ razonSocial: 1 }).lean();
  return docs.map((e) => ({ _id: String(e._id), cuit: soloDigitos(e.cuit), razonSocial: String(e.razonSocial || "") })).filter((e) => e.cuit.length === 11);
}

/**
 * GET /arca/relaciones/antiguedad?empresaId=&empresaCuit=&cuil=&q=&limit=
 * Sin empresa: las filas GLOBALES (todas las empleadoras juntas). Con empresa: las de esa empleadora.
 * `cuil` trae a una persona (todas sus filas: la global y una por empleadora). `q` busca por nombre o CUIL.
 */
router.get("/antiguedad", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const empresas = await empresasConCuit();
    const filtro: any = { tenantId: req.tenantObjectId };
    const cuil = soloDigitos(req.query.cuil);
    if (cuil) {
      filtro.cuil = cuil;
    } else {
      const empresaId = String(req.query.empresaId || "");
      const empresaCuit = soloDigitos(req.query.empresaCuit) || (empresaId ? empresas.find((e) => e._id === empresaId)?.cuit : "");
      filtro.empleadoraCuit = empresaCuit && empresaCuit.length === 11 ? empresaCuit : null;
      const q = String(req.query.q || "").trim();
      if (q) {
        const d = soloDigitos(q);
        filtro.$or = [{ apellidoNombre: { $regex: escaparRegex(q), $options: "i" } }];
        if (d.length >= 3) filtro.$or.push({ cuil: { $regex: `^${d}` } });
      }
    }
    const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 1000));
    const [filas, total] = await Promise.all([
      AntiguedadArca.find(filtro).sort({ apellidoNombre: 1, empleadoraCuit: 1 }).limit(limit).lean(),
      AntiguedadArca.countDocuments(filtro),
    ]);
    res.json({
      total,
      empresas,
      filas: filas.map((f: any) => ({
        cuil: f.cuil,
        empleadoraCuit: f.empleadoraCuit,
        apellidoNombre: f.apellidoNombre,
        primeraAlta: isoDe(f.primeraAlta),
        ultimaFecha: isoDe(f.ultimaFecha),
        antiguedadDesdePrimeraAlta: f.antiguedadDesdePrimeraAlta,
        diasTrabajados: f.diasTrabajados,
        aniosTrabajados: f.aniosTrabajados,
        cantidadContratos: f.cantidadContratos,
        tieneRelacionAbierta: !!f.tieneRelacionAbierta,
        empresas: f.empresas || [],
        calculadoEl: f.calculadoEl,
      })),
    });
  } catch (e) {
    errorDe(res, e);
  }
});

/** GET /arca/relaciones/:cuil/relaciones — las relaciones de una persona, para el detalle. */
router.get("/persona/:cuil", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cuil = soloDigitos(req.params.cuil);
    if (cuil.length !== 11) { res.status(400).json({ error: "CUIL inválido." }); return; }
    const docs: any[] = await RelacionLaboralArca.find({ tenantId: req.tenantObjectId, cuil }).sort({ fechaInicio: -1 }).select("-rawLinea").lean();
    res.json(docs.map((d) => ({ ...d, fechaInicio: isoDe(d.fechaInicio), fechaFin: isoDe(d.fechaFin) })));
  } catch (e) {
    errorDe(res, e);
  }
});

/**
 * POST /arca/relaciones/personas { cuils } — las relaciones de VARIAS personas, resumidas, de la más
 * nueva a la más vieja. Es la columna «Contratos en ARCA» de Contratación → Contratos, para cruzar lo
 * que dice WeProdu con lo que dice ARCA sin abrir persona por persona.
 *
 * Una sola consulta para toda la página y sólo los campos que la celda muestra: con Atlas lejos lo que
 * pesa son los bytes (ver memoria «Atlas dev lento por volumen»). El detalle completo de una persona
 * sigue saliendo de `/persona/:cuil`, cuando se abre.
 */
router.post("/personas", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cuils = [...new Set(((Array.isArray(req.body?.cuils) ? req.body.cuils : []) as unknown[]).map(soloDigitos).filter((c) => c.length === 11))].slice(0, 1000);
    const relaciones: Record<string, Array<{ empleadoraCuit: string; fechaInicio: string; fechaFin: string | null; modalidadContrato: string; puestoDesempenado: string }>> = {};
    if (cuils.length) {
      const docs: any[] = await RelacionLaboralArca.find({ tenantId: req.tenantObjectId, cuil: { $in: cuils } })
        .sort({ fechaInicio: -1 })
        .select("cuil empleadoraCuit fechaInicio fechaFin modalidadContrato puestoDesempenado -_id")
        .lean();
      for (const d of docs) {
        (relaciones[d.cuil] ||= []).push({ empleadoraCuit: d.empleadoraCuit, fechaInicio: isoDe(d.fechaInicio)!, fechaFin: isoDe(d.fechaFin), modalidadContrato: d.modalidadContrato || "", puestoDesempenado: d.puestoDesempenado || "" });
      }
    }
    res.json({ empresas: await empresasConCuit(), relaciones });
  } catch (e) {
    errorDe(res, e);
  }
});

/** GET /arca/relaciones/estado — la sincronización: config, en curso, última corrida y totales. */
router.get("/estado", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = String(req.tenantObjectId);
    const [t, relaciones, personas, cred] = await Promise.all([
      Tenant.findById(req.tenantObjectId).select(BASE).lean() as Promise<any>,
      RelacionLaboralArca.countDocuments({ tenantId: req.tenantObjectId }),
      AntiguedadArca.countDocuments({ tenantId: req.tenantObjectId, empleadoraCuit: null }),
      credencialesDe(tenantId),
    ]);
    const sr = t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones || {};
    const ocupada = quienTiene(tenantId);
    res.json({
      config: configSyncDe(sr),
      ultimoDia: sr.ultimoDia || null,
      ultimaSync: sr.ultimaSync || null,
      enCurso: syncEnCurso(tenantId),
      arcaOcupadaPor: ocupada && ocupada.tipo !== "relaciones" ? NOMBRE_CORRIDA[ocupada.tipo] : null,
      hayCredenciales: !!cred,
      totales: { relaciones, personas },
      hoy: hoyArgentina(),
    });
  } catch (e) {
    errorDe(res, e);
  }
});

/** POST /arca/relaciones/sincronizar { meses? } — arranca la sincronización ya mismo y vuelve enseguida. */
router.post("/sincronizar", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = String(req.tenantObjectId);
    if (syncEnCurso(tenantId)) { res.status(409).json({ enCurso: true, error: "Ya hay una sincronización en curso. Esperá a que termine." }); return; }
    const ocupada = quienTiene(tenantId);
    if (ocupada) throw new CandadoArcaOcupado(ocupada.tipo);
    const t: any = await Tenant.findById(req.tenantObjectId).select(BASE).lean();
    const cfg = configSyncDe(t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones);
    const meses = Number.isInteger(Number(req.body?.meses)) && Number(req.body.meses) >= 1 ? Math.min(24, Number(req.body.meses)) : cfg.meses;
    // Sin `await`: la corrida sigue por su cuenta y la pantalla la sigue por GET /estado.
    void sincronizarRelacionesTenant(tenantId, { meses, automatica: false }).catch((e) => console.error("[sync-relaciones-arca] manual:", e?.message || e));
    res.status(202).json({ arrancada: true, meses });
  } catch (e) {
    errorDe(res, e);
  }
});

/** GET /arca/relaciones/sync-config */
router.get("/sync-config", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const t: any = await Tenant.findById(req.tenantObjectId).select(BASE).lean();
    res.json(configSyncDe(t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones));
  } catch (e) {
    errorDe(res, e);
  }
});

/** PUT /arca/relaciones/sync-config { activa?, hora?: "HH:MM", meses?: 1..24 } */
router.put("/sync-config", requireTenant, authenticateToken, permiso, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const set: Record<string, unknown> = {};
    if (req.body?.hora !== undefined) {
      if (!/^\d{1,2}:\d{2}$/.test(String(req.body.hora)) || horaDe(req.body.hora).hora !== Number(String(req.body.hora).split(":")[0])) { res.status(400).json({ error: "La hora tiene que ser HH:MM (00:00 a 23:59)." }); return; }
      const { hora, minuto } = horaDe(req.body.hora);
      set[`${BASE}.hora`] = `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
    }
    if (req.body?.meses !== undefined) {
      const n = Number(req.body.meses);
      if (!Number.isInteger(n) || n < 1 || n > 24) { res.status(400).json({ error: "Los meses tienen que ser un entero entre 1 y 24." }); return; }
      set[`${BASE}.meses`] = n;
    }
    if (req.body?.activa !== undefined) set[`${BASE}.activa`] = req.body.activa === true;
    const t: any = await Tenant.findById(req.tenantObjectId).select(BASE).lean();
    const sr = t?.integrations?.arcaSimplificacion?.sincronizacionRelaciones || {};
    const cfg = configSyncDe({ ...sr, ...(set[`${BASE}.hora`] ? { hora: set[`${BASE}.hora`] } : {}), ...(set[`${BASE}.meses`] ? { meses: set[`${BASE}.meses`] } : {}), activa: req.body?.activa !== undefined ? req.body.activa === true : sr.activa });
    // Al prender después de la hora de hoy, hoy ya no corre: si se quiere ahora, está «Sincronizar ahora».
    if (req.body?.activa === true && !sr.activa && yaPasoLaHora(horaDe(cfg.hora))) set[`${BASE}.ultimoDia`] = hoyArgentina();
    if (Object.keys(set).length > 0) await Tenant.updateOne({ _id: req.tenantObjectId }, { $set: set });
    res.json(cfg);
  } catch (e) {
    errorDe(res, e);
  }
});

export const arcaRelacionesRoutes = router;
export default router;
