import { huellaNoCoincide } from "./identidadContrato.js";

/*
  ¿A QUÉ CONTRATO APUNTA DE VERDAD UNA REFERENCIA? (etapa 2c, 18/11/2026)

  Antes de la 2b los borrados físicos corrían las posiciones: una referencia guardada antes de un borrado
  quedó apuntando al contrato de al lado. La única forma de saberlo es comparar lo que la referencia
  guardó del contrato con el contrato que hoy está en su posición. Lo usan el backfill de claves (que
  SÓLO pone la clave donde la referencia es consistente) y la reubicación (que mueve las corridas a su
  contrato, sólo con evidencia fuerte y un único candidato).

  EVIDENCIA, de más fuerte a más débil:
   - `logId`: el contrato presentado guarda en `altaArcaPresentada.logId` el log de la corrida que lo
     presentó. Si la referencia es de ese log, es ese contrato. Sólo cuenta si algún contrato del vínculo
     tiene ese log (una presentación rechazada no deja log en el contrato).
   - `alta` + `empresaId`: misma persona y proyecto (el vínculo), misma fecha de alta y misma empleadora.
   - `baja` sola (renovaciones): débil: dos contratos del vínculo pueden terminar el mismo día.
*/

export type CampoDeHuella = "logId" | "alta" | "baja" | "empresaId";
export interface HuellaDeReferencia { alta?: string | null; baja?: string | null; empresaId?: unknown; logId?: unknown }

export interface Clasificacion {
  tipo: "consistente" | "lapida" | "sin_huella" | "corrida" | "fuera";
  /** Qué se comparó (vacío = nada comparable). */
  evidencia: CampoDeHuella[];
  /** `fuerte`: logId, o alta + empleadora. `debil`: cualquier otra cosa. */
  fuerza: "fuerte" | "debil" | "ninguna";
  /** Por qué no coincide (corrida / fuera). */
  motivo?: string;
  /** Posiciones que coinciden con la huella (corrida / fuera). Sin lápidas. */
  candidatos?: number[];
}

const logDe = (c: any) => String(c?.altaArcaPresentada?.logId || "");

/** La huella que se puede usar en ESTE vínculo: el `logId` sólo si algún contrato lo tiene. */
export function huellaUtil(lista: any[], h: HuellaDeReferencia): HuellaDeReferencia {
  const out: HuellaDeReferencia = {};
  if (h.alta) out.alta = h.alta;
  if (h.baja) out.baja = h.baja;
  if (h.empresaId) out.empresaId = h.empresaId;
  if (h.logId && lista.some((c) => logDe(c) === String(h.logId))) out.logId = h.logId;
  return out;
}

export function fuerzaDe(campos: CampoDeHuella[]): Clasificacion["fuerza"] {
  if (campos.includes("logId") || (campos.includes("alta") && campos.includes("empresaId"))) return "fuerte";
  return campos.length ? "debil" : "ninguna";
}

/** La huella completa contra un contrato: la de `identidadContrato` más el log. */
export function noCoincide(c: any, h: HuellaDeReferencia): string | null {
  const m = huellaNoCoincide(c, h);
  if (m) return m;
  if (h.logId && logDe(c) !== String(h.logId)) return `presentado por otro log (${logDe(c).slice(-6) || "ninguno"} ≠ ${String(h.logId).slice(-6)})`;
  return null;
}

export function clasificarReferencia(lista: any[], ref: { indice: number | null | undefined; huella: HuellaDeReferencia }): Clasificacion {
  const h = huellaUtil(lista, ref.huella);
  const evidencia = (["logId", "alta", "baja", "empresaId"] as CampoDeHuella[]).filter((k) => !!h[k]);
  const fuerza = fuerzaDe(evidencia);
  // Candidatos sólo con algo que distinga contratos (la empleadora sola no: casi todos la comparten).
  const candidatos = () => (h.alta || h.baja || h.logId ? lista.flatMap((c, i) => (c?.estadoContrato !== "ANULADO" && noCoincide(c, h) === null ? [i] : [])) : []);
  const n = Number(ref.indice);
  if (ref.indice == null || !Number.isInteger(n) || n < 0 || n >= lista.length) return { tipo: "fuera", evidencia, fuerza, motivo: `posición ${ref.indice ?? "sin guardar"} fuera de los ${lista.length} contratos`, candidatos: candidatos() };
  const c = lista[n];
  // La lápida no guarda alta/baja/empleadora/log (están en `contratos_anulados`): se acepta.
  if (c?.estadoContrato === "ANULADO") return { tipo: "lapida", evidencia, fuerza };
  const motivo = noCoincide(c, h);
  if (motivo) return { tipo: "corrida", evidencia, fuerza, motivo, candidatos: candidatos() };
  return { tipo: evidencia.length ? "consistente" : "sin_huella", evidencia, fuerza };
}
