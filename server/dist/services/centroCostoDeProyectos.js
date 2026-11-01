import { CentroCosto } from "../models/CentroCosto.js";
/**
 * EL CENTRO DE COSTO DE CADA PROYECTO, RESUELTO POR EL SERVER.
 *
 * Lo necesita cualquier listado que dibuje el badge del centro: sin esto la pantalla se queda
 * esperando a `cargarCentrosCosto` —los 2204 centros del catálogo de Tango— para traducir un número,
 * y hasta que llega muestra «ID: 46» en cada tarjeta. Acá es una consulta por página de proyectos.
 *
 * Estaba escrito adentro de `GET /projects` y el listado por cliente no lo tenía, que es justamente
 * la pantalla donde se veían los ids: el mismo badge resolvía distinto según de qué lista saliera.
 *
 * Salió de `routes/projects.ts` (01/11/2026) para usarlo también en Solicitudes.
 */
export async function resolverCentroCostoDeProyectos(projects) {
    if (!projects || projects.length === 0)
        return;
    /*
      RESOLUCIÓN EN BLOQUE DEL CENTRO DE COSTO.
  
      La ficha del proyecto lo resolvía y el LISTADO no, así que la tabla mostraba «ID: 46» donde la
      ficha del mismo proyecto decía «99_PRODUCTORA». No era un problema de la pantalla: el dato no
      llegaba, y el número crudo es lo que la pantalla muestra cuando el id no resuelve —que también
      es el caso real de un centro de costo borrado, y por eso conviene que se distinga de un guion.
  
      Va en bloque, como sede y responsable: un `findOne` por proyecto serían 12 consultas para
      mostrar una columna.
    */
    const centroCostoIds = new Set();
    projects.forEach((p) => {
        if (p.metadata?.centroCostoId)
            centroCostoIds.add(Number(p.metadata.centroCostoId));
    });
    if (centroCostoIds.size > 0) {
        /*
          SÓLO EL CATÁLOGO DEL ABM (`centros-costo`). Antes se mezclaba con `Info type:"centro-costo"`.
    
          Esa unión existía porque los dos tenían los mismos ids y el ABM era el único que se podía
          corregir. Desde que el catálogo se importa de FRAME dejó de ser inofensiva: `infos` conserva la
          numeración vieja (1–46) y esos mismos ids existen ahora como `idAuxiliar` de otros centros. Un
          proyecto con el id 1 resolvería contra «682» en `infos` y contra «99» en FRAME: la unión
          mostraría el centro equivocado, que es peor que no mostrar ninguno.
    
          `idAuxiliar` es lo que guarda el proyecto, y `data.id` se mantiene sincronizado con él (ver el
          modelo), así que se busca por los dos: los centros anteriores al cambio sólo tienen `data.id`.
        */
        const ids = Array.from(centroCostoIds);
        const propios = await CentroCosto.find({ $or: [{ idAuxiliar: { $in: ids } }, { "data.id": { $in: ids } }] }).lean();
        /*
          SE INDEXA POR (EMPRESA, ID) Y TAMBIÉN POR ID SOLO.
    
          El id solo es ambiguo —el 656 es «720» en una empresa y «662» en otra—, así que primero se
          busca el par exacto que guardó el proyecto. El índice por id queda como respaldo para los
          proyectos anteriores a que se guardara la empresa: ahí se muestra el primero, que es lo mismo
          que hacía antes, y no hay forma de saber más.
        */
        const ccPorEmpresa = new Map();
        const ccMap = new Map();
        propios.forEach((c) => {
            const id = String(c.idAuxiliar ?? c.data?.id);
            ccPorEmpresa.set(`${c.empresaTangoId}::${id}`, c);
            if (!ccMap.has(id))
                ccMap.set(id, c);
        });
        projects.forEach((p) => {
            if (p.metadata?.centroCostoId) {
                const cc = ccPorEmpresa.get(`${p.metadata.centroCostoEmpresaTangoId}::${p.metadata.centroCostoId}`) || ccMap.get(String(p.metadata.centroCostoId));
                if (cc) {
                    if (!p.metadataResolutions)
                        p.metadataResolutions = {};
                    p.metadataResolutions.centroCosto = cc;
                }
            }
        });
    }
}
/**
 * Lo que dice el badge del centro de costo de un proyecto ya resuelto: el código de Tango (o el nombre,
 * en los viejos). Con un id que no resuelve, «ID: n», como la pantalla (`nombreCentroCosto`): distingue
 * un centro borrado de un proyecto sin centro, que es "".
 */
export const etiquetaCentroCostoDe = (p) => {
    const cc = p?.metadataResolutions?.centroCosto;
    const etiqueta = String(cc?.codAuxiliar || cc?.name || cc?.data?.nombre || "").trim();
    if (etiqueta)
        return etiqueta;
    const id = Number(p?.metadata?.centroCostoId);
    return id ? `ID: ${id}` : "";
};
