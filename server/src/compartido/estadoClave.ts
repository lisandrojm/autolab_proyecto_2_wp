/**
 * La clave con la que se compara un estado contra otro. SIN dependencias de React.
 *
 * Vivía adentro de `components/EstadoSelect.tsx`, y eso la volvía inimportable desde código que no
 * es de pantalla: traerla arrastraba el componente, sus stores y `axiosConfig`, que en un test bajo
 * `tsx --test` explota al tocar `import.meta.env`. El cálculo del alta temprana la necesita, así que
 * la parte pura vive acá y `EstadoSelect` la reexporta.
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
 * Sin esto, un contrato con "Falta pedido de ARCA" no encontraría al estado "Pedido de ARCA" del ABM
 * y se lo trataría como un estado distinto.
 */
const ESTADO_ALIAS: Record<string, string> = { "falta pedido de afip": "pedido de afip", "pedido servicios": "pedido de servicios" };

export const claveEstado = (name: string): string => {
  const n = normalizarEstado(name);
  return ESTADO_ALIAS[n] || n;
};
