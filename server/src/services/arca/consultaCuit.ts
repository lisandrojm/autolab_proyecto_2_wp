import { Tenant } from "../../models/Tenant.js";
import { getTenantAfipConfig, consultarPadron } from "../afipService.js";
import { cuitEsValido, normalizarCuit } from "../../utils/constanciaPdf.js";

/**
 * «¿Quién es este CUIT?» — UNA sola implementación para las tres pantallas.
 *
 * La usan el alta de usuario, la edición y el registro público. Son tres rutas distintas porque cada
 * una se autentica distinto —las dos primeras con JWT de administrador, el registro con el token de
 * invitación—, pero lo que hacen contra ARCA es idéntico: misma conexión del tenant, mismo
 * certificado, mismo webservice del Padrón, misma forma de respuesta.
 *
 * Estaba escrito dos veces, y ya habían empezado a divergir (una devolvía `estado` y `tipoPersona`,
 * la otra no). Acá vive una vez.
 *
 * NO ESCRIBE NADA: es una consulta. El sello «validado en ARCA» lo ponen las rutas de alta/edición
 * después de llamar a esto, nunca el cliente.
 */
export interface DatosDeArca {
  cuit: string;
  nombre: string;
  apellido: string;
  denominacion: string;
  estado: string;
  tipoPersona?: string;
  /** Los 8 dígitos del medio, sin ceros a la izquierda. Vacío en personas jurídicas. */
  documento: string;
}

/** Prefijos de CUIT de persona física: solo en esos el tramo del medio es un DNI. */
const PREFIJOS_PERSONA_FISICA = ["20", "23", "24", "25", "26", "27"];

/** Error con el status HTTP que le corresponde, para que cada ruta lo traduzca igual. */
export class ErrorConsultaCuit extends Error {
  constructor(
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export async function consultarCuitEnArca(tenantId: any, cuitCrudo: string): Promise<DatosDeArca> {
  const cuit = normalizarCuit(String(cuitCrudo || ""));
  if (!cuitEsValido(cuit)) throw new ErrorConsultaCuit(400, "El CUIT no es válido: revisá los dígitos antes de consultar el Padrón.");

  const tenant = await Tenant.findById(tenantId).lean();
  const cfg = getTenantAfipConfig(tenant);
  if (!cfg) throw new ErrorConsultaCuit(400, "ARCA no está conectado para esta organización.");

  const r = await consultarPadron(String(tenantId), cfg, cuit);
  if (!r.encontrado) throw new ErrorConsultaCuit(404, r.faultString || "ARCA no devolvió datos para este CUIT.");

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
