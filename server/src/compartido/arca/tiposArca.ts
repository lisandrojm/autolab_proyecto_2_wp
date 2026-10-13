/**
 * LOS TIPOS QUE USA EL GENERADOR DEL REGISTRO DE ALTA, compartidos entre el frontend y el servidor.
 *
 * Vivían en `frontend/src/api/*`. Se mudaron acá el 10/10/2026 junto con el generador
 * (`afipCompleteness`, `afipTxt`, `afipTxt85`): la presentación automática de las 14 h corre en el
 * servidor y tiene que armar EXACTAMENTE el mismo registro que arma la pantalla. Los `api/*` del
 * frontend los reexportan, así que el resto de la aplicación no cambió sus imports.
 */
import type { EstadoCategoriaArca } from "../catalogoArca.js";

/** Un documento de respaldo del flujo "Sin CUIT" (extranjeros con el trámite de ARCA pendiente). */
export interface SinCuitDocumento {
  tipo: "pasaporte" | "dni_precario" | "residencia_tramite" | "cuil_provisorio" | "otro";
  numero: string;
  archivoUrl?: string;
  archivoNombre?: string;
  observaciones?: string;
  cargadoPorNombre?: string;
  cargadoAt?: string;
}

/** Estado de la validación excepcional del flujo "Sin CUIT" (ver pestaña Sin CUIT de Contratos). */
export interface SinCuitValidacion {
  documentos: SinCuitDocumento[];
  validado?: boolean;
  validadoPorNombre?: string;
  validadoAt?: string;
  /** Cuándo revisar si ya obtuvo CUIL y puede pasar al flujo normal de ARCA ("YYYY-MM-DD"). */
  fechaSeguimiento?: string;
}

export interface AltaArcaPresentada {
  via: "carga_masiva" | "altas_masivas";
  fecha: string;
  /** `presentando`: se marcó antes del «Aceptar» de ARCA y la corrida se cortó sin resultado. */
  resultado: "presentada" | "indeterminado" | "fallida" | "presentando";
  codigoNovedad?: string;
  nroTransaccion?: string;
  motivo?: string;
  /** Altas Masivas por tandas. */
  tanda?: number;
  cat?: string;
  porConsulta?: boolean;
}

