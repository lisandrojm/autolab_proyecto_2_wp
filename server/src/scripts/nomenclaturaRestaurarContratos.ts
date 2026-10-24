import mongoose from "mongoose";
import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { validarPatron, asegurarCodigo, PATRON_POR_DEFECTO } from "../utils/nomenclatura.js";

/**
 * RESTAURAR LA NOMENCLATURA DE «CONTRATOS» Y SEPARARLA DE «RECIBOS DE SUELDO» (24/10/2026).
 *
 * Entre el 20 y el 24/10 el recibo de sueldo se montó sobre el tipo «Contrato»: la fila guardada de
 * Contratos pasó a tener el patrón «…_REC_SUELDO_{{periodo}}_…» y los contratos se quedaron sin
 * nomenclatura propia. Desde ahora «ReciboSueldo» es un tipo aparte. Este script, por tenant:
 *
 *   1. si la fila «Contrato» tiene el patrón de recibos (menciona REC_SUELDO), la copia a la fila
 *      «ReciboSueldo» (si no existe ya) — así el recibo conserva lo que el cliente configuró;
 *   2. deja en «Contrato» el patrón personalizado de Contratos (PATRON_CONTRATOS, con el default de
 *      abajo, que es el que el cliente ya usaba), validado con las obligatorias de Contratos.
 *
 * No toca las demás filas ni renombra archivos ya generados: sólo afecta a los próximos nombres.
 *
 * Uso (desde server/):
 *   npm run nomenclatura:restaurar-contratos:dry   → muestra el antes/después, no escribe nada
 *   npm run nomenclatura:restaurar-contratos       → aplica
 *
 * Variables:
 *   DRY_RUN=true              → no escribe.
 *   TENANT_ID=<ObjectId>      → (opcional) un solo tenant; sin esto, todos los que tengan fila.
 *   PATRON_CONTRATOS="…"      → (opcional) otro patrón para Contratos (se valida antes de escribir).
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const PATRON_CONTRATOS = asegurarCodigo(process.env.PATRON_CONTRATOS || "{{centroDeCosto}}_{{proyecto}}_{{tipo}}_{{extra}}_{{apellido}}_{{nombres}}-{{email}}_{{cuit}}_D-{{fechaAlta}}_H-{{fechaBaja}}");

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  const erroresContratos = validarPatron("Contrato", PATRON_CONTRATOS);
  if (erroresContratos.length) throw new Error(`El patrón de Contratos no valida: ${erroresContratos.map((e) => e.motivo).join(" | ")}`);

  await mongoose.connect(uri, { dbName });
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Base: ${dbName}\nPatrón de Contratos a dejar: ${PATRON_CONTRATOS}\n`);

  const filtro: any = process.env.TENANT_ID ? { tenantId: new mongoose.Types.ObjectId(process.env.TENANT_ID) } : {};
  const filas = await NomenclaturaArchivo.find({ ...filtro, tipo: { $in: ["Contrato", "ReciboSueldo"] } }).lean();
  const tenants = [...new Set(filas.map((f) => String(f.tenantId)))];
  if (tenants.length === 0) console.log("No hay filas de Contrato ni de ReciboSueldo guardadas: rige el patrón de fábrica en todos los tenants (Contratos ya vuelve a tener el suyo).");

  for (const tenantId of tenants) {
    const contrato = filas.find((f) => String(f.tenantId) === tenantId && f.tipo === "Contrato");
    const recibo = filas.find((f) => String(f.tenantId) === tenantId && f.tipo === "ReciboSueldo");
    console.log(`Tenant ${tenantId}`);

    // 1. El patrón de recibos que quedó en «Contrato» pasa a su tipo.
    if (contrato && /REC_SUELDO/i.test(contrato.patron)) {
      if (recibo) console.log(`  = ReciboSueldo ya tiene fila (${recibo.patron}); el REC_SUELDO de Contrato no se copia`);
      else {
        const patronRecibo = asegurarCodigo(contrato.patron);
        const errs = validarPatron("ReciboSueldo", patronRecibo);
        if (errs.length) console.log(`  ✖ ReciboSueldo: el patrón que estaba en Contrato no valida para recibos, no se copia → ${errs.map((e) => e.motivo).join(" | ")}`);
        else {
          console.log(`  + ReciboSueldo ← ${patronRecibo}`);
          if (!DRY_RUN) await NomenclaturaArchivo.create({ tenantId: contrato.tenantId, tipo: "ReciboSueldo", patron: patronRecibo, actualizadoPor: (contrato as any).actualizadoPor || null });
        }
      }
    } else if (!recibo) {
      console.log(`  = ReciboSueldo sin fila: rige el de fábrica (${PATRON_POR_DEFECTO.ReciboSueldo})`);
    }

    // 2. Contratos queda con su patrón personalizado.
    if (contrato && contrato.patron === PATRON_CONTRATOS) console.log(`  = Contrato ya tiene el patrón personalizado`);
    else if (contrato) {
      console.log(`  ~ Contrato\n      antes:   ${contrato.patron}\n      después: ${PATRON_CONTRATOS}`);
      if (!DRY_RUN) await NomenclaturaArchivo.updateOne({ _id: contrato._id }, { $set: { patron: PATRON_CONTRATOS } });
    } else {
      console.log(`  + Contrato ← ${PATRON_CONTRATOS}`);
      if (!DRY_RUN) await NomenclaturaArchivo.create({ tenantId: new mongoose.Types.ObjectId(tenantId), tipo: "Contrato", patron: PATRON_CONTRATOS, actualizadoPor: null });
    }
  }
  console.log(`\n${DRY_RUN ? "[DRY RUN] No se escribió nada." : "Listo."}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
