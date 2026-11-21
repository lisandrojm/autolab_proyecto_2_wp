/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAMPAÑA DE GOCE DE VACACIONES (15/11/2026): las reglas, puras
 * ═══════════════════════════════════════════════════════════════════════
 *
 * La empresa invita a cada persona con días disponibles a elegir sus fechas dentro de la ventana de goce,
 * con una fecha límite. Si no elige, la EMPRESA le asigna un tramo único continuo. En los dos casos hay
 * aviso por escrito con anticipación y acuse de recibo. Marco: LCT 20.744, arts. 150–157 (a confirmar con
 * el asesor):
 *   · El empleador fija las fechas; dejar elegir primero es una cortesía interna.
 *   · Aviso por escrito con al menos 30 días antes del INICIO (el CCT puede pedir más).
 *   · Fraccionar (tramos de 7 días o más) sólo por acuerdo: si asigna la empresa, UN TRAMO CONTINUO.
 *   · NUNCA se compensa en dinero con la relación vigente (art. 156): esto no existe acá como opción.
 *
 * Fechas en "YYYY-MM-DD" sin Date de por medio (como `planVacaciones/fechas`). Las comparten el server
 * (validar, sugerir) y el front (la app arma la propuesta y la valida antes de mandarla).
 */
import { diasEntre, diasHasta, esISO, fechaCorta, sePisan, sumarDias } from "../planVacaciones/fechas.js";
import { rangoPermitido, temporadaConVentana, textoDeVentana, type TramoDeVentana, type VentanaEfectiva } from "../ventanaGoce.js";

/* ─────────────────────────── Configuración ─────────────────────────── */

export interface ConfigCampania {
  /** La pestaña y la tarjeta de la app sólo se ofrecen con la campaña activa. */
  activa: boolean;
  /** Cuántos días tiene la persona para elegir, desde que se la invita. */
  plazoParaDefinirDias: number;
  /** Aviso por escrito antes del INICIO de las vacaciones (LCT: 30; el CCT puede pedir más). */
  avisoMinimoDias: number;
  /** El tramo más corto que se acepta al fraccionar (LCT: 7 días corridos). */
  minDiasPorTramo: number;
  /**
   * Con qué tipos de contrato (`tipo_contrato_id`) arranca tildada una campaña nueva. Vacío = todos los
   * habilitados. Cada campaña guarda su propia lista: ver «A QUIÉN SE INVITA», más abajo.
   */
  tiposContratoInvitar: number[];
}

export const CONFIG_CAMPANIA_POR_DEFECTO: ConfigCampania = { activa: false, plazoParaDefinirDias: 14, avisoMinimoDias: 30, minDiasPorTramo: 7, tiposContratoInvitar: [] };

/**
 * Qué pasa si la persona no elige, y cómo asigna la empresa. Son constantes y no configuración: NO hay
 * otra opción. En particular, no existe «pagar en lugar de gozar» (art. 156: sólo al egreso).
 */
export const ACCION_SI_NO_DEFINE = "empresaAsigna" as const;
export const ASIGNACION_POR_DEFECTO = "tramoUnico" as const;

const entero = (v: unknown, base: number, min: number, max: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : base;
};

/** Lee la configuración guardada tolerando lo que falte o venga mal: cada dato inválido cae al de por defecto. */
export function normalizarConfigCampania(v: any): ConfigCampania {
  const d = CONFIG_CAMPANIA_POR_DEFECTO;
  return {
    activa: v?.activa === true,
    plazoParaDefinirDias: entero(v?.plazoParaDefinirDias, d.plazoParaDefinirDias, 1, 120),
    avisoMinimoDias: entero(v?.avisoMinimoDias, d.avisoMinimoDias, 0, 180),
    minDiasPorTramo: entero(v?.minDiasPorTramo, d.minDiasPorTramo, 1, 60),
    tiposContratoInvitar: normalizarTiposContrato(v?.tiposContratoInvitar),
  };
}

/* ─────────────────────────── A quién se invita ─────────────────────────── */