export interface ContractOverviewRow {
  _id: string;
  userId: string;
  userName: string;
  /** El nombre es el que ARCA tiene registrado para el CUIT: se tomó del Padrón al validar. */
  userNombreValidadoArca?: boolean;
  userEmail: string;
  userActivo: boolean;
  /** id externo (FRAME) del usuario — para resolver a quién reemplaza otro contrato de la misma página. */
  userExternalId: number | null;
  userRoles: { _id: string; name: string; permissions?: string[] }[];
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  nombreRolFrame: string;
  contractsInProject: number;
  /**
   * Qué decir sobre su renovación: «renovar» (viejo, vencido, sin nada después), «en_proceso» (la
   * renovación recorre el circuito), «renovado» (terminó y no venció) o nada. Ver `estadoDeRenovacion`.
   */
  renovacion?: "renovar" | "en_proceso" | "renovado" | null;
  contractIndex: number;
  nombre_contrato: string;
  nombre_estado_empleado: string;
  nombre_sede: string;
  areaShiftAssignments: { areaId: string | any; shiftIds: (string | any)[] }[];
  reemplazo: boolean;
  empleado_id_reemplezado?: number | null;
  fecha_alta_contrato: string;
  fecha_baja_contrato: string;
  /** Cuándo se cargó el contrato en el sistema: ISO completo o "YYYY-MM-DD" según quién lo creó; vacío en los importados. */
  fecha_carga?: string;
  sueldo_mano?: number;
  cantidad_jornadas_laborales?: number;
  hora_inicio?: string;
  hora_fin?: string;
  // Documentos del contrato ACTIVO, para las columnas de descarga/carga de la tabla de Contratos.
  altaDocumentoUrl?: string;
  altaDocumentoNombre?: string;
  /**
   * Lo que presentó la corrida automática de altas en ARCA. No es el estado del contrato: es la marca
   * que evita presentarlo dos veces. `indeterminado` = hay que mirarlo en ARCA antes de hacer nada.
   */
  altaArcaPresentada?: AltaArcaPresentada | null;
  /** Datos leídos del PDF de la Constancia de CUIT de ARCA ("YYYY-MM-DD"). Vale un mes: la vigencia marca cuándo hay que volver a pedirla. */
  constanciaVigenciaDesde?: string;
  constanciaVigenciaHasta?: string;
  constanciaVerificador?: string;
  /** Resultado de la última consulta al Padrón de ARCA — reemplaza al PDF como fuente de verdad. */
  constanciaAfipEstado?: "activo" | "inactivo" | "desconocido" | "";
  constanciaAfipConsultadaAt?: string;
  /** Recién con esto el trámite se considera terminado (ver ConstanciaBulk.tsx estadoConstancia). */
  constanciaAfipDropboxSubidaAt?: string;
  /** "Firma Digital": Contrato y Release(s) se generan con botones independientes; enviados a firmar
   *  (paso 2, "Enviar a firmar") recién cuando ambos están generados. */
  firmaContratoUrl?: string;
  firmaContratoNombre?: string;
  firmaReleases?: { releaseId: string; nombre: string; url: string }[];
  firmaGeneradoAt?: string;
  firmaReleasesGeneradoAt?: string;
  firmaEnviadaAt?: string;
  /** Contrato custom / Release custom: el texto escrito para este trámite (ver compartido/textoCustom.ts). */
  contenidoCustomContrato?: string;
  contenidoCustomReleases?: { releaseId: string; content: string }[];
  empresaContratoId?: string;
  empresaReleaseId?: string;
  nombre_empresa_contrato?: string;
  nombre_empresa_release?: string;
  /** La empresa del release no la eligió nadie: el proyecto tiene una sola y viene puesta. No se puede quitar. */
  empresaReleaseDelProyecto?: boolean;
  /** Empresas del proyecto (con fallback a las del ABM) para el menú "Descargar con:". */
  contratoEmpresas?: { id: string; label: string }[];
  releaseEmpresas?: { id: string; label: string }[];
  // FKs para el chequeo de completitud ARCA (se resuelven contra los catálogos en el front).
  cuit?: string;
  /** La persona declaró NO tener CUIT/CUIL argentino: va por el circuito "Sin CUIT", no por ARCA. */
  sinCuit?: boolean;
  /** Flujo "Sin CUIT": documentación de respaldo cargada + OK manual de quien revisa. */
  sinCuitValidacion?: SinCuitValidacion | null;
  /**
   * Identidad del contrato dentro del member. Se usa para direccionarlo en los PATCH sin depender del
   * índice: la posición cambia sola si se borra otro contrato mientras la pantalla está abierta.
   */
  contratoId?: string;
  /**
   * Obra social de ESTE contrato (RNOS), no de la persona: ARCA la declara por alta (pos. 40-45) y
   * caduca sola por desregulación. Vacío no es un faltante — significa que se aplica la del convenio.
   */
  osId?: number | null;
  /** De dónde salió `osId`. Vacío = no está fijada en el contrato y la resuelve la cascada. */
  obraSocialOrigen?: "constatada" | "manual" | "heredada-usuario" | "";
  /**
   * Dónde se constató. La FUENTE es el padrón de beneficiarios de la SSS (declaración jurada de cada
   * obra social, consulta de solo lectura); ARCA queda como desempate, porque lo que precompleta
   * viene de relaciones laborales anteriores y puede estar atrasado.
   */
  obraSocialConstatadaEn?: "sss" | "arca" | "";
  /** Cuándo se constató (solo con origen `constatada`). */
  obraSocialConstatadaEl?: string;
  /**
   * Se consultó el padrón de la SSS y la persona NO figura afiliada. Es una respuesta, no un vacío:
   * el contrato queda constatado y usa la obra social del convenio.
   */
  obraSocialNoFigura?: boolean;
  /** Lo devolvió ARCA: el campo va en modo lectura y el server rechaza sobrescribirlo (409). */
  obraSocialBloqueada?: boolean;
  /** La función con la que se contrató: de ella sale la valoración de cada categoría. */
  rol_frame_id?: number | null;
  categoria_sat_id?: number | null;
  sede_id?: number | null;
  tipo_contrato_id?: number | null;
  /**
   * Sucursal del padrón de ARCA (domicilio de desempeño) con la que se declara este contrato. Se
   * elige entre las asignadas a su empresa empleadora. No tiene relación con `sede_id`.
   */
  sucursalArcaId?: string | null;
  /**
   * Actividad del domicilio elegida para ESTE contrato. Solo hace falta cuando la sucursal tiene más
   * de una actividad declarada; con una sola, el contrato la hereda y este campo queda vacío.
   */
  actividadArca?: string | null;
  /** Puesto desempeñado elegido en ESTE contrato (registro de 85). Vacío = hereda el que le toca por defecto. */
  puestoDesempenado?: string | null;
}

