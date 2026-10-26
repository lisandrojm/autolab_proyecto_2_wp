import axios from "./axiosConfig";

/**
 * Configuración de la casilla que recibe las copias de "documento enviado" de Dropbox Sign.
 * La contraseña nunca viaja de vuelta: el server solo informa si hay una guardada.
 */
export interface DropboxSignConfig {
  email: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  tienePassword: boolean;
  enabled: boolean;
  configuredAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckDetalle: string;
  /** Última «Probar conexión» de la casilla. */
  conexionAt: string | null;
  conexionOk: boolean | null;
  conexionDetalle: string;
  /** Rescatar del email los firmados que la integración de Dropbox no depositó. */
  rescatarFirmados: boolean;
  ultimoRescate: { at: string; archivos: number } | null;
  /** Cuántos firmados entraron por el rescate desde el email, en total (registro permanente). */
  totalRescatados: number;
  /** Historial de lecturas, de la más reciente a la más vieja. Lo muestra el modal de Logs. */
  lastCheckHistorial: CorridaLog[];
}

/** Una corrida de la lectura, con todo lo que decidió. */
export interface CorridaLog {
  at: string;
  ok: boolean;
  detalle?: string;
  logs?: LineaLog[];
}

/** Una línea del log: qué se decidió para un aviso y por qué. */
export interface LineaLog {
  resultado: "archivado" | "duplicado" | "sin-archivo" | "ignorado" | "error" | "firmado-rescatado" | "firmado-ya-estaba" | "firmado-sin-adjunto";
  asunto?: string;
  archivo?: string;
  cuit?: string;
  documento?: string;
  detalle?: string;
}

/** Una fila del registro permanente de firmados rescatados desde el email. */
export interface FirmadoRescatado {
  _id: string;
  codigo: string;
  archivo: string;
  path: string;
  carpeta: string;
  titulo: string;
  asunto: string;
  firmante: string;
  cuit: string;
  uid: number | null;
  bytes: number;
  rescatadoEl: string;
  veces: number;
}
export interface PaginaRescatados {
  total: number;
  totalTenant: number;
  pagina: number;
  porPagina: number;
  filas: FirmadoRescatado[];
}

export interface DropboxSignConfigPayload {
  email: string;
  imapHost: string;
  imapPort?: number;
  imapSecure?: boolean;
  imapUser?: string;
  /** Solo se manda cuando se quiere cambiar; vacío conserva la guardada. */
  imapPassword?: string;
  enabled?: boolean;
  rescatarFirmados?: boolean;
}

class DropboxSignAPI {
  async config(): Promise<DropboxSignConfig> {
    const { data } = await axios.get("/dropbox-sign/config");
    return data;
  }

  /** El registro permanente de los firmados rescatados desde el email. */
  async rescates(params: { q?: string; desde?: string; hasta?: string; pagina?: number; porPagina?: number } = {}): Promise<PaginaRescatados> {
    const { data } = await axios.get("/dropbox-sign/rescates", { params });
    return data;
  }
  async save(payload: DropboxSignConfigPayload): Promise<{ ok: boolean; tienePassword: boolean; enabled: boolean }> {
    const { data } = await axios.put("/dropbox-sign/config", payload);
    return data;
  }

  /**
   * Corre la lectura de la casilla ahora mismo. `prueba` solo verifica la conexión y cuenta los
   * avisos sin escribir nada en Dropbox. Puede tardar (conecta por IMAP y sube a Dropbox).
   */
  async leer(prueba = false): Promise<ResultadoLectura> {
    const { data } = await axios.post("/dropbox-sign/leer", { prueba }, { timeout: 120000 });
    return data;
  }
}

/** Resultado de leer la casilla (ver dropboxSignMailService en el server). */
export interface ResultadoLectura {
  ok: boolean;
  detalle: string;
  avisos: number;
  movidos: number;
  /** Salteados porque el documento ya estaba en Pendbox. */
  duplicados: number;
  /** Salteados porque el PDF no aparece en Outbox. */
  sinArchivoEnOutbox: number;
  logs: LineaLog[];
}

