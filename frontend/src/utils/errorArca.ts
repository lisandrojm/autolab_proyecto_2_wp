/**
 * Traduce un fallo al validar un CUIT en un mensaje que diga LA VERDAD.
 *
 * El error se mostraba con `data.error` crudo, y eso hacía que un problema de infraestructura se
 * presentara como un rechazo del organismo: cuando la ruta no existía en el backend, Express devolvía
 * `{ error: "Not Found" }` y el usuario leía «ARCA no reconoció ese CUIT — Not Found». Dos causas
 * completamente distintas —un CUIT mal cargado y un backend desactualizado— con el mismo cartel, y la
 * que no era culpa del dato mandaba a revisar el dato.
 *
 * Acá se separan por el status, que es lo único que las distingue de forma confiable.
 */
export interface ErrorArca {
  titulo: string;
  detalle: string;
}

export const mensajeErrorArca = (status: number | undefined, data: any): ErrorArca => {
  const delServidor = String(data?.error || "").trim();

  // Sin status no hubo respuesta: DNS, red caída, servidor apagado, CORS.
  if (!status) return { titulo: "No se pudo contactar el servidor", detalle: "Revisá la conexión y probá de nuevo en un momento." };

  // El 404 genérico de Express: la ruta no existe. NO es que ARCA no encontró a la persona.
  if (status === 404 && (!delServidor || /^not found$/i.test(delServidor)))
    return {
      titulo: "El servicio de validación no está disponible",
      detalle: "El servidor no reconoce esta operación, así que no se llegó a consultar a ARCA. Suele ser que falta actualizar el backend: avisale a quien administra el sistema.",
    };

  // 404 CON mensaje: ese sí viene del organismo (p. ej. «La Clave (CUIT/CUIL) consultada es inexistente»).
  if (status === 404)
    return {
      titulo: "ARCA no reconoció ese CUIT",
      detalle: `${delServidor}\n\nUn CUIT puede pasar el dígito verificador y aun así no existir: alcanza con un número cambiado. Corregilo y volvé a intentar.`,
    };

  if (status === 401) return { titulo: "El link ya no es válido", detalle: delServidor || "Pedí un link de registro nuevo." };
  if (status === 403) return { titulo: "Sin permiso", detalle: delServidor || "No tenés permiso para consultar el Padrón." };
  if (status === 400) return { titulo: "No se pudo consultar", detalle: delServidor || "Revisá el CUIT antes de validar." };

  if (status >= 500)
    return {
      titulo: "El servidor falló al consultar ARCA",
      detalle: delServidor || "Probá de nuevo en un momento. Si sigue igual, avisale a quien administra el sistema.",
    };

  return { titulo: "No se pudo validar el CUIT", detalle: delServidor || "Probá de nuevo en un momento." };
};
