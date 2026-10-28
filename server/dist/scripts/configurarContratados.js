import mongoose from "mongoose";
import { Info } from "../models/Info.js";
import UserProject from "../models/UserProject.js";
import { elegirCarpeta } from "../utils/estadoCarpetas.js";
import { claveEstado } from "../utils/estadoClave.js";
/**
 * EL ESTADO FINAL («Contratados», paso 6 de Gestión de Contratos) Y SU CARPETA DE FIRMADOS.
 *
 * Contratados es el estado que vigila la carpeta con propósito «firmados» («Requested signatures»).
 * Este script dice cuál es y cuántos contratos de WeProdu tiene. Si la carpeta se reconoce sólo por
 * el nombre, o no está configurada en ningún estado, la deja fija en el estado final:
 *
 *   npm run estados:configurar-contratados                                   (solo lectura)
 *   APLICAR=1 npm run estados:configurar-contratados                         (fija el propósito)
 *   ESTADO=DISPONIBLE CARPETA="/…/Requested signatures" APLICAR=1 npm run …  (si no hay ninguna)
 */
const APLICAR = process.env.APLICAR === "1";
const ESTADO = (process.env.ESTADO || "DISPONIBLE").trim();
const CARPETA = (process.env.CARPETA || "").trim();
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    await mongoose.connect(uri, { dbName });
    console.log(`Base ${dbName} · ${APLICAR ? "APLICANDO" : "solo lectura"}\n`);
    const estados = await Info.find({ type: "estado-empleado" }).select("name data.id data.ordenDependencia data.transicionAutomatica").lean();
    const conCarpetas = estados.filter((e) => e.data?.transicionAutomatica?.carpetas?.length).map((e) => ({ name: e.name, carpetas: e.data.transicionAutomatica.carpetas }));
    const r = elegirCarpeta(conCarpetas, "firmados");
    let final = null;
    if (r.carpeta && r.estado) {
        final = estados.find((e) => e.name === r.estado);
        console.log(`Carpeta de firmados: ${r.carpeta}`);
        console.log(`Estado final («Contratados»): ${r.estado} · ${r.origen === "proposito" ? "configurado por propósito" : "reconocido sólo por el NOMBRE de la carpeta"}`);
        if (r.origen === "patron") {
            if (APLICAR) {
                await Info.updateOne({ _id: final._id, "data.transicionAutomatica.carpetas.dropboxCarpeta": r.carpeta }, { $set: { "data.transicionAutomatica.carpetas.$.proposito": "firmados" } });
                console.log("  → se le fijó el propósito «firmados».");
            }
            else
                console.log("  → con APLICAR=1 se le fija el propósito «firmados».");
        }
    }
    else {
        console.log("Ningún estado vigila la carpeta de firmados.");
        final = estados.find((e) => claveEstado(e.name) === claveEstado(ESTADO));
        if (!final)
            throw new Error(`No hay un estado «${ESTADO}». Indicá cuál con ESTADO=…`);
        if (typeof final.data?.ordenDependencia !== "number")
            throw new Error(`«${final.name}» no está en el flujo de dependencias: asignale un paso en Orden de dependencias antes.`);
        if (!CARPETA)
            throw new Error('Falta CARPETA="/ruta/a/Requested signatures" (la carpeta donde Dropbox Sign deja los firmados).');
        console.log(`Se configuraría en «${final.name}»: ${CARPETA} (propósito «firmados»).`);
        if (APLICAR) {
            const actual = final.data?.transicionAutomatica?.carpetas || [];
            await Info.updateOne({ _id: final._id }, { $set: { "data.transicionAutomatica": { evento: "dropbox_carpeta", carpetas: [...actual, { dropboxCarpeta: CARPETA, detalle: "Firmados de Dropbox Sign", proposito: "firmados" }] } } });
            console.log("  → configurada.");
        }
    }
    if (final) {
        const ups = await UserProject.find({ "contracts.estado_id": final.data?.id }).select("contracts.estado_id contracts.solicitudId contracts.origen").lean();
        let total = 0;
        for (const up of ups)
            for (const c of up.contracts || [])
                if (Number(c.estado_id) === Number(final.data?.id) && (c.solicitudId || c.origen === "agregar_miembro"))
                    total += 1;
        console.log(`\nContratos de WeProdu en «${final.name}»: ${total}`);
    }
}
main()
    .then(() => mongoose.disconnect())
    .catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
