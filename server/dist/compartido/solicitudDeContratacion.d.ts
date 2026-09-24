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
    areaShiftAssignments: {
        areaId: string;
        shiftIds: string[];
    }[];
    esRenovacion?: boolean;
    renovacionDe?: {
        userProjectId: string;
        fechaBajaContrato: string;
    };
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
export declare function armarPayloadDeSolicitud(d: DatosSolicitud, opciones?: OpcionesPayload): {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    hireDate: string;
    metadata: {
        fullName: string;
        projectIds: string[];
        solicitudUserId: string;
        roles_frame: string[];
        categoriaSatId: string;
        startDate: string;
        dueDate: string;
        workdaysCount: number;
        workdaysCalculated: number;
        workdaysOverridden: boolean;
        workdaysOverrideReason: string;
        workdaysOverrideNote: string;
        diasPorSemana: number;
        diasSemana: number[];
        diasRotativos: boolean;
        fechasTrabajadas: string[];
        schedule: string;
        empresaContratoId: string;
        convenioId: string;
        dailyRate: number;
        isReplacement: boolean;
        empleado_id_reemplezado: string | number;
        replacedUserId: string;
        motivoReemplazoId: string;
        comentarios: string;
        tipoImpositivo: string;
        contratoId: string;
        nombre_contrato: string;
        areaShiftAssignments: {
            areaId: string;
            shiftIds: string[];
        }[];
        esRenovacion: true;
        renovacionDe: {
            userProjectId: string;
            fechaBajaContrato: string;
        };
        isSolicitud: true;
    };
};
export type PayloadDeSolicitud = ReturnType<typeof armarPayloadDeSolicitud>;
