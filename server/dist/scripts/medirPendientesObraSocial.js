/**
 * MEDICIÓN, SÓLO LECTURA: cuánto tarda `pendientesObraSocial` para una empleadora y cuántos bytes de
 * contratos baja de Atlas para decidirlo. Es lo primero que espera el botón «Validar obra social»
 * (POST /contratos/obras-sociales/validar-servidor) antes de contestar.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/medirPendientesObraSocial.ts <tenantId> <empresaId>
 *
 * No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { pendientesObraSocial } from "../services/obrasSocialesLoteService.js";
const [tenantId, empresaId] = process.argv.slice(2);
if (!tenantId || !empresaId || !Types.ObjectId.isValid(tenantId) || !Types.ObjectId.isValid(empresaId)) {
    console.error("Uso: <tenantId> <empresaId>");
    process.exit(1);
}
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const tenantObjectId = new Types.ObjectId(tenantId);
    // Lo que la función baja hoy, medido aparte para ver el peso.
    let t = Date.now();
    const usuarios = await User.find({ tenantId: tenantObjectId, "metadata.cuit": { $exists: true, $ne: "" } }).select("_id metadata.cuit firstName lastName").lean();
    console.log(`usuarios con CUIT: ${usuarios.length} · ${Date.now() - t} ms`);
    t = Date.now();
    const ups = await UserProject.find({ userId: { $in: usuarios.map((u) => u._id) }, "contracts.empresaContratoId": new Types.ObjectId(empresaId) }).select("userId contracts").lean();
    const contratos = ups.reduce((n, up) => n + (up.contracts || []).length, 0);
    const bytes = Buffer.byteLength(JSON.stringify(ups));
    console.log(`UserProjects con contratos de la empleadora: ${ups.length} · ${contratos} contratos · ${(bytes / 1024 / 1024).toFixed(2)} MB (contratos enteros) · ${Date.now() - t} ms`);
    t = Date.now();
    const pend = await pendientesObraSocial(tenantObjectId, empresaId);
    console.log(`pendientesObraSocial: ${pend.length} pendiente(s) · ${Date.now() - t} ms`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
