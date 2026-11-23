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

/*
  BAJAS ARCA: la lista (`GET /arca/operaciones/lista`, `server/src/services/arca/listaBajasArca.ts`). Una fila por
  relación viva en ARCA sobre la que se puede operar, cada una con exactamente una situación. Todo lo decide el server.
*/
export type SituacionBajaArca = 1 | 2 | 3 | 4 | 5 | 6;
export const SITUACIONES_BAJA_ARCA: Record<SituacionBajaArca, string> = {
  1: "Terminado en WeProdu",
  2: "Termina antes de su fecha",
  3: "Baja presentada, sin confirmar",
  4: "Sin contrato en WeProdu",
  5: "Indeterminado vigente",
  6: "Plazo vigente",
};

/** Por qué una relación viva está en la lista sin poder operarse desde acá (botón deshabilitado). */
export type MotivoBloqueoBajaArca = "varios_contratos" | "varios_proyectos" | "baja_presentada" | "no_se_opera";
export type EnWeproduBajaArca = "con_contrato" | "sin_contrato" | "sin_ficha";

export interface FilaBajaArca {
  clave: string;
  empleadoraCuit: string;
  empleadora: string;
  cuil: string;
  persona: string;
  userId: string | null;
  /** La persona no tiene ficha en WeProdu (distinto de «ficha sin contrato con esa alta»). */
  sinFicha: boolean;
  /** Qué hay en WeProdu de esta relación: un contrato (o varios), la ficha sin ese contrato, o ni la ficha. */
  enWeprodu: EnWeproduBajaArca;
  inicio: string;
  finArca: string;
  modalidadArca: string;
  /** El tipo por el que se filtra y se ordena: el de WeProdu si hay contrato; si no, la modalidad que declara ARCA. */
  tipo: string;
  /** El nombre del tipo de contrato de WeProdu; "" sin contrato (se muestra la modalidad de ARCA). */
  tipoContrato: string;
  proyecto: string;
  proyectos: string[];
  finWeprodu: string;
  diasDesdeFin: number | null;
  /** `null` = fila bloqueada (ver `bloqueo`). */
  situacion: SituacionBajaArca | null;
  bloqueo: { motivo: MotivoBloqueoBajaArca; etiqueta: string; texto: string } | null;
  detalle: string;
  /** Advertencia visible en la fila y en el panel (la modalidad de directores, LRT). "" si ninguna. */
  advertencia: string;
  /** El motivo de baja cargado en el contrato (`null` = sin motivo, o la relación no tiene un único contrato). */
  motivoBaja: { codigo: string; descripcion: string; fechaTelegrama: string } | null;
  /** Lo que falta para presentar la baja sin que nadie elija nada (situaciones 1 y 2; el telegrama de una renuncia, en todas). */
  falta: "" | "motivo" | "telegrama";
  /** Con qué contrato abre el panel; `null` = modo «sin contrato». */
  contrato: { userProjectId: string; contratoKey: string | null; posicion: number } | null;
}

export interface ConteosBajaArca {
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  s5: number;
  /** Las fotos guardadas antes de la situación 6 no lo traen. */
  s6?: number;
  /** La suma de 1 a 4: el número del menú. La 5 y la 6 son inventario. */
  pendientes: number;
  /** Las filas sin situación (botón deshabilitado), por motivo. */
  bloqueadas?: Partial<Record<MotivoBloqueoBajaArca, number>>;
  /** Todas las filas: tiene que ser igual a las relaciones vivas del espejo. */
  total?: number;
}

export interface MovimientosBajaArca {
  entraron: { clave: string; persona: string; situacion: SituacionBajaArca }[];
  salieron: { clave: string; persona: string; situacion: SituacionBajaArca; ahora: string }[];
  cambiaron: { clave: string; persona: string; de: SituacionBajaArca; a: SituacionBajaArca }[];
}

export interface ListaBajasArca {
  hoy: string;
  /** TODAS las relaciones vivas del espejo: con situación (1 a 6) o bloqueadas. */
  filas: FilaBajaArca[];
  conteos: ConteosBajaArca;
  /** Las relaciones vivas del espejo, contadas aparte: si no coincide con las filas, la lista tiene un error. */
  vivasEnEspejo: number;
  /** La tabla de motivos de baja de ARCA, para cargar el del contrato desde la fila. */
  situacionesBaja: Array<{ codigo: string; descripcion: string }>;
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
  /** La modalidad como la declara ARCA (texto): para la advertencia de directores (LRT). */
  modalidadTexto?: string;
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
  /** El motivo de baja cargado en el contrato y la fecha de telegrama: el panel los trae precargados. */
  motivoBajaArca?: string;
  fechaTelegramaBaja?: string;
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
  /** Guarda en el contrato el motivo de baja (código de ARCA) y, sólo si es renuncia, la fecha de telegrama. No toca ARCA. */
  async guardarMotivoBaja(ref: ReferenciaContratoArca, datos: { motivo: string; fechaTelegrama: string }): Promise<{ motivoBajaArca: string; fechaTelegramaBaja: string }> {
    const { data } = await axios.put("/arca/operaciones/motivo-baja", { ...ref, ...datos });
    return data;
  },
  /** La tabla de motivos de baja de ARCA (para el formulario del contrato). */
  async situacionesBaja(): Promise<Array<{ codigo: string; descripcion: string }>> {
    const { data } = await axios.get("/arca/operaciones/situaciones-baja");
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
