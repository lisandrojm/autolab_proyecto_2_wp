import mongoose from "mongoose";
import { Contrato } from "../models/Contrato.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Release } from "../models/Release.js";
import { ReleaseTipo } from "../models/ReleaseTipo.js";
import { Tenant } from "../models/Tenant.js";
import { PLACEHOLDER_CONTRATO_CUSTOM, PLACEHOLDER_RELEASE_CUSTOM } from "../compartido/textoCustom.js";
/**
 * Crea «Contrato custom» y «Release custom»: el tipo y su plantilla custom (`esCustom`, el cuerpo se
 * escribe en Firma digital para cada trámite; ver `compartido/textoCustom.ts`).
 *
 *   TENANT_SLUG=demo-tenant npm run plantillas-custom:crear:dry
 *   TENANT_SLUG=demo-tenant npm run plantillas-custom:crear
 *
 * Idempotente: busca por nombre y no toca lo que ya existe.
 *
 *  - Contrato + plantilla de contrato: son globales (sin `tenantId`, el nombre de Contrato es único).
 *  - Tipo de release + release: son del tenant de `TENANT_SLUG`.
 *
 * NO SE VINCULA A NINGÚN ESTADO IMPOSITIVO (decisión del 13/10/2026): una plantilla va en un solo
 * estado (`conflictoImpositivo`) y esta es nueva, así que no hay de dónde copiarlo como al duplicar.
 * Se asigna a mano en el ABM de estados. Los códigos de ARCA del tipo de contrato tampoco: se cargan en
 * Tipos de contrato si el contrato custom genera alta.
 *
 * SCRIPT Y NO UN `ensure…Backfilled`: aquellos corren solos en cada GET; esto crea catálogo nuevo en
 * producción y tiene que ser una decisión.
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const NOMBRE_CONTRATO = "Contrato custom";
const NOMBRE_RELEASE = "Release custom";
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    const slug = process.env.TENANT_SLUG?.trim();
    if (!slug)
        throw new Error("Falta TENANT_SLUG=<slug> (el tenant del release custom)");
    await mongoose.connect(uri, { dbName });
    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant)
        throw new Error(`No existe el tenant «${slug}»`);
    console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Tenant ${slug} (${tenant._id})`);
    // ── Tipo de contrato
    let contrato = await Contrato.findOne({ name: NOMBRE_CONTRATO });
    if (contrato)
        console.log(`= Tipo de contrato «${NOMBRE_CONTRATO}» ya existe (${contrato._id})`);
    else if (DRY_RUN)
        console.log(`+ Crearía el tipo de contrato «${NOMBRE_CONTRATO}» (firma de contrato y release: sí)`);
    else {
        contrato = await Contrato.create({ name: NOMBRE_CONTRATO, isActive: true });
        console.log(`+ Tipo de contrato «${NOMBRE_CONTRATO}» creado (${contrato._id})`);
    }
    // ── Plantilla de contrato
    const plantilla = await ContratoFrame.findOne({ name: NOMBRE_CONTRATO }).lean();
    if (plantilla)
        console.log(`= Plantilla «${NOMBRE_CONTRATO}» ya existe (${plantilla._id}, esCustom=${!!plantilla.esCustom})`);
    else if (DRY_RUN || !contrato)
        console.log(`+ Crearía la plantilla «${NOMBRE_CONTRATO}» (esCustom, sin membrete, sin estado impositivo)`);
    else {
        const creada = await ContratoFrame.create({
            name: NOMBRE_CONTRATO,
            externalId: "",
            content: PLACEHOLDER_CONTRATO_CUSTOM,
            esCustom: true,
            contratoId: contrato._id,
            contratoIds: [contrato._id],
            usaMembrete: false,
            isActive: true,
            data: {
                nombre: NOMBRE_CONTRATO,
                cantidadJornadas: contrato.data?.cantidadJornadas || 0,
                multiplicadorDiario: contrato.data?.multiplicadorDiario || 0,
                esTiempoIndeterminado: !!contrato.data?.esTiempoIndeterminado,
            },
        });
        console.log(`+ Plantilla «${NOMBRE_CONTRATO}» creada (${creada._id})`);
    }
    // ── Tipo de release
    let tipo = await ReleaseTipo.findOne({ tenantId: tenant._id, name: NOMBRE_RELEASE });
    if (tipo)
        console.log(`= Tipo de release «${NOMBRE_RELEASE}» ya existe (${tipo._id})`);
    else if (DRY_RUN)
        console.log(`+ Crearía el tipo de release «${NOMBRE_RELEASE}» (se envía a firmar)`);
    else {
        tipo = await ReleaseTipo.create({ tenantId: tenant._id, name: NOMBRE_RELEASE, isActive: true, requiereFirma: true });
        console.log(`+ Tipo de release «${NOMBRE_RELEASE}» creado (${tipo._id})`);
    }
    // ── Release
    const release = await Release.findOne({ tenantId: tenant._id, name: NOMBRE_RELEASE }).lean();
    if (release)
        console.log(`= Release «${NOMBRE_RELEASE}» ya existe (${release._id}, esCustom=${!!release.esCustom})`);
    else if (DRY_RUN || !tipo)
        console.log(`+ Crearía el release «${NOMBRE_RELEASE}» (esCustom, opcional por trámite)`);
    else {
        const creado = await Release.create({
            tenantId: tenant._id,
            name: NOMBRE_RELEASE,
            version: "1",
            description: "El texto se escribe en Firma digital para cada trámite.",
            content: PLACEHOLDER_RELEASE_CUSTOM,
            esCustom: true,
            releaseTipoId: tipo._id,
            isActive: true,
            usaMembrete: false,
        });
        console.log(`+ Release «${NOMBRE_RELEASE}» creado (${creado._id})`);
    }
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error("❌", e?.message || e);
    await mongoose.disconnect();
    process.exit(1);
});
