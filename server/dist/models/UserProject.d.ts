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
    /**
     * Sucursal del padrón de ARCA con la que se declara este contrato (pos. 74-78 del TXT de alta).
     *
     * Es independiente de `sede_id`: la Sede es el lugar de trabajo con el que opera el sistema y la
     * Sucursal es una entidad del padrón de ARCA. Se elige entre las sucursales asignadas a la empresa
     * empleadora del contrato (`companies.sucursalIds`).
     */
    sucursalArcaId?: Types.ObjectId | string | null;
    /**
     * Actividad del domicilio de desempeño (pos. 79-84 del TXT de alta de ARCA).
     *
     * Las actividades se declaran por sucursal en el catálogo de Sucursales. Cuando la sucursal tiene
     * UNA sola, el contrato la hereda y esto queda vacío. Cuando tiene varias — ARCA lo permite — hay
     * que elegir cuál declara este contrato, y esa elección va acá.
     */
    actividadArca?: string;
    /**
     * Obra social de ESTE contrato (RNOS, pos. 40-45 del TXT de alta). Guarda el `data.id` del catálogo.
     *
     * Vive en el contrato y no en la persona porque es un dato de la RELACIÓN LABORAL: ARCA lo declara
     * por alta, no por CUIL. Si la misma persona tiene dos contratos en dos empleadoras, salen dos
     * registros y cada uno lleva el suyo. Además caduca solo —por desregulación alguien cambia de obra
     * social sin que la empleadora se entere—, así que un valor guardado en la ficha de la persona se
     * propaga en silencio a todos sus contratos futuros.
     *
     * Vacío es lo normal: significa que no se constató ninguna y que se aplica la del convenio.
     */
    obraSocialId?: number | null;
    /**
     * De dónde salió `obraSocialId`. Es lo que decide si el dato se puede creer:
     *
     *  - `constatada`        se verificó contra el padrón (ver `obraSocialConstatadaEn`). Gana siempre.
     *  - `manual`            la cargó alguien a mano como excepción.
     *  - `heredada-usuario`  viene del campo viejo de la persona, sin fecha ni verificación. Es el
     *                        origen que deja la migración, y el que hay que ir limpiando.
     *
     * Cuando está vacío, la obra social no está fijada en el contrato y se resuelve por la cascada
     * (convenio → excepción de la empresa → excluidos de convenio). Esos orígenes NO se persisten:
     * son el resultado de una configuración que puede cambiar, y congelarlos sería volver a tener dos
     * fuentes para el mismo dato.
     */
    obraSocialOrigen?: "constatada" | "manual" | "heredada-usuario";
    /**
     * Dónde se constató. La FUENTE es el Padrón de Beneficiarios de la Superintendencia de Servicios
     * de Salud (SSS): lo actualiza cada obra social con carácter de declaración jurada, la consulta es
     * de solo lectura y no exige estar logueado con el CUIT de la empleadora.
     *
     * ARCA queda como DESEMPATE, no como fuente: lo que precompleta en su pantalla de altas es lo que
     * ÉL tiene registrado para ese CUIL —viene de relaciones laborales anteriores— y puede estar
     * atrasado respecto de una opción de cambio. Además esa pantalla es un formulario de alta: se
     * entra a mirar y se queda a un click de registrar algo.
     */
    obraSocialConstatadaEn?: "sss" | "arca";
    /** Cuándo se constató. Solo con `obraSocialOrigen: "constatada"`. */
    obraSocialConstatadaEl?: Date | null;
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
