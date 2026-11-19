/**
 * EL ESTADO DE UN CONTRATO SEGÚN SUS DATOS LOCALES (etapa 3, 19/11/2026; decisiones del usuario).
 *
 * Sale SÓLO de lo que el contrato tiene cargado en WeProdu: fecha de alta, fecha de baja y si su tipo es
 * de tiempo indeterminado. Nada de ARCA: aplicar las bajas del espejo es otro paso, con su propia regla
 * de evidencia fuerte.
 *
 *   FINALIZADO      tiene baja y ya pasó.
 *   VIGENTE         tiene baja de hoy en adelante, o no tiene baja y su tipo ES de tiempo
 *                   indeterminado (el único caso en que «sin baja» quiere decir «abierto»). Un alta
 *                   futura también es VIGENTE: el contrato está vivo aunque todavía no rija; que rija
 *                   hoy lo dice además la fecha (`rigeHoy`).
 *   SIN_DETERMINAR  los datos no alcanzan para decidir, y se dice por qué (`motivo`): sin alta, baja
 *                   anterior al alta, o sin baja con un tipo que NO es indeterminado (o desconocido).
 *                   Nunca se lo manda a VIGENTE por defecto: «sin baja = vigente para siempre» es el
 *                   bug del que venimos. Va a un listado para que lo resuelva una persona.
 *   ANULADO         lo pone la anulación; esto no lo calcula ni lo toca.
 */
import { fechaISO } from "./contratoVigencia.js";

export type EstadoContrato = "VIGENTE" | "FINALIZADO" | "SIN_DETERMINAR";

export interface EstadoCalculado {
  estado: EstadoContrato;
  motivo?: string;
}

/**
 * @param tipoIndeterminado el tipo del contrato (ABM de Contratos) es de tiempo indeterminado; `undefined`
 *   si no se pudo saber cuál es el tipo.
 */
export function estadoSegunDatosLocales(c: { fecha_alta_contrato?: unknown; fecha_baja_contrato?: unknown }, tipoIndeterminado: boolean | undefined, hoy: string): EstadoCalculado {
  const alta = fechaISO(c?.fecha_alta_contrato as any);
  const baja = fechaISO(c?.fecha_baja_contrato as any);
  if (!alta) return { estado: "SIN_DETERMINAR", motivo: "sin fecha de alta" };
  if (baja && baja < alta) return { estado: "SIN_DETERMINAR", motivo: `la baja (${baja}) es anterior al alta (${alta})` };
  if (baja) return { estado: baja < hoy ? "FINALIZADO" : "VIGENTE" };
  if (tipoIndeterminado === true) return { estado: "VIGENTE" };
  return { estado: "SIN_DETERMINAR", motivo: tipoIndeterminado === undefined ? "sin fecha de baja y no se reconoce el tipo de contrato" : "sin fecha de baja y el tipo de contrato no es de tiempo indeterminado" };
}

/**
 * La vigencia NUEVA (todavía no la usa ningún helper: primero el reporte que la compara con la vieja).
 * Rige hoy = estado VIGENTE, ya arrancó, y si tiene baja todavía no pasó. Sin estado, o con cualquier
 * otro, no rige: no se adivina.
 */
export function rigeHoySegunEstado(c: { estadoContrato?: unknown; fecha_alta_contrato?: unknown; fecha_baja_contrato?: unknown }, hoy: string): boolean {
  if (c?.estadoContrato !== "VIGENTE") return false;
  const alta = fechaISO(c.fecha_alta_contrato as any);
  const baja = fechaISO(c.fecha_baja_contrato as any);
  return !!alta && alta <= hoy && (!baja || baja >= hoy);
}

/** El tipo del contrato es indeterminado: por `contrato_id`, y si no, por el nombre exacto del tipo. */
export function tipoEsIndeterminado(c: { contrato_id?: unknown; nombre_contrato?: unknown }, porId: Map<string, boolean>, porNombre: Map<string, boolean>): boolean | undefined {
  const id = c?.contrato_id ? porId.get(String(c.contrato_id)) : undefined;
  return id ?? porNombre.get(String(c?.nombre_contrato || "").trim().toLowerCase());
}
