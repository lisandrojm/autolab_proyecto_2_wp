/**
 * ═══════════════════════════════════════════════════════════════════════
 * EL PAYLOAD DE UNA SOLICITUD DE CONTRATACIÓN (`POST /users` con `metadata.isSolicitud`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Código compartido server ↔ frontend (ver el encabezado de `jornadas.ts`): puro y sin imports.
 *
 * Lo arman DOS caminos que tienen que producir lo mismo: el formulario individual del móvil
 * (`UserRegistrationModal`) y el alta masiva de una plantilla de equipo (server). Si cada uno armara el
 * suyo, «idénticas» sería una intención que se rompe el día que alguien agregue un campo a uno solo. Con
 * una única función, lo que agregue uno lo recibe el otro; `solicitudDeContratacion.test.ts` lo fija.
 *
 * Esta función NO valida: recibe datos ya validados por quien la llama y sólo decide la FORMA.
 */

/** Todo lo que una solicitud necesita, ya resuelto por la pantalla (o por el plan del lote). */
export interface DatosSolicitud {
  fullName: string;
  projectIds: string[];
  /** La persona ya registrada a la que se le pide el alta. Vacío = alguien que todavía no existe. */
  solicitudUserId?: string;
  roleFrameIds: string[];
  /** Un servicio no tiene categoría ni convenio. */
  esServicios: boolean;
  categoriaSatId?: string;
  startDate: string;
  dueDate: string;
  /** Tiempo indeterminado: no hay baja, salvo que se pida por días sueltos. */
  indeterminado: boolean;
  porDiasSueltos: boolean;
  workdaysCount: number | string;
  /** Las jornadas que da el calendario, se hayan pisado o no. */
  workdaysCalculated: number | null;
  /** Se pisaron las jornadas del calendario (ver `hayAjuste` en `jornadas.ts`), y por qué. */
  ajusteJornadas: boolean;
  motivoAjuste?: string;
  notaAjuste?: string;
  diasPorSemana: number | string;
  diasSemana: number[];
  diasRotativos: boolean;
  fechasTrabajadas: string[];
  inTime: string;
  outTime: string;
  empresaContratoId?: string;
  convenioId?: string;
  dailyRate: number | string;
  isReplacement: boolean;
  empleado_id_reemplezado?: string | number;
  replacedUserId?: string;
  motivoReemplazoId?: string;
  comentarios?: string;
  tipoImpositivo?: string;
  contratoId?: string;
  nombreContrato?: string;
  areaShiftAssignments: { areaId: string; shiftIds: string[] }[];
  esRenovacion?: boolean;
  renovacionDe?: { userProjectId: string; fechaBajaContrato: string };
}

export interface OpcionesPayload {
  /** Milisegundos para el email y la contraseña provisorios. Por defecto, ahora. */
  ahora?: number;
  /**
   * Se agrega al email provisorio. En un lote varias solicitudes se arman en el mismo milisegundo y el
   * server rechaza el email repetido: el alta masiva pasa la posición (y algo al azar). El alta
   * individual no pasa nada, y su email queda exactamente como siempre.
   */
  sufijoEmail?: string;
}

export function armarPayloadDeSolicitud(d: DatosSolicitud, opciones: OpcionesPayload = {}) {
  const timestamp = opciones.ahora ?? Date.now();
  return {
    email: `solicitud_${timestamp}${opciones.sufijoEmail || ""}@pending.com`,
    password: `pass_${timestamp}`,
    firstName: d.fullName.split(" ")[0] || "Pendiente",
    lastName: d.fullName.split(" ").slice(1).join(" ") || "Pendiente",
    isActive: false,
    hireDate: d.startDate || new Date(timestamp).toISOString(),
    metadata: {
      fullName: d.fullName,
      projectIds: d.projectIds,
      // Si el alta se pidió para alguien que YA es usuario, se guarda el vínculo: así la solicitud se
      // muestra dentro de su ficha en vez de crear una tarjeta duplicada.
      solicitudUserId: d.solicitudUserId || undefined,
      roles_frame: d.roleFrameIds,
      categoriaSatId: d.esServicios ? undefined : d.categoriaSatId,
      startDate: d.startDate,
      // Un tiempo indeterminado no tiene fecha de baja: viaja vacía aunque el formulario traiga una.
      dueDate: d.indeterminado && !d.porDiasSueltos ? "" : d.dueDate,
      // Lo que se liquida. De dónde salió viaja al lado, para auditarlo sin recalcular.
      workdaysCount: Number(d.workdaysCount),
      // El calculado se guarda SIEMPRE, haya ajuste o no: las reglas del calendario pueden cambiar.
      workdaysCalculated: d.workdaysCalculated,
      workdaysOverridden: d.ajusteJornadas,
      workdaysOverrideReason: d.ajusteJornadas ? d.motivoAjuste : null,
      workdaysOverrideNote: d.ajusteJornadas ? (d.notaAjuste || "").trim() || null : null,
      diasPorSemana: Number(d.diasPorSemana) || undefined,
      diasSemana: d.diasSemana,
      diasRotativos: d.diasRotativos,
      // Los días exactos, cuando el contrato se pide por días sueltos: `diasSemana` y el período no
      // alcanzan para reconstruirlos («los martes de septiembre» vs «el 2, el 9 y el 23»).
      fechasTrabajadas: d.fechasTrabajadas.length > 0 ? d.fechasTrabajadas : undefined,
      schedule: `${d.inTime} - ${d.outTime}`,
      // Con qué CUIT se contrata y bajo qué CCT.
      empresaContratoId: d.empresaContratoId || undefined,
      convenioId: d.esServicios ? undefined : d.convenioId || undefined,
      dailyRate: Number(d.dailyRate),
      isReplacement: d.isReplacement,
      // A quién reemplaza: el id numérico que usa el contrato (puede faltar) y el `_id`, que siempre está.
      empleado_id_reemplezado: d.isReplacement ? d.empleado_id_reemplezado || undefined : undefined,
      replacedUserId: d.isReplacement ? d.replacedUserId || undefined : undefined,
      // El motivo viaja como id del tipo de novedad: el nombre lo pone quien lo muestre.
      motivoReemplazoId: d.isReplacement ? d.motivoReemplazoId || undefined : undefined,
      // Sólo si tiene algo: un string vacío se lee después como «hay un comentario».
      comentarios: (d.comentarios || "").trim() || undefined,
      // El trámite declarado: es lo que después precarga el wizard.
      tipoImpositivo: d.tipoImpositivo || undefined,
      contratoId: d.contratoId || undefined,
      nombre_contrato: d.nombreContrato || undefined,
      // Siempre: la solicitud no se envía sin área y turno, y es lo que precarga el wizard de aprobación.
      areaShiftAssignments: d.areaShiftAssignments,
      // Renovación: la etiqueta y QUÉ contrato renueva. Al crearla, el server anota la decisión.
      esRenovacion: d.esRenovacion || undefined,
      renovacionDe: d.renovacionDe || undefined,
      isSolicitud: true as const,
    },
  };
}

export type PayloadDeSolicitud = ReturnType<typeof armarPayloadDeSolicitud>;
