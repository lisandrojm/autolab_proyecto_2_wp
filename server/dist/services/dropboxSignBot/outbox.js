import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { DocumentoGenerado } from "../../models/DocumentoGenerado.js";
import { getTenantDropboxConfig, listFolder } from "../dropboxService.js";
import { resolverCarpetaPorProposito } from "../../utils/estadoCarpetas.js";
import { leerAnclas } from "../../utils/anclasNombre.js";
import { nombreDeFirmante } from "./reglas.js";
/** El Outbox del tenant: la carpeta y los PDFs que hay. */
export async function leerOutbox(tenantId) {
    const tenant = await Tenant.findById(tenantId).lean();
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        throw Object.assign(new Error("Dropbox no está conectado para esta organización."), { status: 400 });
    const outbox = await resolverCarpetaPorProposito("outbox");
    if (!outbox)
        throw Object.assign(new Error('No hay ninguna carpeta de Dropbox configurada como "Outbox".'), { status: 400 });
    const { entries } = await listFolder(tenantId, cfg, outbox);
    return { outbox: outbox.replace(/\/$/, ""), archivos: entries.filter((e) => e.tag === "file" && /\.pdf$/i.test(e.name)).map((e) => e.name), cfg };
}
/**
 * QUIÉN FIRMA, desde la base. El código del nombre («ID-000123») lleva al `DocumentoGenerado` y de ahí
 * al usuario: su email manda sobre el del nombre de archivo (caso real: el archivo decía
 * `korova-oi@hotmail.com` y la persona tiene `korova_oi@hotmail.com`), y el nombre es «PRIMER NOMBRE
 * APELLIDOS». Sin registro en la base, se busca al usuario por el email del nombre de archivo y se
 * deja constancia del respaldo.
 */
export async function resolverFirmante(tenantId, archivo, avisar) {
    const anclas = leerAnclas(archivo);
    let user = null;
    let viaRegistro = false;
    if (anclas.codigo) {
        const doc = await DocumentoGenerado.findOne({ tenantId: new Types.ObjectId(tenantId), codigo: anclas.codigo }).select("userId userProjectId").lean();
        let userId = doc?.userId || null;
        if (!userId && doc?.userProjectId)
            userId = (await UserProject.findById(doc.userProjectId).select("userId").lean())?.userId || null;
        if (userId) {
            user = await User.findOne({ _id: userId, tenantId }).select("firstName lastName email").lean();
            viaRegistro = !!user;
        }
    }
    if (!user && anclas.email) {
        user = await User.findOne({ tenantId, email: new RegExp(`^${anclas.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).select("firstName lastName email").lean();
        if (user)
            avisar?.(`${archivo}: sin registro en la base para ${anclas.codigo || "el código"}; se tomó al usuario por el email del nombre de archivo.`);
    }
    if (!user)
        return { firmante: null, motivoSinFirmante: anclas.codigo ? `No hay usuario para el código ${anclas.codigo} ni para el email del nombre de archivo.` : "El nombre de archivo no trae código ni email reconocibles." };
    const email = String(user.email || "").trim().toLowerCase() || anclas.email;
    if (viaRegistro && anclas.email && email !== anclas.email)
        avisar?.(`${archivo}: el email del nombre de archivo (${anclas.email}) difiere del de la base (${email}); se usa el de la base.`);
    const nombre = nombreDeFirmante(user);
    if (!nombre || !email)
        return { firmante: null, motivoSinFirmante: "El usuario no tiene nombre o email cargados." };
    return { firmante: { nombre, email } };
}
