import "dotenv/config";
import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { abrirSesionDropboxSign, guardarSesion, pantallaDe } from "../services/dropboxSignBot/navegador.js";
/**
 * LOGIN MANUAL DE DROPBOX SIGN, UNA SOLA VEZ, CON VENTANA (patrón `reconocerAltasArca.ts`).
 *
 * SE CORRE DESDE UNA COMPUTADORA CON PANTALLA, NO EN EL VPS: abre un Chromium con ventana y el VPS no
 * tiene X (da «Unable to open X display»). Apunta a la base de producción con el `.env.production` del
 * servidor (misma MONGO_URI y misma llave de cifrado: ENCRYPTION_KEY o, si no está, JWT_SECRET), así la
 * sesión que guarda la puede descifrar el bot que corre headless en el VPS.
 *
 * Abre un Chromium VISIBLE con la sesión guardada (si hay). Si ya entra a /home/manage, la vuelve a
 * guardar y termina. Si pide login, el operador se loguea a mano —y resuelve captcha o segundo factor
 * si aparecen— y el script, apenas ve el listado de documentos, captura el `storageState` y lo guarda
 * cifrado en `integrations.dropboxSign.bot.sesionEnc`. Desde ahí el bot corre headless renovando la
 * sesión en cada corrida.
 *
 *   dotenv -e .env.production -v TENANT=<slug|id> -- tsx src/scripts/loginDropboxSign.ts
 *   (npm run dropbox-sign:login — con TENANT en el entorno)
 */
const ESPERA_MAX_MS = 10 * 60_000;
const SIN_PANTALLA = "Este login abre un Chromium CON VENTANA y acá no hay pantalla (no hay DISPLAY): en el VPS no se puede. " +
    "Corrélo desde una computadora con pantalla, dentro de server/, con el .env.production del servidor " +
    "(misma MONGO_URI y misma llave de cifrado, ENCRYPTION_KEY o JWT_SECRET):\n\n" +
    "    TENANT=<slug> npm run dropbox-sign:login\n\n" +
    "La sesión queda cifrada en la base y el bot del VPS la usa headless.";
async function main() {
    if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY)
        throw new Error(SIN_PANTALLA);
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const ref = String(process.env.TENANT || "").trim();
    const tenant = ref ? await Tenant.findOne(mongoose.isValidObjectId(ref) ? { _id: ref } : { slug: ref }).select("_id slug name").lean() : await Tenant.findOne({}).select("_id slug name").lean();
    if (!tenant)
        throw new Error(`No se encontró el tenant «${ref || "(primero)"}».`);
    console.log(`Tenant: ${tenant.name || tenant.slug} (${tenant._id})`);
    const sesion = await abrirSesionDropboxSign(String(tenant._id), { visible: true, sinLogin: true });
    try {
        if (sesion.pantalla === "manage") {
            console.log("La sesión guardada sigue vigente: se volvió a guardar. Listo.");
            await guardarSesion(String(tenant._id), sesion.ctx);
            return;
        }
        console.log("Iniciá sesión en la ventana del navegador (resolvé el captcha o el código si aparecen). Esperando hasta ver el listado de documentos…");
        const desde = Date.now();
        while (Date.now() - desde < ESPERA_MAX_MS) {
            await sesion.page.waitForTimeout(2000);
            if ((await pantallaDe(sesion.page)) === "manage") {
                await guardarSesion(String(tenant._id), sesion.ctx);
                await Tenant.findByIdAndUpdate(tenant._id, { $set: { "integrations.dropboxSign.bot.ultimoLoginAt": new Date(), "integrations.dropboxSign.bot.ultimoError": null } });
                console.log("Sesión guardada (cifrada). El bot ya puede correr headless.");
                return;
            }
        }
        throw new Error("Pasaron 10 minutos sin llegar al listado de documentos: no se guardó nada.");
    }
    finally {
        await sesion.browser.close().catch(() => { });
        await mongoose.disconnect();
    }
}
main().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
});
