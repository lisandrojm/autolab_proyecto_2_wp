/**
 * ═══════════════════════════════════════════════════════════════════════
 * EL PLAN DE UN LOTE: qué solicitud sale de cada integrante de una plantilla de equipo
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Es el corazón del alta masiva y es PURO: recibe la plantilla, las fechas de esta contratación, lo que
 * se pisó sólo esta vez y todo lo que hace falta saber de la base (el `Contexto`), y devuelve por
 * integrante sus jornadas, sus cuatro importes, sus errores y sus advertencias, más los `DatosSolicitud`
 * con los que se arma el payload. Lo usan igual `preview` (no escribe) y `contratar` (escribe si no hay
 * errores): por eso los dos no pueden diferir.
 *
 * LAS REGLAS SON LAS DEL FORMULARIO INDIVIDUAL (`UserRegistrationModal.handleSubmit`), una por una:
 * persona, roles, categoría (salvo servicios), área y turno, tipo de contrato, tope de horas del
 * contrato, importe de servicios, convenio, categoría del convenio, reemplazo con reemplazado y motivo,
 * errores de jornadas. Y el cálculo es el mismo módulo (`compartido/jornadas.ts`). Lo único nuevo:
 *  - la persona tiene que existir y estar activa (en el individual se elige de una lista que ya filtra),
 *  - la persona reemplazada tiene que ser del equipo del proyecto (el individual sólo ofrece esos),
 *  - el aviso de que la escala cambió desde que se fijó a mano el importe de alguien.
 *
 * ERRORES frenan la contratación entera (el lote es todo o nada). ADVERTENCIAS se muestran y no frenan.
 */
import { derivarImportes, erroresDeJornadas, importePorJornada, jornadasCalculadasDelPedido, mesesEquivalentes, periodoDeCalculo, Importes } from "../compartido/jornadas.js";
import { DatosSolicitud } from "../compartido/solicitudDeContratacion.js";

export interface PlantillaParaPlan {
  projectId: string;
  empresaContratoId?: string;
  convenioId?: string;
  contratoId?: string;
  nombreContrato?: string;
  tipoImpositivo?: string;
  comentarios?: string;
}

/**
 * Un PUESTO: su rol, su área y turno, su horario y sus días (todo por puesto: una plantilla cubre varias
 * áreas y turnos), y la persona que lo ocupa en el equipo elegido (`userId` vacío = sin asignar).
 */
export interface IntegranteParaPlan {
  _id: string;
  userId: string;
  rolesFrame: string[];
  areaId?: string | null;
  shiftId?: string | null;
  diasSemana?: number[];
  diasPorSemana?: number | null;
  diasRotativos?: boolean;
  categoriaSatId?: string | null;
  inTime?: string | null;
  outTime?: string | null;
  dailyRateManual?: number | null;
  escalaAlFijar?: number | null;
  comentarios?: string | null;
  reemplazadoDePersonaId?: string | null;
}

/** Las fechas de ESTA contratación, iguales para todo el equipo. */
export interface FechasDeContratacion {
  /** Tipo de contrato por días sueltos («Jornada»): los días. */
  fechas?: string[];
  desde?: string;
  hasta?: string;
  /** Días rotativos: las jornadas se cargan a mano (no hay patrón del cual contarlas). */
  jornadasRotativos?: number;
}

/** Lo que se pisa SÓLO en esta contratación, sin tocar la plantilla. */
export interface Puntual {
  excluido?: boolean;
  /** Quién ocupa el puesto en ESTA contratación, en vez de la persona del equipo (o si está sin asignar). */
  userId?: string;
  /** Días rotativos: las jornadas de este puesto en esta contratación. */
  jornadas?: number;
  categoriaSatId?: string;
  inTime?: string;
  outTime?: string;
  dailyRate?: number;
  /** Jornada: otros días para esta persona. */
  fechas?: string[];
  isReplacement?: boolean;
  motivoReemplazoId?: string;
  replacedUserId?: string;
  empleado_id_reemplezado?: string | number;
}

export interface AvisoDeSuperposicionPlan {
  tipo: "horario" | "fechas";
  mensaje: string;
}

