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
import { Importes } from "../compartido/jornadas.js";
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
    contrato: {
        modoFechas?: string;
        esTiempoIndeterminado?: boolean;
        multiplicadorDiario?: number | null;
        horasPorJornada?: number | null;
    } | null;
    /** Hay tipos de contrato cargados: sin ninguno, el individual no lo exige. */
    hayContratos: boolean;
    /** Código del CCT del convenio de la plantilla (`Convenio.externalId`). */
    convenioCct: string;
    /** Hay convenios que ofrecer: sin ninguno, el individual no exige convenio. */
    hayConvenios: boolean;
    categorias: Map<string, {
        neto: number;
        convenio: string;
        nombre: string;
    }>;
    personas: Map<string, {
        nombre: string;
        activo: boolean;
        esSolicitud: boolean;
    }>;
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
    totales: {
        personas: number;
        jornadas: number;
        importe: number;
        conErrores: number;
        conAdvertencias: number;
    };
}
export declare const MAX_INTEGRANTES_POR_LOTE = 50;
export declare function planDeLote(plantilla: PlantillaParaPlan, integrantes: IntegranteParaPlan[], contratacion: FechasDeContratacion, puntuales: Record<string, Puntual>, ctx: Contexto): PlanDeLote;
/** Qué impide contratar el lote entero (además de los errores de cada fila). */
export declare function erroresDelLote(plan: PlanDeLote): string[];
