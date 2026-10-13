/**
 * EL ERROR DE UN PEDIDO CON `responseType: "blob"`: si el server responde un error, el cuerpo también
 * llega como blob y el `{ error }` queda escondido. Esto lo convierte a JSON en `error.response.data`
 * para que el mensaje del server se pueda mostrar (p. ej. «el contrato custom no tiene texto escrito»).
 * Siempre vuelve a lanzar el error.
 */
export async function relanzarErrorDeBlob(error: any): Promise<never> {
  const blob = error?.response?.data;
  if (blob instanceof Blob) {
    try {
      const json = JSON.parse(await blob.text());
      if (json?.error) error.response.data = json;
    } catch {
      /* no era JSON: queda el error original */
    }
  }
  throw error;
}