/* ═══════════════ El bot de envío automático a la firma (ver server/src/services/dropboxSignBot) ═══════════════ */

export interface BotEnvioConfig {
  activo: boolean;
  tamanoTanda: number;
  intervaloHoras: number;
  topeDiario: number;
  enfriamientoHoras: number;
  horaDesde: number;
  horaHasta: number;
}

/** Última vez que el bot abrió Dropbox Sign: si llegó al listado de documentos y cómo, o por qué no. */
export interface ConexionBot {
  estado: "ok" | "caida";
  probadaAt: string;
  via: "sesion" | "login" | "";
  pantalla: string;
  detalle: string;
  /** Hay una captura de lo que vio el navegador cuando falló (GET /bot/conexion/captura). */
  tieneCaptura?: boolean;
}

/** El login asistido desde la web: el navegador del servidor en pantalla. */
export interface EstadoLoginAsistido {
  estado: "abierto" | "conectado" | "cerrado";
  pantalla: string;
  url: string;
  detalle: string;
  viewport: { width: number; height: number };
  abiertoEl: string | null;
  /** El bot está entrando solo con el usuario y la contraseña guardados. */
  automatico?: boolean;
  jpeg?: string;
}
export type AccionLogin = { tipo: "click"; x: number; y: number } | { tipo: "tipear"; texto: string } | { tipo: "tecla"; tecla: string } | { tipo: "scroll"; dy: number };

export interface BotConfig {
  loginEmail: string;
  tienePassword: boolean;
  tieneSesion: boolean;
  sesionGuardadaAt: string | null;
  ultimoLoginAt: string | null;
  /** La casilla de CC (el correo configurado arriba). */
  cc: string;
  envio: BotEnvioConfig;
  enviadosHoy: number;
  cupoHoy: number;
  enfriadoHasta: string | null;
  ultimaCorridaAt: string | null;
  ultimaCorrida: { arrancadaEl: string; fin: string; resultado: string; enviados: number; errores: number; limite: boolean; enSeco: boolean; total: number; automatica: boolean } | null;
  ultimoError: string | null;
  conexion: ConexionBot | null;
  /** Hay un login asistido abierto en el servidor. */
  loginAsistidoAbierto: boolean;
  proximaCorrida: string;
  /** Cuándo arrancaría la próxima tanda automática (ISO), si el envío automático está activo y hay cola. */
  proximaCorridaAt: string | null;
  corriendo: boolean;
  enSecoForzado: boolean;
}

export interface BotConfigPayload {
  loginEmail?: string;
  /** Sólo cuando se quiere cambiar. */
  loginPassword?: string;
  envio?: Partial<BotEnvioConfig>;
}

export interface BotEvento {
  tipo: string;
  at: string;
  texto: string;
  archivo?: string;
  codigo?: string;
  estado?: string;
}

export interface BotLinea {
  archivo: string;
  codigo: string;
  email: string;
  estado: "enviado" | "error" | "limite" | "requiere_revision" | "seco" | "salteado" | "borrado";
  detalle?: string;
}

export interface BotCorrida {
  hay: boolean;
  corriendo: boolean;
  enSeco?: boolean;
  automatica?: boolean;
  arrancadaEl?: string;
  total?: number;
  enviados?: number;
  errores?: number;
  limite?: boolean;
  irreversible?: boolean;
  detenerPedido?: boolean;
  eventos: BotEvento[];
  lineas?: BotLinea[];
  enSecoForzado: boolean;
  /** El documento que está pasando por Dropbox Sign ahora. */
  actual?: string | null;
  cantidad?: number | null;
}

