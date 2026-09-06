import { Tenant } from "../../models/Tenant.js";
import { getTenantAfipConfig, consultarPadron } from "../afipService.js";
import { cuitEsValido, normalizarCuit } from "../../utils/constanciaPdf.js";
/** Prefijos de CUIT de persona física: solo en esos el tramo del medio es un DNI. */
const PREFIJOS_PERSONA_FISICA = ["20", "23", "24", "25", "26", "27"];
/** Error con el status HTTP que le corresponde, para que cada ruta lo traduzca igual. */
export class ErrorConsultaCuit extends Error {
    status;
    constructor(status, mensaje) {
        super(mensaje);
        this.status = status;
    }
}
export async function consultarCuitEnArca(tenantId, cuitCrudo) {
    const cuit = normalizarCuit(String(cuitCrudo || ""));
    if (!cuitEsValido(cuit))
        throw new ErrorConsultaCuit(400, "El CUIT no es válido: revisá los dígitos antes de consultar el Padrón.");
    const tenant = await Tenant.findById(tenantId).lean();
    const cfg = getTenantAfipConfig(tenant);
    if (!cfg)
        throw new ErrorConsultaCuit(400, "ARCA no está conectado para esta organización.");
    const r = await consultarPadron(String(tenantId), cfg, cuit);
    if (!r.encontrado)
        throw new ErrorConsultaCuit(404, r.faultString || "ARCA no devolvió datos para este CUIT.");
    return {
        cuit,
        nombre: r.nombre || "",
        apellido: r.apellido || "",
        denominacion: r.denominacion || "",
        estado: r.estado,
        tipoPersona: r.tipoPersona,
        documento: PREFIJOS_PERSONA_FISICA.includes(cuit.slice(0, 2)) ? String(Number(cuit.slice(2, 10))) : "",
    };
}
/**
 * ¿Ya hay alguien con este CUIT en la organización?
 *
 * El email no alcanza como identidad: la misma persona puede registrarse dos veces con dos correos y
 * quedar duplicada, y ahí el problema recién aparece cuando dos contratos apuntan a legajos distintos
 * del mismo CUIL. El CUIT sí identifica a una persona ante ARCA, así que es la clave que corresponde.
 *
 * Compara por DÍGITOS, no por string: `metadata.cuit` se guarda con o sin guiones según de dónde vino,
 * y comparar crudo devolvía "no existe" para alguien que sí estaba.
 */
export async function usuarioExistenteConCuit(tenantId, cuitCrudo) {
    const { User } = await import("../../models/User.js");
    const buscado = String(cuitCrudo || "").replace(/\D/g, "");
    if (buscado.length !== 11)
        return null;
    const users = await User.find({ tenantId, "metadata.cuit": { $exists: true, $ne: "" } })
        .select("_id firstName lastName email metadata.cuit")
        .lean();
    const encontrado = users.find((u) => String(u?.metadata?.cuit || "").replace(/\D/g, "") === buscado);
    if (!encontrado)
        return null;
    return {
        _id: String(encontrado._id),
        nombre: `${encontrado.firstName || ""} ${encontrado.lastName || ""}`.trim() || "(sin nombre)",
        email: encontrado.email,
    };
}
