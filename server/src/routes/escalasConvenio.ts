import { Router, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import fs from "fs/promises";

import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { EscalaPeriodo } from "../models/EscalaPeriodo.js";
import { AdicionalConvenio } from "../models/AdicionalConvenio.js";
import { AdicionalValorPeriodo } from "../models/AdicionalValorPeriodo.js";
import { EscalaPequenasEmpresas } from "../models/EscalaPequenasEmpresas.js";
import { AcuerdoParitario } from "../models/AcuerdoParitario.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { Categoria } from "../models/Categoria.js";
import { guardarPdf, rutaAbsoluta, borrarArchivo } from "../services/archivoParitariaService.js";
import {
  DatoDeEscalaInvalido,
  armarPeriodo,
  motivoDeSuperposicion,
  cerrarPeriodosAbiertos,
  espejarVigenteEnGrupo,
  escalaDelConvenioAFecha,
  adicionalesAFecha,
  pequenasEmpresasAFecha,
  desvioJornadaAdicional,
  esElVigente,
} from "../services/escalasConvenio.js";
import { aIsoFecha, ordenarPorVigencia, vigenciaIncoherente, periodoVigente } from "../utils/escalaAFecha.js";
import { deducirAdicionalPct, redondearCentavos } from "../utils/escalaCalculo.js";
import { proponerEscala, proponerMontos, porcentajeAcumulado } from "../utils/aplicarParitaria.js";
import { liquidacionDeReferencia, AdicionalVigente } from "../utils/liquidacionReferencia.js";

/**
 * ESCALAS SALARIALES VERSIONADAS, ADICIONALES DEL CONVENIO, CAPÍTULO DE PEQUEÑAS EMPRESAS Y ACUERDOS.
 *
 * Es lo que le faltaba al ABM de `/arca/categorias` para reflejar un acuerdo paritario completo: ahí sólo se
 * puede cargar UN juego de importes por grupo, sin historia, sin los adicionales del acta y sin saber de qué
 * acuerdo salió cada número.
 *
 * Va en un router aparte y no dentro de `arcaCategorias.ts` (863 líneas) porque son entidades nuevas con su
 * propio ciclo de vida. Lo que NO cambia: `ConvenioGrupo` sigue siendo lo vigente y lo que leen los contratos,
 * los PDFs y el TXT de ARCA. Acá se escribe la historia y se ESPEJA el vigente — ver `services/escalasConvenio`.
 *
 * Autenticación igual que en el resto del módulo ARCA: `authenticateToken`. El permiso fino lo aplica la
 * pantalla (`config_holidays:view`, que es el que ya usa Categorías), no este router; cambiarlo acá sería
 * inventar una regla distinta para la misma pantalla.
 */
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

/** Hoy, en ISO. Las cuentas puras reciben la fecha; acá es donde se lee el reloj, una sola vez por request. */
const hoyIso = (): string => new Date().toISOString().slice(0, 10);

/** La fecha del query, o hoy. Todo endpoint de lectura acepta `?fecha=` para poder ver la escala a una fecha. */
const fechaDelQuery = (req: AuthenticatedRequest): string => aIsoFecha(String(req.query.fecha || "")) || hoyIso();

const convenioDelQuery = (req: AuthenticatedRequest): string => String(req.query.convenio || "").trim();

const responderError = (res: Response, error: any, contexto: string) => {
  if (error instanceof DatoDeEscalaInvalido) return res.status(400).json({ error: error.message });
  if (error?.code === 11000) return res.status(409).json({ error: "Ya existe un registro con esa vigencia." });
  if (error?.name === "ValidationError") {
    const detalle = Object.values(error.errors || {}).map((e: any) => e.message);
    return res.status(400).json({ error: detalle.join(" · ") || error.message });
  }
  console.error(`${contexto}:`, error);
  return res.status(500).json({ error: "Error interno del servidor" });
};

const numeroOpcional = (v: any): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* ────────────────────────────── LECTURA: TODO EL CONVENIO A UNA FECHA ────────────────────────────── */

/**
 * GET /api/v1/arca/escalas?convenio=0634/11&fecha=2026-05-10
 *
 * Todo lo que el acuerdo define para ese convenio a esa fecha, en una sola llamada: escala por grupo,
 * adicionales con su importe vigente, capítulo de pequeñas empresas y los acuerdos cargados.
 *
 * Una sola llamada y no cuatro porque la pantalla muestra las cuatro cosas juntas y con el MISMO `fecha`:
 * pedirlas por separado abre la puerta a que el selector de fecha quede desincronizado entre sub-pestañas.
 */
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const convenio = convenioDelQuery(req);
    if (!convenio) return res.status(400).json({ error: "Falta el convenio." });
    const fecha = fechaDelQuery(req);

    const [escala, adicionales, pequenas, acuerdos, grupos] = await Promise.all([
      escalaDelConvenioAFecha(convenio, fecha),
      adicionalesAFecha(convenio, fecha),
      pequenasEmpresasAFecha(convenio, fecha),
      AcuerdoParitario.find({ convenios: convenio, isActive: true }).sort({ firmadoEl: -1 }).lean(),
      ConvenioGrupo.find({ convenio }).select("numero nombre sueldoBasico sueldoAdicional presentismo sueldoBruto neto fechaActualizacion vigenciaHasta").sort({ numero: 1 }).lean(),
    ]);

    /**
     * `grupos` va en la respuesta para poder mostrar LO VIGENTE al lado de lo versionado.
     *
     * Es el dato que hace visible el estado real: mientras un grupo no tenga período cargado, la pantalla
     * tiene que seguir mostrando el importe que de verdad se está usando en los contratos, no un vacío.
     */
    const porGrupo = new Map(escala.map((e: any) => [String(e.grupo ?? ""), e]));
    const filas = (grupos as any[]).map((g) => {
      const periodo: any = porGrupo.get(String(g.numero));
      return {
        grupo: g.numero,
        nombre: g.nombre || "",
        vigenteEnGrupo: {
          basico: g.sueldoBasico,
          adicionalMonto: g.sueldoAdicional,
          presentismoMonto: g.presentismo,
          total: g.sueldoBruto,
          neto: g.neto,
          desde: aIsoFecha(g.fechaActualizacion),
          hasta: aIsoFecha(g.vigenciaHasta),
          /** El % que se deduce de los importes cargados: es lo que deja ver un adicional mal tipeado. */
          adicionalPctDeducido: deducirAdicionalPct(Number(g.sueldoBasico || 0), Number(g.sueldoAdicional || 0)),
          vigenciaIncoherente: vigenciaIncoherente({ desde: g.fechaActualizacion, hasta: g.vigenciaHasta }),
        },
        periodo: periodo || null,
      };
    });

    res.json({ convenio, fecha, filas, escala, adicionales, pequenasEmpresas: pequenas, acuerdos });
  } catch (error) {
    responderError(res, error, "Get escala del convenio a fecha error");
  }
});

