import mongoose, { Types } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════
 * PLANTILLA DE EQUIPO: puestos por rol, y los equipos que los ocupan
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Casi siempre se contrata a los mismos equipos de jornaleros. Una plantilla tiene TRES niveles:
 *
 *  1. GENERAL: nombre, empresa (y convenio) y comentario. Nada de áreas, horarios ni tipo de contrato.
 *  2. PUESTOS (`integrantes`): cada uno con su rol empresa, su TIPO DE CONTRATO, su área y turno, su
 *     horario y sus días (los del turno, modificables), su categoría y, si se fijó, su importe. Una plantilla puede cubrir
 *     varias áreas y turnos: cada puesto dice el suyo.
 *  3. EQUIPOS (`equipos`): cada uno con sus CONDICIONES DEL EQUIPO (`equipos[].condiciones`: tipo de
 *     contrato, área y turno, horario, días), que valen para todos sus puestos, y quién ocupa cada
 *     puesto. Si un puesto difiere del equipo, la DIFERENCIA va en `asignaciones[].condiciones` (sólo lo
 *     distinto). El valor que rige se resuelve siempre igual: puesto → equipo → diferencia del puesto
 *     (`puestoEnEquipo` en el servicio), y las pantallas muestran de cuál de las tres viene.
 *
 *  REEMPLAZO: explícito, en `asignaciones[].reemplazo` (a quién y por qué). Es lo único que crea un
 *  reemplazo: cambiar a la persona de un puesto NUNCA lo hace. Al contratar se vuelve `isReplacement` /
 *  `replacedUserId` / `motivoReemplazoId` de la solicitud, igual que el alta individual, y se borra del
 *  equipo (los reemplazos son de una vez: vacaciones, compensatorio).
 *
 * Al contratar salen N solicitudes idénticas a las del formulario individual (`services/plantillasEquipo.ts`).
 *
 * LO QUE NO GUARDA, A PROPÓSITO:
 *  - FECHAS NI DÍAS DEL CALENDARIO: se eligen en cada contratación.
 *  - IMPORTES CALCULADOS: se recalculan al contratar con la escala VIGENTE. Si alguien fijó a mano el
 *    importe de un puesto (`dailyRateManual`), se guarda la escala de ese momento (`escalaAlFijar`): si
 *    después cambió, la contratación lo avisa («antes X, ahora Y»).
 *
 * ALCANCE: `personal` = de un supervisor (`creadoPor`), en un proyecto; sólo él la ve y la usa (móvil).
 * `general` = del escritorio, sin proyecto ni personas ni áreas: puestos por rol que cada supervisor
 * copia («Usar») a una personal.
 *
 * Todo va EMBEBIDO (decisión D1 del plan): una plantilla se lee y se escribe entera. Una persona no
 * PUEDE ocupar dos puestos del mismo equipo (mañana en uno y noche en otro): si se pisan en días y
 * horario, se AVISA (`utils/superposicionContratos.ts`, `choquesDelEquipo`), no se bloquea.
 */
export interface IPuesto {
    _id: Types.ObjectId;
    rolesFrame: Types.ObjectId[];
    orden: number;
    areaId?: Types.ObjectId | null;
    shiftId?: Types.ObjectId | null;
    inTime?: string | null;
    outTime?: string | null;
    diasSemana?: number[];
    diasPorSemana?: number | null;
    diasRotativos?: boolean;
    categoriaSatId?: Types.ObjectId | null;
    dailyRateManual?: number | null;
    /** La escala (ya multiplicada) cuando se fijó `dailyRateManual`: para avisar si cambió. */
    escalaAlFijar?: number | null;
    comentarios?: string | null;
    /** El tipo de contrato de quien ocupe el puesto (cada persona contratada puede ir con uno distinto). */
    contratoId?: Types.ObjectId | null;
    nombreContrato?: string | null;
    /** El trámite del tipo de contrato («constancia_cuit» = servicios). Lo resuelve la pantalla. */
    tipoImpositivo?: string | null;
}
/**
 * Lo que un EQUIPO pisa de un puesto. Sólo se guardan los campos que difieren del puesto (lo resuelve
 * el servicio): lo que no está sale del puesto, así un cambio en el puesto llega a todos sus equipos.
 */
