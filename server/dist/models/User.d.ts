import { type Document, Types, Model } from "mongoose";
export interface IExternalProject {
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
     * esquema ROTATIVO son los días ENTRE los que rota, y pueden ser más que las jornadas. Sin el
     * flag, «trabaja 3 días rotando entre 6» se leería como «trabaja 6 días».
     */
    dias_semana?: number[];
    dias_rotativos?: boolean;
    sueldo_jornada: number;
    sueldo_mano: number;
    sueldo_mano_texto: string;
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
}
export interface IUserMetadata {
    id?: number;
    nombre?: string;
    apellido?: string;
    generoId?: number | null;
    tipoDocumentoId?: number;
    documento?: string;
    cuit?: string;
    /**
     * Cuándo se tomó el nombre del Padrón de ARCA como el bueno.
     *
     * Es lo que habilita el tilde verde al lado del nombre: no dice «alguien lo revisó», dice «esto
     * es literalmente lo que ARCA tiene registrado para este CUIT». Por eso se sella aunque el nombre
     * ya coincidiera — el valor del sello es la confirmación contra el organismo, no el cambio.
     *
     * NO está en `USER_FRAME_WHITELIST` a propósito: FRAME no tiene nada que decir sobre esto.
     */
    nombreValidadoArcaAt?: Date;
    /** La persona NO tiene CUIT/CUIL argentino (típicamente extranjeros). Se declara explícitamente
     *  al darla de alta: es distinto de "todavía no se cargó", y es lo que habilita el circuito de
     *  documentos sin pasar por AFIP (ver routes/afip.ts → habilitar-firma). */
    sinCuit?: boolean;
    estadoCivil?: string | null;
    calle?: string;
    altura?: string;
    pisoDepto?: string | null;
    codigoPostal?: string | null;
    localidad?: string | null;
    paisId?: number;
    nacionalidadId?: number;
    /**
     * Argentino/a por naturalización, no nativo/a. Solo tiene sentido cuando `nacionalidadId` es
     * Argentina: es lo que distingue a un argentino de toda la vida (CUIL automático desde el DNI) de
     * alguien que se naturalizó (puede estar en trámite y no tenerlo todavía). Ver `esCuilObligatorio`
     * en el frontend (`utils/nacionalidadDocumento.ts`), que es la única lógica que lee este campo.
     */
    nacionalizado?: boolean;
    /** País de nacimiento, solo para quien se declaró `nacionalizado`: alguien nativo nació acá y no
     *  hace falta preguntarlo; un extranjero no nacionalizado ya lo dice con la nacionalidad. */
    paisNacimientoId?: number;
    nivelEstudioId?: number;
    osId?: number | null;
    osPrepaga?: boolean | null;
    fechaNac?: string;
    fechaAlta?: string;
    telefono?: string;
    activo?: boolean;
    /** Tipo de entidad financiera: "banco" | "billetera_virtual" | "compania_financiera" | "caja_credito" | "sin_banco". */
    tipoEntidadFinanciera?: string | null;
    /** Si eligió "No tengo Banco" y pidió que le creen una cuenta. */
    solicitaCreacionCuenta?: boolean | null;
    /** Confirmación de que la cuenta fue creada y los datos cargados (plataforma + banco). */
    cuentaBancariaConfirmada?: boolean | null;
    cuentaBancariaConfirmadaAt?: Date | null;
    /** El usuario solicitó (vía pedido aprobado) un cambio de datos bancarios, pendiente de aplicar en FRAME. */
    solicitaCambioCuenta?: boolean | null;
    /** Confirmación de que el cambio de datos bancarios fue aplicado en el banco/FRAME. */
    cambioCuentaConfirmada?: boolean | null;
    cambioCuentaConfirmadaAt?: Date | null;
    bancoId?: number | null;
    cbu?: string | null;
    tipoDeCuentaBancaria?: string | null;
    nroDeCuentaBancaria?: string | null;
    aliasBancario?: string | null;
    email?: string;
    estadoId?: number | null;
    inHouse?: boolean | null;
    numeroLegajoTango?: string | null;
    afiliadoAlSindicato?: boolean | null;
    /**
     * A qué sindicato/s está afiliado/a. Guarda los `_id` del catálogo `Sindicato`.
     *
     * Es una LISTA y no uno solo: quien trabaja en más de una actividad puede estar afiliado a más de
     * un gremio a la vez (el caso típico es técnica y actuación), y forzar uno obligaría a elegir cuál
     * declarar. Vacío = no se eligió ninguno todavía.
     *
     * Solo tiene sentido con `afiliadoAlSindicato` en true, y se vacía cuando se apaga: gremios
     * colgados de alguien que declaró no estar afiliado no significan nada y se leen como una
     * contradicción. La afiliación es voluntaria y NO se deduce del convenio (ver `models/Sindicato.ts`).
     */
    sindicatoIds?: string[] | null;
    rutaImagen?: string | null;
    bancoReceptor?: string | null;
    swift?: string | null;
    informacionBancariaAdicional?: string | null;
    projects?: Types.ObjectId[] | IExternalProject[] | any[];
    fullName?: string;
    categoriaSatId?: string;
    startDate?: string;
    dueDate?: string;
    workdaysCount?: number;
    /** Días de la semana de la solicitud (0=domingo…6=sábado). Ver `dias_semana` del contrato. */
    diasSemana?: number[];
    diasRotativos?: boolean;
    schedule?: string;
    dailyRate?: number;
    isReplacement?: boolean;
    /** true mientras el registro NO es un usuario real (pendiente/rechazada/cancelada). */
    isSolicitud?: boolean;
    /** Ciclo de vida de la solicitud de alta (espeja los estados de un Pedido). */
    solicitudStatus?: "pendiente" | "aprobada" | "rechazada" | "cancelada";
    /**
     * Usuario REAL al que corresponde esta solicitud, cuando se pidió el alta de alguien que ya existe
     * en el sistema. Con esto la solicitud se muestra dentro de la ficha de esa persona en vez de
     * generar una tarjeta duplicada. Vacío = alta de alguien que todavía no es usuario.
     */
    solicitudUserId?: Types.ObjectId;
    projectIds?: Types.ObjectId[];
    rolesFrameIds?: string[] | Types.ObjectId[];
}
export interface IUser extends Document {
    email: string;
    password: string;
    roles: Types.ObjectId[];
    clientIds: Types.ObjectId[];
    projectIds: Types.ObjectId[];
    tenantId: Types.ObjectId;
    firstName?: string;
    lastName?: string;
    lastLoginAt?: Date;
    hireDate: Date;
    extraVacationDays: number;
    carryOverVacationDays: number;
    createdAt: Date;
    updatedAt: Date;
    vacationDays: {
        lawDays: number;
        extraDays: number;
        carryOverDays: number;
        totalDays: number;
    };
    seniorityAtEndOfYear: number;
    isSystem: boolean;
    comparePassword(candidatePassword: string): Promise<boolean>;
    closeYear(maxDiasArrastre?: number): Promise<void>;
    name: string;
    metadata?: IUserMetadata;
}
export declare const User: Model<IUser>;
