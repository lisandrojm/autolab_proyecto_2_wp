import axios from "./axiosConfig";
import { SinCuitValidacion } from "./users";

/** "ok" = autoconsulta contra Padrón A13 respondió bien; "no_autorizado" = el login WSAA funciona
 *  pero ARCA no devuelve datos para el propio CUIT representada (servicio no autorizado en el
 *  Administrador de Relaciones); "error" = falló la verificación en sí (transporte/WSAA);
 *  null = todavía no se corrió esta verificación (conexión anterior a esta feature). */
export type ServicioPadronEstado = "ok" | "no_autorizado" | "error";

export interface AfipStatus {
  connected: boolean;
  cuitRepresentada: string | null;
  ambiente: "homologacion" | "produccion";
  connectedAt: string | null;
  certificadoAlias: string | null;
  certificadoVencimiento: string | null;
  canManageConnection: boolean;
  servicioPadronOk: boolean | null;
  servicioPadronEstado: ServicioPadronEstado | null;
  servicioPadronDetalle: string | null;
  servicioPadronFaultCode: string | null;
  servicioPadronFaultString: string | null;
  servicioPadronVerificadoAt: string | null;
}

export interface ConnectResult {
  connected: boolean;
  cuitRepresentada: string;
  ambiente: "homologacion" | "produccion";
  connectedAt: string;
  servicioPadronOk: boolean;
  servicioPadronEstado: ServicioPadronEstado;
  servicioPadronDetalle: string;
}

export interface VerificacionServicioPadron {
  ok: boolean;
  estado: ServicioPadronEstado;
  detalle: string;
  faultCode?: string;
  faultString?: string;
  verificadoAt: string;
}

export interface ConsultaPadronTarget {
  projectId: string;
  userId: string;
  contractIndex: number;
}

export interface ResultadoConsultaPadron {
  cuit: string;
  estado?: "activo" | "inactivo" | "desconocido";
  encontrado?: boolean;
  denominacion?: string;
  error?: string;
  contratosActualizados: number;
  /** true si quedó archivada en Dropbox (carpeta "Constancia de cuit"); si es "activo" pero esto es false/undefined, falta ese paso — ver dropboxCfg/carpetaConstancia en el server. */
  dropboxSubido?: boolean;
  /** Por qué no se pudo archivar en Dropbox (Dropbox no conectado, carpeta no configurada, o el error real de la subida). */
  dropboxError?: string;
  /** Con qué CUIT/ambiente del tenant se hizo la consulta — para diagnosticar sin acceso al server. */
  cuitRepresentada?: string;
  ambiente?: string;
  /** faultcode/faultstring reales del SOAP Fault de ARCA, si la consulta terminó en uno. */
  faultCode?: string;
  faultString?: string;
  /** Respuesta cruda de ARCA (o el Fault, si lo hubo) tal cual la parseó el server. */
  raw?: any;
}

export interface ResultadoConsultaPadronBulk {
  resultados: ResultadoConsultaPadron[];
  consultados: number;
  sinCuit: number;
  contratosActualizados: number;
}

/** Resultado de habilitar la firma de gente sin CUIT (ver afipAPI.habilitarFirma). */
export interface HabilitarFirmaResult {
  ok: boolean;
  /** Carpeta de Dropbox donde se archivaron los JSON. */
  carpeta: string;
  habilitados: { userId: string; nombre: string; path: string }[];
  /** Los que no se pudieron habilitar, con el motivo (ej. tiene CUIT y le corresponde el trámite real). */
  omitidos: { userId: string; nombre: string; motivo: string }[];
  /** ¿La carpeta "Sin cuit" está dada de alta como carpeta vigilada? Si no, el archivo se guarda igual
   *  pero el contrato NO avanza solo a Generar Documentos (ver `aviso`). */
  carpetaVigilada?: boolean;
  aviso?: string;
}

/** Un registro persistente de un llamado real a ARCA (guardado por el server en cada consulta). */
export interface AfipLogEntry {
  _id: string;
  tipo: "padron" | "servicio_test";
  cuitConsultado: string;
  cuitRepresentada: string;
  ambiente: "homologacion" | "produccion";
  encontrado?: boolean;
  estado?: "activo" | "inactivo" | "desconocido";
  faultCode?: string;
  faultString?: string;
  raw?: any;
  error?: string;
  createdAt: string;
}

/**
 * Estado del usuario de clave fiscal con el que el SERVIDOR opera Simplificación Registral.
 *
 * NUNCA trae la clave. Es write-only, igual que la clave privada del certificado: se carga y no se
 * lee. Lo que se puede saber desde acá es si está configurada y con qué CUIT.
 */
export interface SimplificacionStatus {
  configurado: boolean;
  cuitUsuario: string;
  /** Si hay sesión de AFIP guardada, la próxima corrida no necesita loguearse. */
  sesionGuardadaAt: string | null;
  ultimoLoginAt: string | null;
  /** Qué pasó la última vez que intentó entrar, para no ir a buscarlo a los logs del VPS. */
  ultimoError: string;
}

