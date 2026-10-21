import axios from "./axiosConfig";

/** Contratación › Recibos de sueldo (ver `server/src/services/recibosSueldo.ts`). */

export type EstadoRecibo = "sin_persona" | "listo" | "enviado" | "firmado" | "error";

export interface ConceptoRecibo {
  codigo: string;
  concepto: string;
  unidad: string;
  monto: string;
  /** «CONTRIBUCIONES EMPRESA», «REMUNERATIVO», «NO REMUNERATIVO», «DESCUENTOS», «OTROS»… */
  seccion: string;
}

/** Lo leído del recibo. Los campos opcionales salen sólo del TXT de MEMOSOFT (con OCR quedan vacíos). */
export interface DatosRecibo {
  cuil: string;
  empleadorCuit: string;
  nombre: string;
  periodo: string;
  legajo: string;
  /** Neto a cobrar. */
  neto: string;
  cuitsEncontrados: string[];
  empresa?: string;
  basico?: string;
  ingreso?: string;
  antiguedad?: string;
  sector?: string;
  modalidad?: string;
  categoria?: string;
  tarea?: string;
  periodoTexto?: string;
  periodoDeposito?: string;
  fechaDeposito?: string;
  bancoDeposito?: string;
  costoTotal?: string;
  contribucionesEmpleador?: string;
  sueldoBruto?: string;
  remunerativo?: string;
  noRemunerativo?: string;
  descuentos?: string;
  sueldoNeto?: string;
  otros?: string;
  formaPago?: string;
  fechaPago?: string;
  numeroRecibo?: string;
  conceptos?: ConceptoRecibo[];
}

export interface ReciboDelLote {
  _id: string;
  paginas: number[];
  datos: DatosRecibo;
  /** `/storage/...`: se abre con `getImageUrl`. */
  archivoUrl: string;
  userId?: string | null;
  userProjectId?: string | null;
  projectId?: string | null;
  contractIndex?: number | null;
  nombreUsuario?: string;
  nombreProyecto?: string;
  asignadoAMano?: boolean;
  /** Se asoció por apellido y nombre porque el OCR no leyó el CUIL: revisar antes de enviar. */
  asociadoPorNombre?: boolean;
  estado: EstadoRecibo;
  enviadoEl?: string | null;
  firmadoEl?: string | null;
  nombreEnviado?: string;
  codigo?: string;
  error?: string;
}

export type EstadoLote = "leyendo" | "listo" | "error";

export interface LoteRecibos {
  _id: string;
  nombreArchivo: string;
  sabanaUrl?: string;
  /** La lectura corre en segundo plano: «leyendo» con el avance en `progreso`, después «listo» o «error». */
  estadoLote: EstadoLote;
  progreso: { leidas: number; total: number };
  error?: string;
  paginas: number;
  paginasPorRecibo: number;
  /** «txt»: los datos salen del TXT de MEMOSOFT (sin OCR); «ocr»: sólo se subió el PDF. */
  fuente?: "ocr" | "txt";
  nombreTxt?: string;
  periodo: string;
  recibos: ReciboDelLote[];
  createdAt: string;
  resumen?: { total: number; listos: number; sinPersona: number; enviados: number; firmados: number };
}

export interface ResultadoMasivo {
  /** `por`: cómo se emparejó — "nombre", "paginas" (mismo tamaño) o "unicos" (el único PDF con el único TXT). */
  lotes: Array<{ loteId: string; pdf: string; txt: string; recibos: number; por: string }>;
  omitidos: Array<{ archivo: string; motivo: string }>;
}

export interface PersonaBuscada {
  _id: string;
  nombre: string;
  email: string;
  cuil: string;
}

export const ETIQUETA_ESTADO_RECIBO: Record<EstadoRecibo, string> = {
  sin_persona: "Sin persona",
  listo: "Listo para enviar",
  enviado: "Enviado a firmar",
  firmado: "Firmado",
  error: "Error",
};

