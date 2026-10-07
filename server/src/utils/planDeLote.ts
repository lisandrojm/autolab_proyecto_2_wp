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
 * persona, roles, categoría (salvo servicios), área y turno, tipo de contrato (por puesto), tope de horas del
 * contrato, importe de servicios, convenio, categoría del convenio, reemplazo con reemplazado y motivo,
 * errores de jornadas. Y el cálculo es el mismo módulo (`compartido/jornadas.ts`). Lo único nuevo:
 *  - la persona tiene que existir y estar activa (en el individual se elige de una lista que ya filtra),
 *  - la persona reemplazada tiene que ser del equipo del proyecto (el individual sólo ofrece esos),
 *  - el aviso de que la escala cambió desde que se fijó a mano el importe de alguien.
 *
 * ERRORES frenan la contratación entera (el lote es todo o nada). ADVERTENCIAS se muestran y no frenan.
 */
import { derivarImportes, erroresDeJornadas, importePorJornada, mesesParaImportes, jornadasCalculadasDelPedido, jornadasFijadasPorElTipo, mesesEquivalentes, periodoDeCalculo, Importes } from "../compartido/jornadas.js";
import { DatosSolicitud } from "../compartido/solicitudDeContratacion.js";
import { semanaDelTipoDeContrato } from "../compartido/diasDeTrabajo.js";

export interface PlantillaParaPlan {
  projectId: string;
  empresaContratoId?: string;
  convenioId?: string;
  /** El tipo de contrato va POR PUESTO; éste es el de las plantillas viejas, que se usa si el puesto no tiene. */
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
  /** El tipo de contrato de este puesto (cada persona contratada puede ir con uno distinto). */
  contratoId?: string | null;
  nombreContrato?: string | null;
  /** El trámite del tipo de contrato («constancia_cuit» = servicios). */
  tipoImpositivo?: string | null;
  reemplazadoDePersonaId?: string | null;
}

/**
 * Lo de ESTA contratación, igual para todo el equipo: el tipo de contrato y las fechas.
 *
 * EL TIPO DE CONTRATO SE ELIGE AL CONTRATAR, no al armar el equipo. Medido en producción: de 867
 * vínculos persona-proyecto, 227 tuvieron más de un tipo a lo largo de su historia; era el campo que
 * más cambia entre una contratación y la siguiente, y el único que la plantilla congelaba. Acá viene
 * uno general para todos los puestos —lo normal: un fin de semana de jornaleros va entero por
 * «Jornada»— y quien necesite otro lo trae en su `Puntual`.
 *
 * Como puede haber de los dos modos en el mismo lote, viajan las dos formas de fecha: los puestos por
 * días sueltos usan `fechas`, los demás `desde`/`hasta`.
 */
export interface FechasDeContratacion {
  /**
   * El tipo de contrato general de esta contratación, con su nombre y su trámite: los tres viajan
   * juntos siempre, como en el puesto y en el equipo. Sin él, vale el del puesto o el de la plantilla.
   */
  contratoId?: string;
  nombreContrato?: string;
  tipoImpositivo?: string;
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
  /**
   * Período: otro desde/hasta para esta persona. Como en el alta individual, cada persona puede tener
   * sus fechas; lo normal es que valgan las del equipo, y esto es la excepción de una.
   */
  desde?: string;
  hasta?: string;
  isReplacement?: boolean;
  motivoReemplazoId?: string;
  replacedUserId?: string;
  empleado_id_reemplezado?: string | number;
  /** El comentario de ESTA solicitud (en la revisión). Sin él, el del puesto o el de la plantilla. */
  comentarios?: string;
  /** Otro tipo de contrato para esta persona, sólo esta vez (un Servicios entre Jornadas). Con nombre y trámite. */
  contratoId?: string;
  nombreContrato?: string;
  tipoImpositivo?: string;
}

export interface AvisoDeSuperposicionPlan {
  tipo: "horario" | "fechas";
  mensaje: string;
}

/** Lo que el plan necesita saber de la base. Lo arma `services/plantillasEquipo.ts`. */
export interface ContratoDelPlan {
  modoFechas?: string;
  esTiempoIndeterminado?: boolean;
  multiplicadorDiario?: number | null;
  horasPorJornada?: number | null;
  /** «Cantidad de jornadas» del tipo: si está, son ésas (ver `jornadasFijadasPorElTipo`). */
  cantidadJornadas?: number | null;
  /** «Días por semana» del tipo: precargan la semana de cada puesto (ver `semanaDelTipoDeContrato`). */
  diasPorSemana?: number | null;
}

