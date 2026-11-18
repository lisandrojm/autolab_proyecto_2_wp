import { Types } from "mongoose";
import { ContratoAnulado } from "../models/ContratoAnulado.js";
import { User } from "../models/User.js";
import { esLapida, lapidaDe, quedanContratosSiSeAnula } from "../utils/anulacionContrato.js";
import { eliminarVinculo } from "./contratoDeSolicitud.js";

/*
  ANULAR UN CONTRATO (etapa 2b, 18/11/2026). Reemplaza al borrado físico: ver `utils/anulacionContrato.ts`.

  Orden: primero el ARCHIVO (el contrato entero en `contratos_anulados`), después la lápida. Si la lápida
  no se puede guardar, se borra el archivo: no queda un contrato «anulado» que en realidad sigue vivo. El
  índice único por `contratoKey` impide archivar dos veces el mismo contrato.

  Si no queda ningún contrato de verdad en el vínculo, se borra el vínculo entero, como hacía el borrado
  físico (el equipo, la coordinación y la ficha dejan de mostrar a la persona en ese proyecto). El
  contrato queda igual en el archivo, con `vinculoEliminado`.
*/

export interface QuienAnula {
  tenantId?: Types.ObjectId | string | null;
  por?: Types.ObjectId | string | null;
  porNombre?: string;
}

export class AnulacionInvalida extends Error {}

export async function anularContrato(o: QuienAnula & { up: any; idx: number; motivo: string; origen: "panel" | "borrar_solicitud" | "delete_deprecado" }): Promise<{ contratoKey: string; vinculoEliminado: boolean }> {
  const { up, idx } = o;
  const contratos: any[] = up.contracts || [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= contratos.length) throw new AnulacionInvalida("Contrato no encontrado");
  const actual = contratos[idx];
  if (esLapida(actual)) throw new AnulacionInvalida("Este contrato ya está anulado.");
  /*
    UN ALTA YA PRESENTADA EN ARCA NO SE ANULA ACÁ. Su marca (`altaArcaPresentada`) es lo que impide dar
    otra alta de la misma persona con la misma empleadora (`altasVigentes.ts`) y lo que espera su
    constancia. Anularla la borraría de esos controles mientras ARCA la sigue teniendo. Primero la baja en
    ARCA (etapa 3).
  */
  const resultadoArca = String(actual?.altaArcaPresentada?.resultado || "");
  if (["presentada", "indeterminado", "presentando"].includes(resultadoArca)) {
    throw new AnulacionInvalida(resultadoArca === "presentando" ? "Este contrato se está presentando en ARCA ahora mismo: no se puede anular." : "Este contrato ya tiene el alta presentada en ARCA: no se puede anular. Hay que darle la baja.");
  }
  const motivo = String(o.motivo || "").trim();
  if (!motivo) throw new AnulacionInvalida("Falta el motivo de la anulación.");

  const contrato: Record<string, any> = typeof actual?.toObject === "function" ? actual.toObject() : { ...actual };
  // Un contrato todavía sin clave (antes del backfill) recibe una acá: la lápida y el archivo tienen que compartirla.
  const contratoKey = contrato.contratoKey ? new Types.ObjectId(String(contrato.contratoKey)) : new Types.ObjectId();
  const anuladoEl = new Date();
  const por = o.por && Types.ObjectId.isValid(String(o.por)) ? new Types.ObjectId(String(o.por)) : null;
  const vinculoEliminado = !quedanContratosSiSeAnula(contratos, idx);
  // Quién, con nombre: el token sólo trae el id, y el archivo tiene que poder leerse sin cruzar tablas.
  let porNombre = o.porNombre || "";
  if (!porNombre && por) {
    const u: any = await User.findById(por).select("firstName lastName email metadata.fullName").lean().catch(() => null);
    porNombre = u ? u.metadata?.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "" : "";
  }

  const archivo = await ContratoAnulado.create({
    tenantId: o.tenantId && Types.ObjectId.isValid(String(o.tenantId)) ? new Types.ObjectId(String(o.tenantId)) : null,
    userProjectId: up._id,
    userId: up.userId,
    projectId: up.projectId,
    contratoKey,
    posicion: idx,
    contrato: { ...contrato, contratoKey },
    anuladoEl,
    anuladoPor: por,
    anuladoPorNombre: porNombre,
    motivo,
    origen: o.origen,
    vinculoEliminado,
  });

  try {
    if (vinculoEliminado) {
      await eliminarVinculo(up);
    } else {
      up.contracts[idx] = lapidaDe(contrato, contratoKey, { el: anuladoEl, por, porNombre, motivo });
      up.markModified("contracts");
      await up.save();
    }
  } catch (e) {
    await ContratoAnulado.deleteOne({ _id: archivo._id }).catch(() => {});
    throw e;
  }
  console.log(`[anular-contrato] ${up._id}#${idx} (clave ${contratoKey}) anulado por ${porNombre || o.por || "?"} desde ${o.origen}${vinculoEliminado ? "; era el último: se borró el vínculo" : ""}. Motivo: ${motivo}`);
  return { contratoKey: String(contratoKey), vinculoEliminado };
}