/* ────────────────────────────── PERÍODOS DE ESCALA ────────────────────────────── */

/**
 * GET /api/v1/arca/escalas/periodos?convenio=0634/11[&grupo=1]
 *
 * El historial completo, del más nuevo al más viejo. Es lo que alimenta el selector de período y la
 * sub-pestaña de historial.
 */
router.get("/periodos", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const convenio = convenioDelQuery(req);
    if (!convenio) return res.status(400).json({ error: "Falta el convenio." });
    const filtro: Record<string, any> = { convenio };
    const grupo = numeroOpcional(req.query.grupo);
    if (grupo != null) filtro.grupo = grupo;

    const periodos = await EscalaPeriodo.find(filtro).lean();
    res.json(ordenarPorVigencia(periodos as any[]));
  } catch (error) {
    responderError(res, error, "Get periodos de escala error");
  }
});

/**
 * POST /api/v1/arca/escalas/periodos
 *
 * Crea un período. Con `cerrarAnterior: true` cierra el que estaba abierto (su `hasta` pasa a ser el día
 * anterior) en lugar de rechazar por superposición — es el caso normal al cargar un tramo nuevo.
 *
 * Si el período creado rige hoy, se espeja en `ConvenioGrupo`: si no, aplicar una paritaria no cambiaría
 * nada en los contratos.
 */
router.post("/periodos", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const convenio = String(body.convenio || "").trim();
    if (!convenio) return res.status(400).json({ error: "El convenio es obligatorio." });
    const grupo = numeroOpcional(body.grupo);
    const desde = aIsoFecha(String(body.desde || ""));
    if (!desde) return res.status(400).json({ error: "La vigencia desde es obligatoria." });
    const hasta = body.hasta ? aIsoFecha(String(body.hasta)) : null;

    if (body.cerrarAnterior === true) await cerrarPeriodosAbiertos(convenio, grupo, desde);
    const choque = await motivoDeSuperposicion(convenio, grupo, desde, hasta);
    if (choque) return res.status(409).json({ error: choque });

    // El `grupoId` se resuelve acá y no lo manda el cliente: es el vínculo con la estructura y tiene que
    // salir de la base, no de lo que diga un formulario.
    const grupoDoc = grupo == null ? null : await ConvenioGrupo.findOne({ convenio, numero: grupo }).select("_id");

    const datos = armarPeriodo({
      convenio,
      grupo,
      grupoId: grupoDoc?._id ? String(grupoDoc._id) : null,
      categoriaId: body.categoriaId || null,
      desde,
      hasta,
      basico: Number(body.basico || 0),
      adicionalPct: numeroOpcional(body.adicionalPct),
      presentismoPct: numeroOpcional(body.presentismoPct),
      netoFactor: numeroOpcional(body.netoFactor),
      acta: body.acta || {},
      acuerdoId: body.acuerdoId || null,
      tramo: body.tramo || "",
      origen: body.origen || "manual",
      nota: body.nota || "",
      createdBy: req.user?.userId || null,
    });

    const creado = await EscalaPeriodo.create(datos);
    const espejo = esElVigente(creado, hoyIso()) ? await espejarVigenteEnGrupo(convenio, grupo, hoyIso()) : null;
    res.status(201).json({ periodo: creado, espejo });
  } catch (error) {
    responderError(res, error, "Create periodo de escala error");
  }
});

/**
 * PUT /api/v1/arca/escalas/periodos/:id
 *
 * Reemplaza los datos del período y recalcula todo. No hay edición parcial de importes: si cambia el básico
 * y no se recalculara el resto, la escala quedaría contradiciéndose a sí misma.
 */
router.put("/periodos/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const actual = await EscalaPeriodo.findById(req.params.id);
    if (!actual) return res.status(404).json({ error: "El período no existe." });

    const body = req.body || {};
    const desde = aIsoFecha(String(body.desde ?? actual.desde));
    const hasta = body.hasta === null || body.hasta === "" ? null : aIsoFecha(String(body.hasta ?? actual.hasta ?? ""));
    const choque = await motivoDeSuperposicion(actual.convenio, actual.grupo ?? null, desde, hasta, String(actual._id));
    if (choque) return res.status(409).json({ error: choque });

    const datos = armarPeriodo({
      convenio: actual.convenio,
      grupo: actual.grupo ?? null,
      grupoId: actual.grupoId ? String(actual.grupoId) : null,
      categoriaId: actual.categoriaId ? String(actual.categoriaId) : null,
      desde,
      hasta,
      basico: Number(body.basico ?? actual.basico),
      adicionalPct: body.adicionalPct === undefined ? actual.adicionalPct ?? null : numeroOpcional(body.adicionalPct),
      presentismoPct: body.presentismoPct === undefined ? actual.presentismoPct ?? null : numeroOpcional(body.presentismoPct),
      netoFactor: body.netoFactor === undefined ? actual.netoFactor ?? null : numeroOpcional(body.netoFactor),
      acta: body.acta === undefined ? { adicionalMonto: actual.actaAdicionalMonto, presentismoMonto: actual.actaPresentismoMonto, total: actual.actaTotal, neto: actual.actaNeto } : body.acta,
      acuerdoId: body.acuerdoId === undefined ? (actual.acuerdoId ? String(actual.acuerdoId) : null) : body.acuerdoId,
      tramo: body.tramo ?? actual.tramo,
      // Editar a mano un período cargado por script deja de ser "lo que dice el acta": pasa a ser manual,
      // y eso es lo que después permite volver a correr el seed sin pisar lo que alguien corrigió.
      origen: body.origen ?? (actual.origen === "estado-actual" || actual.origen === "derivado" ? "manual" : actual.origen),
      nota: body.nota ?? actual.nota,
      createdBy: actual.createdBy ? String(actual.createdBy) : null,
    });

    await EscalaPeriodo.updateOne({ _id: actual._id }, { $set: datos });
    const actualizado = await EscalaPeriodo.findById(actual._id).lean();
    const espejo = esElVigente(actualizado as any, hoyIso()) ? await espejarVigenteEnGrupo(actual.convenio, actual.grupo ?? null, hoyIso()) : null;
    res.json({ periodo: actualizado, espejo });
  } catch (error) {
    responderError(res, error, "Update periodo de escala error");
  }
});

