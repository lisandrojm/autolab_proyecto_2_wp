import { CondicionFiscal } from "./condicionFiscal.js";

/**
 * Cache de condición fiscal por CUIT, en memoria del proceso.
 *
 * ARCA tiene rate limit y la condición fiscal de alguien no cambia de un minuto al otro: sin cache,
 * abrir el alta, equivocarse de pestaña y volver son tres consultas por la misma persona.
 *
 * EN MEMORIA Y NO EN LA BASE, a propósito para esta primera versión: es una copia de algo que ARCA
 * tiene, no un dato de la plataforma, y persistirlo obliga a decidir cuándo invalidarlo y a explicar
 * por qué la base guarda algo que puede estar viejo. Si el proceso reinicia se vuelve a consultar, y
 * eso está bien. Lo que sí se persiste es el resultado en el USUARIO al darlo de alta —eso es el dato
 * del que se responde—, y ahí queda con su `fechaConsulta`.
 *
 * Se cachea también el fallo: si el servicio A5 no está autorizado en AFIP, todas las consultas van
 * a fallar igual, y reintentar por cada tecla no lo va a arreglar. El TTL del fallo es mucho más
 * corto para que habilitar el servicio se note enseguida.
 */
const TTL_OK_MS = 24 * 60 * 60 * 1000; // 24h, lo pedido
const TTL_FALLA_MS = 5 * 60 * 1000; // 5 min

interface Entrada {
  condicion: CondicionFiscal;
  expiraEn: number;
}

const cache = new Map<string, Entrada>();

/** La clave lleva el tenant: dos tenants pueden consultar el mismo CUIT y no comparten nada. */
const clave = (tenantId: string, cuit: string) => `${tenantId}:${cuit}`;

export function leerCacheFiscal(tenantId: string, cuit: string): CondicionFiscal | null {
  const e = cache.get(clave(tenantId, cuit));
  if (!e) return null;
  if (Date.now() > e.expiraEn) {
    cache.delete(clave(tenantId, cuit));
    return null;
  }
  return e.condicion;
}

export function guardarCacheFiscal(tenantId: string, cuit: string, condicion: CondicionFiscal): void {
  const ttl = condicion.error ? TTL_FALLA_MS : TTL_OK_MS;
  cache.set(clave(tenantId, cuit), { condicion, expiraEn: Date.now() + ttl });
}

/** Saltea el cache para un CUIT: lo usa el botón «Actualizar» de la pantalla. */
export function olvidarCacheFiscal(tenantId: string, cuit: string): void {
  cache.delete(clave(tenantId, cuit));
}
