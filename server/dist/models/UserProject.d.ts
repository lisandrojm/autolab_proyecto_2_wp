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
    /**
     * Los días de la semana del contrato (0 = domingo … 6 = sábado).
     *
     * Qué significan depende de `dias_rotativos`: con esquema FIJO son los días que trabaja; con
     * ROTATIVO son los días ENTRE los que rota, y pueden ser más que las jornadas. Sin el flag,
     * «trabaja 3 días rotando entre 6» se leería como «trabaja 6 días».
     */
    /**
     * Cuántos días de la SEMANA trabaja (1 a 7).
     *
     * NO confundir con `cantidad_jornadas_laborales`, que son las jornadas TOTALES del contrato (22,
     * 30…) y es lo que multiplica al sueldo por jornada. Son dos números distintos y por un rato
     * compartieron campo: la pantalla llegó a mostrar «días por semana: 22».
     */
    dias_por_semana?: number;
    dias_semana?: number[];
    dias_rotativos?: boolean;
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
    /**
     * La valoración con la que se contrató, y su nombre COPIADO al momento del alta.
     *
     * Misma convención que `nombre_categoria_sat`: el nombre se congela porque el contrato tiene que
     * poder explicarse a sí mismo años después, aunque la valoración se haya renombrado o apagado.
     * El id queda para cruzar contra la del proyecto y detectar desalineados.
     */
    valoracion_id?: Types.ObjectId | string | null;
    nombre_valoracion?: string;
    /**
     * Por qué se eligió una categoría de OTRA valoración que la del proyecto.
     *
     * El filtro del front es comodidad; la regla la hace cumplir el server, que rechaza con 422 salvo
     * que venga esto. Se guarda quién y cuándo además del motivo: un salteo sin autor es un dato que
     * no se le puede reclamar a nadie, y es exactamente la clase de decisión que después se discute.
     */
    valoracionOverride?: {
        motivo: string;
        por: Types.ObjectId | string;
        at: Date;
    };
    nombre_contrato: string;
    nombre_sede: string;
    nombre_rol_frame: string;
    areaId: Types.ObjectId | string | null;
    shiftId: Types.ObjectId | string | null;
    nombre_area: string;
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
     *  - `constatada`        la devolvió el organismo (ver `obraSocialConstatadaEn`). Gana siempre.
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
     * Dónde se constató.
     *
     *  - `arca`  Simplificación Registral → Relaciones Laborales → Registrar Nuevas Altas: se pone el
     *            CUIL y el organismo precompleta la obra social que tiene registrada. Es la FUENTE
     *            actual, y su respuesta es INMUTABLE (ver el candado en el PATCH de obra-social): ARCA
     *            es quien después valida el alta, así que su valor no se corrige a mano.
     *  - `sss`   Padrón de Beneficiarios de la Superintendencia de Servicios de Salud. Fue la fuente
     *            original y quedó DEPRECADA: obligaba a salir a otro organismo, con otro captcha, para
     *            preguntar lo mismo que ARCA contesta en la pantalla donde el operador igual tiene que
     *            entrar a subir el TXT. Los contratos ya constatados con este valor NO se reescriben —
     *            decían la verdad cuando se guardaron— y se siguen mostrando con su fuente.
     *
     * El trade-off asumido: lo que ARCA precompleta sale de relaciones laborales anteriores y puede
     * estar atrasado frente a una opción de cambio reciente, que la SSS sí reflejaría. Se acepta a
     * cambio de que el trámite sea uno y no dos.
     */
    obraSocialConstatadaEn?: "sss" | "arca";
    /** Cuándo se constató. Con `obraSocialOrigen: "constatada"` o con `obraSocialNoFigura`. */
    obraSocialConstatadaEl?: Date | null;
    /**
     * El valor está FIJO: lo devolvió ARCA y no se edita a mano.
     *
     * Se persiste en vez de derivarse de `obraSocialConstatadaEn === "arca"` porque es una regla de
     * negocio, no una consecuencia: el server lo lee para rechazar cualquier sobrescritura (409) y el
     * cliente lo lee para mostrar el campo en modo lectura. Un flag explícito hace que los dos hablen
     * del mismo dato — derivarlo en cada lado es cómo terminan discrepando.
     *
     * El único camino para cambiar un valor bloqueado es re-constatar en ARCA, que manda `forzar: true`
     * después de una confirmación explícita.
     */
    obraSocialBloqueada?: boolean;
    /**
     * Se consultó y NO hay obra social registrada para esa persona.
     *
     * Es una RESPUESTA, no un vacío: el operador hizo el trabajo —copió el CUIL, lo puso en Registrar
     * Nuevas Altas, miró el resultado— y lo que obtuvo fue nada. Sin poder guardarlo, ese contrato
     * quedaba en ámbar para siempre y se volvía a consultar una y otra vez.
     *
     * Convive con `obraSocialId: null` a propósito: no figurar significa que corresponde la del
     * CONVENIO, así que el id se deja vacío para que la cascada la resuelva y siga siguiendo al
     * convenio si la categoría cambia. Lo que se sella es que la consulta se hizo.
     */
    obraSocialNoFigura?: boolean;
    /**
     * Por dónde entró la constatación: el panel de pegado o el script que opera ARCA.
     *
     * Se guarda junto con quién y cuándo porque el dato queda BLOQUEADO: si alguien lo discute meses
     * después —"esta persona no tiene esta obra social"— la única forma de reconstruir qué pasó es
     * saber de dónde salió. Con el pegado manual bastaba el `El`, porque siempre había alguien
     * mirando; desde que hay un script que aplica por API, no.
     */
    obraSocialAplicadaOrigen?: "panel" | "script";
    /** Quién la aplicó. En el camino automático es el dueño del token que corrió el script. */
    obraSocialAplicadaPor?: Types.ObjectId | null;
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
     * Es exclusivo de esa pestaña: no toca "Alta temprana de ARCA" ni "Constancia de CUIT".
     */
    /**
     * La solicitud de contratación cuya aprobación creó este contrato. Es lo que permite que borrar la
     * solicitud aprobada borre ESTE contrato y no otro de la misma persona en el mismo proyecto. Los
     * contratos aprobados antes de que existiera el campo no lo tienen (ver `contratoDeSolicitud.ts`).
     */
    solicitudId?: Types.ObjectId;
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
}
declare const UserProject: import("mongoose").Model<IUserProject, {}, {}, {}, Document<unknown, {}, IUserProject, {}, {}> & IUserProject & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
export default UserProject;
