import axios from "./axiosConfig";

/** El espejo de ARCA: leerlo desde ARCA y aplicar lo leído (ver `server/src/routes/arcaCatalogo.ts`). */
export interface FilaCatalogoArca {
  tabla: string;
  filtroPadre: string;
  codigo: string;
  descripcion: string;
  descripcionAnterior?: string;
}

export interface LecturaCatalogoArca {
  _id: string;
  fecha: string;
  empresaCuit: string | null;
  empresaRazonSocial?: string;
  origen: "csv" | "arca";
  porTabla: Record<string, { cantidad: number; hash: string }>;
  diff: { nuevos: FilaCatalogoArca[]; dejaronDePublicarse: FilaCatalogoArca[]; descripcionCambiada: FilaCatalogoArca[] };
  impacto?: Array<{ tipo: string; convenio: string; codigo: string; descripcion: string; categorias: string[]; contratos: number }>;
  estado: "pendiente" | "aplicada" | "descartada";
  aplicadaEl?: string;
  error?: string;
}

export interface EmpleadoraCatalogo {
  _id: string;
  razonSocial: string;
  cuit: string;
  ultimaLectura: string | null;
}

/** Días sin leer el catálogo de ARCA a partir de los cuales se avisa en Contratos (no bloquea). */
export const DIAS_CATALOGO_VIEJO = 30;

export const arcaCatalogoAPI = {
  async empleadoras(): Promise<EmpleadoraCatalogo[]> {
    const { data } = await axios.get("/arca/catalogo/empleadoras");
    return data;
  },
  async lecturas(): Promise<LecturaCatalogoArca[]> {
    const { data } = await axios.get("/arca/catalogo/lecturas");
    return data;
  },
  async sincronizar(empresaId: string): Promise<{ arrancada: boolean }> {
    const { data } = await axios.post("/arca/catalogo/sincronizar", { empresaId });
    return data;
  },
  async estadoSincronizacion(): Promise<{ hay: boolean; corriendo: boolean; eventos: any[]; lecturaId?: string; error?: string; razonSocial?: string }> {
    const { data } = await axios.get("/arca/catalogo/sincronizacion");
    return data;
  },
  async aplicar(id: string): Promise<{ nuevos: number; cambiados: number; bajas: number }> {
    const { data } = await axios.post(`/arca/catalogo/lecturas/${id}/aplicar`, { confirmar: true });
    return data;
  },
  async descartar(id: string): Promise<void> {
    await axios.post(`/arca/catalogo/lecturas/${id}/descartar`);
  },
};
