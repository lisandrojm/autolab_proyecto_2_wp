import axios from "./axiosConfig";

/** Contratación › Recibos de sueldo (ver `server/src/services/recibosSueldo.ts`). */

export type EstadoRecibo = "sin_persona" | "listo" | "enviado" | "firmado" | "error";

export interface ReciboDelLote {
  _id: string;
  paginas: number[];
  datos: { cuil: string; empleadorCuit: string; nombre: string; periodo: string; legajo: string; neto: string; cuitsEncontrados: string[] };
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
  periodo: string;
  recibos: ReciboDelLote[];
  createdAt: string;
  resumen?: { total: number; listos: number; sinPersona: number; enviados: number; firmados: number };
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
  async subir(archivo: File, paginasPorRecibo = 2): Promise<LoteRecibos> {
    const fd = new FormData();
    fd.append("archivo", archivo);
    fd.append("paginasPorRecibo", String(paginasPorRecibo));
    const { data } = await axios.post("/recibos-sueldo/lotes", fd, { headers: { "Content-Type": "multipart/form-data" } });
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
