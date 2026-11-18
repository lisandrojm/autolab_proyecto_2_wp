import { Types } from "mongoose";
import { Info } from "../models/Info.js";
import { User } from "../models/User.js";
import { copiarConstanciaAContratados, estadoContratado } from "./contratadoDirecto.js";
import { esLapida } from "../utils/anulacionContrato.js";
/*
  TERMINAR EL CIRCUITO SIN FIRMA (18/11/2026). Pedido: contratos cuyos documentos ya se generaron pero NO
  se van a mandar a firmar tienen que terminar el flujo así como están, en el estado final (el de la
  carpeta de firmados; en este tenant «Disponible»), igual que un contrato de un tipo que no firma nada.

  Sólo cambia el estado (sólo hacia adelante) y deja `cierreSinFirma` con quién, cuándo, por qué y desde
  qué estado venía. Los documentos generados quedan como están. La constancia de CUIT se copia a
  «Contratados / Sin firma» como en `pasarAContratados` (best-effort: si Dropbox falla, se informa).

  No se aplica a un alta de ARCA pendiente (el trámite impositivo no se saltea) ni a una lápida.
*/
export class CierreInvalido extends Error {
}
export async function cerrarSinFirma(o) {
    const { up, idx } = o;
    const c = up.contracts?.[idx];
    if (!c || esLapida(c))
        throw new CierreInvalido("Contrato no encontrado (o anulado).");
    const motivo = String(o.motivo || "").trim();
    if (!motivo)
        throw new CierreInvalido("Falta el motivo.");
    const final = await estadoContratado();
    if (!final?.data?.id)
        throw new CierreInvalido("No hay un estado configurado con la carpeta de firmados: no se sabe cuál es el estado final.");
    const actual = c.estado_id != null ? await Info.findOne({ type: "estado-empleado", "data.id": Number(c.estado_id) }).select("name data.ordenDependencia data.tipoImpositivo data.esImpositivo").lean() : null;
    if (Number(c.estado_id) === Number(final.data.id))
        throw new CierreInvalido(`Ya está en «${final.name}».`);
    if ((Number(actual?.data?.ordenDependencia) || 0) >= (Number(final.data.ordenDependencia) || 0))
        throw new CierreInvalido(`«${actual?.name || c.nombre_estado_empleado}» no está antes de «${final.name}»: sólo se avanza.`);
    if (actual?.data?.esImpositivo || actual?.data?.tipoImpositivo === "alta_temprana_afip") {
        throw new CierreInvalido(`Está en el trámite impositivo («${actual?.name}»): eso no se saltea. Terminá el trámite primero.`);
    }
    const por = o.por && Types.ObjectId.isValid(String(o.por)) ? new Types.ObjectId(String(o.por)) : null;
    let porNombre = o.porNombre || "";
    if (!porNombre && por) {
        const u = await User.findById(por).select("firstName lastName email metadata.fullName").lean().catch(() => null);
        porNombre = u ? u.metadata?.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "" : "";
    }
    const estadoAnterior = { id: c.estado_id != null ? Number(c.estado_id) : null, nombre: String(c.nombre_estado_empleado || actual?.name || "") };
    up.contracts[idx] = {
        ...c.toObject(),
        estado_id: final.data.id,
        nombre_estado_empleado: final.name,
        cierreSinFirma: { el: new Date(), por, porNombre, motivo, estadoAnterior },
    };
    up.markModified("contracts");
    await up.save();
    const r = await copiarConstanciaAContratados(up.projectId, c);
    console.log(`[cierre-sin-firma] ${up._id}#${idx} (${c.contratoKey}) «${estadoAnterior.nombre}» → «${final.name}» por ${porNombre || por || "?"}. Motivo: ${motivo}. Constancia: ${r.path || r.motivo}`);
    return { estadoAnterior: estadoAnterior.nombre, estadoNuevo: final.name, constancia: r.path ? `copiada a ${r.path}` : `no se copió (${r.motivo})` };
}