/**
 * DELETE /api/v1/arca/escalas/periodos/:id
 *
 * Borra el período del historial. NO toca `ConvenioGrupo`: si se borrara también el importe vigente, un
 * borrado equivocado dejaría sin escala a todas las categorías del grupo y bloquearía las altas.
 */
router.delete("/periodos/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const borrado = await EscalaPeriodo.findByIdAndDelete(req.params.id);
    if (!borrado) return res.status(404).json({ error: "El período no existe." });
    res.json({ ok: true, aviso: "Se borró el período del historial. La escala vigente del grupo quedó como estaba." });
  } catch (error) {
    responderError(res, error, "Delete periodo de escala error");
  }
});

/**
 * POST /api/v1/arca/escalas/periodos/:id/espejar
 *
 * Fuerza la copia del vigente a `ConvenioGrupo`. Existe para el caso en que el espejo quedó desalineado —por
 * ejemplo después de borrar un período— y para poder arreglarlo sin editar la escala a mano.
 */
router.post("/periodos/:id/espejar", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const periodo = await EscalaPeriodo.findById(req.params.id).lean();
    if (!periodo) return res.status(404).json({ error: "El período no existe." });
    const espejo = await espejarVigenteEnGrupo((periodo as any).convenio, (periodo as any).grupo ?? null, hoyIso());
    res.json(espejo);
  } catch (error) {
    responderError(res, error, "Espejar periodo error");
  }
});

/* ────────────────────────────── ADICIONALES ────────────────────────────── */

/** GET /api/v1/arca/escalas/adicionales?convenio=&fecha=&capitulo= */
router.get("/adicionales", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const convenio = convenioDelQuery(req);
    if (!convenio) return res.status(400).json({ error: "Falta el convenio." });
    const capitulo = req.query.capitulo === "pequenas_empresas" ? "pequenas_empresas" : req.query.capitulo === "general" ? "general" : undefined;
    res.json(await adicionalesAFecha(convenio, fechaDelQuery(req), capitulo));
  } catch (error) {
    responderError(res, error, "Get adicionales error");
  }
});

/**
 * POST /api/v1/arca/escalas/adicionales
 *
 * Da de alta un adicional. `remunerativo` y `tipoCalculo` pueden quedar sin definir a propósito: el acta no
 * los publica, y `confirmado: false` es lo que hace que la pantalla y la liquidación lo digan.
 */
router.post("/adicionales", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const convenio = String(body.convenio || "").trim();
    const codigo = String(body.codigo || "")
      .trim()
      .toLowerCase();
    const nombre = String(body.nombre || "").trim();
    if (!convenio) return res.status(400).json({ error: "El convenio es obligatorio." });
    if (!codigo) return res.status(400).json({ error: "El código es obligatorio (es la clave del adicional dentro del convenio)." });
    if (!nombre) return res.status(400).json({ error: "El nombre es obligatorio." });
    if (await AdicionalConvenio.findOne({ convenio, codigo })) return res.status(409).json({ error: `El convenio ${convenio} ya tiene un adicional con código «${codigo}».` });

    const creado = await AdicionalConvenio.create({
      convenio,
      codigo,
      nombre,
      tipoCalculo: body.tipoCalculo || "a_confirmar",
      remunerativo: body.remunerativo === true ? true : body.remunerativo === false ? false : null,
      confirmado: body.confirmado === true,
      base: body.base || null,
      unidad: String(body.unidad || "").trim(),
      condicion: String(body.condicion || "").trim(),
      conceptoLiquidacion: String(body.conceptoLiquidacion || "").trim(),
      codigoArca: numeroOpcional(body.codigoArca),
      capitulo: body.capitulo === "pequenas_empresas" ? "pequenas_empresas" : "general",
      orden: Number(body.orden || 0),
      createdBy: req.user?.userId || null,
    });
    res.status(201).json(creado);
  } catch (error) {
    responderError(res, error, "Create adicional error");
  }
});

/** PUT /api/v1/arca/escalas/adicionales/:id */
router.put("/adicionales/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const set: Record<string, any> = {};
    if (body.nombre !== undefined) set.nombre = String(body.nombre).trim();
    if (body.tipoCalculo !== undefined) set.tipoCalculo = body.tipoCalculo;
    // `null` tiene significado ("no se sabe"), así que se distingue de "no vino la clave".
    if (body.remunerativo !== undefined) set.remunerativo = body.remunerativo === true ? true : body.remunerativo === false ? false : null;
    if (body.confirmado !== undefined) set.confirmado = body.confirmado === true;
    if (body.base !== undefined) set.base = body.base || null;
    for (const k of ["unidad", "condicion", "conceptoLiquidacion"]) if (body[k] !== undefined) set[k] = String(body[k] ?? "").trim();
    if (body.codigoArca !== undefined) set.codigoArca = numeroOpcional(body.codigoArca);
    if (body.capitulo !== undefined) set.capitulo = body.capitulo === "pequenas_empresas" ? "pequenas_empresas" : "general";
    if (body.orden !== undefined) set.orden = Number(body.orden || 0);
    if (body.isActive !== undefined) set.isActive = body.isActive === true;

    const actualizado = await AdicionalConvenio.findByIdAndUpdate(req.params.id, { $set: set }, { new: true, runValidators: true });
    if (!actualizado) return res.status(404).json({ error: "El adicional no existe." });
    res.json(actualizado);
  } catch (error) {
    responderError(res, error, "Update adicional error");
  }
});