export interface ICondiciones {
    areaId?: Types.ObjectId | null;
    shiftId?: Types.ObjectId | null;
    inTime?: string | null;
    outTime?: string | null;
    diasSemana?: number[];
    diasPorSemana?: number | null;
    diasRotativos?: boolean;
    categoriaSatId?: Types.ObjectId | null;
    dailyRateManual?: number | null;
    escalaAlFijar?: number | null;
    comentarios?: string | null;
    contratoId?: Types.ObjectId | null;
    nombreContrato?: string | null;
    tipoImpositivo?: string | null;
}
/** Los campos de un puesto que un equipo puede pisar (todos menos el rol y el orden). */
export declare const CAMPOS_DE_CONDICIONES: readonly ["areaId", "shiftId", "inTime", "outTime", "diasSemana", "diasPorSemana", "diasRotativos", "categoriaSatId", "dailyRateManual", "comentarios", "contratoId", "nombreContrato", "tipoImpositivo"];
/** Las condiciones que un equipo pone para todos sus puestos. */
export declare const CAMPOS_DE_EQUIPO: readonly ["contratoId", "nombreContrato", "tipoImpositivo", "areaId", "shiftId", "inTime", "outTime", "diasSemana", "diasPorSemana", "diasRotativos"];
/** A quién reemplaza quien ocupa el puesto, y por qué (los motivos de Novedades). */
export interface IReemplazo {
    replacedUserId: Types.ObjectId;
    motivoReemplazoId?: Types.ObjectId | null;
    /** Vino de un «Entró en lugar de» viejo (sin motivo): hay que revisarlo antes de contratar. */
    revisarMotivo?: boolean;
}
export interface IAsignacion {
    puestoId: Types.ObjectId;
    /** `null` = el puesto no tiene persona en este equipo, pero sí condiciones propias. */
    userId: Types.ObjectId | null;
    condiciones?: ICondiciones | null;
    /** El equipo NO usa este puesto: no se asigna, no se contrata, no cuenta. Sigue en la plantilla para los demás equipos. */
    excluido?: boolean;
    reemplazo?: IReemplazo | null;
    /** VIEJO: «Entró en lugar de» implícito. Lo pasa a `reemplazo` el script `migrar-plantillas`. */
    reemplazadoDePersonaId?: Types.ObjectId | null;
    reemplazadoEl?: Date | null;
}
export interface IEquipo {
    _id: Types.ObjectId;
    nombre: string;
    /** Las condiciones del equipo (`CAMPOS_DE_EQUIPO`): valen para todos sus puestos. */
    condiciones?: Record<string, any> | null;
    asignaciones: IAsignacion[];
    ultimaContratacionEl?: Date | null;
}
export interface IPlantillaEquipo {
    tenantId: Types.ObjectId;
    alcance: "personal" | "general";
    /** `null` en las generales. */
    projectId: Types.ObjectId | null;
    nombre: string;
    empresaContratoId?: Types.ObjectId | null;
    /** Derivado de la empresa, guardado para detectar que cambió. */
    convenioId?: Types.ObjectId | null;
    /** VIEJO: el tipo de contrato ahora va por puesto. Los puestos sin uno propio heredan éste. */
    contratoId?: Types.ObjectId | null;
    nombreContrato?: string;
    /** El trámite del tipo de contrato («constancia_cuit» = servicios). Lo resuelve la pantalla, igual que en el alta individual. */
    tipoImpositivo?: string;
    comentarios?: string;
    integrantes: IPuesto[];
    equipos: IEquipo[];
    activo: boolean;
    creadoPor: Types.ObjectId;
    ultimaContratacionEl?: Date | null;
    ultimoLoteId?: Types.ObjectId | null;
    createdAt?: Date;
    updatedAt?: Date;
}
export declare const PlantillaEquipo: mongoose.Model<IPlantillaEquipo, {}, {}, {}, mongoose.Document<unknown, {}, IPlantillaEquipo, {}, {}> & IPlantillaEquipo & {
    _id: Types.ObjectId;
} & {
    __v: number;
}, any>;