export interface Contexto {
  /** Los tipos de contrato de los puestos, por `_id`. */
  contratos: Map<string, ContratoDelPlan>;
  /** Hay tipos de contrato cargados: sin ninguno, el individual no lo exige. */
  hayContratos: boolean;
  /** Código del CCT del convenio de la plantilla (`Convenio.externalId`). */
  convenioCct: string;
  /** Hay convenios que ofrecer: sin ninguno, el individual no exige convenio. */
  hayConvenios: boolean;
  /** La escala de cada categoría (para el importe por jornada: ver `importePorJornada`), su convenio y su nombre. */
  categorias: Map<string, { neto: number; sueldoBasico?: number; sueldoAdicional?: number; presentismo?: number; sueldoBruto?: number; convenio: string; nombre: string }>;
  personas: Map<string, { nombre: string; activo: boolean; esSolicitud: boolean }>;
  /** Los `_id` de las personas del equipo del proyecto: a quién se puede reemplazar. */
  equipo: Set<string>;
  /** Motivos de reemplazo válidos (los de Novedades). Vacío = el individual no lo exige. */
  motivos: Set<string>;
  /**
   * Superposiciones de cada PUESTO (`_id` del integrante, no de la persona: la misma puede ocupar dos)
   * con lo que la persona ya tiene y con sus otros puestos del lote, para ESTAS fechas.
   */
  superposiciones: Map<string, AvisoDeSuperposicionPlan[]>;
  /** La sede principal del proyecto (`data.id`): la que lleva cada solicitud del lote, como en el alta individual. */
  sedePrincipal?: number | null;
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
  // La persona de cada puesto: la elegida para esta vez o, si no, la del equipo.
  // Puede ser la misma en dos puestos: no es error. Si se pisan, lo avisa `superposiciones` (origen «lote»).
  const personaDelPuesto = (integ: IntegranteParaPlan) => puntuales[integ._id]?.userId || integ.userId || "";

