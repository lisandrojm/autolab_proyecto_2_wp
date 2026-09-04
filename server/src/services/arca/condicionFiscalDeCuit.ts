import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { getTenantAfipConfig, consultarPadronFiscal } from "../afipService.js";
import { derivarCondicionFiscal, condicionFiscalFallida, CondicionFiscal } from "./condicionFiscal.js";
import { leerCacheFiscal, guardarCacheFiscal, olvidarCacheFiscal } from "./cacheFiscal.js";

/**
 * La condición fiscal de un CUIT, lista para devolver: consulta A5, deriva y cachea.
 *
 * NUNCA TIRA. Cualquier problema —servicio sin autorizar en AFIP, timeout, tenant sin conexión de
 * ARCA configurada— vuelve como `DESCONOCIDO` con el motivo adentro. Es lo que permite que el alta
 * de usuario siga funcionando cuando esto no anda, que es el requisito que ordena todo lo demás: la
 * condición fiscal es un dato que suma, no un permiso para dar de alta a alguien.
 */
export async function condicionFiscalDeCuit(tenantId: Types.ObjectId | string, cuit: string, opts: { refrescar?: boolean } = {}): Promise<CondicionFiscal> {
  const tid = String(tenantId);
  if (opts.refrescar) olvidarCacheFiscal(tid, cuit);
  else {
    const enCache = leerCacheFiscal(tid, cuit);
    if (enCache) return enCache;
  }

  const inicio = Date.now();
  let condicion: CondicionFiscal;
  try {
    const tenant = await Tenant.findById(tid);
    const cfg = tenant ? getTenantAfipConfig(tenant) : null;
    if (!cfg) condicion = condicionFiscalFallida("La conexión con ARCA no está configurada");
    else {
      const r = await consultarPadronFiscal(tid, cfg, cuit);
      condicion = r.personaReturn ? derivarCondicionFiscal(r.personaReturn) : condicionFiscalFallida(r.motivo || "sin datos");
    }
  } catch (e: any) {
    condicion = condicionFiscalFallida(e?.message || String(e));
  }

  guardarCacheFiscal(tid, cuit, condicion);
  // Sin datos personales: CUIT, qué se derivó y cuánto tardó. Alcanza para ver si el servicio anda y
  // si el cache está sirviendo, que es para lo que se mira este log.
  console.log(`[fiscal] cuit=${cuit} tipo=${condicion.tipo}${condicion.error ? ` error="${condicion.error}"` : ""} ms=${Date.now() - inicio} cache=miss`);
  return condicion;
}
