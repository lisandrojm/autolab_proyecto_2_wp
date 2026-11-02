import { fechaCorta } from "./altasVigentes.js";

/**
 * QUÉ HACER CON UN ALTA TRABADA POR «ARCA YA TIENE UN ALTA DE ESE DÍA» después de mirarla en ARCA
 * (pedido del 02/11/2026). Puro: la consulta llega por parámetro. La corre `verificacionAltas.ts`.
 *
 * La traba (`bloqueoPorVigencia`, regla 4) sale de las Relaciones Laborales SINCRONIZADAS: hay una
 * relación con esa empleadora que empieza el mismo día. Casi siempre es ESTA alta, hecha a mano en ARCA
 * o por un contrato duplicado, y quedaba trabada para siempre hasta que alguien la revisara. Acá se
 * consulta ARCA en vivo (Relaciones Laborales → Consultas, por CUIL, solo lectura) y se decide:
 *
 *   · UNA relación que empieza ese día, con el mismo fin que el contrato (o las dos sin fin) → el alta
 *     ya está hecha: se marca PRESENTADA. Nunca se vuelve a presentar (sería el rechazo por alta activa).
 *   · Esa relación sin fecha de fin y el contrato con baja → REVISIÓN MANUAL: falta informar la baja, y
 *     el sistema no presenta bajas (decisión del 02/11/2026). Con fin, ARCA la cierra sola al vencer.
 *   · Fechas que no coinciden, más de una relación ese día, ninguna, la consulta que falla, o otro
 *     contrato de WeProdu que ya es esa alta → REVISIÓN MANUAL, con lo que se vio.
 *
 * «No la encontré» NO destraba nada (decisión del 02/11/2026): el lector de ARCA sólo afirma lo que ve
 * (ver `altaEnConsulta` en el motor) y la sincronización sí la había traído. Volver a presentarla por un
 * «no la vi» es justo el rechazo que se quiere evitar.
 */

/** Una relación tal como la mostró la consulta. Fechas "YYYY-MM-DD"; `fin` vacío = sin fecha de fin. */
export interface RelacionConsultada {
  inicio: string;
  fin: string;
  /** La «situación de baja» si la tarjeta la nombra; vacío si no. */
  baja?: string;
  texto?: string;
}

export type ConsultaArca = { ok: true; relaciones: RelacionConsultada[]; /** El CUIL y la fecha están en pantalla (o null: no se pudo afirmar). */ encontrada: true | null } | { ok: false; error: string };

export interface AltaAVerificar {
  /** "YYYY-MM-DD" */
  alta: string;
  /** "YYYY-MM-DD"; vacío = tiempo indeterminado. */
  baja: string;
  /** Otro contrato de WeProdu de la misma persona y empleadora, ya presentado, empieza el mismo día. */
  otroContratoMismoDia: boolean;
}

export type DecisionVerificacion =
  | { accion: "presentada"; motivo: string; relacion: RelacionConsultada }
  | { accion: "revision_manual"; motivo: string; relacion?: RelacionConsultada };

const manual = (motivo: string, relacion?: RelacionConsultada): DecisionVerificacion => ({ accion: "revision_manual", motivo, ...(relacion ? { relacion } : {}) });

/** Si otro contrato de WeProdu ya es esa alta, no hace falta consultar ARCA: es un duplicado para revisar. */
export function decisionSinConsultar(a: AltaAVerificar): DecisionVerificacion | null {
  if (!a.otroContratoMismoDia) return null;
  return manual(`Otro contrato de esta persona con esta empleadora que empieza el ${fechaCorta(a.alta)} ya figura presentado desde WeProdu: revisar si éste es un duplicado. No se marca presentado para no tener dos contratos con la misma alta.`);
}

export function decidirVerificacion(a: AltaAVerificar, consulta: ConsultaArca): DecisionVerificacion {
  const previa = decisionSinConsultar(a);
  if (previa) return previa;
  if (consulta.ok === false) return manual(`La consulta a ARCA falló: ${consulta.error}`);

  const delDia = consulta.relaciones.filter((r) => r.inicio === a.alta);
  if (delDia.length === 0) {
    return manual(
      consulta.encontrada === true
        ? `ARCA muestra el CUIL y el ${fechaCorta(a.alta)} en la consulta, pero no se pudo leer la relación: revisar a mano.`
        : `La consulta a ARCA no mostró ninguna relación que empiece el ${fechaCorta(a.alta)} (la sincronización sí la había traído). Revisar a mano en Relaciones Laborales → Consultas: no se presenta por un «no la vi».`,
    );
  }
  if (delDia.length > 1) return manual(`ARCA muestra ${delDia.length} relaciones que empiezan el ${fechaCorta(a.alta)}: no se puede saber cuál es la de este contrato. Revisar a mano.`);

  const r = delDia[0];
  const periodoArca = r.fin ? `del ${fechaCorta(r.inicio)} al ${fechaCorta(r.fin)}` : `desde el ${fechaCorta(r.inicio)}, sin fecha de fin`;
  if (a.baja) {
    if (r.fin === a.baja) return { accion: "presentada", motivo: `Resuelta por verificación automática: el alta ya estaba registrada en ARCA (${periodoArca}).`, relacion: r };
    if (!r.fin) return manual(`El alta ya está en ARCA (${periodoArca}), pero falta la baja del ${fechaCorta(a.baja)}: hay que informarla a mano en ARCA (el sistema no presenta bajas).`, r);
    return manual(`ARCA tiene la relación ${periodoArca} y el contrato va del ${fechaCorta(a.alta)} al ${fechaCorta(a.baja)}: las fechas de fin no coinciden. Revisar cuál es la correcta.`, r);
  }
  if (!r.fin) return { accion: "presentada", motivo: `Resuelta por verificación automática: el alta ya estaba registrada en ARCA (${periodoArca}).`, relacion: r };
  return manual(`ARCA tiene la relación ${periodoArca} y el contrato es por tiempo indeterminado: las fechas no coinciden. Revisar cuál es la correcta.`, r);
}
