/**
 * Traduce un fallo de la API a un mensaje que diga LA VERDAD.
 *
 * El caso que motiva esto: cuando el backend del VPS todavía no levantó una ruta nueva, Express contesta
 * `{ error: "Not Found" }` y la pantalla mostraba «No se pudo leer la base — Not Found». Eso manda a
 * buscar un problema en la base cuando el problema es que falta reiniciar el server: dos causas
 * completamente distintas con el mismo cartel, y la que no era culpa del dato es la que se investiga.
 *
 * Es el mismo criterio que ya usa `errorArca.ts` para el Padrón; acá está genérico para el resto de la
 * plataforma. Lo único que distingue los casos de forma confiable es el STATUS.
 */
export interface ErrorApi {
  titulo: string;
  detalle: string;
}

export const mensajeErrorApi = (error: any, tituloPorDefecto: string): ErrorApi => {
  const status: number | undefined = error?.response?.status;
  const delServidor = String(error?.response?.data?.error || "").trim();

  // Sin status no hubo respuesta: red caída, DNS, servidor apagado, CORS.
  if (!status) return { titulo: "No se pudo contactar el servidor", detalle: "Revisá la conexión y probá de nuevo en un momento." };

  // El 404 pelado de Express: la ruta no existe. NO es que no se haya encontrado el dato.
  if (status === 404 && (!delServidor || /^not found$/i.test(delServidor)))
    return {
      titulo: "El servidor no reconoce esta operación",
      detalle: "Suele ser que el backend está corriendo una versión anterior: hay que actualizarlo y reiniciar el proceso. Avisale a quien administra el sistema.",
    };

  if (status === 404) return { titulo: tituloPorDefecto, detalle: delServidor };
  if (status === 403) return { titulo: "Sin permiso", detalle: delServidor || "Esta operación es solo para administradores." };
  if (status === 409) return { titulo: "Hay una operación en curso", detalle: delServidor || "Esperá a que termine y volvé a intentar." };
  if (status === 400) return { titulo: tituloPorDefecto, detalle: delServidor || "Revisá los datos antes de reintentar." };
  if (status >= 500) return { titulo: tituloPorDefecto, detalle: delServidor || "El servidor falló al procesar la operación. Probá de nuevo en un momento." };

  return { titulo: tituloPorDefecto, detalle: delServidor || "Probá de nuevo en un momento." };
};