/**
 * DELETE /api/v1/arca/escalas/adicionales/:id
 *
 * Borra el adicional y sus importes. Con `?baja=true` sólo lo desactiva, que es lo que conviene cuando ya se
 * usó para liquidar: un adicional borrado deja las liquidaciones viejas sin explicación.
 */
router.delete("/adicionales/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (String(req.query.baja) === "true") {
      const dado = await AdicionalConvenio.findByIdAndUpdate(req.params.id, { $set: { isActive: false } }, { new: true });
      if (!dado) return res.status(404).json({ error: "El adicional no existe." });
      return res.json({ ok: true, baja: true });
    }
    const borrado = await AdicionalConvenio.findByIdAndDelete(req.params.id);
    if (!borrado) return res.status(404).json({ error: "El adicional no existe." });
    const { deletedCount } = await AdicionalValorPeriodo.deleteMany({ adicionalId: borrado._id });
    res.json({ ok: true, valoresBorrados: deletedCount || 0 });
  } catch (error) {
    responderError(res, error, "Delete adicional error");
  }
});

/** GET /api/v1/arca/escalas/adicionales/:id/valores — el historial de importes de un adicional. */
router.get("/adicionales/:id/valores", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const valores = await AdicionalValorPeriodo.find({ adicionalId: req.params.id }).lean();
    res.json(ordenarPorVigencia(valores as any[]));
  } catch (error) {
    responderError(res, error, "Get valores de adicional error");
  }
});

/** POST /api/v1/arca/escalas/adicionales/:id/valores — un importe nuevo para un período. */
router.post("/adicionales/:id/valores", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adicional = await AdicionalConvenio.findById(req.params.id);
    if (!adicional) return res.status(404).json({ error: "El adicional no existe." });
    const body = req.body || {};
    const desde = aIsoFecha(String(body.desde || ""));
    if (!desde) return res.status(400).json({ error: "La vigencia desde es obligatoria." });
    const hasta = body.hasta ? aIsoFecha(String(body.hasta)) : null;
    if (hasta && hasta < desde) return res.status(400).json({ error: "La vigencia termina antes de empezar." });
    const grupo = numeroOpcional(body.grupo);

    if (body.cerrarAnterior === true) {
      const corte = new Date(`${desde}T00:00:00.000Z`);
      const diaAntes = new Date(corte.getTime() - 86400000);
      await AdicionalValorPeriodo.updateMany({ adicionalId: adicional._id, grupo: grupo ?? null, hasta: null, desde: { $lt: corte } }, { $set: { hasta: diaAntes } });
    }

    const creado = await AdicionalValorPeriodo.create({
      adicionalId: adicional._id,
      convenio: adicional.convenio,
      grupo: grupo ?? null,
      desde: new Date(`${desde}T00:00:00.000Z`),
      hasta: hasta ? new Date(`${hasta}T00:00:00.000Z`) : null,
      monto: numeroOpcional(body.monto),
      porcentaje: numeroOpcional(body.porcentaje),
      acuerdoId: body.acuerdoId || null,
      tramo: body.tramo || "",
      origen: body.origen || "manual",
      nota: body.nota || "",
      createdBy: req.user?.userId || null,
    });
    res.status(201).json(creado);
  } catch (error) {
    responderError(res, error, "Create valor de adicional error");
  }
});

/** PUT /api/v1/arca/escalas/valores/:id */
router.put("/valores/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const set: Record<string, any> = {};
    if (body.desde !== undefined) {
      const desde = aIsoFecha(String(body.desde));
      if (!desde) return res.status(400).json({ error: "La vigencia desde no se entiende." });
      set.desde = new Date(`${desde}T00:00:00.000Z`);
    }
    if (body.hasta !== undefined) {
      const hasta = body.hasta ? aIsoFecha(String(body.hasta)) : "";
      set.hasta = hasta ? new Date(`${hasta}T00:00:00.000Z`) : null;
    }
    if (body.monto !== undefined) set.monto = numeroOpcional(body.monto);
    if (body.porcentaje !== undefined) set.porcentaje = numeroOpcional(body.porcentaje);
    if (body.grupo !== undefined) set.grupo = numeroOpcional(body.grupo);
    if (body.nota !== undefined) set.nota = String(body.nota ?? "");
    if (body.origen !== undefined) set.origen = body.origen;

    const actualizado = await AdicionalValorPeriodo.findByIdAndUpdate(req.params.id, { $set: set }, { new: true, runValidators: true });
    if (!actualizado) return res.status(404).json({ error: "El importe no existe." });
    res.json(actualizado);
  } catch (error) {
    responderError(res, error, "Update valor de adicional error");
  }
});

/** DELETE /api/v1/arca/escalas/valores/:id */
router.delete("/valores/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const borrado = await AdicionalValorPeriodo.findByIdAndDelete(req.params.id);
    if (!borrado) return res.status(404).json({ error: "El importe no existe." });
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error, "Delete valor de adicional error");
  }
});

/* ────────────────────────────── PEQUEÑAS EMPRESAS ────────────────────────────── */

