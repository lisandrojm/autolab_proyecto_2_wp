import { Types } from "mongoose";
import { ArcaVerificacionAlta } from "../models/ArcaVerificacionAlta.js";
import { ConstanciaArca } from "../models/ConstanciaArca.js";
import { ArcaAltasLog } from "../models/ArcaAltasLog.js";
import { RenovacionContrato } from "../models/RenovacionContrato.js";
import { ReciboSueldoEnviado } from "../models/ReciboSueldoEnviado.js";
import { LoteRecibosSueldo } from "../models/LoteRecibosSueldo.js";
import { User } from "../models/User.js";

/*
  LO QUE CUELGA DE UN CONTRATO EN OTRAS COLECCIONES (18/11/2026). Todas lo nombran por su POSICIÓN en el
  array (la etapa 2c les va a sumar la clave). Lo usan el panel (vista previa antes de anular, y la
  anulación misma) y el script `anularContratos.ts`: la misma regla en los dos lados.

  BLOQUEANTES: lo que una persona ve o firma, o una decisión todavía abierta. Un contrato anulado no
  puede quedar debajo de un recibo de sueldo ni de una renovación: primero se mueven (los recibos, con
  `moverRecibos`) o se resuelven.
  INFORMATIVAS: registro histórico de ARCA (verificaciones, constancias, logs de corridas). Siguen
  apuntando a la posición, donde queda la lápida, y el contrato entero está en `contratos_anulados`.
  Un alta YA presentada no llega hasta acá: la anulación la frena antes.
*/

export interface ReferenciasDeContrato {
  bloqueantes: { recibos: { periodo: string; estado: string }[]; lotesDeRecibos: number; renovaciones: number; solicitudesDeRenovacion: number };
  informativas: { verificacionesArca: number; constanciasArca: number; logsDeAltas: number };
  totalBloqueantes: number;
  /** Para mostrar: «2 recibos de sueldo (2026-09 firmado, 2026-10 enviado) · 1 renovación». Vacío si no hay. */
  textoBloqueantes: string;
  textoInformativas: string;
}

export async function referenciasDeContrato(userProjectId: Types.ObjectId | string, idx: number): Promise<ReferenciasDeContrato> {
  const upId = new Types.ObjectId(String(userProjectId));
  const [verificacionesArca, constanciasArca, logsDeAltas, renovaciones, recibos, lotesDeRecibos, solicitudesDeRenovacion] = await Promise.all([
    ArcaVerificacionAlta.countDocuments({ userProjectId: upId, contractIndex: idx }),
    ConstanciaArca.countDocuments({ userProjectId: upId, contractIndex: idx }),
    ArcaAltasLog.countDocuments({ contratos: { $elemMatch: { userProjectId: upId, contractIndex: idx } } }),
    RenovacionContrato.countDocuments({ userProjectId: upId, indiceContrato: idx }),
    ReciboSueldoEnviado.find({ userProjectId: upId, contractIndex: idx }).select("periodo estado").sort({ periodo: 1 }).lean(),
    LoteRecibosSueldo.countDocuments({ recibos: { $elemMatch: { userProjectId: upId, contractIndex: idx } } }),
    User.countDocuments({ "metadata.renovacionDe.userProjectId": upId, "metadata.renovacionDe.indiceContrato": idx }),
  ]);
  const listaRecibos = (recibos as any[]).map((r) => ({ periodo: String(r.periodo || ""), estado: String(r.estado || "") }));
  const partes = (xs: [number, string][]) => xs.filter(([n]) => n > 0).map(([n, t]) => `${n} ${t}`).join(" · ");
  const textoRecibos = listaRecibos.length ? ` (${listaRecibos.map((r) => `${r.periodo} ${r.estado}`).join(", ")})` : "";
  return {
    bloqueantes: { recibos: listaRecibos, lotesDeRecibos, renovaciones, solicitudesDeRenovacion },
    informativas: { verificacionesArca, constanciasArca, logsDeAltas },
    // Los lotes son el mismo recibo visto desde la sábana: se mueven con él y no suman aparte.
    totalBloqueantes: listaRecibos.length + (listaRecibos.length ? 0 : lotesDeRecibos) + renovaciones + solicitudesDeRenovacion,
    textoBloqueantes: partes([
      [listaRecibos.length || lotesDeRecibos, `${(listaRecibos.length || lotesDeRecibos) === 1 ? "recibo" : "recibos"} de sueldo${textoRecibos}`],
      [renovaciones, renovaciones === 1 ? "decisión de renovación" : "decisiones de renovación"],
      [solicitudesDeRenovacion, solicitudesDeRenovacion === 1 ? "solicitud de renovación" : "solicitudes de renovación"],
    ]),
    textoInformativas: partes([
      [verificacionesArca, "verificaciones en ARCA"],
      [constanciasArca, "constancias de ARCA"],
      [logsDeAltas, "registros de corridas de altas"],
    ]),
  };
}

/**
 * Mueve los recibos de sueldo de un contrato a otro DEL MISMO vínculo (p. ej. quedaron atados al
 * contrato duplicado y hay que anularlo). Filtra por la posición vieja: si algo cambió en el medio, no
 * toca nada que no deba. Devuelve qué movió, para el respaldo/auditoría.
 */
export async function moverRecibos(userProjectId: Types.ObjectId | string, deIdx: number, aIdx: number): Promise<{ recibos: string[]; lotes: string[]; movidos: number; lotesMovidos: number }> {
  const upId = new Types.ObjectId(String(userProjectId));
  const recibos: any[] = await ReciboSueldoEnviado.find({ userProjectId: upId, contractIndex: deIdx }).select("_id").lean();
  const lotes: any[] = await LoteRecibosSueldo.find({ recibos: { $elemMatch: { userProjectId: upId, contractIndex: deIdx } } }).select("_id").lean();
  const r1 = recibos.length ? await ReciboSueldoEnviado.updateMany({ _id: { $in: recibos.map((r) => r._id) }, contractIndex: deIdx }, { $set: { contractIndex: aIdx } }) : { modifiedCount: 0 };
  const r2 = lotes.length
    ? await LoteRecibosSueldo.updateMany({ _id: { $in: lotes.map((l) => l._id) } }, { $set: { "recibos.$[r].contractIndex": aIdx } }, { arrayFilters: [{ "r.userProjectId": upId, "r.contractIndex": deIdx }] })
    : { modifiedCount: 0 };
  return { recibos: recibos.map((r) => String(r._id)), lotes: lotes.map((l) => String(l._id)), movidos: r1.modifiedCount, lotesMovidos: r2.modifiedCount };
}