/*
  REGLAS DE COLOCACIÓN DE LA FIRMA y su verificación visual (22/10/2026). Espejo de
  `server/src/compartido/reglasColocacionFirma.ts` y `services/dropboxSignBot/colocacion.ts`.
  Coordenadas en PUNTOS PDF, con `y` desde arriba.
*/
export type TipoAncla = "derechaDelRotulo" | "sobreRotulo" | "columnaDelFirmante";
export interface AnclaRegla {
  tipo: TipoAncla;
  rotulo: string;
  ocurrencia: "ultima" | "primera";
  excluir: string[];
  offset: { dx: number; dy: number };
}
export type ValidacionRegla = { tipo: "enMitadIzquierda" } | { tipo: "enMitadDerecha" } | { tipo: "lejosDeTexto"; patron: string; distanciaMin: number } | { tipo: "textoCercano"; patron: string; distanciaMax: number };
export interface ReglaColocacion {
  tipo: string;
  patronNombre: string;
  estado: "activo" | "pendiente";
  motivoPendiente?: string;
  pagina: "primera" | "ultima" | "cualquiera";
  anclas: AnclaRegla[];
  ocr: { desde: number; hasta: number } | null;
  campo: { alto: number; anchoFijo: number };
  validaciones: ValidacionRegla[];
  descripcion: string;
}
export interface ReglasColocacion {
  reglas: ReglaColocacion[];
  /** Hay una copia editada guardada; si no, rige el catálogo de fábrica. */
  personalizadas: boolean;
  actualizadasAt: string | null;
  catalogo: ReglaColocacion[];
  tiposAncla: Record<TipoAncla, string>;
}
export interface RectPdf {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface CandidatoAncla {
  /** Base 1. */
  pagina: number;
  paginaIndex: number;
  texto: string;
  renglon: string;
  rect: RectPdf;
  fuente: "texto" | "ocr";
  ancla: TipoAncla;
  rotulo: string;
  /** Sólo en los descartados. */
  motivo?: string;
}
export interface ColocacionResuelta {
  tipo: string;
  pagina: "primera" | "ultima" | "otra";
  paginaIndex: number;
  tamanoPagina: { ancho: number; alto: number };
  campo: RectPdf;
  puntoPdf: { x: number; y: number };
  rectEsperado: RectPdf;
  linea: RectPdf | null;
  descripcion: string;
  nota: string;
  /** «plantilla» = la posición la declaró la plantilla al generar el documento ({{firma}}). Ausente = por regla. */
  origen?: "plantilla" | "ancla";
}
export type DeteccionColocacion =
  | { ok: true; colocacion: ColocacionResuelta; ancla: CandidatoAncla; descartados: CandidatoAncla[] }
  | { ok: false; motivo: string; descartados: CandidatoAncla[]; paginaIndex: number | null; tamanoPagina: { ancho: number; alto: number } | null };
export interface PrevisualizacionColocacion {
  archivo: string;
  codigo: string;
  tipo: string | null;
  regla: { tipo: string; descripcion: string; pagina: string } | null;
  firmante: { nombre: string; email: string } | null;
  motivoSinFirmante?: string;
  deteccion: DeteccionColocacion;
  pagina: { numero: number; total: number; ancho: number; alto: number };
  imagen: { base64: string; ancho: number; alto: number };
  ocrMs: number;
  /** «plantilla» = posición declarada por la plantilla; «ancla» = por regla (servidores anteriores al 25/10/2026 no lo mandan). */
  origen?: "plantilla" | "ancla";
  avisos?: string[];
}
/** La última detección guardada en el registro de un archivo (el ✓/✗ de la cola y del tab). */
export interface ResumenColocacion {
  verificadaAt: string;
  ok: boolean;
  pagina: number | null;
  rotulo: string;
  fuente: string;
  motivo: string;
  campo: RectPdf | null;
  descartados: number;
  origen?: "plantilla" | "ancla";
  /** Por qué ya no es el estado actual (el PDF cambió, las reglas o la plantilla). Vacío o ausente = vigente. */
  desactualizado?: string[];
}
export type AlcanceVerificacion = "cola" | "revision" | "cola_y_revision" | "outbox";
export interface ResultadoVerificado {
  archivo: string;
  codigo: string;
  tipo: string | null;
  estado: string;
  firmante: string;
  ok: boolean;
  pagina: number | null;
  rotulo: string;
  fuente: string;
  motivo: string;
  ms: number;
  verificadaAt?: string;
  origen?: "plantilla" | "ancla";
}
export interface Verificacion {
  hay: boolean;
  corriendo: boolean;
  alcance?: AlcanceVerificacion;
  arrancadaEl?: string;
  terminadaEl?: string | null;
  total?: number;
  hechos?: number;
  enviables?: number;
  noEnviables?: number;
  actual?: string | null;
  resultados?: ResultadoVerificado[];
  porMotivo?: Record<string, number>;
  error?: string | null;
  detenerPedido?: boolean;
}

export interface BotItemCola {
  archivo: string;
  codigo: string;
  tipo: string;
  email: string;
  firmante: string;
  orden: number;
  colocacion?: ResumenColocacion | null;
  /** Cuándo saldría según el scheduler (ISO). */
  estimadoAt?: string | null;
}

export interface BotCola {
  tanda: BotItemCola[];
  /** Encolados que ya no están en Outbox: no se envían. */
  faltantes: BotItemCola[];
  pendientesDespues: number;
  cupoHoy: number;
  outbox: string | null;
  archivosEnOutbox: number;
  enCola: number;
  motivoNoCorre: string | null;
  // La cola como la ve la persona (25/10/2026). Ausente en servidores anteriores.
  items?: ItemDeColaFirma[];
  resumen?: { listos: number; entranAhora: number; quedan: number; cupo: number; enviados24h: number; tope: number; liberaAt: string | null; tamanoTanda: number };
  ordenManual?: boolean;
  trabados?: GrupoTrabados[];
  verificacion?: { ultimaAt: string | null; desactualizada: boolean; corriendo: boolean };
  estadoPanel?: { tipo: string; texto: string };
  corriendo?: boolean;
}

export interface ItemDeColaFirma {
  posicion: number;
  archivo: string;
  codigo: string;
  firmante: string;
  tipo: string;
  /** en_cola · limite · enviando */
  estado: string;
  enOutbox: boolean;
  /** Entra en el cupo (arriba de la línea de corte). */
  entra: boolean;
  estimadoAt: string | null;
}

/** Los trabados de un mismo motivo, con su salida. `accion.destino`: ruta, «previsualizar» o «descartar». */
export interface GrupoTrabados {
  tipo: string;
  titulo: string;
  accion: { texto: string; destino: string };
  cantidad: number;
  items: Array<{ archivo: string; codigo: string; detalle: string; firmante: string; verificadaAt: string | null }>;
}

/** El estado de un archivo del listado «Para Firmar» frente al bot. */
export interface EstadoArchivoFirma {
  archivo: string;
  codigo: string;
  /** "" = sin encolar · en_cola · seco · enviando · enviado · limite · error · requiere_revision */
  estado: "" | "en_cola" | "seco" | "enviando" | "enviado" | "limite" | "error" | "requiere_revision";
  detalle: string;
  enviadoAt: string | null;
  posicion: number | null;
  colocacion?: ResumenColocacion | null;
  /** Cuándo saldría según el scheduler (ISO): la cuenta regresiva del badge. Null sin envío automático. */
  estimadoAt?: string | null;
  /** El último intento que falló en la pantalla o la red; el documento sigue en la cola (26/10/2026). */
  ultimoIntento?: { at: string; detalle: string } | null;
}

export interface ResultadoEncolado {
  encolados: number;
  rechazados: Array<{ archivo: string; motivo: string }>;
  porMotivo: Record<string, number>;
}

export interface BotLog {
  _id: string;
  inicio: string;
  fin: string | null;
  resultado: string;
  enviados: number;
  errores: number;
  limite: boolean;
  enSeco: boolean;
  automatica: boolean;
  lineas: BotLinea[];
  error?: string;
  /** Hay captura de lo que vio el navegador (GET /bot/logs/:id/captura). */
  tieneCaptura?: boolean;
}

export interface BotEnvioRegistro {
  _id: string;
  codigo: string;
  archivo: string;
  email: string;
  firmante: string;
  tipo: string;
  estado: string;
  detalle: string;
  updatedAt: string;
  colocacion?: ResumenColocacion | null;
}

/** «Limpiar borradores» (26/10/2026): revisión en seco y limpieza confirmada. */
export interface ResultadoBorradores {
  tipo: "revision" | "limpieza";
  corriendo: boolean;
  arrancadaEl: string;
  terminadaEl: string | null;
  total: number | null;
  candidatos: Array<{ titulo: string; archivo: string }>;
  salteados: Array<{ texto: string; motivo: string }>;
  borrados: Array<{ titulo: string; archivo: string }>;
  cortada: string | null;
  error: string | null;
  eventos: Array<{ at: string; texto: string }>;
}
export interface EstadoBorradores {
  ultimo: ResultadoBorradores | null;
  revision: ResultadoBorradores | null;
  vigenciaMin: number;
}

class DropboxSignBotAPI {
  async borradores(): Promise<EstadoBorradores> {
    const { data } = await axios.get("/dropbox-sign/bot/borradores");
    return data;
  }
  /** Paso 1, en seco: filtra «Borrador» en Dropbox Sign y lista qué se eliminaría. No borra nada. */
  async revisarBorradores(): Promise<{ arrancada: boolean }> {
    const { data } = await axios.post("/dropbox-sign/bot/borradores/revisar");
    return data;
  }
  /** Paso 2: elimina los candidatos de la última revisión; `confirmados` tiene que ser su número. */
  async limpiarBorradores(confirmados: number): Promise<{ arrancada: boolean }> {
    const { data } = await axios.post("/dropbox-sign/bot/borradores/limpiar", { confirmados });
    return data;
  }
  async config(): Promise<BotConfig> {
    const { data } = await axios.get("/dropbox-sign/bot/config");
    return data;
  }
  async save(payload: BotConfigPayload): Promise<BotConfig> {
    const { data } = await axios.put("/dropbox-sign/bot/config", payload);
    return data;
  }
  /** Lee el Outbox y dice qué enviaría la próxima tanda. Tarda (lista Dropbox y resuelve firmantes). */
  async cola(): Promise<BotCola> {
    const { data } = await axios.get("/dropbox-sign/bot/cola", { timeout: 120000 });
    return data;
  }
  /** Abre el navegador del servidor, entra a Dropbox Sign y lo cierra. Tarda 15-60 s. No envía nada. */
  async probarConexion(): Promise<{ conexion: ConexionBot }> {
    const { data } = await axios.post("/dropbox-sign/bot/conexion/probar", {}, { timeout: 180000 });
    return data;
  }
  /** Lo que vio el navegador cuando no pudo entrar (JPEG). */
  /** Lo que vio el navegador en una corrida que falló (JPEG/PNG). */
  async capturaLog(id: string): Promise<Blob> {
    const { data } = await axios.get(`/dropbox-sign/bot/logs/${id}/captura`, { responseType: "blob" });
    return data;
  }
  async capturaConexion(): Promise<Blob> {
    const { data } = await axios.get("/dropbox-sign/bot/conexion/captura", { responseType: "blob" });
    return data;
  }
  /* Login asistido: el navegador del servidor en pantalla. */
  async abrirLogin(): Promise<EstadoLoginAsistido> {
    const { data } = await axios.post("/dropbox-sign/bot/login/abrir", {}, { timeout: 120000 });
    return data;
  }
  async pantallaLogin(): Promise<EstadoLoginAsistido> {
    const { data } = await axios.get("/dropbox-sign/bot/login/pantalla", { timeout: 30000 });
    return data;
  }
  async accionLogin(accion: AccionLogin): Promise<EstadoLoginAsistido> {
    const { data } = await axios.post("/dropbox-sign/bot/login/accion", accion, { timeout: 30000 });
    return data;
  }
  async cerrarLogin(): Promise<{ ok: boolean; estado: string }> {
    const { data } = await axios.post("/dropbox-sign/bot/login/cerrar");
    return data;
  }
  /** `cantidad`: «Enviar ahora N» (si no, el tamaño de tanda). El cupo de 24 h sigue mandando. */
  async arrancar(enSeco = false, cantidad?: number): Promise<{ arrancada: boolean; enSeco: boolean; cantidad?: number | null }> {
    const { data } = await axios.post("/dropbox-sign/bot/corrida", { enSeco, ...(cantidad ? { cantidad } : {}) });
    return data;
  }
  /** Mueve documentos de la cola: al principio, al fondo o antes de otro. 409 si hay una corrida enviando. */
  async moverEnCola(codigos: string[], a: "tope" | "fondo" | "antes", antesDe?: string): Promise<{ movidos: number }> {
    const { data } = await axios.post("/dropbox-sign/bot/cola/mover", { codigos, a, ...(antesDe ? { antesDe } : {}) });
    return data;
  }
  /** Vuelve al orden automático (el de encolado). */
  async ordenAutomatico(): Promise<{ total: number }> {
    const { data } = await axios.post("/dropbox-sign/bot/cola/orden-automatico");
    return data;
  }
  /** Saca documentos de la lista de trabados (no se envían). */
  async descartarTrabados(codigos: string[]): Promise<{ quitados: number }> {
    const { data } = await axios.post("/dropbox-sign/bot/trabados/descartar", { codigos });
    return data;
  }
  async detener(): Promise<{ ok: boolean; motivo?: string }> {
    const { data } = await axios.post("/dropbox-sign/bot/corrida/detener");
    return data;
  }
  async corrida(): Promise<BotCorrida> {
    const { data } = await axios.get("/dropbox-sign/bot/corrida");
    return data;
  }
  async logs(): Promise<{ logs: BotLog[]; requierenRevision: BotEnvioRegistro[] }> {
    const { data } = await axios.get("/dropbox-sign/bot/logs");
    return data;
  }
  /** Encola archivos del Outbox (por nombre) o todo lo elegible. Tarda: resuelve firmantes. */
  async encolar(pedido: { archivos?: string[]; todosElegibles?: boolean }): Promise<ResultadoEncolado> {
    const { data } = await axios.post("/dropbox-sign/bot/encolar", pedido, { timeout: 180000 });
    return data;
  }
  async desencolar(codigos: string[]): Promise<{ quitados: number }> {
    const { data } = await axios.post("/dropbox-sign/bot/desencolar", { codigos });
    return data;
  }
  /** El estado de cada archivo del listado: una query, sin tocar Dropbox. */
  /** `hashes`: el contentHash del listado, para que la verificación de otro PDF salga como desactualizada. */
  async estadoArchivos(archivos: string[], hashes: Record<string, string> = {}): Promise<EstadoArchivoFirma[]> {
    if (archivos.length === 0) return [];
    const { data } = await axios.post("/dropbox-sign/bot/estado-archivos", { archivos, hashes });
    return data;
  }