/** GET /api/v1/arca/escalas/pequenas-empresas?convenio=&fecha= */
router.get("/pequenas-empresas", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const convenio = convenioDelQuery(req);
    if (!convenio) return res.status(400).json({ error: "Falta el convenio." });
    if (String(req.query.historial) === "true") {
      const filas = await EscalaPequenasEmpresas.find({ convenio }).lean();
      return res.json(ordenarPorVigencia(filas as any[]));
    }
    res.json(await pequenasEmpresasAFecha(convenio, fechaDelQuery(req)));
  } catch (error) {
    responderError(res, error, "Get pequeñas empresas error");
  }
});

/**
 * POST /api/v1/arca/escalas/pequenas-empresas
 *
 * Los cuatro valores de un grupo para un período. La respuesta trae `avisoJornada` cuando la jornada adicional
 * no es la semana ÷ 5: se guarda igual —el importe que se paga es el del acta— pero se dice.
 */
router.post("/pequenas-empresas", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const convenio = String(body.convenio || "").trim();
    const grupo = numeroOpcional(body.grupo);
    const desde = aIsoFecha(String(body.desde || ""));
    if (!convenio) return res.status(400).json({ error: "El convenio es obligatorio." });
    if (grupo == null) return res.status(400).json({ error: "El grupo es obligatorio." });
    if (!desde) return res.status(400).json({ error: "La vigencia desde es obligatoria." });
    const hasta = body.hasta ? aIsoFecha(String(body.hasta)) : null;

    const semana = Number(body.semana9hsLunVie || 0);
    const jornada = Number(body.jornadaAdicional9hs || 0);
    const creado = await EscalaPequenasEmpresas.create({
      convenio,
      grupo,
      desde: new Date(`${desde}T00:00:00.000Z`),
      hasta: hasta ? new Date(`${hasta}T00:00:00.000Z`) : null,
      semana9hsLunVie: redondearCentavos(semana),
      jornadaAdicional9hs: redondearCentavos(jornada),
      horaExtra50: redondearCentavos(Number(body.horaExtra50 || 0)),
      horaExtra100: redondearCentavos(Number(body.horaExtra100 || 0)),
      acuerdoId: body.acuerdoId || null,
      tramo: body.tramo || "",
      origen: body.origen || "manual",
      nota: body.nota || "",
      createdBy: req.user?.userId || null,
    });

    const desvio = desvioJornadaAdicional(semana, jornada);
    res.status(201).json({ fila: creado, avisoJornada: desvio == null ? null : `La jornada adicional difiere en ${desvio} de la semana ÷ 5.` });
  } catch (error) {
    responderError(res, error, "Create pequeñas empresas error");
  }
});

/** PUT /api/v1/arca/escalas/pequenas-empresas/:id */
router.put("/pequenas-empresas/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const set: Record<string, any> = {};
    for (const k of ["semana9hsLunVie", "jornadaAdicional9hs", "horaExtra50", "horaExtra100"]) if (body[k] !== undefined) set[k] = redondearCentavos(Number(body[k] || 0));
    if (body.desde !== undefined) {
      const desde = aIsoFecha(String(body.desde));
      if (!desde) return res.status(400).json({ error: "La vigencia desde no se entiende." });
      set.desde = new Date(`${desde}T00:00:00.000Z`);
    }
    if (body.hasta !== undefined) {
      const hasta = body.hasta ? aIsoFecha(String(body.hasta)) : "";
      set.hasta = hasta ? new Date(`${hasta}T00:00:00.000Z`) : null;
    }
    if (body.nota !== undefined) set.nota = String(body.nota ?? "");

    const actualizado = await EscalaPequenasEmpresas.findByIdAndUpdate(req.params.id, { $set: set }, { new: true, runValidators: true });
    if (!actualizado) return res.status(404).json({ error: "La fila no existe." });
    const desvio = desvioJornadaAdicional(actualizado.semana9hsLunVie, actualizado.jornadaAdicional9hs);
    res.json({ fila: actualizado, avisoJornada: desvio == null ? null : `La jornada adicional difiere en ${desvio} de la semana ÷ 5.` });
  } catch (error) {
    responderError(res, error, "Update pequeñas empresas error");
  }
});

/** DELETE /api/v1/arca/escalas/pequenas-empresas/:id */
router.delete("/pequenas-empresas/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const borrado = await EscalaPequenasEmpresas.findByIdAndDelete(req.params.id);
    if (!borrado) return res.status(404).json({ error: "La fila no existe." });
    res.json({ ok: true });
  } catch (error) {
    responderError(res, error, "Delete pequeñas empresas error");
  }
});

/* ────────────────────────────── ACUERDOS PARITARIOS ────────────────────────────── */

/** GET /api/v1/arca/escalas/acuerdos?convenio= */
router.get("/acuerdos", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const convenio = convenioDelQuery(req);
    const filtro = convenio ? { convenios: convenio } : {};
    const acuerdos = await AcuerdoParitario.find(filtro).sort({ firmadoEl: -1, createdAt: -1 }).lean();
    /** El acumulado se calcula y no se guarda: guardado, se desactualiza cuando se agrega un tramo. */
    res.json(
      (acuerdos as any[]).map((a) => ({
        ...a,
        porcentajeAcumuladoGeneral: porcentajeAcumulado((a.tramos || []).filter((t: any) => t.regimen !== "alternativo" && t.acumulativo !== false).map((t: any) => Number(t.porcentaje || 0))),
      }))
    );
  } catch (error) {
    responderError(res, error, "Get acuerdos error");
  }
});

/** POST /api/v1/arca/escalas/acuerdos */
router.post("/acuerdos", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const titulo = String(body.titulo || "").trim();
    if (!titulo) return res.status(400).json({ error: "El título es obligatorio." });
    const creado = await AcuerdoParitario.create({ ...body, titulo, createdBy: req.user?.userId || null });
    res.status(201).json(creado);
  } catch (error) {
    responderError(res, error, "Create acuerdo error");
  }
});

