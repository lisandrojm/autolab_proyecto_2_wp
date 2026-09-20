import axiosClient from "./axiosConfig";

/**
 * Liquidación de novedades a Memosoft.
 *
 * Memosoft es el sistema de sueldos y no tiene API: lo que se le entrega es un XLSX. Acá vive lo
 * que la plataforma necesita para armarlo —el padrón del período y el mapeo de qué motivo de
 * novedad genera qué concepto del recibo—, no el archivo en sí.
 */

export type Regimen = "mensual" | "jornalero";

export interface MemosoftEffect {
  conceptoCodigo: string;
  param: "par1" | "par2";
  unidad: "cantidad" | "importe";
  fuente: "jornadas" | "horas50" | "horas100" | "fijo" | "manual";
  valorFijo?: number;
  aplicaA: "titular" | "reemplazante";
  soloRegimen?: Regimen | null;
  empresaId?: string | null;
  vigenteDesde: string;
  vigenteHasta?: string | null;
  nota?: string;
}

export interface ConceptoMemosoft {
  _id: string;
  empresaId: string;
  codigo: string;
  descripcion: string;
  usaPar1: boolean;
  usaPar2: boolean;
  unidadPar1?: string | null;
  unidadPar2?: string | null;
  activo: boolean;
}

export interface MotivoConMapeo {
  _id: string;
  name: string;
  isActive: boolean;
  requiresReplacement: boolean;
  /** Revisado y decidido: este motivo no liquida nada. Distinto de no estar configurado. */
  noLiquida?: boolean;
  /** Los efectos que rigen a la fecha consultada. */
  vigentes: MemosoftEffect[];
  /** Todos, incluidos los cerrados. Es el historial. */
  historial: MemosoftEffect[];
}

export interface Mapeo {
  fecha: string;
  motivos: MotivoConMapeo[];
  conceptos: ConceptoMemosoft[];
}

export interface FilaPadron {
  filaId: string;
  userId: string;
  apellidoYNombre: string;
  legajo: string | null;
  empresaId: string | null;
  empresaNombre: string | null;
  ccCodigo: string | null;
  ccNombre: string | null;
  regimen: Regimen | null;
  projectId: string;
  proyectoNombre: string;
  rolFrame: string | null;
  contrato: { nombre: string | null; tipoId: number | null; jornadas: number | null; alta: string; baja: string };
}

export interface ExcepcionPadron {
  tipo: string;
  filaId: string;
  userId: string;
  apellidoYNombre: string;
  projectId: string;
  proyectoNombre: string;
  detalle: string;
}

export interface Padron {
  periodo: string;
  desde: string;
  hasta: string;
  filas: FilaPadron[];
  excepciones: ExcepcionPadron[];
  resumen: { contratos: number; personas: number; completos: number; conExcepcion: number; porRegimen: Record<string, number> };
}

/** El error que devuelve el server cuando un mapeo no pasa la validación contra el catálogo. */
export interface ProblemaDeMapeo {
  codigo: string;
  problema: string;
}

export const liquidacionAPI = {
  getMapeo: async (fecha?: string) => {
    const response = await axiosClient.get<Mapeo>("/liquidacion/mapeo", { params: fecha ? { fecha } : {} });
    return response.data;
  },

  /**
   * Reemplaza lo que rige para ese motivo. Lo anterior NO se borra: queda cerrado el día previo,
   * así una liquidación vieja se puede volver a armar con las reglas que tenía.
   */
  guardarMapeo: async (motivoId: string, efectos: Partial<MemosoftEffect>[], desde?: string, noLiquida?: boolean) => {
    const response = await axiosClient.put<{ _id: string; name: string; vigentes: MemosoftEffect[]; historial: MemosoftEffect[] }>(
      `/liquidacion/mapeo/${motivoId}`,
      { efectos, desde, noLiquida },
    );
    return response.data;
  },

  getConceptos: async (empresaId?: string) => {
    const response = await axiosClient.get<ConceptoMemosoft[]>("/liquidacion/conceptos", { params: empresaId ? { empresaId } : {} });
    return response.data;
  },

  getPadron: async (periodo: string, filtros: Record<string, string | number | undefined> = {}) => {
    const response = await axiosClient.get<Padron>("/liquidacion/padron", { params: { periodo, ...filtros } });
    return response.data;
  },
};
