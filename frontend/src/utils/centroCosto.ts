/*
  EL CENTRO DE COSTO DE UN PROYECTO, COMO SE MUESTRA EN TODA LA PLATAFORMA.

  Se muestra el CÓDIGO (`codAuxiliar`): «682», «99», «SinAsignar». Es el número real del centro en
  Tango y es como lo nombra producción. Antes se mostraba `name`, que resultaba ser el mismo número
  por casualidad —el ABM guardaba el código en el campo «nombre»—; ahora el código es un campo propio
  y `name` quedó como su derivado, para el código viejo que todavía lo lee.
*/

/**
 * La etiqueta de un centro del catálogo. Un solo lugar, para que la tabla del ABM, los selects y la
 * ficha del proyecto no puedan mostrar cosas distintas del mismo registro.
 *
 * El orden es el de la precisión: el código de Tango, después `name`/`data.nombre` —que es lo único
 * que tienen los centros cargados antes del cambio— y nada si no hay ninguno.
 */
export const etiquetaCentroCosto = (cc: any): string => String(cc?.codAuxiliar || cc?.name || cc?.data?.nombre || "").trim();

/** El id con el que el proyecto lo referencia. `idAuxiliar` y `data.id` se mantienen sincronizados. */
export const idCentroCosto = (cc: any): number | null => {
  const id = Number(cc?.idAuxiliar ?? cc?.data?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

/** ¿Está inhabilitado en Tango? Ausente cuenta como habilitado: los viejos no tienen el campo. */
export const centroCostoInhabilitado = (cc: any): boolean => String(cc?.habilitado ?? "S").toUpperCase() === "N";

/**
 * Las opciones de un select de centro de costo.
 *
 * Los INHABILITADOS no se ofrecen —Tango dice que no se usan más— SALVO el que el proyecto ya tiene
 * puesto: sacarlo de la lista haría que el select apareciera vacío sobre un proyecto que sí tiene
 * centro, y guardar cualquier otro cambio de la ficha se lo borraría sin que nadie lo pidiera. Ése se
 * muestra con «(inhabilitado)» para que se vea por qué conviene cambiarlo.
 */
export const opcionesCentroCosto = (catalogo: any[], idActual?: number | null): Array<{ clave: string; id: number; etiqueta: string; descripcion: string; empresa: string; inhabilitado: boolean }> =>
  (catalogo || [])
    .map((cc) => ({ cc, id: idCentroCosto(cc) }))
    .filter((x): x is { cc: any; id: number } => x.id !== null)
    .filter((x) => !centroCostoInhabilitado(x.cc) || Number(idActual) === x.id)
    .map((x) => ({
      // El `_id` y no el id de Tango: con tres empresas el id se repite y React necesita una clave única.
      clave: String(x.cc?._id || `${x.cc?.empresaNombre || ""}-${x.id}`),
      id: x.id,
      etiqueta: etiquetaCentroCosto(x.cc) + (centroCostoInhabilitado(x.cc) ? " (inhabilitado)" : ""),
      descripcion: String(x.cc?.descAuxiliar || x.cc?.data?.descripcion || "").trim(),
      // De qué empresa vino: los códigos se repiten entre las tres, así que sin esto «682» es ambiguo.
      empresa: String(x.cc?.empresaNombre || "").trim(),
      inhabilitado: centroCostoInhabilitado(x.cc),
    }));

/**
 * El CÓDIGO del centro de costo de un proyecto.
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
 * está en el catálogo —hoy hay 12, con ids 33 a 46, creados en Tango después de la última carga—, y
 * un guion diría «no tiene» cuando lo que pasa es «apunta a uno que falta». Son cosas distintas y la
 * segunda hay que poder verla.
 */
export const nombreCentroCosto = (proyecto: { metadataResolutions?: { centroCosto?: any }; metadata?: { centroCostoId?: number } }, catalogo: any[] = []): string => {
  const resuelto = proyecto?.metadataResolutions?.centroCosto;
  // `codAuxiliar` primero: es el código de Tango. `name` es su derivado y lo único que traen los viejos.
  const delServer = etiquetaCentroCosto(resuelto);
  if (delServer) return delServer;

  const id = proyecto?.metadata?.centroCostoId;
  /*
    EL 0 ES «NO TIENE», NO UN ID QUE FALTA.

    Es lo que deja un campo numérico vacío, y el resto de la app ya lo trata así: `cargarCentrosCosto`
    descarta del select los centros con id 0, y la ficha muestra un guion cuando `centroCostoId` es 0.
    Sin este chequeo cae en el fallback de abajo y devuelve «ID: 0», que dice «apunta a uno que no
    está» cuando lo que pasa es que no apunta a ninguno. Son justo los dos casos que el fallback
    existe para distinguir, así que confundirlos acá lo vuelve inútil.
  */
  if (id == null || Number(id) === 0) return "";

  const delCatalogo = catalogo.find((c) => idCentroCosto(c) === Number(id));
  return etiquetaCentroCosto(delCatalogo) || `ID: ${id}`;
};

/**
 * TODOS los centros de costo: SÓLO los de `/centros-costo`, el catálogo que se administra.
 *
 * ACÁ SE UNÍAN DOS CATÁLOGOS y ya no: `infos` con `type: "centro-costo"` tiene la numeración VIEJA
 * (ids 1–46) y esos mismos ids existen ahora como `idAuxiliar` de otros centros de Tango. Unirlos
 * ofrecería dos centros distintos con el mismo id y resolvería el nombre del que quedara último: un
 * proyecto con el id 1 mostraría «682» o «99» según el orden del `Map`. La unión tenía sentido cuando
 * las dos colecciones eran la misma lista con distinto dueño; desde el import de Tango es un riesgo
 * sin beneficio, porque el catálogo del ABM es el completo (806).
 *
 * Los que no tienen id se descartan: el proyecto guarda un número, así que uno sin id no se puede
 * elegir ni resolver.
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
  const delAbm = await traer("/centros-costo");
  /*
    SIN ID NO ENTRA, PERO NO SE DEDUPLICA POR ID.

    Antes se indexaban en un `Map` por id, que servía cuando había dos catálogos con los mismos ids
    (uno pisaba al otro). Con el catálogo de Tango por empresa eso BORRA datos: las tres empresas
    tienen un centro con id 1, y el `Map` dejaría uno solo. Se conservan todos y cada uno muestra de
    qué empresa vino.

    Lo que sí se descarta es el que no tiene id: se comporta como «vacío» en cada chequeo por verdadero
    de la aplicación —la ficha lo muestra con `centroCostoId ? … : '—'`—, así que aparecería en el
    selector y no se podría guardar.
  */
  const conId = delAbm.filter((c: any) => idCentroCosto(c) !== null);
  /*
    Ordenado por código y con `numeric`: son números guardados como texto, y sin eso «100» va antes de
    «99» y «1000» antes de «682». Con 806 centros, encontrar el propio en una lista mal ordenada es el
    trabajo que este orden ahorra.
  */
  return conId.sort((a: any, b: any) => etiquetaCentroCosto(a).localeCompare(etiquetaCentroCosto(b), "es", { numeric: true }) || String(a?.empresaNombre || "").localeCompare(String(b?.empresaNombre || "")));
};
