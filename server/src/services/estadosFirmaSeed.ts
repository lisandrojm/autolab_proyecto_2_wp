import { Info } from "../models/Info.js";
import { SemillaAplicada } from "../models/SemillaAplicada.js";
import { ESTADO_TYPE } from "../utils/estadosImpositivosSistema.js";
import { pareceEstadoDeFirma } from "../compartido/estadosFirma.js";

const CLAVE = "estados-vinculados-a-firma";

/**
 * «VINCULADO A FIRMA» EN LOS ESTADOS QUE YA EXISTÍAN, UNA SOLA VEZ (patrón `formasPagoSeed.ts`).
 *
 * Marca los que son de firma por su nombre (ENVIO DE DOCUMENTACION, FIRMA PENDIENTE, FIRMA ENVIADA) o
 * porque vigilan la carpeta de enviados/firmados de Dropbox Sign. Sólo los que todavía no tienen la
 * marca definida y no son impositivos. Después, lo que cada estado tenga lo decide quien lo edita.
 */
export async function marcarEstadosDeFirmaUnaVez(): Promise<void> {
  const marca = await SemillaAplicada.updateOne({ clave: CLAVE }, { $setOnInsert: { clave: CLAVE, aplicadaEl: new Date() } }, { upsert: true });
  if (marca.upsertedCount === 0) return;
  try {
    const estados: any[] = await Info.find({ type: ESTADO_TYPE, "data.vinculadoAFirma": { $exists: false }, "data.esImpositivo": { $ne: true } }).select("name data.transicionAutomatica").lean();
    const ids = estados.filter((e) => pareceEstadoDeFirma(e.name, e.data?.transicionAutomatica?.carpetas)).map((e) => e._id);
    const nombres = estados.filter((e) => ids.some((id) => String(id) === String(e._id))).map((e) => e.name);
    if (ids.length) await Info.updateMany({ _id: { $in: ids } }, { $set: { "data.vinculadoAFirma": true } });
    const detalle = `Estados vinculados a firma: ${ids.length ? nombres.join(", ") : "ninguno reconocido"}.`;
    await SemillaAplicada.updateOne({ clave: CLAVE }, { $set: { detalle } });
    console.log(`✍️  ${detalle}`);
  } catch (error) {
    await SemillaAplicada.deleteOne({ clave: CLAVE });
    throw error;
  }
}
