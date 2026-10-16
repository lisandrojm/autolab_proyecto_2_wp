import { Types } from "mongoose";
import { Contrato } from "../models/Contrato.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Release } from "../models/Release.js";
import { ReleaseTipo } from "../models/ReleaseTipo.js";
import { Tenant } from "../models/Tenant.js";
import { PLACEHOLDER_CONTRATO_CUSTOM, PLACEHOLDER_RELEASE_CUSTOM } from "../compartido/textoCustom.js";
/**
 * «CONTRATO CUSTOM» Y «RELEASE CUSTOM» SON DEL SISTEMA (pedido del 16/10/2026): los crea el server y
 * no se pueden eliminar. Antes los creaba un script a mano (`scripts/crearPlantillasCustom.ts`), así
 * que un tenant nuevo no los tenía.
 *
 * Son cuatro registros, marcados con `delSistema`:
 *  - el tipo de contrato y su plantilla (globales: no tienen `tenantId`; uno solo para todos),
 *  - el tipo de release y el release (uno por tenant).
 *
 * Idempotente. Lo que ya existe se reconoce por la marca o, la primera vez, por el nombre y lo custom
 * (los que creó el script), y se marca sin duplicarlo. No toca lo que el usuario cambió (membrete,
 * activo, estados): sólo crea lo que falta, pone la marca y mantiene la plantilla como custom.
 *
 * Corre al arrancar el server para todos los tenants y, por las dudas, en los GET de las cuatro
 * pantallas para el tenant que mira (una vez por proceso y tenant).
 */
export const NOMBRE_CONTRATO_CUSTOM = "Contrato custom";
export const NOMBRE_RELEASE_CUSTOM = "Release custom";
let globalesListos = null;
const tenantsListos = new Map();
async function asegurarGlobales() {
    // El tipo de contrato: por la marca, o el que se llama así (el nombre es único).
    let contrato = (await Contrato.findOne({ delSistema: true }).lean()) || (await Contrato.findOne({ name: NOMBRE_CONTRATO_CUSTOM }).lean());
    if (!contrato) {
        contrato = (await Contrato.create({ name: NOMBRE_CONTRATO_CUSTOM, isActive: true, delSistema: true })).toObject();
        console.log(`[plantillas-custom] tipo de contrato «${NOMBRE_CONTRATO_CUSTOM}» creado`);
    }
    else if (!contrato.delSistema) {
        await Contrato.updateOne({ _id: contrato._id }, { $set: { delSistema: true } });
    }
    const plantilla = (await ContratoFrame.findOne({ delSistema: true }).lean()) || (await ContratoFrame.findOne({ name: NOMBRE_CONTRATO_CUSTOM, esCustom: true }).lean());
    if (!plantilla) {
        await ContratoFrame.create({
            name: NOMBRE_CONTRATO_CUSTOM,
            externalId: "",
            content: PLACEHOLDER_CONTRATO_CUSTOM,
            esCustom: true,
            delSistema: true,
            contratoId: contrato._id,
            contratoIds: [contrato._id],
            usaMembrete: false,
            isActive: true,
            data: {
                nombre: NOMBRE_CONTRATO_CUSTOM,
                cantidadJornadas: contrato.data?.cantidadJornadas || 0,
                multiplicadorDiario: contrato.data?.multiplicadorDiario || 0,
                esTiempoIndeterminado: !!contrato.data?.esTiempoIndeterminado,
            },
        });
        console.log(`[plantillas-custom] plantilla «${NOMBRE_CONTRATO_CUSTOM}» creada (sin estado impositivo: se asigna en Estados)`);
    }
    else if (!plantilla.delSistema || !plantilla.esCustom) {
        await ContratoFrame.updateOne({ _id: plantilla._id }, { $set: { delSistema: true, esCustom: true, content: PLACEHOLDER_CONTRATO_CUSTOM } });
    }
}
async function asegurarDelTenant(tenantId) {
    const tid = new Types.ObjectId(String(tenantId));
    // El tenant del sistema no tiene contratos ni releases propios.
    const tenant = await Tenant.findById(tid).select("slug").lean();
    if (!tenant || tenant.slug === "superadmin")
        return;
    let tipo = (await ReleaseTipo.findOne({ tenantId: tid, delSistema: true }).lean()) || (await ReleaseTipo.findOne({ tenantId: tid, name: NOMBRE_RELEASE_CUSTOM }).lean());
    if (!tipo) {
        tipo = (await ReleaseTipo.create({ tenantId: tid, name: NOMBRE_RELEASE_CUSTOM, isActive: true, requiereFirma: true, delSistema: true })).toObject();
    }
    else if (!tipo.delSistema) {
        await ReleaseTipo.updateOne({ _id: tipo._id }, { $set: { delSistema: true } });
    }
    const release = (await Release.findOne({ tenantId: tid, delSistema: true }).lean()) || (await Release.findOne({ tenantId: tid, name: NOMBRE_RELEASE_CUSTOM, esCustom: true }).lean());
    if (!release) {
        await Release.create({
            tenantId: tid,
            name: NOMBRE_RELEASE_CUSTOM,
            version: "1",
            description: "El texto se escribe en Firma digital para cada trámite.",
            content: PLACEHOLDER_RELEASE_CUSTOM,
            esCustom: true,
            delSistema: true,
            releaseTipoId: tipo._id,
            isActive: true,
            usaMembrete: false,
        });
        console.log(`[plantillas-custom] ${tid}: release «${NOMBRE_RELEASE_CUSTOM}» creado`);
    }
    else if (!release.delSistema || !release.esCustom) {
        await Release.updateOne({ _id: release._id }, { $set: { delSistema: true, esCustom: true, content: PLACEHOLDER_RELEASE_CUSTOM } });
    }
}
/** Para un tenant: los globales y los suyos. Una vez por proceso (si falla, se reintenta la próxima). */
export function asegurarPlantillasCustom(tenantId) {
    if (!globalesListos)
        globalesListos = asegurarGlobales().catch((e) => ((globalesListos = null), Promise.reject(e)));
    const clave = String(tenantId);
    if (!tenantsListos.has(clave)) {
        tenantsListos.set(clave, globalesListos.then(() => asegurarDelTenant(tenantId)).catch((e) => {
            tenantsListos.delete(clave);
            throw e;
        }));
    }
    return tenantsListos.get(clave);
}
/** Al arrancar: todos los tenants de clientes (el del sistema no tiene contratos). */
export async function asegurarPlantillasCustomEnTodos() {
    const tenants = await Tenant.find({ slug: { $ne: "superadmin" } }).select("_id").lean();
    for (const t of tenants) {
        try {
            await asegurarPlantillasCustom(t._id);
        }
        catch (e) {
            console.error(`[plantillas-custom] ${t._id}:`, e?.message || e);
        }
    }
}
/** Para los GET: que nunca rompan la pantalla si esto falla. */
export async function asegurarPlantillasCustomSinRomper(tenantId) {
    if (!tenantId)
        return;
    await asegurarPlantillasCustom(tenantId).catch((e) => console.error("[plantillas-custom]", e?.message || e));
}
export const MENSAJE_DEL_SISTEMA = "Es del sistema (Contrato custom / Release custom): no se puede eliminar.";
