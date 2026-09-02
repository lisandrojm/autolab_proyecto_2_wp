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
