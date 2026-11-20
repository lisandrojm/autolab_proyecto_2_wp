import axios from "./axiosConfig";
import type { OperacionArcaPresentada } from "@compartido/arca/tiposArca";

/**
 * Baja, modificación y anulación de una relación laboral en ARCA (Relaciones Laborales → Modificaciones y
 * Bajas). Ver `server/src/routes/arcaOperaciones.ts`. Todo corre EN SECO salvo que se mande `confirmar: true`.
 */

export type OperacionArca = "baja" | "modificacion" | "anulacion";

export const NOMBRE_OPERACION_ARCA: Record<OperacionArca, string> = { baja: "Baja", modificacion: "Modificación", anulacion: "Anulación" };

export interface ReferenciaContratoArca {
  userProjectId: string;
  contratoKey?: string | null;
  contractIndex?: number | null;
}

export interface RelacionEspejoArca {
  inicio: string;
  fin: string;
  situacionBaja: string;
  retribucion?: number | null;
  sincronizadoEl?: string;
}

export interface ContratoOperableArca {
  userProjectId: string;
  contratoKey: string | null;
  posicion: number;
  nombre_contrato: string;
  alta: string;
  baja: string;
  nombre_empresa_contrato: string;
  estadoContrato: string;
  marcas: { alta: { resultado?: string; fecha?: string; cat?: string } | null; baja: OperacionArcaPresentada | null; modificacion: OperacionArcaPresentada | null; anulacion: OperacionArcaPresentada | null };
}

export interface RelacionParaOperar {
  persona: { userId: string; nombre: string; cuil: string };
  empresa: { _id: string; cuit: string; razonSocial: string };
  contrato: ContratoOperableArca;
  espejo: RelacionEspejoArca | null;
  situacionesBaja: Array<{ codigo: string; descripcion: string }>;
  camposModificables: Array<{ campo: string; etiqueta: string }>;
  enSecoForzado: boolean;
  ocupadaPor: string | null;
}

export interface PlanOperacionArca {
  op: OperacionArca;
  puede: boolean;
  motivo: string;
  avisos: string[];
  payload: Record<string, unknown>;
}

export interface RespuestaPlanArca {
  plan: PlanOperacionArca;
  hoy: string;
  contexto: { persona: RelacionParaOperar["persona"]; empresa: RelacionParaOperar["empresa"]; contrato: ContratoOperableArca; espejo: RelacionEspejoArca | null; situacionTexto?: string };
  enSecoForzado: boolean;
}

export type DatosOperacionArca = { fechaFin?: string; situacionBaja?: string; fechaTelegrama?: string } | { cambios: Record<string, string>; obraSocialTexto?: string } | { que: "alta" | "baja" };

export type EventoOperacionArca =
  | { tipo: "abriendo" }
  | { tipo: "sesion"; seLogueo: boolean }
  | { tipo: "empleadoraVerificada"; cuit: string }
  | { tipo: "pantalla"; que: string }
  | { tipo: "pagina"; numero: number }
  | { tipo: "relacion"; relacion: { inicio?: string; fin?: string; cat?: string; cbt?: string; sitRevistaTexto?: string; iconos?: Record<string, { habilitado: boolean } | null> } }
  | { tipo: "formulario"; valores: Record<string, unknown>; cambios?: Array<{ campo: string; antes: string; despues: string }> }
  | { tipo: "seco" }
  | { tipo: "irreversible"; que: string }
  | { tipo: "rechazo"; motivo: string }
  | { tipo: "acuse"; acuse: Record<string, unknown> }
  | { tipo: "dialogoInesperado"; mensaje: string }
  | { tipo: "fin"; resultado: string; clase?: string; motivo?: string }
  | { tipo: "fallo"; mensaje: string; clase: string };

export interface ResultadoOperacionArca {
  resultado: "presentada" | "rechazada" | "fallida" | "indeterminado" | "seco" | "ya_hecha";
  clase?: "regla_arca" | "navegacion" | "";
  motivo?: string;
  acuse?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  relacion?: { inicio?: string; fin?: string; cat?: string; cbt?: string };
  cambios?: Array<{ campo: string; antes: string; despues: string }>;
  pantallaDesconocida?: boolean;
}

export interface EstadoOperacionArca {
  hay: boolean;
  corriendo: boolean;
  op?: OperacionArca;
  userProjectId?: string;
  contractIndex?: number;
  contratoKey?: string | null;
  persona?: string;
  cuil?: string;
  empresaRazonSocial?: string;
  plan?: PlanOperacionArca;
  enSeco?: boolean;
  eventos: EventoOperacionArca[];
  terminada?: boolean;
  irreversible?: boolean;
  arrancadaEl?: string;
  resultado?: ResultadoOperacionArca;
  logId?: string | null;
  enSecoForzado: boolean;
  ocupadaPor: string | null;
}

export interface RegistroOperacionArca {
  _id: string;
  tipo: OperacionArca;
  fecha: string;
  quien: string;
  empresaRazonSocial: string;
  enSeco: boolean;
  resultado: string;
  irreversible: boolean;
  error: string;
  textoArca: string;
  contrato: { userProjectId: string; contractIndex: number; contratoKey: string | null; cuil: string; nombre: string; resultado: string; motivo: string } | null;
  operacion: { que?: "alta" | "baja"; payload?: Record<string, unknown>; relacion?: Record<string, unknown>; acuse?: Record<string, unknown>; clase?: string; cambios?: Array<{ campo: string; antes: string; despues: string }>; leidoDe?: string; pantallaDesconocida?: boolean };
  duracionMs?: number;
}

export const arcaOperacionesAPI = {
  /** El contrato, sus marcas, lo que el espejo sabe y la tabla de motivos de baja. No toca ARCA. */
  async relacion(ref: ReferenciaContratoArca): Promise<RelacionParaOperar> {
    const { data } = await axios.get("/arca/operaciones/relacion", { params: { userProjectId: ref.userProjectId, contratoKey: ref.contratoKey || undefined, contractIndex: ref.contratoKey ? undefined : ref.contractIndex ?? undefined } });
    return data;
  },
  /** Qué se mandaría y si se puede. No toca ARCA. */
  async plan(op: OperacionArca, ref: ReferenciaContratoArca, datos: DatosOperacionArca): Promise<RespuestaPlanArca> {
    const { data } = await axios.post("/arca/operaciones/plan", { op, ...ref, datos });
    return data;
  },
  /** Arranca la corrida. Sin `confirmar` es EN SECO: entra, completa, informa y cancela. */
  async arrancar(op: OperacionArca, ref: ReferenciaContratoArca, datos: DatosOperacionArca, confirmar: boolean): Promise<{ arrancada: true; enSeco: boolean; plan: PlanOperacionArca }> {
    const { data } = await axios.post("/arca/operaciones/corrida", { op, ...ref, datos, confirmar });
    return data;
  },
  async estado(): Promise<EstadoOperacionArca> {
    const { data } = await axios.get("/arca/operaciones/corrida");
    return data;
  },
  async detener(): Promise<{ detenida: boolean; motivo?: string }> {
    const { data } = await axios.post("/arca/operaciones/corrida/detener", {}, { validateStatus: (s) => s === 200 || s === 409 });
    return data;
  },
  async historial(params: { userProjectId?: string; contratoKey?: string; limit?: number } = {}): Promise<RegistroOperacionArca[]> {
    const { data } = await axios.get("/arca/operaciones/historial", { params });
    return data;
  },
  async htmlDe(logId: string): Promise<string> {
    const { data } = await axios.get(`/arca/operaciones/historial/${logId}/html`, { responseType: "text" });
    return data;
  },
};