/**
 * A QUIÉN SE INVITA, POR TIPO DE CONTRATO (16/11/2026). La campaña puede limitarse a ciertos tipos de
 * contrato. Lo que se mira de cada persona es UN contrato: el vigente en su EMPRESA DE CÓMPUTO (la
 * empleadora de la que sale su antigüedad); si ahí tiene varios vigentes, el de alta más reciente. Lo
 * elige el server (`utils/contratoDeComputo.ts`); acá está la decisión, que comparten el lanzamiento y
 * la vista previa para que digan el mismo número:
 *  · Un tipo deshabilitado en «Visibilidad por tipo de Contrato» (`contractRules.vacationsEnabled = false`)
 *    NUNCA se invita, esté o no tildado en la campaña.
 *  · Sin selección (lista vacía) no se filtra por tipo: la población de siempre, menos los deshabilitados.
 *  · Con selección, sólo quien tiene su contrato vigente de cómputo en uno de esos tipos. Quien no tiene
 *    contrato vigente en su empresa de cómputo (o lo tiene sin tipo) queda afuera: no hay qué comparar.
 */
export type MotivoNoInvitar = "tipo_deshabilitado" | "tipo_no_incluido" | "sin_contrato_vigente";

/** La lista de tipos tal como se guarda: números, sin repetir, ordenados. Lo que no es una lista queda vacío. */
export function normalizarTiposContrato(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const ids = v.filter((x) => x !== null && x !== "" && typeof x !== "boolean").map(Number).filter((n) => Number.isFinite(n));
  return [...new Set(ids)].sort((a, b) => a - b);
}

/** Por qué NO se invita a alguien, o `null` si se la invita. `tipoContratoId` null = sin contrato vigente de cómputo. */
export function motivoDeNoInvitar(o: { tipoContratoId: number | null; seleccion: number[]; deshabilitados: number[] }): MotivoNoInvitar | null {
  if (o.tipoContratoId !== null && o.deshabilitados.includes(o.tipoContratoId)) return "tipo_deshabilitado";
  if (o.seleccion.length === 0) return null;
  if (o.tipoContratoId === null) return "sin_contrato_vigente";
  return o.seleccion.includes(o.tipoContratoId) ? null : "tipo_no_incluido";
}

/** Cuánta gente con días hay en cada tipo de contrato (por su contrato vigente de cómputo), y cuánta sin contrato. */
export interface PoblacionPorTipo {
  porTipo: { id: number; nombre: string; personas: number }[];
  sinContrato: number;
}

export interface ResumenDeInvitables {
  invitar: number;
  tipoDeshabilitado: number;
  tipoNoIncluido: number;
  sinContrato: number;
}

/**
 * LA VISTA PREVIA: cuántas personas se invitarían con esa selección, y cuántas quedan afuera por cada
 * motivo. Es `motivoDeNoInvitar` aplicado grupo por grupo, así que coincide con lo que hace el lanzamiento.
 */
export function resumenDeInvitables(p: PoblacionPorTipo, seleccion: number[], deshabilitados: number[]): ResumenDeInvitables {
  const r: ResumenDeInvitables = { invitar: 0, tipoDeshabilitado: 0, tipoNoIncluido: 0, sinContrato: 0 };
  const sumar = (tipoContratoId: number | null, personas: number) => {
    const motivo = motivoDeNoInvitar({ tipoContratoId, seleccion, deshabilitados });
    if (!motivo) r.invitar += personas;
    else if (motivo === "tipo_deshabilitado") r.tipoDeshabilitado += personas;
    else if (motivo === "tipo_no_incluido") r.tipoNoIncluido += personas;
    else r.sinContrato += personas;
  };
  for (const t of p.porTipo) sumar(t.id, t.personas);
  sumar(null, p.sinContrato);
  return r;
}

/* ─────────────────────────── Fechas ─────────────────────────── */

export interface Tramo {
  desde: string;
  hasta: string;
}

/** La ventana de una campaña, con año: «del 1/11/2026 al 30/4/2027». */
export type VentanaDeCampania = Tramo;

const diaDeSemana = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay();

/**
 * Cuántos días cuenta un tramo: corridos, o de lunes a viernes cuando la configuración no usa días
 * corridos. Es la misma cuenta que `contarDias` del server (sin descontar feriados), para que la suma
 * de la propuesta dé lo mismo que van a descontar las vacaciones que se crean.
 */
