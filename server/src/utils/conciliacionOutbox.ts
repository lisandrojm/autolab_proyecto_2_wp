import { leerAnclas } from "./anclasNombre.js";
import { ArchivoConNombre } from "./coincidenciaDeNombre.js";

/**
 * LO QUE YA SE ENVIÓ NO SE QUEDA EN OUTBOX (28/10/2026). La decisión, SIN Dropbox ni base: es lo que se
 * testea. La ejecución está en `services/conciliacionOutboxService.ts`.
 *
 * El aviso por mail de Dropbox Sign (`dropboxSignMailService.ts`) era la única señal de que un documento
 * se había enviado: si no llegaba, no entraba en la ventana de 30 días o el asunto no matcheaba, el
 * archivo quedaba en Outbox para siempre, aunque ya estuviera esperando firma o hasta firmado. Así quedaron
 * 20 recibos del PERIODO_09, que en cuanto existiera la regla de colocación se habrían vuelto a mandar.
 *
 * Las carpetas son la otra fuente, y la más confiable: si el código del documento («ID-000429») está en
 * Pendbox o en Requested signatures, se envió. Por cada archivo del Outbox:
 *   · con código y ese código en Firmados → `firmado` (gana sobre Pendbox: ya volvió);
 *   · con código y ese código en Pendbox → `esperando_firma`;
 *   · si no, se queda: `sin_codigo` (no se adivina por persona ni CUIL: hay personas con dos documentos,
 *     BENITEZ con ID-000448 e ID-000510) o `sin_rastro`.
 * Los que se van se MUEVEN (nunca se borran): un match equivocado se recupera.
 */

export type EstadoYaEnviado = "firmado" | "esperando_firma";

export interface YaEnviado {
  archivo: ArchivoConNombre;
  codigo: string;
  estado: EstadoYaEnviado;
  /** El archivo de Pendbox o Firmados que lo prueba. */
  prueba: string;
}

export interface Queda {
  archivo: ArchivoConNombre;
  motivo: "sin_codigo" | "sin_rastro";
}

export interface PlanConciliacion {
  mover: YaEnviado[];
  quedan: Queda[];
}

const esDocumento = (e: ArchivoConNombre) => !/\.json$/i.test(e.name);

/** Código → primer archivo que lo trae, de una carpeta. */
export function codigosDe(archivos: ArchivoConNombre[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of archivos.filter(esDocumento)) {
    const c = leerAnclas(a.name).codigo;
    if (c && !m.has(c)) m.set(c, a.name);
  }
  return m;
}

export function planConciliacionOutbox(outbox: ArchivoConNombre[], pendbox: ArchivoConNombre[], firmados: ArchivoConNombre[]): PlanConciliacion {
  const enPendbox = codigosDe(pendbox);
  const enFirmados = codigosDe(firmados);
  const plan: PlanConciliacion = { mover: [], quedan: [] };
  for (const archivo of outbox.filter(esDocumento)) {
    const codigo = leerAnclas(archivo.name).codigo;
    if (!codigo) plan.quedan.push({ archivo, motivo: "sin_codigo" });
    else if (enFirmados.has(codigo)) plan.mover.push({ archivo, codigo, estado: "firmado", prueba: enFirmados.get(codigo)! });
    else if (enPendbox.has(codigo)) plan.mover.push({ archivo, codigo, estado: "esperando_firma", prueba: enPendbox.get(codigo)! });
    else plan.quedan.push({ archivo, motivo: "sin_rastro" });
  }
  return plan;
}

/** Si el código ya está en Pendbox o Firmados, cuál de los dos (la red de la corrida de envío). */
export function yaEnviadoPorCarpeta(codigo: string, carpetas: { pendbox: Map<string, string>; firmados: Map<string, string> }): EstadoYaEnviado | null {
  if (!codigo) return null;
  if (carpetas.firmados.has(codigo)) return "firmado";
  if (carpetas.pendbox.has(codigo)) return "esperando_firma";
  return null;
}

export const TEXTO_ESTADO: Record<EstadoYaEnviado, string> = { firmado: "firmado", esperando_firma: "esperando firma" };

/** El resumen del modo seco: totales y una línea por archivo que se movería. */
export function describirConciliacion(plan: PlanConciliacion, enSeco: boolean): string[] {
  const firmados = plan.mover.filter((m) => m.estado === "firmado").length;
  const sinRastro = plan.quedan.filter((q) => q.motivo === "sin_rastro").length;
  const sinCodigo = plan.quedan.filter((q) => q.motivo === "sin_codigo").length;
  const lineas = [
    `Conciliación Outbox ↔ Pendbox/Firmados${enSeco ? " — EN SECO" : ""}`,
    "",
    `  ${plan.mover.length + plan.quedan.length} archivos en Outbox`,
    `  ${plan.mover.length} ya enviados (${firmados} firmados · ${plan.mover.length - firmados} esperando firma)  → ${enSeco ? "se moverían" : "se mueven"}`,
    `  ${sinRastro} sin rastro en Pendbox ni Firmados  → se quedan`,
    ...(sinCodigo ? [`  ${sinCodigo} sin código ID-NNNNNN en el nombre  → se quedan (no se matchea por persona)`] : []),
    "",
  ];
  for (const m of [...plan.mover].sort((a, b) => a.codigo.localeCompare(b.codigo))) lineas.push(`  ${m.codigo}  ${TEXTO_ESTADO[m.estado].padEnd(16)} ${m.archivo.name}`);
  return lineas;
}
