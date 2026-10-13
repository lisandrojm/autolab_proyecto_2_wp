import axios from "./axiosConfig";

/**
 * Relaciones laborales según ARCA y antigüedad de cada persona (Documentos → «Antigüedad ARCA»).
 * Ver `server/src/routes/arcaRelaciones.ts`. La sincronización sólo LEE en ARCA.
 */

export interface EmpresaConCuit {
  _id: string;
  cuit: string;
  razonSocial: string;
}

export interface AntiguedadFila {
  cuil: string;
  /** `null` en la fila global (todas las empleadoras). */
  empleadoraCuit: string | null;
  apellidoNombre: string;
  primeraAlta: string;
  ultimaFecha: string;
  antiguedadDesdePrimeraAlta: { dias: number; anios: number };
  diasTrabajados: number;
  aniosTrabajados: number;
  cantidadContratos: number;
  tieneRelacionAbierta: boolean;
  empresas: string[];
  calculadoEl: string;
}

export interface RelacionLaboral {
  _id: string;
  empleadoraCuit: string;
  cuil: string;
  apellidoNombre: string;
  obraSocial: string;
  modalidadContrato: string;
  actividadLaboral: string;
  puestoDesempenado: string;
  retribucionPactada: number | null;
  modLiquidacion: string;
  fechaInicio: string;
  fechaFin: string | null;
  situacionBaja: string;
  convenioColectivo: string;
  categoria: string;
  tipoServicio: string;
  origen: "seed-dropbox" | "sync";
  sincronizadoEl: string;
}

export interface ConfigSyncRelaciones {
  activa: boolean;
  /** "HH:MM" argentina. */
  hora: string;
  meses: number;
}

export interface ResumenSyncRelaciones {
  fecha: string;
  hoy: string;
  meses: string[];
  automatica: boolean;
  empresas: Array<{
    cuit: string;
    razonSocial: string;
    meses: Array<{ mes: string; resultado: "ok" | "sin_datos" | "error"; paginas: number; filas: number; descartes: number; error?: string }>;
    nuevas: number;
    actualizadas: number;
    bajasAplicadas: number;
    sinCambios: number;
    error?: string;
  }>;
  cuilsRecalculados: number;
  filasAntiguedad: number;
  duracionMs: number;
  error?: string;
  htmlGuardado?: string;
}

export interface EstadoSyncRelaciones {
  config: ConfigSyncRelaciones;
  ultimoDia: string | null;
  ultimaSync: ResumenSyncRelaciones | null;
  enCurso: { desde: string; automatica: boolean; progreso: string[] } | null;
  /** Qué otra corrida tiene tomada la sesión de ARCA, si hay una. */
  arcaOcupadaPor: string | null;
  hayCredenciales: boolean;
  totales: { relaciones: number; personas: number };
  hoy: string;
}

export const arcaRelacionesAPI = {
  async antiguedad(params: { empresaCuit?: string; cuil?: string; q?: string; limit?: number } = {}): Promise<{ total: number; empresas: EmpresaConCuit[]; filas: AntiguedadFila[] }> {
    const { data } = await axios.get("/arca/relaciones/antiguedad", { params });
    return data;
  },
  async relacionesDe(cuil: string): Promise<RelacionLaboral[]> {
    const { data } = await axios.get(`/arca/relaciones/persona/${cuil}`);
    return data;
  },
  async estado(): Promise<EstadoSyncRelaciones> {
    const { data } = await axios.get("/arca/relaciones/estado");
    return data;
  },
  async sincronizar(meses?: number): Promise<{ arrancada: boolean; meses: number }> {
    const { data } = await axios.post("/arca/relaciones/sincronizar", meses ? { meses } : {});
    return data;
  },
  async setConfig(cambios: Partial<ConfigSyncRelaciones>): Promise<ConfigSyncRelaciones> {
    const { data } = await axios.put("/arca/relaciones/sync-config", cambios);
    return data;
  },
};