  /* Reglas de colocación y verificación visual. */
  async reglas(): Promise<ReglasColocacion> {
    const { data } = await axios.get("/dropbox-sign/bot/reglas");
    return data;
  }
  async guardarReglas(reglas: ReglaColocacion[]): Promise<ReglasColocacion> {
    const { data } = await axios.put("/dropbox-sign/bot/reglas", { reglas });
    return data;
  }
  async restaurarReglas(): Promise<ReglasColocacion> {
    const { data } = await axios.put("/dropbox-sign/bot/reglas", { restaurar: true });
    return data;
  }
  /** Baja el PDF del Outbox, detecta el ancla y devuelve la página renderizada: tarda unos segundos. */
  async previsualizar(archivo: string): Promise<PrevisualizacionColocacion> {
    const { data } = await axios.post("/dropbox-sign/bot/colocacion/previsualizar", { archivo }, { timeout: 180000 });
    return data;
  }
  async verificarTodos(alcance: AlcanceVerificacion): Promise<{ arrancada: boolean; total: number }> {
    const { data } = await axios.post("/dropbox-sign/bot/colocacion/verificar-todos", { alcance }, { timeout: 120000 });
    return data;
  }
  async verificacion(): Promise<Verificacion> {
    const { data } = await axios.get("/dropbox-sign/bot/colocacion/verificacion");
    return data;
  }
  async detenerVerificacion(): Promise<{ ok: boolean; motivo?: string }> {
    const { data } = await axios.post("/dropbox-sign/bot/colocacion/verificacion/detener");
    return data;
  }
}

export const dropboxSignBotAPI = new DropboxSignBotAPI();

export const dropboxSignAPI = new DropboxSignAPI();
