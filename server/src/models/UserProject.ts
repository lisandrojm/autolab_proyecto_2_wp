import { Schema, model, Document, Types } from "mongoose";

// Define interface for a single contract within the project history
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
  nombre_contrato: string;
  nombre_sede: string;
  nombre_rol_frame: string;
  areaId: Types.ObjectId | string | null;
  shiftId: Types.ObjectId | string | null;
  nombre_area: string;
  nombre_turno: string;
  // Empresa (razón social) elegida para el contrato / release de ESTE miembro.
  // Debe ser una de las empresas activadas en el proyecto (project.contratoEmpresas / releaseEmpresas).
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
  // Documento de "Alta" (AFIP o Servicios, según el Estado impositivo vinculado a la Plantilla).
  altaDocumentoUrl?: string;
  altaDocumentoNombre?: string;
  // Datos leídos del PDF de la Constancia de CUIT de ARCA al subirlo (el PDF en sí va en
  // altaDocumentoUrl). La constancia vale un mes, así que la vigencia es la que marca cuándo
  // hay que volver a pedirla.
  constanciaVigenciaDesde?: string; // "YYYY-MM-DD"
  constanciaVigenciaHasta?: string; // "YYYY-MM-DD"
  constanciaVerificador?: string;
  constanciaCargadaAt?: Date;
  // Resultado de consultar el CUIT directo contra el Padrón de AFIP (Consulta Padrón A13) — reemplaza
  // a la constancia en PDF como fuente de verdad de "Constancia de CUIT": si figura activo, alcanza.
  constanciaAfipEstado?: "activo" | "inactivo" | "desconocido";
  constanciaAfipConsultadaAt?: Date;
  constanciaAfipRaw?: any;
  // Recién cuando el resultado de la consulta queda archivado en Dropbox (carpeta "Constancia de
  // cuit") se considera terminado el trámite: es lo que dispara la transición automática de estado
  // (estadoDropboxCronService.ts). constanciaAfipEstado "activo" sin esto todavía no alcanza.
  constanciaAfipDropboxSubidaAt?: Date;
  // Path exacto donde quedó el JSON en Dropbox — para poder armar un link temporal de vista bajo
  // demanda (GET /afip/constancia-link) sin tener que guardar una URL que puede vencer.
  constanciaAfipDropboxPath?: string;
  // Firma Digital: Contrato/Release generados (paso 1, "Generar") — se guardan en disco local hasta
  // que "Enviar a firmar" (paso 2) los sube a la carpeta Outbox de Dropbox. Separado a propósito de
  // "generar" vs "enviar": la empresa se elige al generar, y el usuario quiere poder revisar el PDF
  // (ícono de ojito) antes de mandarlo a firmar. Contrato y Release(s) se generan con botones
  // INDEPENDIENTES (`firmaGeneradoAt` / `firmaReleasesGeneradoAt` por separado) — recién cuando ambos
  // están listos se puede seleccionar la fila para "Enviar a firmar".
  firmaContratoUrl?: string;
  firmaContratoNombre?: string;
  firmaReleases?: { releaseId: string; nombre: string; url: string }[];
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
  projectId: Types.ObjectId; // Reference to the internal Project document
  userId: Types.ObjectId; // Reference to the internal User document
  externalProjectId: number;
  externalEmployeeId: number;
  nombre_proyecto: string;
  nombre_rol_frame: string;
  contracts: IContract[];
  areaId?: Types.ObjectId;
}

