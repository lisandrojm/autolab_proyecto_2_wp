import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder, uploadFile } from "./dropboxService.js";
/**
 * COPIA EN DROPBOX DE LO QUE ARCA CONTESTÓ AL REGISTRARSE (link de registro público).
 *
 * Un `.json` POR CUIT en `/WEPRODU/Registros/<cuit>_registro.json`, con la ÚLTIMA validación: cada
 * registro nuevo de ese CUIT lo reemplaza. Las consultas sueltas de «Validar CUIT» no se guardan (eran
 * un log que no se iba a mirar); lo que importa es con qué respuesta de ARCA quedó registrada la persona.
 *
 * SIN `/FZERO S.R.L` ADELANTE: es el nombre del espacio de equipo en la web, no un path de la API (ver
 * `espejoDropboxParitaria.ts`). Para el token, `/WEPRODU` cuelga de la raíz.
 *
 * NUNCA FRENA EL REGISTRO: se sube en segundo plano y un error de Dropbox solo se loguea. Del otro
 * lado hay una persona sola completando un formulario; no puede quedar esperando a Dropbox.
 *
 * NO SE GUARDA LA CONTRASEÑA ni el token del link: solo lo que respondió ARCA y quién lo pidió.
 */
export const BASE_REGISTROS = "/WEPRODU/Registros";
const base = () => {
    const p = String(process.env.DROPBOX_REGISTROS_PATH || BASE_REGISTROS).trim();
    return (p.startsWith("/") ? p : `/${p}`).replace(/\/+$/, "");
};
/** Por tenant: si su Dropbox tiene `/WEPRODU`. Se verifica una vez por proceso (ver `baseAlcanzable`). */
const alcanzable = new Map();
/*
  Se verifica el PRIMER tramo antes de subir. Con un token de app con carpeta propia, subir a una ruta
  inexistente NO falla: Dropbox crea el árbol adentro de la carpeta de la app y los archivos quedan
  donde nadie los mira. Que falte `Registros` es normal (se crea al subir); que falte `/WEPRODU`, no.
*/
const verificarBase = (tenantId, cfg) => {
    let p = alcanzable.get(tenantId);
    if (!p) {
        const ancla = "/" + base().split("/").filter(Boolean)[0];
        p = listFolder(tenantId, cfg, ancla).then(() => true, (e) => {
            console.warn(`[REGISTROS→DROPBOX] «${ancla}» no está en el Dropbox del tenant ${tenantId}: no se sube nada.`, e?.response?.data?.error_summary || e?.message || e);
            alcanzable.delete(tenantId); // se reintenta en la próxima: puede haber sido un corte de red
            return false;
        });
        alcanzable.set(tenantId, p);
    }
    return p;
};
/**
 * Sube la evidencia en segundo plano. No devuelve nada que haya que esperar y no tira nunca.
 */
export function guardarRespuestaDeRegistro(o) {
    void (async () => {
        try {
            const tenant = await Tenant.findById(o.tenantId).select("integrations.dropbox").lean();
            const cfg = getTenantDropboxConfig(tenant);
            if (!cfg)
                return; // sin Dropbox conectado no hay dónde guardar: no es un error del registro
            if (!(await verificarBase(o.tenantId, cfg)))
                return;
            const cuit = String(o.cuit || "").replace(/\D/g, "");
            if (!cuit)
                return; // sin CUIT no hay validación de ARCA que guardar
            const ruta = `${base()}/${cuit}_registro.json`;
            const json = JSON.stringify({ momento: new Date().toISOString(), cuit: o.cuit || null, linkId: o.linkId || null, ...o.contenido }, null, 2);
            await uploadFile(o.tenantId, cfg, ruta, Buffer.from(json, "utf8"), true);
        }
        catch (e) {
            console.warn(`[REGISTROS→DROPBOX] No se pudo guardar el registro de ${o.cuit || "?"}:`, e?.response?.data?.error_summary || e?.message || e);
        }
    })();
}
