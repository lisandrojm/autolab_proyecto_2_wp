/**
 * El NOMBRE del centro de costo de un proyecto.
 *
 * DOS FUENTES, Y LAS DOS HACEN FALTA:
 *
 *   1. `metadataResolutions.centroCosto` — lo que resuelve el server. Es la fuente correcta, pero el
 *      listado no lo resolvía (solo la ficha), así que hasta que ese backend esté deployado llega
 *      vacío y la columna mostraba «ID: 46» en todas las filas.
 *   2. El catálogo `info?type=centro-costo` que las pantallas YA cargan para el select del formulario.
 *      Está en memoria, se indexa por `data.id` —que es exactamente lo que el proyecto guarda en
 *      `metadata.centroCostoId`— y no cuesta una request más.
 *
 * Se prueban en ese orden. No es redundancia: la primera deja de depender del catálogo cargado en la
 * pantalla, y la segunda hace que el nombre se vea sin esperar un deploy.
 *
 * `ID: n` COMO ÚLTIMO RECURSO, NO UN GUION. Un proyecto puede apuntar a un centro de costo que no
 * está en el catálogo —hoy hay 12, con ids 33 a 46, creados en FRAME después de la última carga—, y
 * un guion diría «no tiene» cuando lo que pasa es «apunta a uno que falta». Son cosas distintas y la
 * segunda hay que poder verla.
 */
export const nombreCentroCosto = (proyecto: { metadataResolutions?: { centroCosto?: any }; metadata?: { centroCostoId?: number } }, catalogo: any[] = []): string => {
  const resuelto = proyecto?.metadataResolutions?.centroCosto;
  const delServer = resuelto?.name || resuelto?.data?.nombre;
  if (delServer) return String(delServer);

  const id = proyecto?.metadata?.centroCostoId;
  if (id == null) return "";

  const delCatalogo = catalogo.find((c) => Number(c?.data?.id) === Number(id));
  return String(delCatalogo?.name || delCatalogo?.data?.nombre || `ID: ${id}`);
};

/**
 * TODOS los centros de costo, de los DOS catálogos que existen.
 *
 * Hay dos, y no son el mismo: `info?type=centro-costo` (colección `infos`) es de donde salían los
 * selects, y `/centros-costo` (modelo `CentroCosto`) es el que administra Configuración → Centros de
 * Costos, con su alta, su edición y su import de Excel.
 *
 * Mientras tuvieron los mismos 32 registros la diferencia no se veía. En cuanto alguien cargó 15 más
 * desde el ABM, el select del proyecto siguió ofreciendo 32: los nuevos existían, se podían editar, y
 * no se podían elegir. La pantalla que los administra y la que los usa miraban lugares distintos.
 *
 * Se devuelven UNIDOS y no reemplazados: quedarse solo con el del ABM haría desaparecer del select
 * cualquiera que exista únicamente en `infos` y que algún proyecto ya esté usando —y un proyecto no
 * puede perder su centro de costo porque cambiamos de dónde leemos la lista—. Ante el mismo `data.id`
 * gana el del ABM, que es el que una persona puede corregir.
 *
 * Los que no tienen `data.id` se descartan: el proyecto guarda un número, así que uno sin id no se
 * puede elegir ni resolver. Aparece en el ABM con «—» en la columna ID Externo.
 */
/**
 * El valor de un `<select>` de id numérico, listo para el payload.
 *
 * `parseInt(v) || undefined` ES UN BUG, y este es el que costó encontrar: con la opción de valor
 * «0», `parseInt` da 0 y `0 || undefined` da **undefined**. El id se descarta en silencio, el PATCH
 * viaja sin el campo, y el server —que solo escribe `if (... !== undefined)`— no guarda nada. Desde
 * afuera se ve como «elegí uno y no guarda», sin ningún error.
 *
 * Acá el vacío se distingue del cero mirando el STRING, que es lo único que sabe cuál de los dos es.
 */
export const idOpcional = (valor: string): number | undefined => {
  const limpio = String(valor ?? "").trim();
  if (limpio === "") return undefined;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : undefined;
};

export const cargarCentrosCosto = async (apiUrl: string, headers: Record<string, string>): Promise<any[]> => {
  const traer = async (ruta: string) => {
    try {
      const r = await fetch(`${apiUrl}${ruta}`, { headers });
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : d?.items || [];
    } catch {
      return [];
    }
  };
  const [deInfo, delAbm] = await Promise.all([traer("/info?type=centro-costo"), traer("/centros-costo")]);
  const porId = new Map<number, any>();
  for (const c of [...deInfo, ...delAbm]) {
    const id = Number(c?.data?.id);
    /*
      Se descarta el id 0, que es lo que queda cuando alguien crea un centro de costo SIN ID Externo.
      No es un id: es el default del campo numérico, y se comporta como «vacío» en cada chequeo por
      verdadero de la aplicación —el propio proyecto lo muestra con `centroCostoId ? … : '—'`—. Un
      centro con id 0 aparecería en el select y no se podría guardar; mejor que no aparezca y que se
      le cargue un ID Externo real.
    */
    if (Number.isFinite(id) && id > 0) porId.set(id, c);
  }
  return [...porId.values()].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
};