/** PUT /api/v1/arca/escalas/acuerdos/:id */
router.put("/acuerdos/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = { ...(req.body || {}) };
    // El archivo se sube por su propio endpoint: dejarlo entrar por acá permitiría apuntar el registro a
    // cualquier ruta del disco.
    delete body.archivo;
    delete body.createdBy;
    const actualizado = await AcuerdoParitario.findByIdAndUpdate(req.params.id, { $set: body }, { new: true, runValidators: true });
    if (!actualizado) return res.status(404).json({ error: "El acuerdo no existe." });
    res.json(actualizado);
  } catch (error) {
    responderError(res, error, "Update acuerdo error");
  }
});

/** DELETE /api/v1/arca/escalas/acuerdos/:id — deja los períodos, sólo les quita el vínculo. */
router.delete("/acuerdos/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const borrado = await AcuerdoParitario.findByIdAndDelete(req.params.id);
    if (!borrado) return res.status(404).json({ error: "El acuerdo no existe." });
    await Promise.all([
      EscalaPeriodo.updateMany({ acuerdoId: borrado._id }, { $set: { acuerdoId: null } }),
      AdicionalValorPeriodo.updateMany({ acuerdoId: borrado._id }, { $set: { acuerdoId: null } }),
      EscalaPequenasEmpresas.updateMany({ acuerdoId: borrado._id }, { $set: { acuerdoId: null } }),
    ]);
    if (borrado.archivo?.ruta) await borrarArchivo(borrado.archivo.ruta);
    res.json({ ok: true, aviso: "Se borró el acuerdo. Los importes que había cargado quedaron, sin el vínculo al acta." });
  } catch (error) {
    responderError(res, error, "Delete acuerdo error");
  }
});

/**
 * POST /api/v1/arca/escalas/acuerdos/:id/archivo
 *
 * Adjunta el PDF del acta. Se guarda con el mismo servicio que los PDF de paritarias —nombre por hash, bajo
 * `storage/`— para no tener dos convenciones de archivos que después se mantienen distinto.
 */
router.post("/acuerdos/:id/archivo", authenticateToken, upload.single("archivo"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const acuerdo = await AcuerdoParitario.findById(req.params.id);
    if (!acuerdo) return res.status(404).json({ error: "El acuerdo no existe." });
    if (!req.file) return res.status(400).json({ error: "No llegó ningún archivo." });
    const esPdf = req.file.mimetype?.includes("pdf") || /\.pdf$/i.test(req.file.originalname || "");
    if (!esPdf) return res.status(400).json({ error: "El acta tiene que ser un PDF." });

    const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const guardado = await guardarPdf(String(acuerdo._id), hash, req.file.buffer, req.file.originalname || "acta.pdf", req.file.mimetype);
    const anterior = acuerdo.archivo?.ruta;

    acuerdo.archivo = { ...guardado, nombreOriginal: req.file.originalname || guardado.nombreOriginal, subidoEl: new Date() };
    await acuerdo.save();
    // El anterior se borra después de guardar el nuevo: si falla el save, el registro sigue apuntando a un
    // archivo que existe.
    if (anterior && anterior !== guardado.ruta) await borrarArchivo(anterior);

    res.json(acuerdo.archivo);
  } catch (error) {
    responderError(res, error, "Subir archivo de acuerdo error");
  }
});

/** GET /api/v1/arca/escalas/acuerdos/:id/archivo — descarga con token, como los PDF de paritarias. */
router.get("/acuerdos/:id/archivo", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const acuerdo = await AcuerdoParitario.findById(req.params.id).select("archivo titulo").lean();
    const ruta = (acuerdo as any)?.archivo?.ruta;
    if (!ruta) return res.status(404).json({ error: "El acuerdo no tiene el acta adjunta." });
    const absoluta = rutaAbsoluta(ruta);
    try {
      await fs.access(absoluta);
    } catch {
      return res.status(404).json({ error: "El archivo ya no está en el disco." });
    }
    res.setHeader("Content-Type", (acuerdo as any).archivo.contentType || "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${((acuerdo as any).archivo.nombreOriginal || "acta.pdf").replace(/"/g, "")}"`);
    res.sendFile(absoluta);
  } catch (error) {
    responderError(res, error, "Descargar archivo de acuerdo error");
  }
});

/* ────────────────────────────── APLICAR PARITARIA ────────────────────────────── */

/**
 * POST /api/v1/arca/escalas/aplicar-paritaria/preview
 *
 * Devuelve la escala y los adicionales que resultarían de aplicar un porcentaje, SIN ESCRIBIR NADA.
 *
 * El preview no es un lujo: el porcentaje no reproduce el acta al centavo (seis de los siete adicionales de
 * 634/11 dan un centavo de diferencia), así que la única forma honesta de usar el automatismo es proponer y
 * dejar corregir. Ver `utils/aplicarParitaria.ts`.
 */
