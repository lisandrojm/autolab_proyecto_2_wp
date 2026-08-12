import { Document, Types } from "mongoose";
interface IContract {
    proyecto_id: number;
    empleado_id: number;
    estado_id: number;
    categoria_sat_id: number;
    fecha_alta_contrato: string;
    fecha_baja_contrato: string;
    tipo_contrato_id: number;
    cantidad_jornadas_laborales: number;
    sueldo_jornada: number;
    sueldo_mano: number;
    sueldo_mano_texto: string;
    sueldo_diario_neto: number;
    diferencia_diaria_neto: number;
    sueldo_neto: number;
    sueldo_bruto: number;
    reemplazo: boolean | null;
    empleado_id_reemplezado: number | null;
    observaciones: string;
    sede_id: number;
    rol_frame_id: number;
    fecha_inicio_participacion: string | null;
    fecha_fin_participacion: string | null;
    hora_inicio: string;
    hora_fin: string;
    calificacion: number | null;
    fecha_carga: string;
    puede_renovar_contrato: boolean;
    nombre_proyecto: string;
    nombre_estado_empleado: string;
    nombre_categoria_sat: string;
    nombre_contrato: string;
    nombre_sede: string;
    nombre_rol_frame: string;
    areaId: Types.ObjectId | string | null;
    positionId: Types.ObjectId | string | null;
    levelId: Types.ObjectId | string | null;
    shiftId: Types.ObjectId | string | null;
    nombre_area: string;
    nombre_cargo: string;
    nombre_nivel: string;
    nombre_turno: string;
    empresaContratoId?: Types.ObjectId | string | null;
    empresaReleaseId?: Types.ObjectId | string | null;
    nombre_empresa_contrato?: string;
    nombre_empresa_release?: string;
    altaDocumentoUrl?: string;
    altaDocumentoNombre?: string;
    constanciaVigenciaDesde?: string;
    constanciaVigenciaHasta?: string;
    constanciaVerificador?: string;
    constanciaCargadaAt?: Date;
    constanciaAfipEstado?: "activo" | "inactivo" | "desconocido";
    constanciaAfipConsultadaAt?: Date;
    constanciaAfipRaw?: any;
    constanciaAfipDropboxSubidaAt?: Date;
    constanciaAfipDropboxPath?: string;
    firmaContratoUrl?: string;
    firmaContratoNombre?: string;
    firmaReleases?: {
        releaseId: string;
        nombre: string;
        url: string;
    }[];
    firmaEmpresaContratoId?: Types.ObjectId | string | null;
    firmaEmpresaReleaseId?: Types.ObjectId | string | null;
    firmaGeneradoAt?: Date;
    firmaReleasesGeneradoAt?: Date;
    firmaEnviadaAt?: Date;
    areaShiftAssignments?: {
        areaId: Types.ObjectId | string;
        shiftIds: (Types.ObjectId | string)[];
    }[];
    /**
     * Flujo "Sin CUIT" (personas extranjeras que todavía no tienen CUIT/CUIL argentino). El trámite de
     * AFIP/ANSES no está descartado: queda PENDIENTE hasta que la persona cuente con la documentación
     * migratoria necesaria (DNI precario, residencia en trámite, etc.). Mientras tanto se avanza con el
     * contrato de forma excepcional, respaldado por la documentación que se carga acá.
     *
     * Es exclusivo de esa pestaña: no toca "Alta temprana de AFIP" ni "Constancia de CUIT".
     */
    sinCuitValidacion?: {
        /** Documentación de respaldo cargada. Hace falta al menos una para poder marcar `validado`. */
        documentos: {
            tipo: "pasaporte" | "dni_precario" | "residencia_tramite" | "cuil_provisorio" | "otro";
            numero: string;
            archivoUrl?: string;
            archivoNombre?: string;
            observaciones?: string;
            /** Quién cargó el respaldo (se completa en el server, no llega del cliente). */
            cargadoPor?: Types.ObjectId | string;
            cargadoPorNombre?: string;
            cargadoAt?: Date;
        }[];
        /** OK manual de quien revisa: habilita "Enviar a Generar Documentos". */
        validado?: boolean;
        validadoPor?: Types.ObjectId | string;
        validadoPorNombre?: string;
        validadoAt?: Date;
        /** Cuándo volver a revisar si ya obtuvo CUIL y puede pasar al flujo normal de AFIP ("YYYY-MM-DD"). */
        fechaSeguimiento?: string;
    };
}
export interface IUserProject extends Document {
    projectId: Types.ObjectId;
    userId: Types.ObjectId;
    externalProjectId: number;
    externalEmployeeId: number;
    nombre_proyecto: string;
    nombre_rol_frame: string;
    contracts: IContract[];
    areaId?: Types.ObjectId;
    positionId?: Types.ObjectId;
    levelId?: Types.ObjectId;
}
declare const UserProject: import("mongoose").Model<IUserProject, {}, {}, {}, Document<unknown, {}, IUserProject, {}, {}> & IUserProject & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default UserProject;
