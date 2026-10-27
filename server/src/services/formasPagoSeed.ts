import { FormaPago } from "../models/FormaPago.js";
import { Contrato } from "../models/Contrato.js";
import { SemillaAplicada } from "../models/SemillaAplicada.js";

const CLAVE = "formas-de-pago-iniciales";

/** Las formas con las que arranca el catálogo. Se identifican por código. */
export const FORMAS_INICIALES = [
  { codigo: "EFECTIVO", nombre: "Efectivo" },
  { codigo: "TRANSFERENCIA_BANCARIA", nombre: "Transferencia bancaria", requiereDatosBancarios: true },
  { codigo: "CHEQUE", nombre: "Cheque", requiereComprobante: true },
  { codigo: "BILLETERA_VIRTUAL", nombre: "Billetera virtual" },
  { codigo: "COMPENSACION_INTERCAMBIO", nombre: "Compensación / Intercambio", descripcion: "Sin pago en dinero: el día trabajado compensa otro (cambio de franco)." },
] as const;

/**
 * LA PRIMERA CARGA DE FORMAS DE PAGO, UNA SOLA VEZ (patrón `paisesResidenciaSeed.ts`).
 *
 * Upsert por código con `$setOnInsert`: correrla de nuevo no duplica ni pisa lo que alguien editó. La marca
 * en `SemillaAplicada` hace que un reinicio no reponga una forma que alguien borró a propósito desde el ABM.
 *
 * Además deja al tipo de contrato «Servicios Intercambio» (importes en 0) con «Compensación / Intercambio»
 * como única habilitada y predeterminada, sólo si todavía no tenía formas configuradas.
 */
export async function sembrarFormasPagoUnaVez(): Promise<void> {
  const marca = await SemillaAplicada.updateOne({ clave: CLAVE }, { $setOnInsert: { clave: CLAVE, aplicadaEl: new Date() } }, { upsert: true });
  if (marca.upsertedCount === 0) return; // ya se aplicó, acá o en otra instancia

  try {
    const r = await FormaPago.bulkWrite(
      FORMAS_INICIALES.map((f, i) => ({
        updateOne: {
          filter: { externalId: f.codigo },
          update: {
            $setOnInsert: {
              externalId: f.codigo,
              name: f.nombre,
              data: { nombre: f.nombre },
              descripcion: "descripcion" in f ? f.descripcion : "",
              requiereDatosBancarios: "requiereDatosBancarios" in f ? f.requiereDatosBancarios : false,
              requiereComprobante: "requiereComprobante" in f ? f.requiereComprobante : false,
              activo: true,
              orden: i + 1,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    let detalleTipo = "No hay un tipo de contrato «Servicios Intercambio».";
    const compensacion = await FormaPago.findOne({ externalId: "COMPENSACION_INTERCAMBIO" }).select("_id").lean();
    const tipo = await Contrato.findOne({ name: { $regex: /^\s*servicios\s+intercambio\s*$/i } });
    if (tipo && compensacion) {
      const yaTiene = Array.isArray((tipo.data as any)?.formasPagoIds) && (tipo.data as any).formasPagoIds.length > 0;
      if (yaTiene) detalleTipo = `«${tipo.name}» ya tenía formas de pago: no se tocó.`;
      else {
        await Contrato.updateOne({ _id: tipo._id }, { $set: { "data.formasPagoIds": [compensacion._id], "data.formaPagoDefaultId": compensacion._id } });
        detalleTipo = `«${tipo.name}» quedó con «Compensación / Intercambio» como única habilitada y predeterminada.`;
      }
    }

    const detalle = `Formas de pago: ${r.upsertedCount} creada(s), ${FORMAS_INICIALES.length - r.upsertedCount} ya existían. ${detalleTipo}`;
    await SemillaAplicada.updateOne({ clave: CLAVE }, { $set: { detalle } });
    console.log(`💳 ${detalle}`);
  } catch (error) {
    await SemillaAplicada.deleteOne({ clave: CLAVE });
    throw error;
  }
}