  const filas: FilaDelPlan[] = integrantes.map((original) => {
    const p = puntuales[original._id] || {};
    const integ = { ...original, userId: personaDelPuesto(original) };
    const sinPersona = !integ.userId;
    const persona = sinPersona ? undefined : ctx.personas.get(integ.userId);
    const nombre = sinPersona ? "Puesto sin asignar" : persona?.nombre || "Persona no encontrada";
    const errores: string[] = [];
    const advertencias: string[] = [];

    /*
      ── El tipo de contrato de esta persona ──

      Puntual → general del pedido → puesto → plantilla vieja. El general le gana al puesto a propósito:
      lo que se elige al contratar es lo que vale para todos, y el que necesite otro lo dice en su fila.
      Si el puesto tuviera un contrato propio guardado y pesara más que el general, «elegí Jornada para
      todos» dejaría a uno en Plazo fijo sin que nada lo avise. El nombre y el trámite vienen de la
      misma fuente que el id: nunca se mezclan los de una capa con el id de otra.
    */
    const fuente = p.contratoId ? p : contratacion.contratoId ? contratacion : integ.contratoId ? integ : plantilla;
    const contratoId = String(fuente.contratoId || "");
    const nombreContrato = fuente.nombreContrato || "";
    const tipoImpositivo = fuente.tipoImpositivo || "";
    const contrato = contratoId ? ctx.contratos.get(contratoId) : undefined;
    const porDiasSueltos = contrato?.modoFechas === "dias";
    const indeterminado = !!contrato?.esTiempoIndeterminado;
    const esServicios = tipoImpositivo === "constancia_cuit";
    const multiplicador = Number(contrato?.multiplicadorDiario) > 0 ? Number(contrato!.multiplicadorDiario) : 1;
    const limiteHoras = contrato?.horasPorJornada ?? null;

    const inTime = p.inTime || integ.inTime || "";
    const outTime = p.outTime || integ.outTime || "";
    const areaShiftAssignments = integ.areaId && integ.shiftId ? [{ areaId: String(integ.areaId), shiftIds: [String(integ.shiftId)] }] : [];
    const categoriaSatId = esServicios ? "" : p.categoriaSatId || integ.categoriaSatId || "";
    const categoria = categoriaSatId ? ctx.categorias.get(categoriaSatId) : undefined;

    // ── Las fechas de esta persona ──
    const fechasSueltas = porDiasSueltos ? [...new Set((p.fechas?.length ? p.fechas : contratacion.fechas) || [])].sort() : [];
    // Las fechas: las suyas si las trae, si no las del equipo. Un puntual con período pisa las dos juntas o ninguna.
    const periodoPropio = !porDiasSueltos && !!p.desde;
    const desde = porDiasSueltos ? fechasSueltas[0] || "" : (periodoPropio ? p.desde : contratacion.desde) || "";
    const hasta = porDiasSueltos ? fechasSueltas[fechasSueltas.length - 1] || "" : indeterminado ? "" : (periodoPropio ? p.hasta : contratacion.hasta) || "";
    const rotativos = porDiasSueltos ? false : !!integ.diasRotativos;
    // Los días por semana del TIPO de contrato («6x6» → 6) mandan sobre los del puesto, igual que en el alta individual.
    const semanaDelTipo = porDiasSueltos ? null : semanaDelTipoDeContrato(contrato?.diasPorSemana, integ.diasSemana || [], rotativos);
    const diasSemana = porDiasSueltos ? [...new Set(fechasSueltas.map(diaDeSemana))].sort((a, b) => a - b) : semanaDelTipo?.dias || integ.diasSemana || [];
    const diasPorSemana = porDiasSueltos ? diasSemana.length : semanaDelTipo?.diasPorSemana || Number(integ.diasPorSemana) || diasSemana.length;
    // Igual que el formulario individual: `periodoDeCalculo` con el `indeterminado` del contrato, y las
    // jornadas con la regla compartida.
    const periodo = periodoDeCalculo(desde, hasta, indeterminado);
    const calculadas = jornadasCalculadasDelPedido({ porDiasSueltos, fechas: fechasSueltas, rotativos, desde: periodo.desde, hasta: periodo.hasta, dias: diasSemana, jornadasDelTipo: contrato?.cantidadJornadas });
    const fijadasPorTipo = jornadasFijadasPorElTipo(contrato?.cantidadJornadas, porDiasSueltos);
    const jornadas = fijadasPorTipo ?? (rotativos ? Number(p.jornadas) || Number(contratacion.jornadasRotativos) || 0 : calculadas || 0);

    // ── Lo que se paga por jornada ──
    const escala = categoria ? importePorJornada(categoria, multiplicador, Number(contrato?.cantidadJornadas) || null) : 0;
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

    const mesesEq = mesesEquivalentes(periodo.desde, periodo.hasta, diasSemana, porDiasSueltos ? fechasSueltas : undefined);
    // Con las jornadas del tipo («Jornada»: 22 por mes), el mensual es jornada × 22: ver `mesesParaImportes`.
    const importes = derivarImportes({ ancla: null, jornada: dailyRate > 0 ? dailyRate : null, mesesEq: mesesParaImportes(mesesEq, jornadas, Number(contrato?.cantidadJornadas) || null), jornadas, diasSemana: Number(contrato?.diasPorSemana) > 0 ? Number(contrato!.diasPorSemana) : diasPorSemana });

    // ── Las reglas del formulario individual ──
    if (sinPersona) errores.push("Falta la persona del puesto: elegila o excluí el puesto.");
    else if (!persona) errores.push("La persona no existe (se borró).");
    else if (persona.esSolicitud) errores.push("No es una persona registrada: es una solicitud de alta.");
    else if (!persona.activo) errores.push("La persona está inactiva.");
    if (integ.rolesFrame.length === 0) errores.push("Falta el rol empresa.");
    if (!esServicios && !categoriaSatId) errores.push("Falta la categoría (a completar).");
    if (!areaShiftAssignments.length) errores.push("El puesto no tiene área y turno.");
    if (!contratoId && ctx.hayContratos) errores.push("El puesto no tiene tipo de contrato.");
    else if (contratoId && !contrato && ctx.hayContratos) errores.push("El tipo de contrato del puesto ya no existe.");
    const horas = horasDelHorario(inTime, outTime);
    if (!inTime || !outTime) errores.push("El puesto no tiene horario.");
    else if (limiteHoras != null && horas != null && horas > limiteHoras) errores.push(`El horario suma ${horas.toLocaleString("es-AR", { maximumFractionDigits: 2 })} h y «${nombreContrato || "el contrato"}» admite hasta ${limiteHoras} h por jornada.`);
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
      if (!desde) errores.push("Falta la fecha de inicio.");
      else if (!indeterminado && !hasta) errores.push("Falta la fecha de fin.");
      for (const m of Object.values(e)) if (m) errores.push(m);
    }

    const sup = ctx.superposiciones.get(integ._id) || [];
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
          sedeId: ctx.sedePrincipal || undefined,
          convenioId: plantilla.convenioId,
          dailyRate,
          isReplacement: !!p.isReplacement,
          empleado_id_reemplezado: p.empleado_id_reemplezado,
          replacedUserId: p.replacedUserId,
          motivoReemplazoId: p.motivoReemplazoId,
          comentarios: p.comentarios ?? (integ.comentarios || plantilla.comentarios || ""),
          tipoImpositivo,
          contratoId,
          nombreContrato,
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