router.post("/aplicar-paritaria/preview", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const convenio = String(body.convenio || "").trim();
    const porcentaje = Number(body.porcentaje);
    if (!convenio) return res.status(400).json({ error: "Falta el convenio." });
    if (!Number.isFinite(porcentaje)) return res.status(400).json({ error: "Falta el porcentaje." });
    /** La escala que se toma como base: la que rige a `baseFecha` (por defecto, hoy). */
    const baseFecha = aIsoFecha(String(body.baseFecha || "")) || hoyIso();
    const desde = aIsoFecha(String(body.desde || "")) || hoyIso();

    const [periodos, grupos, adicionales, pequenas] = await Promise.all([
      escalaDelConvenioAFecha(convenio, baseFecha),
      ConvenioGrupo.find({ convenio }).select("numero sueldoBasico sueldoAdicional presentismo sueldoBruto neto").sort({ numero: 1 }).lean(),
      adicionalesAFecha(convenio, baseFecha),
      pequenasEmpresasAFecha(convenio, baseFecha),
    ]);

    /**
     * Si todavía no hay períodos cargados, la base es lo que hay en `ConvenioGrupo`.
     *
     * Es el caso del día 1: sin esto, el primer uso de "aplicar paritaria" no tendría de dónde partir y habría
     * que cargar la historia a mano antes de poder usar la función.
     */
    const filasBase = periodos.length
      ? periodos.map((p: any) => ({ grupo: p.grupo, basico: p.basico, adicionalPct: p.adicionalPct, presentismoPct: p.presentismoPct, netoFactor: p.netoFactor, adicionalMonto: p.adicionalMonto, presentismoMonto: p.presentismoMonto, total: p.total, neto: p.neto }))
      : (grupos as any[]).map((g) => ({
          grupo: g.numero,
          basico: g.sueldoBasico,
          adicionalPct: deducirAdicionalPct(Number(g.sueldoBasico || 0), Number(g.sueldoAdicional || 0)),
          presentismoPct: null,
          netoFactor: null,
          adicionalMonto: g.sueldoAdicional,
          presentismoMonto: g.presentismo,
          total: g.sueldoBruto,
          neto: g.neto,
        }));

    const escala = proponerEscala(filasBase, porcentaje, body.esperado?.escala || []);
    const adicionalesPropuestos = body.incluirAdicionales === false ? [] : proponerMontos(adicionales.map((a) => ({ clave: a.codigo, nombre: a.nombre, monto: a.monto })), porcentaje, body.esperado?.adicionales || []);
    const pequenasPropuestas =
      body.incluirPequenasEmpresas === false
        ? []
        : (pequenas as any[]).map((f) => ({
            grupo: f.grupo,
            semana9hsLunVie: redondearCentavos(f.semana9hsLunVie * (1 + porcentaje / 100)),
            jornadaAdicional9hs: redondearCentavos(f.jornadaAdicional9hs * (1 + porcentaje / 100)),
            horaExtra50: redondearCentavos(f.horaExtra50 * (1 + porcentaje / 100)),
            horaExtra100: redondearCentavos(f.horaExtra100 * (1 + porcentaje / 100)),
          }));

    res.json({
      convenio,
      porcentaje,
      baseFecha,
      desde,
      baseTomadaDe: periodos.length ? "periodos" : "convenio-grupos",
      escala,
      adicionales: adicionalesPropuestos,
      pequenasEmpresas: pequenasPropuestas,
      aviso: "Es una propuesta: el porcentaje no reproduce el acta al centavo. Revisá los importes antes de confirmar.",
    });
  } catch (error) {
    responderError(res, error, "Preview aplicar paritaria error");
  }
});

/**
 * POST /api/v1/arca/escalas/aplicar-paritaria
 *
 * Confirma. Recibe LAS FILAS FINALES —las que la persona vio y pudo corregir—, no un porcentaje: si recibiera
 * el porcentaje y volviera a calcular, las correcciones del preview se perderían en silencio.
 *
 * Por cada grupo: cierra el período abierto, crea el nuevo y espeja si rige hoy. Es idempotente por
 * `(convenio, grupo, desde)`: repetir la llamada actualiza el mismo período en lugar de duplicarlo.
 */
router.post("/aplicar-paritaria", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const convenio = String(body.convenio || "").trim();
    const desde = aIsoFecha(String(body.desde || ""));
    if (!convenio) return res.status(400).json({ error: "Falta el convenio." });
    if (!desde) return res.status(400).json({ error: "Falta la fecha desde la que rige el tramo." });
    const filas: any[] = Array.isArray(body.escala) ? body.escala : [];
    if (!filas.length) return res.status(400).json({ error: "No llegó ninguna fila de escala." });

    const hoy = hoyIso();
    const grupos = await ConvenioGrupo.find({ convenio }).select("numero").lean();
    const idPorNumero = new Map((grupos as any[]).map((g) => [Number(g.numero), String(g._id)]));

    const resultado: Array<{ grupo: number | null; creado: boolean; actualizado: boolean; espejado: boolean; motivo?: string }> = [];
    for (const fila of filas) {
      const grupo = numeroOpcional(fila.grupo);
      await cerrarPeriodosAbiertos(convenio, grupo, desde);

      const datos = armarPeriodo({
        convenio,
        grupo,
        grupoId: grupo == null ? null : idPorNumero.get(grupo) || null,
        desde,
        hasta: fila.hasta ? aIsoFecha(String(fila.hasta)) : null,
        basico: Number(fila.basico || 0),
        adicionalPct: numeroOpcional(fila.adicionalPct),
        presentismoPct: numeroOpcional(fila.presentismoPct),
        netoFactor: numeroOpcional(fila.netoFactor),
        acta: fila.acta || {},
        acuerdoId: body.acuerdoId || null,
        tramo: body.tramo || "",
        origen: body.origen || "manual",
        nota: fila.nota || body.nota || "",
        createdBy: req.user?.userId || null,
      });

      const existente = await EscalaPeriodo.findOne({ convenio, grupo: grupo ?? null, desde: datos.desde }).select("_id");
      if (existente) await EscalaPeriodo.updateOne({ _id: existente._id }, { $set: datos });
      else await EscalaPeriodo.create(datos);

      const espejo = esElVigente({ desde, hasta: datos.hasta }, hoy) ? await espejarVigenteEnGrupo(convenio, grupo, hoy) : { espejado: false, motivo: "El tramo no rige hoy: el grupo queda con su escala actual." };
      resultado.push({ grupo, creado: !existente, actualizado: Boolean(existente), espejado: espejo.espejado, motivo: espejo.motivo });
    }

    /* Los adicionales y pequeñas empresas del mismo tramo, si vinieron. */
    const adicionalesAplicados: Array<{ codigo: string; ok: boolean; motivo?: string }> = [];
    for (const a of Array.isArray(body.adicionales) ? body.adicionales : []) {
      const codigo = String(a.codigo || a.clave || "").trim();
      const adicional = await AdicionalConvenio.findOne({ convenio, codigo }).select("_id");
      if (!adicional) {
        adicionalesAplicados.push({ codigo, ok: false, motivo: "No existe ese adicional en el convenio." });
        continue;
      }
      const corte = new Date(`${desde}T00:00:00.000Z`);
      await AdicionalValorPeriodo.updateMany({ adicionalId: adicional._id, grupo: numeroOpcional(a.grupo) ?? null, hasta: null, desde: { $lt: corte } }, { $set: { hasta: new Date(corte.getTime() - 86400000) } });
      await AdicionalValorPeriodo.updateOne(
        { adicionalId: adicional._id, grupo: numeroOpcional(a.grupo) ?? null, desde: corte },
        { $set: { convenio, monto: numeroOpcional(a.monto), porcentaje: numeroOpcional(a.porcentaje), acuerdoId: body.acuerdoId || null, tramo: body.tramo || "", origen: body.origen || "manual", createdBy: req.user?.userId || null } },
        { upsert: true }
      );
      adicionalesAplicados.push({ codigo, ok: true });
    }

    for (const p of Array.isArray(body.pequenasEmpresas) ? body.pequenasEmpresas : []) {
      const grupo = numeroOpcional(p.grupo);
      if (grupo == null) continue;
      const corte = new Date(`${desde}T00:00:00.000Z`);
      await EscalaPequenasEmpresas.updateMany({ convenio, grupo, hasta: null, desde: { $lt: corte } }, { $set: { hasta: new Date(corte.getTime() - 86400000) } });
      await EscalaPequenasEmpresas.updateOne(
        { convenio, grupo, desde: corte },
        {
          $set: {
            semana9hsLunVie: redondearCentavos(Number(p.semana9hsLunVie || 0)),
            jornadaAdicional9hs: redondearCentavos(Number(p.jornadaAdicional9hs || 0)),
            horaExtra50: redondearCentavos(Number(p.horaExtra50 || 0)),
            horaExtra100: redondearCentavos(Number(p.horaExtra100 || 0)),
            acuerdoId: body.acuerdoId || null,
            tramo: body.tramo || "",
            origen: body.origen || "manual",
            createdBy: req.user?.userId || null,
          },
        },
        { upsert: true }
      );
    }

    res.json({ convenio, desde, grupos: resultado, adicionales: adicionalesAplicados });
  } catch (error) {
    responderError(res, error, "Aplicar paritaria error");
  }
});

