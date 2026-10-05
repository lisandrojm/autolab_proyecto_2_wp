/**
 * En qué estado está el conocimiento sobre DÓNDE PUBLICA SUS PARITARIAS un convenio.
 *
 * SON DOS COSAS DISTINTAS Y CONVIENE NO VOLVER A MEZCLARLAS
 *
 * Que el 0131/75 se publique en satsaid.com.ar es una propiedad del convenio: es verdad para
 * cualquier empleadora de la plataforma, hoy y dentro de tres años. Que esa página se esté bajando
 * todos los días es otra cosa —una decisión operativa, que cuesta requests y mantenimiento— y vive
 * en `FuenteParitaria.activa`.
 *
 * La primera entrega las confundió: la columna de /convenios decía «No vigilado», como si no tener
 * fuente fuera una falta operativa. Con 2.669 convenios de gremios de todos los rubros, eso se leía
 * como 2.664 pendientes. No lo son: son 2.664 casillas de conocimiento que la plataforma todavía no
 * acumuló, y cada una que alguien completa vale para siempre y para todas las empresas.
 *
 * DE LOS CUATRO VALORES, UNO ES DERIVADO Y TRES SE DECLARAN
 *
 * `con_fuente` NO se guarda en ningún lado. Sale de que exista una `FuenteParitaria` que liste el
 * código. Guardarlo como booleano sería tener dos verdades sobre lo mismo, y la copia se queda vieja
 * apenas alguien desasigna la última fuente — a partir de ahí la pantalla afirmaría que el convenio
 * está cubierto cuando no lo está, que es exactamente el tipo de mentira silenciosa que costó los
 * 163 contratos del `legacyId 43`.
 */
/** Lo que una persona puede elegir. `con_fuente` queda afuera a propósito: se gana asignando. */
export const ESTADOS_DECLARABLES = ["sin_revisar", "sin_fuente_conocida", "no_aplica"];
export const esDeclarable = (v) => ESTADOS_DECLARABLES.includes(String(v));
/**
 * El estado efectivo de un convenio.
 *
 * Los enlaces mandan: si hay una fuente que lo lista, está `con_fuente` sin importar lo que diga el
 * campo declarado. Por eso el endpoint que declara rechaza hacerlo mientras haya una fuente asignada
 * —guardar una contradicción que después se ignora es guardar basura—, pero la derivación se hace
 * igual acá: es la que sobrevive a que alguien escriba en la base por otro camino.
 *
 * Ausente y `"sin_revisar"` son lo mismo: el default de los 2.669 es no tener el campo.
 */
export const estadoFuenteDe = (tieneFuenteAsignada, declarado) => {
    if (tieneFuenteAsignada)
        return "con_fuente";
    return esDeclarable(declarado) ? declarado : "sin_revisar";
};
/**
 * Cómo se llama cada estado en la pantalla.
 *
 * Ninguno es una alarma: no saber dónde publica un gremio que ninguna empresa usa no es un problema
 * que haya que arreglar hoy. El encuadre es «conocimiento acumulado», no «lista de deudas».
 */
export const ETIQUETA_ESTADO_FUENTE = {
    con_fuente: "Con fuente",
    sin_revisar: "Sin revisar",
    sin_fuente_conocida: "Sin fuente conocida",
    no_aplica: "No aplica",
};
