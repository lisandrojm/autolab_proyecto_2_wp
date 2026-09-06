/**
 * La clave con la que se compara un estado contra otro, del lado del server.
 *
 * Es el espejo de `frontend/src/utils/estadoClave.ts`. Vivía copiada adentro de `routes/users.ts`
 * como `estadoCanonico`, y una segunda copia acá habría sido la tercera: los alias tienen que ser
 * los mismos en los dos lados o un contrato guardado como «Falta pedido de AFIP» se encuentra
 * desde una pantalla y no desde la otra.
 *
 * NO se toca la lista de alias sin mirar también el archivo del front.
 */

export const normalizarEstado = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/**
 * Alias históricos: el mismo estado se guardó con más de un nombre en los contratos.
 *
 * Sin esto, un contrato con «Falta pedido de AFIP» no encontraría al estado «Pedido de ARCA» del
 * ABM y se lo trataría como un estado distinto.
 */
const ESTADO_ALIAS: Record<string, string> = { "falta pedido de afip": "pedido de afip", "pedido servicios": "pedido de servicios" };

export const claveEstado = (name: string): string => {
  const n = normalizarEstado(name);
  return ESTADO_ALIAS[n] || n;
};