/* ────────────────────────────── LIQUIDACIÓN DE REFERENCIA ────────────────────────────── */

/**
 * POST /api/v1/arca/escalas/liquidacion-referencia
 *
 * Qué cobraría una categoría (o un grupo) a una fecha, con el desglose y las advertencias.
 *
 * Acepta `categoriaId` o `(convenio, grupo)`. Con la categoría es más útil desde el resto del sistema: quien
 * arma un contrato tiene la categoría en la mano, no el grupo.
 */
router.post("/liquidacion-referencia", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const body = req.body || {};
    const fecha = aIsoFecha(String(body.fecha || "")) || hoyIso();

    let convenio = String(body.convenio || "").trim();
    let grupo = numeroOpcional(body.grupo);
    let categoriaNombre = "";

    if (body.categoriaId) {
      const cat = await Categoria.findById(body.categoriaId).select("convenio grupoId nombre").lean();
      if (!cat) return res.status(404).json({ error: "La categoría no existe." });
      convenio = String((cat as any).convenio || "");
      categoriaNombre = String((cat as any).nombre || "");
      if ((cat as any).grupoId) {
        const g = await ConvenioGrupo.findById((cat as any).grupoId).select("numero").lean();
        grupo = g ? Number((g as any).numero) : null;
      }
    }
    if (!convenio) return res.status(400).json({ error: "Falta el convenio (o una categoría de la que sacarlo)." });

    const [periodos, adicionales, gruposDoc] = await Promise.all([
      EscalaPeriodo.find({ convenio, grupo: grupo ?? null }).lean(),
      adicionalesAFecha(convenio, fecha, "general"),
      ConvenioGrupo.find({ convenio, numero: grupo ?? -1 }).select("sueldoBasico sueldoAdicional presentismo sueldoBruto").lean(),
    ]);

    const periodo: any = periodoVigente(periodos as any[], fecha);
    const grupoActual: any = (gruposDoc as any[])[0];

    /**
     * Sin período cargado se usa la escala vigente del grupo, y se avisa.
     *
     * Es lo que hace que esto sirva desde el día 1, antes de cargar la historia: el número que devuelve es el
     * mismo que ya usan los contratos, sólo que sin poder garantizar que corresponda a la fecha pedida.
     */
    const advertenciasPrevias: string[] = [];
    let escala;
    if (periodo) {
      escala = { basico: periodo.basico, adicionalMonto: periodo.adicionalMonto, presentismoMonto: periodo.presentismoMonto, total: periodo.total, netoFactor: periodo.netoFactor };
    } else if (grupoActual) {
      advertenciasPrevias.push(`No hay una escala cargada con vigencia al ${fecha}: se usó la escala vigente del grupo, que puede corresponder a otro período.`);
      escala = { basico: grupoActual.sueldoBasico, adicionalMonto: grupoActual.sueldoAdicional, presentismoMonto: grupoActual.presentismo, total: grupoActual.sueldoBruto, netoFactor: null };
    } else {
      return res.status(404).json({ error: `No hay escala para el convenio ${convenio}${grupo == null ? "" : `, grupo ${grupo}`}.` });
    }

    const liquidacion = liquidacionDeReferencia(escala, adicionales as AdicionalVigente[], { aniosAntiguedad: Number(body.aniosAntiguedad || 0), cantidades: body.cantidades || {} });
    res.json({
      convenio,
      grupo,
      categoria: categoriaNombre,
      fecha,
      escalaDe: periodo ? { desde: aIsoFecha(periodo.desde), hasta: aIsoFecha(periodo.hasta), origen: periodo.origen } : { desde: "", hasta: "", origen: "convenio-grupos" },
      ...liquidacion,
      advertencias: [...advertenciasPrevias, ...liquidacion.advertencias],
    });
  } catch (error) {
    responderError(res, error, "Liquidación de referencia error");
  }
});

export { router as escalasConvenioRoutes };
