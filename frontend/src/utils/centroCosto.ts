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