export const recibosSueldoAPI = {
  /** La sábana PDF y, si se tiene, el TXT que MEMOSOFT exporta con ella: con el TXT los datos salen de ahí, sin OCR. */
  async subir(archivo: File, txt: File | null, paginasPorRecibo = 2): Promise<LoteRecibos> {
    const fd = new FormData();
    fd.append("archivo", archivo);
    if (txt) fd.append("txt", txt);
    fd.append("paginasPorRecibo", String(paginasPorRecibo));
    const { data } = await axios.post("/recibos-sueldo/lotes", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return data;
  },
  /**
   * Subida masiva: todas las sábanas PDF y sus TXT juntos. El server empareja cada TXT con su PDF (por
   * nombre o por cantidad de páginas) y crea un lote por par; lo que no tiene pareja vuelve en `omitidos`.
   */
  async subirVarios(archivos: File[], paginasPorRecibo = 2): Promise<ResultadoMasivo> {
    const fd = new FormData();
    for (const a of archivos) fd.append("archivos", a);
    fd.append("paginasPorRecibo", String(paginasPorRecibo));
    const { data } = await axios.post("/recibos-sueldo/lotes/masivo", fd, { headers: { "Content-Type": "multipart/form-data" } });
    return data;
  },
  async lotes(): Promise<LoteRecibos[]> {
    const { data } = await axios.get("/recibos-sueldo/lotes");
    return data;
  },
  async lote(id: string): Promise<LoteRecibos> {
    const { data } = await axios.get(`/recibos-sueldo/lotes/${id}`);
    return data;
  },
  async textoDeRecibo(loteId: string, reciboId: string): Promise<string> {
    const { data } = await axios.get(`/recibos-sueldo/lotes/${loteId}/recibos/${reciboId}/texto`);
    return String(data?.texto || "");
  },
  /** Descarga el JSON con todo lo leído del PDF (datos y texto crudo de cada recibo). */
  async descargarExportacion(lote: LoteRecibos): Promise<void> {
    const { data } = await axios.get(`/recibos-sueldo/lotes/${lote._id}/exportacion`, { responseType: "blob" });
    const url = window.URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recibos-${lote.periodo || lote._id}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  /** Vuelve a pasar el PDF de ese recibo por OCR, a más resolución, y relee sus datos. */
  async releer(loteId: string, reciboId: string): Promise<LoteRecibos> {
    const { data } = await axios.post(`/recibos-sueldo/lotes/${loteId}/recibos/${reciboId}/releer`);
    return data;
  },
  /** El JSON de un solo recibo: sus datos, su persona y el texto crudo leído. */
  async descargarJsonDeRecibo(lote: LoteRecibos, recibo: ReciboDelLote): Promise<void> {
    const texto = await this.textoDeRecibo(lote._id, recibo._id);
    const { textoCrudo: _omitido, ...resto } = recibo as any;
    const json = JSON.stringify({ lote: { id: lote._id, archivo: lote.nombreArchivo, periodo: lote.periodo }, recibo: { ...resto, textoCrudo: texto } }, null, 2);
    const url = window.URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `recibo-${(recibo.nombreUsuario || recibo.datos.nombre || recibo.paginas.join("-")).replace(/[^\w.-]+/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  async asignarPersona(loteId: string, reciboId: string, userId: string): Promise<LoteRecibos> {
    const { data } = await axios.patch(`/recibos-sueldo/lotes/${loteId}/recibos/${reciboId}/persona`, { userId });
    return data;
  },
  async enviar(loteId: string, reciboIds?: string[]): Promise<{ enviados: number; fallidos: Array<{ reciboId: string; motivo: string }>; lote: LoteRecibos }> {
    const { data } = await axios.post(`/recibos-sueldo/lotes/${loteId}/enviar`, { reciboIds });
    return data;
  },
  async eliminar(loteId: string): Promise<void> {
    await axios.delete(`/recibos-sueldo/lotes/${loteId}`);
  },
  async buscarPersonas(q: string): Promise<PersonaBuscada[]> {
    const { data } = await axios.get("/recibos-sueldo/personas", { params: { q } });
    return data;
  },
};
