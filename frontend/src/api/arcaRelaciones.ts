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
  /** Las bajas de ARCA aplicadas solas a los contratos después de la corrida automática (con tope). */
  bajasContratos?: { aplicables: number; aplicadas: number; cambiaron: number; listadas: number; excluidasPorEmpleadora: number; frenada: boolean; tope: number; error?: string };
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
  /** Los totales guardados de la Auditoría ARCA: lo que dice la barra («N para que mire una persona» y las históricas). */
  auditoria?: { el: string | null; totales: TotalesAuditoria | null } | null;
}

/** Una relación resumida, para la columna «Contratos en ARCA» de Contratación → Contratos. */
export interface RelacionResumida {
  empleadoraCuit: string;
  fechaInicio: string;
  /** `null` = sigue abierta. */
  fechaFin: string | null;
  modalidadContrato: string;
  puestoDesempenado: string;
}

/** Un contrato que «Sincronizar bajas» escribiría (o no, y por qué). Ver server `utils/bajasArcaContrato.ts`. */
export type TipoCambioBaja = "baja_nueva" | "baja_por_tramos" | "baja_anterior" | "baja_paraguas" | "arca_granularidad" | "revision_manual" | "arca_posterior" | "arca_abierta";
export interface ItemBajaArca {
  userProjectId: string;
  userId: string;
  persona: string;
  cuil: string;
  proyecto: string;
  contratoKey: string;
  posicion: number;
  contrato: string;
  alta: string;
  bajaContrato: string;
  finArca: string;
  situacionBaja: string;
  empleadora: string;
  tipo: TipoCambioBaja;
  aplicar: boolean;
  /** Por qué va a revisión manual, o qué mirar. */
  alerta?: string;
}
export interface PlanBajasArca {
  hoy: string;
  espejoAl: string | null;
  items: ItemBajaArca[];
  resumen: Record<TipoCambioBaja, number>;
  enCurso?: unknown;
}

/** AUDITORÍA ARCA (etapa 5): lo que no encaja entre WeProdu y ARCA. Ver server `services/arca/auditoriaArca.ts`. */
export type ItemAuditoriaBaja = ItemBajaArca & { diasAntesDelFin?: number; tramos?: { inicio: string; fin: string; situacionBaja: string }[] };
export interface ItemRelacionSinContrato {
  userId: string;
  persona: string;
  cuil: string;
  empleadora: string;
  empleadoraCuit: string;
  inicio: string;
  fin: string;
  situacionBaja: string;
  /** Los contratos solapados, del más cercano al más lejano. `dias` positivo = ARCA empieza después. */
  contratos: { contratoKey: string; userProjectId: string; posicion: number; proyecto: string; contrato: string; alta: string; baja: string; dias: number }[];
}
/** Una relación viva en ARCA con varios contratos en WeProdu (misma persona, empleadora y fecha de alta). */
export interface ItemRelacionVariosContratos {
  userId: string;
  persona: string;
  cuil: string;
  empleadora: string;
  empleadoraCuit: string;
  inicio: string;
  fin: string;
  /** `duplicado`: varios contratos en un mismo proyecto. `varios_proyectos`: la misma relación en varios proyectos (se resuelve a mano). */
  tipo?: "duplicado" | "varios_proyectos";
  nota?: string;
  contratos: { contratoKey: string | null; userProjectId: string; posicion: number; proyecto: string; contrato: string; alta: string; baja: string }[];
}
export interface ItemDiscrepanciaFrame {
  _id: string;
  userId: string;
  persona: string;
  userProjectId: string;
  contratoKey: string | null;
  posicion: number;
  campo: string;
  weprodu: string;
  frame: string;
  detectadaEl: string;
  ultimaVezEl: string;
  veces: number;
}
export interface TotalesAuditoria {
  faltaBajaArca: number;
  revisionManual: number;
  granularidad: number;
  relacionSinContrato: number;
  /** Desde el 22/11/2026: los totales guardados antes no lo traen. */
  relacionVariosContratos?: number;
  discrepanciasFrame: number;
  total: number;
  /** Altas hechas a mano donde ARCA termina después que el contrato: histórico, sin acción. No suma al total. */
  historicasArcaPosterior?: number;
}
export interface AuditoriaArca {
  hoy: string;
  espejoAl: string | null;
  calculadoEl: string;
  faltaBajaArca: ItemAuditoriaBaja[];
  revisionManual: ItemAuditoriaBaja[];
  granularidad: ItemAuditoriaBaja[];
  relacionSinContrato: ItemRelacionSinContrato[];
  relacionVariosContratos?: ItemRelacionVariosContratos[];
  discrepanciasFrame: ItemDiscrepanciaFrame[];
  totales: TotalesAuditoria;
}

export const arcaRelacionesAPI = {
  /** La auditoría completa (etapa 5). Calcula en el momento y deja guardados los totales. */
  async auditoria(): Promise<AuditoriaArca> {
    const { data } = await axios.get("/arca/relaciones/auditoria");
    return data;
  },
  /** Los totales guardados de la auditoría (barato: para el contador). */
  async auditoriaResumen(): Promise<{ el: string | null; totales: TotalesAuditoria | null }> {
    const { data } = await axios.get("/arca/relaciones/auditoria/resumen");
    return data;
  },
  /** Qué bajas de ARCA se llevarían a los contratos (no escribe). */
  async planBajas(): Promise<PlanBajasArca> {
    const { data } = await axios.get("/arca/relaciones/bajas-contratos");
    return data;
  },
  /** Escribe las bajas (todas las aplicables, o las de esas claves). El server recalcula el plan. */
  async aplicarBajas(claves?: string[]): Promise<{ escritos: ItemBajaArca[]; cambiaron: ItemBajaArca[] }> {
    const { data } = await axios.post("/arca/relaciones/bajas-contratos/aplicar", claves ? { claves } : {});
    return data;
  },
  /** Las relaciones de varias personas por CUIL, de la más nueva a la más vieja (una sola consulta). */
  async relacionesDePersonas(cuils: string[]): Promise<{ empresas: EmpresaConCuit[]; relaciones: Record<string, RelacionResumida[]> }> {
    const { data } = await axios.post("/arca/relaciones/personas", { cuils });
    return data;
  },
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