export interface CategoriaSatItem {
  _id: string;
  externalId: string;
  name: string;
  /**
   * `false` = resuelve pero no se elige. Son alias que existen para que contratos históricos
   * encuentren su sueldo y su código ARCA, y no deben ofrecerse al cargar un contrato nuevo.
   * El listado las trae SIEMPRE: filtrar es responsabilidad de cada selector, nunca de la
   * resolución (si el TXT las filtrara, esos contratos saldrían sin sueldo). Usar `esElegible`.
   */
  isActive?: boolean;
  data: {
    id: number;
    numeroCategoria: number;
    sueldoBruto: number;
    sueldoBrutoLetras: string;
    neto: number;
    sueldoNetoLetras: string;
    fechaActualizacion: string;
    /** Numérico, por compatibilidad: pierde los ceros a la izquierda (35283, no "035283"). */
    codigoAfip: number;
    /**
     * El MISMO código, canónico: 6 dígitos con ceros a la izquierda, tal como lo escribe ARCA.
     * Es lo que hay que mostrar; `codigoAfip` queda para los consumidores que esperan un número.
     */
    codigoArca?: string;
    /**
     * Código de CCT al que pertenece la categoría ("0131/75"). NO va al TXT: se usa para validar
     * que la categoría sea de un convenio habilitado para la empleadora del contrato.
     */
    convenio?: string;
    /**
     * Código de puesto desempeñado de ARCA (4 díg.). Solo lo informa el registro de 85 (Altas
     * Masivas); vacío = cae al default de la empleadora / instalación.
     */
    puestoDesempenado?: string;
    /** Lo que ARCA dice HOY de este código (espejo de ARCA). */
    descripcionArca?: string;
    /**
     * El código contra el espejo de ARCA: `ok` / `nombre_distinto` / `grupo_distinto` /
     * `no_existe_en_arca` / `no_vigente`. `null` = espejo sin sembrar (no se sabe, no bloquea).
     */
    estadoArca?: EstadoCategoriaArca | null;
    /** `nombre_distinto` que alguien revisó y confirmó: no bloquea el alta. */
    estadoArcaConfirmada?: boolean;
    presentismo: number;
    sueldoBasico: number;
    sueldoAdicional: number;
    nombre: string;
    /** El grupo salarial del que cuelga, si el convenio tiene grupos. Es donde vive la escala. */
    grupoId?: string | null;
    grupoNombre?: string;
    /** Hasta cuándo rige la escala. Vacío = la paritaria no declaró vencimiento. */
    vigenciaHasta?: string;
    /** De dónde salió la escala: del grupo, de la propia categoría, o de ningún lado. */
    escalaOrigen?: "categoria" | "grupo" | null;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Contrato: el tipo de contrato real (Jornada, Plazo fijo 5x7, Tiempo Indeterminado, ...). Es lo
 * que se elige en el wizard de Agregar/Configurar miembro. Cada Contrato puede tener una o varias
 * Plantillas (ver `api/contratosFrame.ts`) que son el documento PDF en sí.
 */
export interface ContratoItem {
  _id: string;
  name: string;
  data: {
    cantidadJornadas: number;
    multiplicadorDiario: number;
    esTiempoIndeterminado: boolean;
    /**
     * Cómo se eligen las fechas al pedir el alta: un período (`periodo`, el de siempre) o días
     * sueltos pintados en un calendario (`dias`), donde cada día marcado es una jornada.
     */
    modoFechas?: "periodo" | "dias";
    /** Límites de la jornada del tipo de contrato. `null`/ausente = sin límite. */
    horasPorJornada?: number | null;
    diasPorSemana?: number | null;
    /** «Se envía a firmar el contrato». */
    requiereFirma: boolean;
    /** «Se envía a firmar el release» (además del tipo de release). Ausente = sí. */
    requiereFirmaRelease?: boolean;
    /** «Se envía a firmar el alta de ARCA» (sólo con alta temprana). Ausente = sí. */
    requiereFirmaAlta?: boolean;
    /** Códigos ARCA para el TXT de Alta masiva (específicos de convenio/modalidad). */
    afipModalidadContrato?: string;
    afipTipoServicio?: string;
    afipActividad?: string;
    afipModalidadLiquidacion?: string;
    /** Si genera alta temprana ante ARCA. `false` = no es relación laboral (ej. locación de servicios). */
    generaAlta?: boolean;
  };
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SimpleCatalogItem {
  _id: string;
  externalId: string;
  name: string;
  data?: { id?: number; nombre?: string };
  createdAt?: string;
  updatedAt?: string;
  // Campos extra opcionales por catálogo (ej. Bancos → tipoEntidad).
  [key: string]: unknown;
}

export interface InfoItem {
  _id: string;
  externalId: string;
  type: string;
  data: {
    id: number;
    nombre: string;
    /** Estados: color del texto del badge (el fondo es ese color con transparencia). */
    color?: string;
    /** Estados: tipos de contrato (contratos-frame) en los que se ofrece. Vacío = todos. */
    contratoFrameIds?: string[];
    /** Estados: marca los de índole impositiva, para darles un tratamiento distinto. */
    esImpositivo?: boolean;
    /** Estados impositivos: texto del badge secundario que se muestra en las tarjetas de Contrato. */
    etiquetaSecundaria?: string;
    /** Estados impositivos: color del badge secundario. */
    colorEtiquetaSecundaria?: string;
    /** Estados impositivos: trámite que representa (excluyente). */
    tipoImpositivo?: "alta_temprana_afip" | "constancia_cuit";
    /** Estado creado por el sistema: se puede editar, pero no eliminar. */
    esSistema?: boolean;
    /** El estado admite personas SIN CUIT/CUIL argentino (badge "Sin CUIT" en vez del trámite). */
    aceptaSinCuit?: boolean;
    /** Estados: orden visual en el ABM y en el dropdown del wizard (guía, no bloquea transiciones). */
    orden?: number;
    /** Estados: paso del flujo de dependencias (alternativas comparten número). Ausente = fuera del flujo. */
    ordenDependencia?: number;
    /** Estados: transición automática hacia ESTE estado cuando aparece un archivo en una carpeta de
     *  Dropbox. Requiere `ordenDependencia`. */
    /** Transición automática hacia ESTE estado cuando aparece un archivo en CUALQUIERA de estas
     *  carpetas de Dropbox. Requiere `ordenDependencia`. */
    transicionAutomatica?: {
      evento: "dropbox_carpeta";
      carpetas: {
        dropboxCarpeta: string;
        /**
     * PARA QUÉ SIRVE esta carpeta. Es lo que usa el server para resolverla, en vez de su nombre.
     *
     * `string` y no un union: la lista de valores vive en el server (`utils/propositosCarpeta.ts`)
     * y llega por `GET /info/propositos-carpeta`. Declarar acá un union sería una copia de esa
     * lista que hay que acordarse de mantener sincronizada — la segunda verdad que evitamos.
     *
     * Vacío = carpeta sin migrar: el server la resuelve por su nombre y lo registra.
     */
    proposito?: string;
    /** Nota libre de quien la configuró (ej. qué significa esta carpeta puntual en su flujo). */
        detalle?: string;
      }[];
    };
    [key: string]: any;
  };
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Catálogo de Sucursales del padrón de ARCA (Simplificación Registral).
 *
 * No confundir con Sedes: la Sede es el lugar de trabajo con el que opera el sistema; la Sucursal es
 * una entidad del padrón de ARCA con su código, domicilio y actividades. Las empresas no cargan
 * estos datos, solo eligen cuáles les corresponden.
 */
export interface ArcaSucursalActividad {
  /** Código de actividad de 6 dígitos (pos. 79-84 del TXT de alta). */
  codigo: string;
  descripcion?: string;
}

export interface ArcaSucursal {
  _id: string;
  /** Código de sucursal de 5 dígitos (pos. 74-78 del TXT de alta). */
  codigo: string;
  /** Domicilio tal como figura en el padrón, ej. "ZAPIOLA 392". */
  domicilio: string;
  localidad?: string;
  codigoPostal?: string;
  actividades: ArcaSucursalActividad[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

