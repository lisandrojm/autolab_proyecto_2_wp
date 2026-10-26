import "dotenv/config";
import mongoose from "mongoose";
import { DropboxSignEnvio } from "../models/DropboxSignEnvio.js";

/**
 * DEVOLVER A LA COLA LO QUE UNA CORRIDA MARCÓ POR UNA FALLA DE PANTALLA (26/10/2026).
 *
 * Hasta hoy, cuando el motor no podía terminar un documento en la pantalla de Dropbox Sign (el editor
 * seguía «Preparando documentos…», un timeout, una detención), el documento quedaba «requiere
 * revisión» y salía de la cola aunque la colocación de la firma estuviera resuelta. Ahora esas fallas
 * no marcan nada; este script deshace lo que quedó marcado así.
 *
 * Sólo toca registros en «requiere revisión» cuyo motivo es de PANTALLA o de RED (los patrones de
 * abajo). Los de colocación (sin regla, ancla no encontrada, página del medio, sin firmante) no se
 * tocan: ésos sí son para revisar. Vuelven a «en cola» con su posición de antes (si la tenían) y el
 * motivo queda como «último intento», visible en la pantalla.
 *
 *   npm run dropbox-sign:devolver-a-la-cola -- --dry-run     (muestra qué haría, no escribe)
 *   npm run dropbox-sign:devolver-a-la-cola                  (lo hace)
 */
const PANTALLA = /No se pudo verificar un único campo|No se pudo medir la página|Preparando documentos|No apareció |Timeout \d+ ?ms|El formulario de firmantes no tomó|Detenid|cortad|No se pudo bajar o leer el PDF|net::ERR|Target (page|closed)|browser has been closed/i;

async function main() {
  const seco = process.argv.includes("--dry-run");
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const marcados: any[] = await DropboxSignEnvio.find({ estado: "requiere_revision" }).sort({ tenantId: 1, orden: 1, updatedAt: 1 }).lean();
  const aDevolver = marcados.filter((r) => PANTALLA.test(String(r.detalle || "")));
  console.log(`${marcados.length} en «requiere revisión»; ${aDevolver.length} por una falla de pantalla o de red${seco ? " (DRY-RUN: no se escribe nada)" : ""}:`);
  // Los que no tenían posición van al final de la cola de su tenant.
  const ultimoPorTenant = new Map<string, number>();
  for (const r of aDevolver) {
    const tid = String(r.tenantId);
    if (!ultimoPorTenant.has(tid)) {
      const u: any = await DropboxSignEnvio.findOne({ tenantId: r.tenantId, orden: { $ne: null }, estado: { $in: ["en_cola", "limite"] } }).sort({ orden: -1 }).select("orden").lean();
      ultimoPorTenant.set(tid, Number(u?.orden) || 0);
    }
    let orden = Number(r.orden) || 0;
    if (!orden) {
      orden = ultimoPorTenant.get(tid)! + 1;
      ultimoPorTenant.set(tid, orden);
    }
    console.log(`  #${orden} ${r.archivo}\n      era: ${String(r.detalle).slice(0, 160)}`);
    if (!seco) {
      await DropboxSignEnvio.updateOne(
        { _id: r._id, estado: "requiere_revision" },
        { $set: { estado: "en_cola", detalle: "", orden, ultimoIntento: { at: r.updatedAt || new Date(), detalle: r.detalle }, ...(r.encoladoAt ? {} : { encoladoAt: new Date() }) } },
      );
    }
  }
  console.log(seco ? "DRY-RUN: no se cambió nada." : `Listo: ${aDevolver.length} de vuelta en la cola.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
