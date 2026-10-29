import { Types } from "mongoose";
import { Info } from "../models/Info.js";
import { Contrato } from "../models/Contrato.js";
import { resolverEstadoPorPropositos } from "../utils/estadoCarpetas.js";
import { tipoEnviaAFirmar } from "../compartido/estadosFirma.js";
import { Project } from "../models/Project.js";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, copyEntry } from "./dropboxService.js";
import { resolverContratadosSinFirma } from "../utils/estadoCarpetas.js";
const ESTADO_TYPE = "estado-empleado";
/**
 * EL ESTADO «CONTRATADO» (paso 6 de Gestión de Contratos): el último del circuito, al que llega el
 * contrato cuando Dropbox Sign devuelve el firmado (la carpeta con propósito «firmados»). No hay un
 * nombre fijo: se resuelve por la configuración del tenant, como el de Envío de documentación.
 */
export async function estadoContratado() {
    const nombre = await resolverEstadoPorPropositos(["firmados"]);
    return nombre ? Info.findOne({ type: ESTADO_TYPE, name: nombre }).lean() : null;
}
/**
 * TIPOS QUE NO PASAN POR EL CIRCUITO (28/10/2026): un contrato nuevo de un tipo que no manda nada a
 * firmar y no genera alta temprana de ARCA no tiene nada que hacer en los pasos 1 a 5. Queda
 * contratado al crearse. Devuelve ese estado, o null si el contrato sigue el circuito normal.
 *
 * Si genera alta lo dice el estado impositivo que ya trae el contrato (el de su plantilla): el
 * `generaAlta` guardado en el tipo quedó viejo, ahora lo decide ese estado (ver ContractTypesTab).
 */
/**
 * TERMINADO EL TRÁMITE IMPOSITIVO, LOS QUE NO SE FIRMAN VAN A CONTRATADOS (29/10/2026). La constancia de
 * CUIT archivada (o el alta registrada) llevaba el contrato a «Envío de documentación», la bandeja
 * Generar Documentos, aunque su tipo no mande nada a firmar: quedaba ahí diciendo «No se firma». Si el
 * tipo no firma nada —contando la firma del alta sólo si el contrato viene de un alta temprana—, el
 * destino pasa a ser Contratados. Sólo contratos de WeProdu (solicitud o «Agregar miembro»), como el
 * paso 6. Devuelve el estado que corresponde, o el mismo destino.
 */
export async function destinoSiNoSeFirma(contrato, destino) {
    if (!(contrato?.solicitudId || contrato?.origen === "agregar_miembro"))
        return destino;
    const final = await estadoContratado();
    if (!final?.data?.id || final.data.id === destino.data?.id)
        return destino;
    if ((Number(destino.data?.ordenDependencia) || 0) >= (Number(final.data?.ordenDependencia) || 0))
        return destino;
    // Un destino impositivo es el trámite mismo, no lo que viene después: ése no se saltea.
    if (destino.data?.esImpositivo)
        return destino;
    const contratoId = contrato?.contrato_id;
    if (!contratoId || !Types.ObjectId.isValid(String(contratoId)))
        return destino;
    const tipo = await Contrato.findById(contratoId).select("data.requiereFirma data.requiereFirmaRelease data.requiereFirmaAlta").lean();
    if (!tipo)
        return destino;
    const actual = contrato.estado_id != null ? await Info.findOne({ type: ESTADO_TYPE, "data.id": Number(contrato.estado_id) }).select("data.tipoImpositivo").lean() : null;
    const generaAlta = actual?.data?.tipoImpositivo === "alta_temprana_afip";
    return tipoEnviaAFirmar({ ...(tipo.data || {}), generaAlta }) ? destino : final;
}
export async function estadoDirectoAContratado(contratoId, estadoId) {
    if (!contratoId || !Types.ObjectId.isValid(String(contratoId)))
        return null;
    const tipo = await Contrato.findById(contratoId).select("data.requiereFirma data.requiereFirmaRelease data.requiereFirmaAlta").lean();
    if (!tipo)
        return null;
    const estadoActual = Number.isFinite(Number(estadoId)) && estadoId !== "" && estadoId != null ? await Info.findOne({ type: ESTADO_TYPE, "data.id": Number(estadoId) }).select("data.tipoImpositivo").lean() : null;
    const generaAlta = estadoActual?.data?.tipoImpositivo === "alta_temprana_afip";
    if (generaAlta || tipoEnviaAFirmar({ ...(tipo.data || {}), generaAlta }))
        return null;
    return estadoContratado();
}
/**
 * LA CONSTANCIA, COPIADA A «CONTRATADOS SIN FIRMA» (29/10/2026). Un contrato que no se firma no tiene
 * documento firmado que quede en la carpeta del estado final; lo único que tiene es la constancia de
 * CUIT archivada. Se COPIA —el original sigue en la carpeta del trámite, que es la que vigila el
 * escaneo— a la carpeta de los contratados sin firma. Best-effort: si Dropbox falla, el contrato ya
 * está en Contratados igual y queda el motivo en el log. Devuelve el path copiado o el motivo.
 */
export async function copiarConstanciaAContratados(projectId, contrato) {
    const origen = String(contrato?.constanciaAfipDropboxPath || "");
    if (!origen)
        return { motivo: "el contrato no tiene constancia archivada" };
    try {
        const proyecto = await Project.findById(projectId).select("tenantId").lean();
        const tenant = proyecto?.tenantId ? await Tenant.findById(proyecto.tenantId).lean() : null;
        const cfg = getTenantDropboxConfig(tenant);
        if (!cfg)
            return { motivo: "Dropbox no está conectado" };
        const { carpeta } = await resolverContratadosSinFirma();
        if (!carpeta)
            return { motivo: "no hay carpeta de Constancia de CUIT de la que deducir «Contratados/Sin firma»" };
        const nombre = origen.split("/").pop();
        const copia = await copyEntry(String(proyecto.tenantId), cfg, origen, `${carpeta.replace(/\/$/, "")}/${nombre}`);
        return { path: copia.path };
    }
    catch (e) {
        const detalle = e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e);
        console.error(`CONTRATADOS: no se pudo copiar la constancia ${origen} a «Contratados sin firma»:`, detalle);
        return { motivo: detalle };
    }
}
