import crypto from "crypto";
import { Types } from "mongoose";
import { Request } from "../../models/Request.js";
import { RequestConfig } from "../../models/RequestConfig.js";
import { MemosoftConcepto } from "../../models/MemosoftConcepto.js";
import { ActivityLogGeneralConfig } from "../../models/ActivityLogGeneralConfig.js";
import { LiquidacionCorrida, ILineaCorrida, IExcepcionCorrida } from "../../models/LiquidacionCorrida.js";
import { Project } from "../../models/Project.js";
import { Area } from "../../models/Area.js";
import { Shift } from "../../models/Shift.js";
import { limitesDelPeriodo } from "../../utils/liquidacion/contratos.js";
import { armarPadron, FiltrosPadron } from "./padron.js";
import { normalizarParte, Evento, DatosDePersona } from "./normalizar.js";
import { codificarEvento, Linea, Exclusion, ReglasGlobales, MotivoDeExclusion } from "./codificar.js";
import { agregarLineas, hojaDe } from "./agregar.js";
import { claveDeMotivo } from "../../utils/liquidacion/nombresDeMotivo.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CORRIDA: las tres etapas puras, encadenadas contra la base
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Acá está TODO lo que habla con Mongo, para que normalizar, codificar y agregar se puedan probar
 * sin levantar nada. Este archivo trae los datos, los pasa por las tres etapas en orden y guarda el
 * resultado.
 *
 * NO GENERA NINGÚN ARCHIVO: eso es la fase 3. Esto deja calculado qué va a decir.
 */

/** Cuáles excepciones impiden descargar el import y cuáles sólo avisan. */
const BLOQUEANTES: Record<MotivoDeExclusion | string, boolean> = {
  sin_legajo: true,
  legajo_duplicado: true,
  sin_empresa: true,
  sin_centro_de_costo: true,
  sin_regimen: true,
  empresa_ambigua: true,
  // Estas avisan: no ensucian el archivo, pero alguien tiene que resolverlas aparte.
  sin_efecto_configurado: false,
  efecto_manual: false,
  horas_extra_sin_discriminar: false,
  presente_sin_regla_base: false,
  empresa_sin_dato: true,
  regimen_sin_dato: true,
  regimen_contradictorio: true,
  centro_de_costo_ambiguo: true,
};

export interface OpcionesDeCorrida extends FiltrosPadron {
  /** Contra qué fecha se evalúa la vigencia del mapeo. Por defecto, el último día del período. */
  versionMapeo?: string;
  /** Si `false`, calcula y devuelve sin guardar. Sirve para previsualizar. */
  persistir?: boolean;
  /**
   * Devolver además el detalle evento por evento, para armar la planilla de control.
   *
   * No se guarda en la corrida: son 2.000 filas por mes y sólo hacen falta cuando alguien baja el
   * archivo. Guardarlas engordaría cada documento para algo que se usa una vez.
   */
  detalle?: boolean;
}

