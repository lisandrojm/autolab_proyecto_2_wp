import { createSimpleCatalogApi } from "./simpleCatalog";
import { infoAPI, InfoItem } from "./info";
import { PAIS_RESIDENCIA_CATALOG } from "../config/personalDataFields";

/** País del DOMICILIO: el ABM de Países de residencia. Ver `server/src/models/PaisResidencia.ts`. */
export const paisesResidenciaApi = createSimpleCatalogApi("/paises-residencia");

export type PaisResidenciaComoInfo = InfoItem & { activo: boolean };

/**
 * Los países de residencia con la forma de un catálogo de Info (`data.id`, `name`), para los formularios
 * genéricos de datos personales, que resuelven todos sus selects así.
 *
 * Trae también los inactivos (`activo: false`): quien ya tiene uno cargado tiene que seguir viendo su
 * nombre, y el que arma las opciones es el que los filtra. Se descartan los que no tienen id, porque no
 * hay nada que guardar en `paisId`.
 *
 * Si el catálogo no responde o está vacío —un server que todavía no lo tiene—, devuelve los países de
 * FRAME, que comparten ids: el formulario no se queda sin opciones y lo elegido sigue siendo válido.
 */
export async function listarPaisesResidenciaComoInfo(): Promise<PaisResidenciaComoInfo[]> {
  const propios = await paisesResidenciaApi.list().catch(() => []);
  const conId = propios.filter((p) => typeof p.data?.id === "number");
  if (conId.length === 0) {
    const deFrame = await infoAPI.listByType("pais").catch(() => [] as InfoItem[]);
    return deFrame.map((c) => ({ ...c, activo: true }));
  }
  return conId.map((p) => ({
    _id: p._id,
    externalId: p.externalId,
    type: PAIS_RESIDENCIA_CATALOG,
    name: p.name,
    data: { id: p.data?.id as number, nombre: p.name },
    createdAt: p.createdAt || "",
    updatedAt: p.updatedAt || "",
    activo: p.activo !== false,
  }));
}