/** Lo que el plan necesita saber de la base. Lo arma `services/plantillasEquipo.ts`. */
export interface Contexto {
  contrato: { modoFechas?: string; esTiempoIndeterminado?: boolean; multiplicadorDiario?: number | null; horasPorJornada?: number | null } | null;
  /** Hay tipos de contrato cargados: sin ninguno, el individual no lo exige. */
  hayContratos: boolean;
  /** Código del CCT del convenio de la plantilla (`Convenio.externalId`). */
  convenioCct: string;
  /** Hay convenios que ofrecer: sin ninguno, el individual no exige convenio. */
  hayConvenios: boolean;
  categorias: Map<string, { neto: number; convenio: string; nombre: string }>;
  personas: Map<string, { nombre: string; activo: boolean; esSolicitud: boolean }>;
  /** Los `_id` de las personas del equipo del proyecto: a quién se puede reemplazar. */
  equipo: Set<string>;
  /** Motivos de reemplazo válidos (los de Novedades). Vacío = el individual no lo exige. */
  motivos: Set<string>;
  /** Superposiciones de cada persona con lo que ya tiene, para ESTAS fechas. */
  superposiciones: Map<string, AvisoDeSuperposicionPlan[]>;
}

export interface FilaDelPlan {
  integranteId: string;
  userId: string;
  nombre: string;
  excluido: boolean;
  categoriaSatId: string;
  categoriaNombre: string;
  inTime: string;
  outTime: string;
  jornadas: number;
  importes: Importes;
  /** Lo que se paga por jornada: pisado esta vez, fijado en la plantilla, o el de la escala. */
  origenImporte: "puntual" | "plantilla" | "escala" | "servicios";
  errores: string[];
  advertencias: string[];
  /** Las que son de horario (la persona ya tiene algo a esa hora): se resaltan. */
  superposicionHorario: boolean;
  datos: DatosSolicitud | null;
}

export interface PlanDeLote {
  filas: FilaDelPlan[];
  totales: { personas: number; jornadas: number; importe: number; conErrores: number; conAdvertencias: number };
}

export const MAX_INTEGRANTES_POR_LOTE = 50;

/** "HH:MM" a horas (cruza la medianoche). `null` si no se entiende. Igual que `horasDelHorario` del formulario. */
const horasDelHorario = (entrada?: string, salida?: string): number | null => {
  const a = /^(\d{1,2}):(\d{2})/.exec(entrada || "");
  const b = /^(\d{1,2}):(\d{2})/.exec(salida || "");
  if (!a || !b) return null;
  let min = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  if (min <= 0) min += 1440;
  return min / 60;
};

