import axios from "./axiosConfig";
import type { OperacionArcaPresentada } from "@compartido/arca/tiposArca";

/**
 * Baja, modificación y anulación de una relación laboral en ARCA (Relaciones Laborales → Modificaciones y
 * Bajas). Ver `server/src/routes/arcaOperaciones.ts`. Todo corre EN SECO salvo que se mande `confirmar: true`.
 */

export type OperacionArca = "baja" | "modificacion" | "anulacion";

export const NOMBRE_OPERACION_ARCA: Record<OperacionArca, string> = { baja: "Baja", modificacion: "Modificación", anulacion: "Anulación" };

export interface ReferenciaContratoArca {
  /** "" en modo «sin contrato». */
  userProjectId: string;
  contratoKey?: string | null;
  contractIndex?: number | null;
  /** Modo «sin contrato»: la relación de ARCA misma (empleadora, CUIL y fecha de inicio), cuando no hay contrato en WeProdu. */
  relacion?: { empleadoraCuit: string; cuil: string; fechaInicio: string } | null;
}

/** La decisión de la regla compartida (`server/src/compartido/arca/relacionParaOperar.ts`). */
export interface DecisionRelacionArca {
  puede: boolean;
  motivo: string;
  via: "weprodu" | "verificacion" | "adoptada" | "espejo" | null;
}

/** Un contrato de WeProdu de una relación de ARCA (misma persona, empleadora y fecha de alta). */
export interface ContratoDeRelacionArca {
  userProjectId: string;
  contratoKey: string | null;
  posicion: number;
  proyecto: string;
  contrato: string;
  alta: string;
  baja: string;
  relacionArca: DecisionRelacionArca;
}

/** Cómo se opera una relación vista desde ARCA: con su contrato, eligiendo entre varios, o sin contrato. */
export interface ComoSeOperaArca {
  modo: "contrato" | "elegir" | "sin_contrato" | null;
  puede: boolean;
  motivo: string;
  contratos: ContratoDeRelacionArca[];
}

/*
  BAJAS ARCA: la lista (`GET /arca/operaciones/lista`, `server/src/services/arca/listaBajasArca.ts`). Una fila por
  relación viva en ARCA sobre la que se puede operar, cada una con exactamente una situación. Todo lo decide el server.
*/
export type SituacionBajaArca = 1 | 2 | 3 | 4 | 5;
export const SITUACIONES_BAJA_ARCA: Record<SituacionBajaArca, string> = {
  1: "Terminado en WeProdu",
  2: "Termina antes de su fecha",
  3: "Baja presentada, sin confirmar",
  4: "Sin contrato en WeProdu",
  5: "Indeterminado vigente",
};

export interface FilaBajaArca {
  clave: string;
  empleadoraCuit: string;
  empleadora: string;
  cuil: string;
  persona: string;
  userId: string | null;
  /** La persona no tiene ficha en WeProdu (distinto de «ficha sin contrato con esa alta»). */
  sinFicha: boolean;
  inicio: string;
  finArca: string;
  modalidadArca: string;
  /** El tipo de contrato de WeProdu; "" sin contrato (se muestra la modalidad de ARCA). */
  tipoContrato: string;
  proyecto: string;
  finWeprodu: string;
  diasDesdeFin: number | null;
  situacion: SituacionBajaArca;
  detalle: string;
  /** Con qué contrato abre el panel; `null` = modo «sin contrato». */
  contrato: { userProjectId: string; contratoKey: string | null; posicion: number } | null;
}

export type MotivoFueraBajaArca = "cerrada" | "varios_contratos" | "plazo_vigente" | "baja_presentada" | "no_se_opera";

/** Una relación viva en ARCA que NO está en la lista, y por qué. */
export interface FilaFueraBajaArca {
  clave: string;
  empleadora: string;
  cuil: string;
  persona: string;
  inicio: string;
  finArca: string;
  motivo: MotivoFueraBajaArca;
  texto: string;
}

export interface ConteosBajaArca {
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  /** La suma de 1 a 4: el número del menú. La 5 es inventario. */
  pendientes: number;
  fuera: Partial<Record<MotivoFueraBajaArca, number>>;
}

export interface MovimientosBajaArca {
  entraron: { clave: string; persona: string; situacion: SituacionBajaArca }[];
  salieron: { clave: string; persona: string; situacion: SituacionBajaArca; ahora: string }[];
  cambiaron: { clave: string; persona: string; de: SituacionBajaArca; a: SituacionBajaArca }[];
}

export interface ListaBajasArca {
  hoy: string;
  filas: FilaBajaArca[];
  fuera: FilaFueraBajaArca[];
  conteos: ConteosBajaArca;
  /** La foto de la última corrida automática (06:00), si hubo. */
  corrida: { el: string; conteos: ConteosBajaArca } | null;
  /** Qué cambió entre esa foto y ahora. */
  desdeLaCorrida: MovimientosBajaArca | null;
  /** Qué cambió en cada corrida respecto de la anterior, de la más nueva a la más vieja. */
  movimientos: ({ el: string; conteos: ConteosBajaArca } & MovimientosBajaArca)[];
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
  /** La relación no tiene contrato en WeProdu: el resultado no se guarda en ningún contrato. */
  sinContrato?: boolean;
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
  operacion: { sinContrato?: boolean; que?: "alta" | "baja"; payload?: Record<string, unknown>; relacion?: Record<string, unknown>; acuse?: Record<string, unknown>; clase?: string; cambios?: Array<{ campo: string; antes: string; despues: string }>; leidoDe?: string; pantallaDesconocida?: boolean };
  duracionMs?: number;
}

export const arcaOperacionesAPI = {
  /** El contrato, sus marcas, lo que el espejo sabe y la tabla de motivos de baja. No toca ARCA. */
  async relacion(ref: ReferenciaContratoArca): Promise<RelacionParaOperar> {
    const sinContrato = !ref.userProjectId && ref.relacion ? { relCuit: ref.relacion.empleadoraCuit, relCuil: ref.relacion.cuil, relInicio: ref.relacion.fechaInicio } : {};
    const { data } = await axios.get("/arca/operaciones/relacion", { params: { userProjectId: ref.userProjectId || undefined, contratoKey: ref.contratoKey || undefined, contractIndex: ref.contratoKey ? undefined : ref.contractIndex ?? undefined, ...sinContrato } });
    return data;
  },
  /** Bajas ARCA: la lista con la situación de cada relación viva, los conteos y qué cambió desde la corrida de las 06:00. No toca ARCA. */
  async lista(): Promise<ListaBajasArca> {
    const { data } = await axios.get("/arca/operaciones/lista");
    return data;
  },
  /** Los conteos guardados de Bajas ARCA (barato: el número del menú). */
  async listaResumen(): Promise<{ el: string | null; conteos: ConteosBajaArca | null }> {
    const { data } = await axios.get("/arca/operaciones/lista/resumen");
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
