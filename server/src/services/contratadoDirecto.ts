import { Types } from "mongoose";
import { Info, IInfo } from "../models/Info.js";
import { Contrato } from "../models/Contrato.js";
import { resolverEstadoPorPropositos } from "../utils/estadoCarpetas.js";
import { tipoEnviaAFirmar } from "../compartido/estadosFirma.js";

const ESTADO_TYPE = "estado-empleado";

/**
 * EL ESTADO «CONTRATADO» (paso 6 de Gestión de Contratos): el último del circuito, al que llega el
 * contrato cuando Dropbox Sign devuelve el firmado (la carpeta con propósito «firmados»). No hay un
 * nombre fijo: se resuelve por la configuración del tenant, como el de Envío de documentación.
 */
export async function estadoContratado(): Promise<IInfo | null> {
  const nombre = await resolverEstadoPorPropositos(["firmados"]);
  return nombre ? Info.findOne({ type: ESTADO_TYPE, name: nombre }).lean<IInfo>() : null;
}

/**
 * TIPOS QUE NO PASAN POR EL CIRCUITO (28/10/2026): un contrato nuevo de un tipo que no manda nada a
 * firmar y no genera alta temprana de ARCA no tiene nada que hacer en los pasos 1 a 5. Queda
 * contratado al crearse. Devuelve ese estado, o null si el contrato sigue el circuito normal.
 *
 * Si genera alta lo dice el estado impositivo que ya trae el contrato (el de su plantilla): el
 * `generaAlta` guardado en el tipo quedó viejo, ahora lo decide ese estado (ver ContractTypesTab).
 */
export async function estadoDirectoAContratado(contratoId: unknown, estadoId: unknown): Promise<IInfo | null> {
  if (!contratoId || !Types.ObjectId.isValid(String(contratoId))) return null;
  const tipo: any = await Contrato.findById(contratoId).select("data.requiereFirma data.requiereFirmaRelease data.requiereFirmaAlta").lean();
  if (!tipo) return null;
  const estadoActual: any = Number.isFinite(Number(estadoId)) && estadoId !== "" && estadoId != null ? await Info.findOne({ type: ESTADO_TYPE, "data.id": Number(estadoId) }).select("data.tipoImpositivo").lean() : null;
  const generaAlta = estadoActual?.data?.tipoImpositivo === "alta_temprana_afip";
  if (generaAlta || tipoEnviaAFirmar({ ...(tipo.data || {}), generaAlta })) return null;
  return estadoContratado();
}