export function contarDiasTramo(t: Tramo, diasCorridos: boolean): number {
  const total = diasEntre(t.desde, t.hasta);
  if (diasCorridos || total <= 0) return total;
  let n = 0;
  for (let i = 0; i < total; i++) {
    const d = diaDeSemana(sumarDias(t.desde, i));
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

/** El último día de un tramo que empieza en `desde` y tiene `dias` días (corridos o hábiles). */
export function hastaParaDias(desde: string, dias: number, diasCorridos: boolean): string {
  if (dias <= 0) return desde;
  if (diasCorridos) return sumarDias(desde, dias - 1);
  let cuenta = 0;
  let d = desde;
  for (let guarda = 0; guarda < 800; guarda++) {
    const dow = diaDeSemana(d);
    if (dow !== 0 && dow !== 6) cuenta++;
    if (cuenta >= dias) return d;
    d = sumarDias(d, 1);
  }
  return d;
}

/**
 * LA VENTANA DE LA TEMPORADA, CON AÑO: la que está en curso o, si ya terminó, la próxima. La ventana
 * anual es «MM-DD» sin año (1/11 → 30/4); una campaña lanzada el 15/9/2026 es para la del 1/11/2026 al
 * 30/4/2027, y una lanzada el 15/1/2027, para la que ya empezó (termina el 30/4/2027).
 */
export function ventanaDeLaTemporada(hoy: string, tramo: TramoDeVentana): VentanaDeCampania {
  const anio = Number(hoy.slice(0, 4));
  for (const a of [anio - 1, anio, anio + 1]) {
    const t = temporadaConVentana(`${a}-01-01`, tramo);
    if (t.hasta >= hoy) return t;
  }
  return temporadaConVentana(`${anio + 1}-01-01`, tramo);
}

/** Hasta cuándo puede elegir: `hoy` + el plazo. */
export const fechaLimite = (hoy: string, plazoDias: number): string => sumarDias(hoy, plazoDias);

/** El primer día en que pueden empezar unas vacaciones avisadas hoy. */
export const primerInicioPosible = (hoy: string, avisoDias: number): string => sumarDias(hoy, avisoDias);

/* ─────────────────────────── Alertas de plazo ─────────────────────────── */

export interface Alerta {
  nivel: "error" | "aviso";
  codigo: string;
  mensaje: string;
}

/**
 * LO QUE CONVIENE SABER ANTES DE LANZAR. La cuenta que importa es la del peor caso: alguien que no elige
 * hasta la fecha límite, la empresa le asigna ese día y recién ahí corre el aviso. Si ese inicio (más los
 * días a otorgar) se pasa del fin de la ventana, la campaña no llega a otorgar en término.
 *
 * `diasMasLargo`: los días del que más tiene para gozar (si se sabe), para medir también el fin del tramo.
 */
export function alertasDeLanzamiento(o: { hoy: string; plazoDias: number; avisoDias: number; ventana: VentanaDeCampania; diasMasLargo?: number }): Alerta[] {
  const alertas: Alerta[] = [];
  const { hoy, plazoDias, avisoDias, ventana } = o;
  if (!esISO(ventana.desde) || !esISO(ventana.hasta) || ventana.hasta < ventana.desde) {
    return [{ nivel: "error", codigo: "ventana_invalida", mensaje: "La ventana de goce no es válida: revisá Configuración › Vacaciones › Ventana anual." }];
  }
  if (ventana.hasta < hoy) {
    return [{ nivel: "error", codigo: "ventana_terminada", mensaje: `La ventana de goce terminó el ${fechaCorta(ventana.hasta)}.` }];
  }
  const limite = fechaLimite(hoy, plazoDias);
  const dias = Math.max(1, o.diasMasLargo || 1);
  const inicioTardio = primerInicioPosible(limite, avisoDias) > ventana.desde ? primerInicioPosible(limite, avisoDias) : ventana.desde;
  const finTardio = sumarDias(inicioTardio, dias - 1);
  // El último día para lanzar y que el peor caso (asignar al vencer + aviso + los días) termine dentro de la ventana.
  const ultimoLanzamiento = sumarDias(ventana.hasta, -(dias - 1) - avisoDias - plazoDias);

  if (inicioTardio > ventana.hasta || finTardio > ventana.hasta) {
    alertas.push({
      nivel: "error",
      codigo: "no_llega",
      mensaje:
        `Quien no elija hasta el ${fechaCorta(limite)} recibiría el aviso ese día y no podría empezar antes del ${fechaCorta(inicioTardio)}` +
        (finTardio > ventana.hasta && inicioTardio <= ventana.hasta ? ` (con ${dias} días terminaría el ${fechaCorta(finTardio)})` : "") +
        `: la ventana cierra el ${fechaCorta(ventana.hasta)}. ` +
        (ultimoLanzamiento >= hoy ? `Lanzala a más tardar el ${fechaCorta(ultimoLanzamiento)} o acortá el plazo para elegir.` : "Acortá el plazo para elegir o el aviso no alcanza: ya es tarde para esta ventana."),
    });
  } else if (diasHasta(hoy, ultimoLanzamiento) <= 7) {
    alertas.push({ nivel: "aviso", codigo: "justo", mensaje: `Queda poco margen: el último día para lanzarla y otorgar en término es el ${fechaCorta(ultimoLanzamiento)}.` });
  }

  const primerInicio = primerInicioPosible(hoy, avisoDias) > ventana.desde ? primerInicioPosible(hoy, avisoDias) : ventana.desde;
  if (primerInicio > ventana.desde) {
    alertas.push({ nivel: "aviso", codigo: "inicio_recortado", mensaje: `Por el aviso de ${avisoDias} días, nadie puede empezar antes del ${fechaCorta(primerInicio)} (la ventana abre el ${fechaCorta(ventana.desde)}).` });
  }
  return alertas;
}

/* ─────────────────────────── Validaciones ─────────────────────────── */

/**
 * LA PROPUESTA DE LA PERSONA: uno o más tramos.
 *  · Cada tramo dentro de la ventana de la campaña (y de la suya, si su área o proyecto tiene otra).
 *  · Ninguno empieza antes de `hoy + aviso`: el aviso por escrito sale al aprobarse, y tiene que llegar.
 *  · Los tramos no se pisan, y si son varios, cada uno de al menos `minPorTramo` días (fraccionar es un
 *    acuerdo: proponerlo la persona y aprobarlo la empresa es ese acuerdo).
 *  · La suma da los días disponibles: sin acumulación pactada (segunda etapa) no quedan días sueltos.
 * Devuelve los errores, en castellano; vacío = está bien.
 */
export function validarPropuesta(o: {
  tramos: Tramo[];
  diasDisponibles: number;
  ventana: VentanaDeCampania;
  ventanaPersona?: VentanaEfectiva | null;
  hoy: string;
  avisoDias: number;
  minPorTramo: number;
  diasCorridos: boolean;
}): string[] {
  const errores: string[] = [];
  const tramos = o.tramos || [];
  if (tramos.length === 0) return ["Elegí al menos un tramo."];
  const desdeMinimo = primerInicioPosible(o.hoy, o.avisoDias);

  tramos.forEach((t, i) => {
    const n = tramos.length > 1 ? ` ${i + 1}` : "";
    if (!esISO(t.desde) || !esISO(t.hasta) || t.hasta < t.desde) {
      errores.push(`El tramo${n} no tiene fechas válidas.`);
      return;
    }
    if (t.desde < o.ventana.desde || t.hasta > o.ventana.hasta) errores.push(`El tramo${n} se sale de la ventana (${fechaCorta(o.ventana.desde)} al ${fechaCorta(o.ventana.hasta)}).`);
    else if (o.ventanaPersona && !rangoPermitido(t.desde, t.hasta, o.ventanaPersona)) errores.push(`El tramo${n} se sale de tu ventana de goce (${textoDeVentana(o.ventanaPersona)}).`);
    if (t.desde < desdeMinimo) errores.push(`El tramo${n} empieza muy pronto: hace falta avisar con ${o.avisoDias} días, así que puede empezar desde el ${fechaCorta(desdeMinimo)}.`);
    if (tramos.length > 1 && contarDiasTramo(t, o.diasCorridos) < o.minPorTramo) errores.push(`El tramo${n} tiene menos de ${o.minPorTramo} días: al fraccionar, cada parte tiene que tener al menos ${o.minPorTramo}.`);
  });

  for (let i = 0; i < tramos.length; i++) for (let j = i + 1; j < tramos.length; j++) if (sePisan(tramos[i], tramos[j])) errores.push(`Los tramos ${i + 1} y ${j + 1} se pisan.`);

  const suma = tramos.reduce((s, t) => s + (esISO(t.desde) && esISO(t.hasta) ? contarDiasTramo(t, o.diasCorridos) : 0), 0);
  if (suma !== o.diasDisponibles) errores.push(suma < o.diasDisponibles ? `Te faltan repartir ${o.diasDisponibles - suma} día(s): tenés ${o.diasDisponibles}.` : `Te pasaste por ${suma - o.diasDisponibles} día(s): tenés ${o.diasDisponibles}.`);
  return errores;
}

/**
 * AL OTORGAR (aprobar la propuesta o confirmar lo que asigna la empresa): el aviso por escrito sale HOY,
 * así que tiene que haber al menos `aviso` días hasta el inicio, y el goce tiene que terminar dentro de la
 * ventana. Devuelve los errores; vacío = se puede otorgar.
 */
export function validarOtorgamiento(o: { hoy: string; desde: string; hasta: string; avisoDias: number; ventana: VentanaDeCampania }): string[] {
  const errores: string[] = [];
  const faltan = diasHasta(o.hoy, o.desde);
  if (!(faltan >= o.avisoDias)) errores.push(`El aviso no llega: empieza el ${fechaCorta(o.desde)} y hay que avisar con ${o.avisoDias} días (hoy faltan ${Math.max(0, faltan || 0)}). Mové el inicio al ${fechaCorta(primerInicioPosible(o.hoy, o.avisoDias))} o después.`);
  if (o.hasta > o.ventana.hasta) errores.push(`Termina el ${fechaCorta(o.hasta)}, después del cierre de la ventana (${fechaCorta(o.ventana.hasta)}).`);
  if (o.desde < o.ventana.desde) errores.push(`Empieza el ${fechaCorta(o.desde)}, antes de que abra la ventana (${fechaCorta(o.ventana.desde)}).`);
  return errores;
}

/* ─────────────────────────── Lo que asigna la empresa ─────────────────────────── */

/**
 * EL TRAMO ÚNICO QUE SUGIERE EL SISTEMA para quien no eligió: el primero, desde `desdeMinimo` (hoy +
 * aviso), que entra entero en la ventana (la de la campaña y la de la persona) y no toca ningún día
 * bloqueado (topes de solapamiento del área, otras vacaciones). Continuo siempre: la empresa no
 * fracciona sin acuerdo. `null` si no entra en ningún lado.
 */
export function sugerirTramoUnico(o: { dias: number; ventana: VentanaDeCampania; desdeMinimo: string; diasCorridos: boolean; ventanaPersona?: VentanaEfectiva | null; bloqueadas?: Iterable<string> }): Tramo | null {
  if (!(o.dias > 0)) return null;
  const bloqueadas = new Set(o.bloqueadas || []);
  let desde = o.desdeMinimo > o.ventana.desde ? o.desdeMinimo : o.ventana.desde;
  for (let guarda = 0; guarda < 400 && desde <= o.ventana.hasta; guarda++, desde = sumarDias(desde, 1)) {
    // Con días hábiles, el tramo arranca un día hábil: empezar un sábado «regala» el fin de semana.
    if (!o.diasCorridos && [0, 6].includes(diaDeSemana(desde))) continue;
    const hasta = hastaParaDias(desde, o.dias, o.diasCorridos);
    if (hasta > o.ventana.hasta) return null;
    if (o.ventanaPersona && !rangoPermitido(desde, hasta, o.ventanaPersona)) continue;
    let libre = true;
    for (let i = 0, total = diasEntre(desde, hasta); i < total; i++) {
      if (bloqueadas.has(sumarDias(desde, i))) {
        libre = false;
        break;
      }
    }
    if (libre) return { desde, hasta };
  }
  return null;
}

/* ─────────────────────────── Estados ─────────────────────────── */

export type EstadoInvitacion =
  | "pendiente_de_invitar"
  | "invitado"
  | "acuso_recibo"
  | "propuso_fechas"
  | "rechazada"
  | "aprobado_notificado"
  | "vencido_sin_definir"
  | "asignado_por_empresa_notificado"
  /** Ya no le quedan días de ese año (los tomó por otra vía): no hay nada que otorgar. */
  | "sin_dias_pendientes";

/** Lo que se muestra: el estado guardado, o «en curso» / «gozado» cuando las vacaciones otorgadas ya empezaron. */
export type EstadoVisible = EstadoInvitacion | "en_curso" | "gozado";

export const ETIQUETA_ESTADO: Record<EstadoVisible, string> = {
  pendiente_de_invitar: "Sin invitar",
  invitado: "Invitado",
  acuso_recibo: "Acusó recibo",
  propuso_fechas: "Propuso fechas",
  rechazada: "Propuesta rechazada",
  aprobado_notificado: "Otorgadas y notificadas",
  vencido_sin_definir: "Venció sin elegir",
  asignado_por_empresa_notificado: "Asignadas por la empresa",
  sin_dias_pendientes: "Sin días pendientes",
  en_curso: "De vacaciones",
  gozado: "Gozadas",
};

/** Los estados en que la persona todavía puede elegir (y en que la tarjeta de la app está viva). */
export const PUEDE_PROPONER: EstadoInvitacion[] = ["invitado", "acuso_recibo", "rechazada"];
/** Los estados ya otorgados: hubo aviso por escrito. */
export const OTORGADOS: EstadoInvitacion[] = ["aprobado_notificado", "asignado_por_empresa_notificado"];
/** Los que ya no deben nada: otorgados con aviso, o sin días que otorgar. La campaña cierra sólo si todos están acá. */
export const RESUELTOS: EstadoInvitacion[] = [...OTORGADOS, "sin_dias_pendientes"];

/** «En curso» o «gozado» según las fechas otorgadas; si no, el estado guardado. */
export function estadoVisible(estado: EstadoInvitacion, otorgados: Tramo[], hoy: string): EstadoVisible {
  if (!OTORGADOS.includes(estado) || otorgados.length === 0) return estado;
  const inicio = otorgados.reduce((m, t) => (t.desde < m ? t.desde : m), otorgados[0].desde);
  const fin = otorgados.reduce((m, t) => (t.hasta > m ? t.hasta : m), otorgados[0].hasta);
  if (hoy > fin) return "gozado";
  if (hoy >= inicio) return "en_curso";
  return estado;
}

/**
 * LAS ALERTAS DE SEGUIMIENTO DE UNA PERSONA: no acusó recibo, la fecha límite está por vencer, o lo que
 * propuso ya no llega con el aviso (la jerarquía tardó en aprobar).
 */
export function alertasDeInvitacion(o: { estado: EstadoInvitacion; fechaLimite: string; acuseInvitacionAt?: string | Date | null; invitadoAt?: string | Date | null; tramos?: Tramo[]; hoy: string; avisoDias: number }): Alerta[] {
  const alertas: Alerta[] = [];
  const faltan = diasHasta(o.hoy, o.fechaLimite);
  if (PUEDE_PROPONER.includes(o.estado)) {
    if (!o.acuseInvitacionAt && o.invitadoAt) alertas.push({ nivel: "aviso", codigo: "sin_acuse", mensaje: "No acusó recibo de la invitación." });
    if (faltan >= 0 && faltan <= 2) alertas.push({ nivel: "aviso", codigo: "limite_por_vencer", mensaje: faltan === 0 ? "La fecha límite vence hoy." : `La fecha límite vence en ${faltan} día(s).` });
  }
  if (o.estado === "propuso_fechas" && o.tramos?.length) {
    const inicio = o.tramos.reduce((m, t) => (t.desde < m ? t.desde : m), o.tramos[0].desde);
    if (diasHasta(o.hoy, inicio) < o.avisoDias) alertas.push({ nivel: "error", codigo: "aviso_insuficiente", mensaje: `Lo propuesto empieza el ${fechaCorta(inicio)}: aprobándolo hoy ya no se llega al aviso de ${o.avisoDias} días.` });
  }
  return alertas;
}
