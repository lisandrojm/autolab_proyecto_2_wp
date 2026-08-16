/**
 * Resuelve la URL del logo y la firma de una Empresa (membrete).
 *
 * Se cuelgan de `VITE_API_URL` —que INCLUYE `/api/v1`— porque `companies.logoUrl` guarda el `path`
 * que devuelve la subida a `/client-assets/...`, servido por la misma API.
 *
 * OJO: no confundir con `utils/imageHelpers.getImageUrl`, que hace lo contrario —le SACA el `/api/v1`
 * a la base porque resuelve `/storage/...`, que se sirve en la raíz—. Con estas rutas devuelve la
 * URL sin el prefijo y la imagen no carga. Esta función existía duplicada dentro de `MembretesPage`;
 * al reusarla en el contexto Empresa se sacó afuera para que haya una sola y no vuelvan a divergir.
 */
export const empresaAssetUrl = (url?: string | null): string => {
  if (!url) return '';
  // `blob:` son previews locales antes de subir; `http` ya viene absoluta.
  if (url.startsWith('blob:') || url.startsWith('http')) return url;
  return `${import.meta.env.VITE_API_URL}${url}`;
};