export const afipAPI = {
  /** Ver `SimplificacionStatus`: dice si hay credenciales, no cuáles. */
  async simplificacionStatus(): Promise<SimplificacionStatus> {
    const { data } = await axios.get(`/afip/simplificacion`);
    return data;
  },

  /**
   * Guarda el usuario delegado. Reemplazar la clave BORRA la sesión guardada del lado del server:
   * si no, seguiría entrando con la anterior y rotar la contraseña no tendría ningún efecto.
   */
  async guardarSimplificacion(payload: { cuitUsuario: string; clave: string }): Promise<{ configurado: boolean; cuitUsuario: string }> {
    const { data } = await axios.post(`/afip/simplificacion`, payload);
    return data;
  },

  /** Saca las credenciales y también la sesión: cortar una credencial tiene que cortar el acceso. */
  async borrarSimplificacion(): Promise<{ configurado: boolean }> {
    const { data } = await axios.delete(`/afip/simplificacion`);
    return data;
  },

  async status(): Promise<AfipStatus> {
    const { data } = await axios.get("/afip/status");
    return data;
  },

  async connect(payload: { cuitRepresentada: string; certificadoPem: string; clavePrivadaPem: string; ambiente: "homologacion" | "produccion" }): Promise<ConnectResult> {
    const { data } = await axios.post("/afip/connect", payload, { timeout: 30000 });
    return data;
  },

  async disconnect(): Promise<void> {
    await axios.post("/afip/disconnect");
  },

  /** Re-corre la autoconsulta de prueba contra Padrón A13 con las credenciales ya guardadas — para
   *  revalidar después de arreglar la autorización del servicio en ARCA, sin re-pegar el certificado. */
  async verificarServicio(): Promise<VerificacionServicioPadron> {
    const { data } = await axios.post("/afip/verificar-servicio", {}, { timeout: 30000 });
    return data;
  },

  /** Puede tardar (una consulta SOAP por CUIT, con concurrencia acotada) — timeout propio más largo. */
  async consultarPadronBulk(targets: ConsultaPadronTarget[]): Promise<ResultadoConsultaPadronBulk> {
    const { data } = await axios.post("/afip/consulta-padron/bulk", { targets }, { timeout: 180000 });
    return data;
  },

  /**
   * Salida para la gente SIN CUIT/CUIL argentino: archiva un JSON en la carpeta de Dropbox que ya
   * vigila la transición automática de ese trámite, para que el contrato avance a Firma digital sin
   * pasar por ARCA (que no le aplica). Ver POST /afip/habilitar-firma.
   */
  async habilitarFirma(targets: ConsultaPadronTarget[], tipo: "alta_temprana_afip" | "constancia_cuit"): Promise<HabilitarFirmaResult> {
    const { data } = await axios.post("/afip/habilitar-firma", { targets, tipo }, { timeout: 120000 });
    return data;
  },

  /* ── Flujo "Sin CUIT": documentación de respaldo del trámite de ARCA pendiente ── */

  /** Agrega un documento de respaldo (con archivo opcional) al contrato. */
  async sinCuitAgregarDocumento(payload: {
    projectId: string;
    userId: string;
    contractIndex: number;
    tipo: string;
    numero: string;
    observaciones?: string;
    archivo?: File | null;
  }): Promise<{ ok: boolean; sinCuitValidacion: SinCuitValidacion }> {
    const form = new FormData();
    form.append("projectId", payload.projectId);
    form.append("userId", payload.userId);
    form.append("contractIndex", String(payload.contractIndex));
    form.append("tipo", payload.tipo);
    form.append("numero", payload.numero);
    if (payload.observaciones) form.append("observaciones", payload.observaciones);
    if (payload.archivo) form.append("archivo", payload.archivo);
    const { data } = await axios.post("/afip/sin-cuit/documento", form, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 });
    return data;
  },

  /** Marca/desmarca el OK manual. El server exige al menos un documento de respaldo cargado. */
  async sinCuitSetValidado(payload: { projectId: string; userId: string; contractIndex: number; validado: boolean; fechaSeguimiento?: string }): Promise<{ ok: boolean; sinCuitValidacion: SinCuitValidacion }> {
    const { data } = await axios.patch("/afip/sin-cuit/validado", payload);
    return data;
  },

  /** Quita un documento de respaldo por índice. */
  async sinCuitBorrarDocumento(payload: { projectId: string; userId: string; contractIndex: number; docIndex: number }): Promise<{ ok: boolean; sinCuitValidacion: SinCuitValidacion }> {
    const { data } = await axios.delete("/afip/sin-cuit/documento", { data: payload });
    return data;
  },

  /** Últimos llamados reales a ARCA (Consulta Padrón / autoconsulta de servicio) — para diagnosticar
   *  sin depender de haber visto el toast en el momento. */
  async logs(): Promise<AfipLogEntry[]> {
    const { data } = await axios.get("/afip/logs");
    return data?.logs || [];
  },

  /** Link temporal (Dropbox lo vence a las pocas horas) para ver el JSON de la constancia archivada. */
  async constanciaLink(target: ConsultaPadronTarget): Promise<string> {
    const { data } = await axios.get("/afip/constancia-link", { params: target });
    return data.url;
  },

  /** Borra de Dropbox el JSON de la validación y limpia la marca, para que el escaneo automático no
   *  avance el contrato de bandeja. */
  async eliminarConstanciaArchivada(target: ConsultaPadronTarget): Promise<{ ok: boolean; aviso?: string }> {
    const { data } = await axios.post("/afip/constancia-archivada/eliminar", target);
    return data;
  },
};