export async function correrLiquidacion(tenantId: Types.ObjectId, periodo: string, createdBy: Types.ObjectId, opciones: OpcionesDeCorrida = {}) {
  const { desde, hasta } = limitesDelPeriodo(periodo);
  const versionMapeo = opciones.versionMapeo || hasta;

  /* ── 1. Todo lo que hace falta, en cinco consultas ── */
  const [padron, motivos, conceptos, config, proyectos] = await Promise.all([
    armarPadron(tenantId, periodo, opciones),
    RequestConfig.find({ tenantId }).select("name memosoftEffects memosoftNoLiquida").lean(),
    MemosoftConcepto.find({ tenantId }).select("codigo descripcion empresaId").lean(),
    ActivityLogGeneralConfig.getOrCreateDefault(tenantId),
    Project.find({ tenantId }).select("name").lean(),
  ]);

  const nombreProyecto = new Map(proyectos.map((p: any) => [String(p._id), p.name]));

  /* Áreas y turnos: sólo para la planilla de control, que los muestra por nombre. */
  const [areas, turnos] = opciones.detalle
    ? await Promise.all([Area.find({ tenantId }).select("name").lean(), Shift.find({ tenantId }).select("name").lean()])
    : [[], []];
  const nombreArea = new Map((areas as any[]).map((a: any) => [String(a._id), a.name]));
  const nombreTurno = new Map((turnos as any[]).map((t: any) => [String(t._id), t.name]));

  /*
    EL PADRÓN SE INDEXA POR (persona, proyecto) Y TAMBIÉN POR PERSONA SOLA.

    Lo segundo es para los reemplazantes: el que cubre muchas veces no pertenece al proyecto del
    parte, así que buscarlo sólo por (persona, proyecto) lo dejaría sin legajo y sin empresa, y su
    jornal se perdería. Con el índice por persona se lo encuentra por su propio contrato.
  */
  const porPersonaYProyecto = new Map<string, DatosDePersona>();
  const porPersona = new Map<string, DatosDePersona>();
  for (const f of padron.filas) {
    const datos: DatosDePersona = {
      apellidoYNombre: f.apellidoYNombre,
      legajo: f.legajo,
      empresaId: f.empresaId,
      ccCodigo: f.ccCodigo,
      regimen: f.regimen,
    };
    const clave = `${f.userId}|${f.projectId}`;
    if (!porPersonaYProyecto.has(clave)) porPersonaYProyecto.set(clave, datos);
    if (!porPersona.has(f.userId)) porPersona.set(f.userId, datos);
  }

  const datosDe = (userId: string, projectId: string | null) =>
    (projectId ? porPersonaYProyecto.get(`${userId}|${projectId}`) : undefined) || porPersona.get(userId);

  /* ── 2. Los partes del período ── */
  const filtroPartes: any = { tenantId, date: { $gte: desde, $lte: hasta }, "attendance.0": { $exists: true } };
  if (opciones.projectId) filtroPartes.projectId = new Types.ObjectId(opciones.projectId);

  const partes: any[] = await Request.find(filtroPartes)
    .select("date projectId areaId shiftId reportNumber attendance")
    .sort({ date: 1 })
    .lean();

  /* ── 3. Normalizar ── */
  const numeroDeParte = new Map<string, string>();
  const eventos: Evento[] = [];
  for (const parte of partes) {
    if (parte.reportNumber) numeroDeParte.set(String(parte._id), parte.reportNumber);
    eventos.push(
      ...normalizarParte(
        {
          _id: String(parte._id),
          date: parte.date,
          projectId: parte.projectId ? String(parte.projectId) : null,
          proyectoNombre: parte.projectId ? nombreProyecto.get(String(parte.projectId)) || null : null,
          areaId: parte.areaId ? String(parte.areaId) : null,
          shiftId: parte.shiftId ? String(parte.shiftId) : null,
          attendance: (parte.attendance || []).map((r: any) => ({ ...r, _id: String(r._id) })),
        },
        datosDe,
      ),
    );
  }

  /* ── 4. Codificar ── */
  const efectosPorMotivo = new Map<string, any[]>(motivos.map((m: any) => [String(m._id), m.memosoftEffects || []]));
  const noLiquidaPorMotivo = new Map<string, boolean>(motivos.map((m: any) => [String(m._id), !!m.memosoftNoLiquida]));
  const noLiquidaPorNombre = new Map<string, boolean>(motivos.map((m: any) => [claveDeMotivo(m.name), !!m.memosoftNoLiquida]));
  /*
    Los partes viejos no tienen `typeId` —el tipo viajaba como texto—, así que también se indexa por
    nombre. Son 7.938 renglones: sin esto, todo lo cargado antes del backfill queda sin mapeo.

    La clave se normaliza (ver `utils/liquidacion/nombresDeMotivo.ts`) porque los nombres del ABM y
    los textos guardados YA divergieron: los partes dicen "Compensatorios" y el motivo hoy se llama
    "Compensatorio".
  */
  const efectosPorNombre = new Map<string, any[]>(motivos.map((m: any) => [claveDeMotivo(m.name), m.memosoftEffects || []]));

  const globales: ReglasGlobales = {
    horasExtra: (config as any).memosoftHorasExtra || null,
    jornalBase: (config as any).memosoftJornalBase || null,
  };

  const lineas: Linea[] = [];
  const exclusiones: Exclusion[] = [];
  /* Qué conceptos salió de cada evento. Es lo que la planilla muestra en su última columna. */
  const conceptosPorEvento = new Map<string, string[]>();
  for (const evento of eventos) {
    const efectos =
      (evento.motivoId ? efectosPorMotivo.get(evento.motivoId) : undefined) ||
      (evento.motivoNombre ? efectosPorNombre.get(claveDeMotivo(evento.motivoNombre)) : undefined) ||
      [];
    const noLiquida =
      (evento.motivoId ? noLiquidaPorMotivo.get(evento.motivoId) : undefined) ??
      (evento.motivoNombre ? noLiquidaPorNombre.get(claveDeMotivo(evento.motivoNombre)) : undefined) ??
      false;
    const r = codificarEvento(evento, efectos as any, globales, noLiquida);
    lineas.push(...r.lineas);
    exclusiones.push(...r.exclusiones);
    if (opciones.detalle && r.lineas.length) {
      conceptosPorEvento.set(
        evento.id,
        r.lineas.map((l) => `${l.conceptoCodigo} (${l.par1 || l.par2})`),
      );
    }
  }

  /* ── 5. Agregar ── */
  const agregadas = agregarLineas(lineas);

  const nombreEmpresa = new Map<string, string>();
  padron.filas.forEach((f) => { if (f.empresaId && f.empresaNombre) nombreEmpresa.set(f.empresaId, f.empresaNombre); });
  const nombreCC = new Map<string, string>();
  padron.filas.forEach((f) => { if (f.ccCodigo && f.ccNombre) nombreCC.set(f.ccCodigo, f.ccNombre); });
  const descripcionConcepto = new Map<string, string>();
  conceptos.forEach((c: any) => { if (!descripcionConcepto.has(c.codigo)) descripcionConcepto.set(c.codigo, c.descripcion); });

  const lineasCorrida: ILineaCorrida[] = agregadas.map((l) => ({
    empresaId: l.empresaId ? new Types.ObjectId(l.empresaId) : null,
    empresaNombre: l.empresaId ? nombreEmpresa.get(l.empresaId) || null : null,
    ccCodigo: l.ccCodigo,
    ccNombre: l.ccCodigo ? nombreCC.get(l.ccCodigo) || null : null,
    regimen: l.regimen,
    legajo: l.legajo,
    apellidoYNombre: l.apellidoYNombre,
    userId: Types.ObjectId.isValid(l.userId) ? new Types.ObjectId(l.userId) : null,
    conceptoCodigo: l.conceptoCodigo,
    conceptoDescripcion: descripcionConcepto.get(l.conceptoCodigo) || null,
    par1: l.par1,
    par2: l.par2,
    hoja: hojaDe(l, l.empresaId ? nombreEmpresa.get(l.empresaId) || "" : "", l.ccCodigo ? nombreCC.get(l.ccCodigo) : null),
    eventIds: l.eventIds,
    dias: l.dias,
    origenes: l.origenes,
  }));

  /* ── 6. Las excepciones: las del padrón y las del cálculo, juntas ── */
  const excepciones: IExcepcionCorrida[] = [
    ...padron.excepciones.map((e) => ({
      motivo: e.tipo,
      userId: Types.ObjectId.isValid(e.userId) ? new Types.ObjectId(e.userId) : null,
      apellidoYNombre: e.apellidoYNombre,
      fecha: null,
      eventoId: null,
      detalle: e.detalle,
      bloqueante: BLOQUEANTES[e.tipo] ?? false,
    })),
    ...exclusiones.map((e) => ({
      motivo: e.motivo,
      userId: Types.ObjectId.isValid(e.userId) ? new Types.ObjectId(e.userId) : null,
      apellidoYNombre: e.apellidoYNombre,
      fecha: e.fecha,
      eventoId: e.eventoId,
      detalle: e.detalle,
      bloqueante: BLOQUEANTES[e.motivo] ?? false,
    })),
  ];

  // La huella se calcula sobre lo que va a terminar en el archivo, no sobre el documento entero.
  const hashLineas = crypto
    .createHash("sha1")
    .update(JSON.stringify(lineasCorrida.map((l) => [l.hoja, l.legajo, l.conceptoCodigo, l.par1, l.par2])))
    .digest("hex");

  const resumen = {
    partes: partes.length,
    eventos: eventos.length,
    lineas: lineasCorrida.length,
    personas: new Set(lineasCorrida.map((l) => String(l.userId))).size,
    hojas: new Set(lineasCorrida.map((l) => l.hoja)).size,
    excepciones: excepciones.length,
    bloqueantes: excepciones.filter((e) => e.bloqueante).length,
  };

  const corrida = {
    tenantId,
    periodo,
    filtros: opciones as Record<string, unknown>,
    versionMapeo,
    createdBy,
    lineas: lineasCorrida,
    excepciones,
    resumen,
    hashLineas,
  };

  /* El detalle viaja aparte del documento: no se guarda, se usa y se descarta. */
  const detalle = opciones.detalle
    ? eventos.map((e) => ({
        ...e,
        empresaNombre: e.empresaId ? nombreEmpresa.get(e.empresaId) || null : null,
        areaNombre: e.areaId ? nombreArea.get(e.areaId) || null : null,
        turnoNombre: e.turnoId ? nombreTurno.get(e.turnoId) || null : null,
        reportNumber: numeroDeParte.get(e.activityReportId) || null,
        conceptos: conceptosPorEvento.get(e.id) || [],
      }))
    : undefined;

  if (opciones.persistir === false) return { ...corrida, detalle } as any;

  // Reliquidar NO pisa: siempre es un documento nuevo.
  const guardada = (await LiquidacionCorrida.create(corrida)).toObject();
  return { ...guardada, detalle } as any;
}