const contractSchema = new Schema<IContract>(
  {
    proyecto_id: { type: Number },
    empleado_id: { type: Number },
    estado_id: { type: Number },
    categoria_sat_id: { type: Number },
    fecha_alta_contrato: { type: String },
    fecha_baja_contrato: { type: String },
    tipo_contrato_id: { type: Number },
    cantidad_jornadas_laborales: { type: Number },
    dias_por_semana: { type: Number },
    dias_semana: { type: [Number], default: undefined },
    dias_rotativos: { type: Boolean, default: false },
    sueldo_jornada: { type: Number },
    sueldo_mano: { type: Number },
    sueldo_mano_texto: { type: String },
    sueldo_diario_neto: { type: Number },
    diferencia_diaria_neto: { type: Number },
    sueldo_neto: { type: Number },
    sueldo_bruto: { type: Number },
    reemplazo: { type: Boolean },
    empleado_id_reemplezado: { type: Number },
    observaciones: { type: String },
    sede_id: { type: Number },
    rol_frame_id: { type: Number },
    fecha_inicio_participacion: { type: String },
    fecha_fin_participacion: { type: String },
    hora_inicio: { type: String },
    hora_fin: { type: String },
    calificacion: { type: Number },
    fecha_carga: { type: String },
    puede_renovar_contrato: { type: Boolean },
    nombre_proyecto: { type: String },
    nombre_estado_empleado: { type: String },
    nombre_categoria_sat: { type: String },
    nombre_contrato: { type: String },
    nombre_sede: { type: String },
    nombre_rol_frame: { type: String },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift" },
    nombre_area: { type: String },
    nombre_turno: { type: String },
    empresaContratoId: { type: Schema.Types.ObjectId, ref: "Company" },
    empresaReleaseId: { type: Schema.Types.ObjectId, ref: "Company" },
    nombre_empresa_contrato: { type: String },
    nombre_empresa_release: { type: String },
    sucursalArcaId: { type: Schema.Types.ObjectId, ref: "ArcaSucursal" },
    actividadArca: { type: String },
    // Obra social del contrato: ver el comentario del campo en `IContract`.
    obraSocialId: { type: Number, default: null },
    obraSocialOrigen: { type: String, enum: ["constatada", "manual", "heredada-usuario"] },
    obraSocialConstatadaEn: { type: String, enum: ["sss", "arca"] },
    obraSocialConstatadaEl: { type: Date, default: null },
    obraSocialNoFigura: { type: Boolean, default: false },
    obraSocialBloqueada: { type: Boolean, default: false },
    obraSocialAplicadaOrigen: { type: String, enum: ["panel", "script"] },
    obraSocialAplicadaPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    altaDocumentoUrl: { type: String },
    altaDocumentoNombre: { type: String },
    constanciaVigenciaDesde: { type: String },
    constanciaVigenciaHasta: { type: String },
    constanciaVerificador: { type: String },
    constanciaCargadaAt: { type: Date },
    constanciaAfipEstado: { type: String, enum: ["activo", "inactivo", "desconocido"] },
    constanciaAfipConsultadaAt: { type: Date },
    constanciaAfipRaw: { type: Schema.Types.Mixed },
    constanciaAfipDropboxSubidaAt: { type: Date },
    constanciaAfipDropboxPath: { type: String },
    firmaContratoUrl: { type: String },
    firmaContratoNombre: { type: String },
    firmaReleases: [
      {
        _id: false,
        releaseId: { type: String },
        nombre: { type: String },
        url: { type: String },
      },
    ],
    firmaEmpresaContratoId: { type: Schema.Types.ObjectId, ref: "Company" },
    firmaEmpresaReleaseId: { type: Schema.Types.ObjectId, ref: "Company" },
    firmaGeneradoAt: { type: Date },
    firmaReleasesGeneradoAt: { type: Date },
    firmaEnviadaAt: { type: Date },
    areaShiftAssignments: [
      {
        areaId: { type: Schema.Types.ObjectId, ref: "Area" },
        shiftIds: [{ type: Schema.Types.ObjectId, ref: "Shift" }],
      },
    ],
    sinCuitValidacion: {
      documentos: [
        {
          _id: false,
          tipo: { type: String, enum: ["pasaporte", "dni_precario", "residencia_tramite", "cuil_provisorio", "otro"] },
          numero: { type: String },
          archivoUrl: { type: String },
          archivoNombre: { type: String },
          observaciones: { type: String },
          cargadoPor: { type: Schema.Types.ObjectId, ref: "User" },
          cargadoPorNombre: { type: String },
          cargadoAt: { type: Date },
        },
      ],
      validado: { type: Boolean },
      validadoPor: { type: Schema.Types.ObjectId, ref: "User" },
      validadoPorNombre: { type: String },
      validadoAt: { type: Date },
      fechaSeguimiento: { type: String },
    },
  },
  { _id: false },
); // subdocument, no need for _id usually unless we want addressable contracts

const userProjectSchema = new Schema<IUserProject>(
  {
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    externalProjectId: { type: Number, required: false },
    externalEmployeeId: { type: Number, required: false },
    nombre_proyecto: { type: String }, // User requested convenience field
    nombre_rol_frame: { type: String }, // User requested convenience field
    contracts: [contractSchema],
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
  },
  {
    timestamps: true,
    collection: "users_&_projects",
  },
);

// Index to ensure one document per project per employee (internal IDs)
userProjectSchema.index({ projectId: 1, userId: 1 }, { unique: true });

// Optional index for legacy IDs if they exist
userProjectSchema.index(
  { externalProjectId: 1, externalEmployeeId: 1 },
  { unique: true, sparse: true }
);

const UserProject = model<IUserProject>("UserProject", userProjectSchema);

export default UserProject;