/** 0 = domingo … 6 = sábado, del día "YYYY-MM-DD" (en UTC, sin que la zona horaria corra el día). */
const diaDeSemana = (f: string) => new Date(`${f}T12:00:00Z`).getUTCDay();
const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function planDeLote(plantilla: PlantillaParaPlan, integrantes: IntegranteParaPlan[], contratacion: FechasDeContratacion, puntuales: Record<string, Puntual>, ctx: Contexto): PlanDeLote {
  const porDiasSueltos = ctx.contrato?.modoFechas === "dias";
  const indeterminado = !!ctx.contrato?.esTiempoIndeterminado;
  const esServicios = plantilla.tipoImpositivo === "constancia_cuit";
  const multiplicador = Number(ctx.contrato?.multiplicadorDiario) > 0 ? Number(ctx.contrato!.multiplicadorDiario) : 1;
  const limiteHoras = ctx.contrato?.horasPorJornada ?? null;

  // La persona de cada puesto: la elegida para esta vez o, si no, la del equipo.
  const personaDelPuesto = (integ: IntegranteParaPlan) => puntuales[integ._id]?.userId || integ.userId || "";
  const veces = new Map<string, number>();
  for (const integ of integrantes) {
    const uid = personaDelPuesto(integ);
    if (uid && !puntuales[integ._id]?.excluido) veces.set(uid, (veces.get(uid) || 0) + 1);
  }

  const filas: FilaDelPlan[] = integrantes.map((original) => {
    const p = puntuales[original._id] || {};
    const integ = { ...original, userId: personaDelPuesto(original) };
    const sinPersona = !integ.userId;
    const persona = sinPersona ? undefined : ctx.personas.get(integ.userId);
    const nombre = sinPersona ? "Puesto sin asignar" : persona?.nombre || "Persona no encontrada";
    const errores: string[] = [];
    const advertencias: string[] = [];

    const inTime = p.inTime || integ.inTime || "";
    const outTime = p.outTime || integ.outTime || "";
    const areaShiftAssignments = integ.areaId && integ.shiftId ? [{ areaId: String(integ.areaId), shiftIds: [String(integ.shiftId)] }] : [];
    const categoriaSatId = esServicios ? "" : p.categoriaSatId || integ.categoriaSatId || "";
    const categoria = categoriaSatId ? ctx.categorias.get(categoriaSatId) : undefined;

    // ── Las fechas de esta persona ──
    const fechasSueltas = porDiasSueltos ? [...new Set((p.fechas?.length ? p.fechas : contratacion.fechas) || [])].sort() : [];
    const desde = porDiasSueltos ? fechasSueltas[0] || "" : contratacion.desde || "";
    const hasta = porDiasSueltos ? fechasSueltas[fechasSueltas.length - 1] || "" : indeterminado ? "" : contratacion.hasta || "";
    const diasSemana = porDiasSueltos ? [...new Set(fechasSueltas.map(diaDeSemana))].sort((a, b) => a - b) : integ.diasSemana || [];
    const diasPorSemana = porDiasSueltos ? diasSemana.length : Number(integ.diasPorSemana) || diasSemana.length;
    const rotativos = porDiasSueltos ? false : !!integ.diasRotativos;
    // Igual que el formulario individual: `periodoDeCalculo` con el `indeterminado` del contrato, y las
    // jornadas con la regla compartida.
    const periodo = periodoDeCalculo(desde, hasta, indeterminado);
    const calculadas = jornadasCalculadasDelPedido({ porDiasSueltos, fechas: fechasSueltas, rotativos, desde: periodo.desde, hasta: periodo.hasta, dias: diasSemana });
    const jornadas = rotativos ? Number(p.jornadas) || Number(contratacion.jornadasRotativos) || 0 : calculadas || 0;

    // ── Lo que se paga por jornada ──
    const escala = categoria ? importePorJornada(categoria.neto, multiplicador) : 0;
    let dailyRate = 0;
    let origenImporte: FilaDelPlan["origenImporte"] = "escala";
    if (p.dailyRate != null && Number(p.dailyRate) > 0) {
      dailyRate = Number(p.dailyRate);
      origenImporte = "puntual";
    } else if (integ.dailyRateManual != null && Number(integ.dailyRateManual) > 0) {
      dailyRate = Number(integ.dailyRateManual);
      origenImporte = "plantilla";
      // La escala cambió desde que alguien fijó este importe a mano: se avisa, no se pisa.
      if (!esServicios && categoria && integ.escalaAlFijar != null && Number(integ.escalaAlFijar) !== escala) {
        advertencias.push(`La escala de su categoría cambió desde que se fijó su importe: antes ${pesos(Number(integ.escalaAlFijar))}, ahora ${pesos(escala)}. Se paga el fijado, ${pesos(dailyRate)}.`);
      }
    } else if (esServicios) {
      origenImporte = "servicios";
    } else {
      dailyRate = escala;
    }

    const mesesEq = mesesEquivalentes(periodo.desde, periodo.hasta, diasSemana);
    const importes = derivarImportes({ ancla: null, jornada: dailyRate > 0 ? dailyRate : null, mesesEq, jornadas, diasSemana: diasPorSemana });

    // ── Las reglas del formulario individual ──
    if (sinPersona) errores.push("Falta la persona del puesto: elegila o excluí el puesto.");
    else if (!persona) errores.push("La persona no existe (se borró).");
    else if (persona.esSolicitud) errores.push("No es una persona registrada: es una solicitud de alta.");
    else if (!persona.activo) errores.push("La persona está inactiva.");
    if (integ.rolesFrame.length === 0) errores.push("Falta el rol empresa.");
    if (!sinPersona && (veces.get(integ.userId) || 0) > 1) errores.push("La misma persona está en más de un puesto.");
    if (!esServicios && !categoriaSatId) errores.push("Falta la categoría (a completar).");
    if (!areaShiftAssignments.length) errores.push("El puesto no tiene área y turno.");
    if (!plantilla.contratoId && ctx.hayContratos) errores.push("La plantilla no tiene tipo de contrato.");
    const horas = horasDelHorario(inTime, outTime);
    if (!inTime || !outTime) errores.push("El puesto no tiene horario.");
    else if (limiteHoras != null && horas != null && horas > limiteHoras) errores.push(`El horario suma ${horas.toLocaleString("es-AR", { maximumFractionDigits: 2 })} h y «${plantilla.nombreContrato || "el contrato"}» admite hasta ${limiteHoras} h por jornada.`);
    if (esServicios && !(dailyRate > 0)) errores.push("Es un servicio: hay que cargar el importe por jornada a mano.");
    if (!esServicios && ctx.hayConvenios && !plantilla.convenioId) errores.push("La plantilla no tiene convenio.");
    if (!esServicios && categoriaSatId && !categoria) errores.push("La categoría ya no existe (a completar).");
    if (!esServicios && categoria && ctx.convenioCct && categoria.convenio && categoria.convenio !== ctx.convenioCct) errores.push(`La categoría «${categoria.nombre}» es del convenio ${categoria.convenio} y el alta va por el ${ctx.convenioCct} (a completar).`);
    if (p.isReplacement) {
      if (!p.replacedUserId) errores.push("Marcaste que es un reemplazo: falta a quién reemplaza.");
      else if (!ctx.equipo.has(p.replacedUserId)) errores.push("La persona reemplazada no es del equipo del proyecto.");
      else if (p.replacedUserId === integ.userId) errores.push("No puede reemplazarse a sí misma.");
      if (!p.motivoReemplazoId && ctx.motivos.size > 0) errores.push("Falta el motivo del reemplazo.");
      else if (p.motivoReemplazoId && ctx.motivos.size > 0 && !ctx.motivos.has(p.motivoReemplazoId)) errores.push("El motivo del reemplazo no es válido.");
    }
    if (porDiasSueltos) {
      if (fechasSueltas.length === 0) errores.push("Elegí al menos un día.");
    } else {
      const e = erroresDeJornadas({ desde: periodo.desde, hasta: periodo.hasta, diasPorSemana: String(diasPorSemana || ""), dias: diasSemana, rotativos, jornadas: jornadas ? String(jornadas) : "", calculadas, ajustado: false, motivo: "", nota: "" });
      if (!contratacion.desde) errores.push("Falta la fecha de inicio.");
      else if (!indeterminado && !contratacion.hasta) errores.push("Falta la fecha de fin.");
      for (const m of Object.values(e)) if (m) errores.push(m);
    }

    const sup = ctx.superposiciones.get(integ.userId) || [];
    for (const s of sup) advertencias.push(s.mensaje);

    const datos: DatosSolicitud | null = persona
      ? {
          fullName: persona.nombre,
          projectIds: [plantilla.projectId],
          solicitudUserId: integ.userId,
          roleFrameIds: integ.rolesFrame,
          esServicios,
          categoriaSatId: categoriaSatId || undefined,
          startDate: desde,
          dueDate: hasta,
          indeterminado,
          porDiasSueltos,
          workdaysCount: jornadas,
          workdaysCalculated: calculadas,
          ajusteJornadas: false,
          diasPorSemana,
          diasSemana,
          diasRotativos: rotativos,
          fechasTrabajadas: fechasSueltas,
          inTime,
          outTime,
          empresaContratoId: plantilla.empresaContratoId,
          convenioId: plantilla.convenioId,
          dailyRate,
          isReplacement: !!p.isReplacement,
          empleado_id_reemplezado: p.empleado_id_reemplezado,
          replacedUserId: p.replacedUserId,
          motivoReemplazoId: p.motivoReemplazoId,
          comentarios: integ.comentarios || plantilla.comentarios || "",
          tipoImpositivo: plantilla.tipoImpositivo,
          contratoId: plantilla.contratoId,
          nombreContrato: plantilla.nombreContrato,
          areaShiftAssignments,
        }
      : null;

    return {
      integranteId: integ._id,
      userId: integ.userId,
      nombre,
      excluido: !!p.excluido,
      categoriaSatId,
      categoriaNombre: categoria?.nombre || "",
      inTime,
      outTime,
      jornadas,
      importes,
      origenImporte,
      // Excluido esta vez: no se valida, no sale, no suma.
      errores: p.excluido ? [] : errores,
      advertencias: p.excluido ? [] : advertencias,
      superposicionHorario: !p.excluido && sup.some((s) => s.tipo === "horario"),
      datos,
    };
  });

  const incluidas = filas.filter((f) => !f.excluido);
  const totales = {
    personas: incluidas.length,
    jornadas: incluidas.reduce((s, f) => s + f.jornadas, 0),
    importe: Number(incluidas.reduce((s, f) => s + (f.importes.total ?? 0), 0).toFixed(2)),
    conErrores: incluidas.filter((f) => f.errores.length > 0).length,
    conAdvertencias: incluidas.filter((f) => f.advertencias.length > 0).length,
  };
  return { filas, totales };
}

/** Qué impide contratar el lote entero (además de los errores de cada fila). */
export function erroresDelLote(plan: PlanDeLote): string[] {
  const e: string[] = [];
  if (plan.totales.personas === 0) e.push("No hay nadie para contratar: están todos excluidos.");
  if (plan.totales.personas > MAX_INTEGRANTES_POR_LOTE) e.push(`Son ${plan.totales.personas} personas y el máximo por contratación es ${MAX_INTEGRANTES_POR_LOTE}.`);
  if (plan.totales.conErrores > 0) e.push(`${plan.totales.conErrores} ${plan.totales.conErrores === 1 ? "integrante tiene" : "integrantes tienen"} errores.`);
  return e;
}
