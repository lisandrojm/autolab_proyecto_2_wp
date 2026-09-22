import { Document, Types, Model } from "mongoose";
export interface IProjectMetadata {
    id: number;
    nombre: string;
    descripcion: string;
    responsableId: number;
    clienteId: number;
    fechaInicio: string;
    fechaFin: string;
    fechaAlta: string;
    sedeId: number;
    activo: boolean;
    centroCostoId: number;
    /**
     * DE QUÉ EMPRESA DE TANGO es ese centro de costo.
     *
     * SIN ESTO EL `centroCostoId` ES AMBIGUO, y no en teoría: el catálogo son cuatro empresas de Tango
     * con numeraciones propias, así que el id 656 es el código «720» en FZERO CORP y el «662» en otra.
     * Un proyecto que había elegido 720 mostraba 662, porque la resolución tomaba la primera fila con
     * ese id. Guardando la empresa, el par (empresa, id) identifica un solo centro.
     *
     * Es el id de TANGO y no el `_id` de la empresa de la plataforma: FZERO CORP —la entidad de EE.UU.—
     * tiene catálogo en Tango y no tiene ficha acá (ver `CentroCosto.empresaTangoId`).
     */
    centroCostoEmpresaTangoId?: number;
    /**
     * DE DÓNDE SALIÓ ese `centroCostoId`: "tango" = lo puso la migración del catálogo.
     *
     * Es el resguardo que hace idempotente el remapeo (ver `services/centrosCostoImport.ts`): los ids
     * viejos del catálogo (1–46) también son ids válidos del catálogo de Tango, así que sin esta marca
     * una segunda corrida volvería a mover proyectos que ya estaban bien.
     *
     * TIENE QUE ESTAR DECLARADO ACÁ. Mongoose es `strict`: un campo que no está en el schema se
     * DESCARTA EN SILENCIO y el update contesta OK. La primera corrida de la migración guardó los
     * `centroCostoId` nuevos y perdió las 38 marcas por exactamente esto.
     */
    centroCostoOrigen?: string;
}
export interface IWorkScheduleDay {
    startTime: string;
    endTime: string;
    isWorkDay: boolean;
}
export interface IWorkSchedule {
    mode: "weekdays" | "all_week" | "per_day";
    weekdays?: IWorkScheduleDay;
    weekend?: IWorkScheduleDay;
    days?: {
        monday?: IWorkScheduleDay;
        tuesday?: IWorkScheduleDay;
        wednesday?: IWorkScheduleDay;
        thursday?: IWorkScheduleDay;
        friday?: IWorkScheduleDay;
        saturday?: IWorkScheduleDay;
        sunday?: IWorkScheduleDay;
    };
}
export interface IProject extends Document {
    tenantId: Types.ObjectId;
    clientId?: Types.ObjectId;
    contratoEmpresas?: Types.ObjectId[];
    /**
     * LOS CONVENIOS BAJO LOS QUE ESTE PROYECTO CONTRATA.
     *
     * Cuelgan de `contratoEmpresas`: solo pueden ser convenios que alguna de esas empleadoras tenga
     * registrados ante ARCA, porque el organismo únicamente acepta categorías de los CCT que ese CUIT
     * registró. Sacarle una empresa al proyecto se lleva sus convenios.
     *
     * Sirven para acotar el alta: una productora puede tener seis CCT registrados y este proyecto
     * contratar bajo uno. Con la lista cargada, el alta ofrece esa; vacía, ofrece todas las de la
     * empresa — vacío es «todavía no se acotó», no «ninguno».
     */
    convenioIds?: Types.ObjectId[];
    releaseEmpresas?: Types.ObjectId[];
    name: string;
    description?: string;
    status: "active" | "completed" | "on_hold" | "archived";
    startDate?: Date;
    endDate?: Date;
    objectives: string[];
    targetAudience?: string;
    /**
     * EL PRESUPUESTO DEL PROYECTO. Contexto, no criterio.
     *
     * Es un campo NUEVO: hasta acá el repo no guardaba presupuesto en ningún lado. NO decide la
     * valoración — eso lo hace el margen — pero se guarda porque es el número con el que se habla del
     * proyecto y el que da sentido al porcentaje.
     */
    presupuesto?: number | null;
    /** En qué moneda está ese número. Sin esto, comparar presupuestos entre proyectos es adivinar. */
    presupuestoMoneda?: string;
    /**
     * EL MARGEN, EN PORCENTAJE. Es lo que decide la valoración.
     *
     * Un proyecto grande con margen flaco no puede pagar las categorías caras, y uno chico con buen
     * margen sí: el volumen no dice nada sobre lo que se puede pagar.
     *
     * HOY SE CARGA A MANO en la ficha del proyecto. Está previsto que en algún momento lo provea el
     * presupuestador/planificador; cuando eso pase, lo que cambia es quién escribe este campo, no la
     * regla que lo consume (`resolverValoracion`) ni nada de lo que cuelga de ella.
     *
     * Opcional: sin margen cargado el proyecto cae en la valoración por defecto y se contrata como
     * antes.
     */
    margen?: number | null;
    /**
     * La valoración que rige. La calcula `resolverValoracion` a partir del margen, salvo que alguien
     * la haya fijado a mano (ver `valoracionManual`).
     */
    valoracionId?: Types.ObjectId | null;
    /**
     * La valoración la puso una persona, no el cálculo.
     *
     * Existe porque el recálculo automático tiene que poder correr sin pisar una decisión: un proyecto
     * puede ser Oro por acuerdo comercial aunque su margen diga Plata, y que eso se revierta solo
     * al editar cualquier otro campo sería peor que no tener cálculo automático.
     */
    valoracionManual?: boolean;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    assignedUsers: Types.ObjectId[];
    teamConfig?: {
        userId: Types.ObjectId;
        canRegister: boolean;
        useProjectSchedule?: boolean;
        startTime?: string;
        endTime?: string;
        areaId?: Types.ObjectId;
        shiftId?: Types.ObjectId;
        areaShiftAssignments?: {
            areaId: Types.ObjectId;
            shiftIds: Types.ObjectId[];
        }[];
    }[];
    favorite?: boolean;
    vacationConfig?: {
        useGlobalConfig: boolean;
        permiteFraccionadas: boolean;
        minDiasFraccion?: number;
        diasCorridos?: boolean;
    };
    activityLogConfig?: {
        useGlobalConfig: boolean;
        enableFastEntry?: boolean;
        allowsAdditionalStaff?: boolean;
        allowedPastDays?: number;
        schedule?: {
            type: "daily" | "workdays" | "custom";
            days: number[];
        };
    };
    externalId?: number;
    metadata?: IProjectMetadata;
    workSchedule?: IWorkSchedule;
    turnos: Types.ObjectId[];
    areasConfig?: {
        areaId: Types.ObjectId;
        shiftIds: Types.ObjectId[];
    }[];
    coordinatorAssignments?: {
        areaId: Types.ObjectId;
        shiftId: Types.ObjectId;
        userId: Types.ObjectId;
    }[];
}
export declare const Project: Model<IProject>;
