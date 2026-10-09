/**
 * ¿EL TRÁMITE DEJA AL CONTRATO SIN CONVENIO NI CATEGORÍA? Es la regla única que deciden la solicitud de
 * la app, el alta del escritorio, el detalle de la solicitud, la aprobación masiva y las plantillas de
 * equipo: si esconden convenio y categoría, si los importes se cargan a mano y si se rotulan bruto/neto.
 *
 * DESDE EL 09/10/2026, NINGUNO. Un Pedido de servicios (constancia de CUIT) lleva convenio, categoría y
 * los mismos importes que un Pedido de ARCA: la escala de la categoría —básico, adicional, presentismo—,
 * el importe por jornada bruto y el neto. Antes un servicio no tenía categoría y el importe se cargaba
 * a mano, sin bruto ni neto.
 *
 * Se deja como función y no se borró el camino de «sin categoría» porque el criterio ya cambió dos
 * veces: volver a separar los servicios es cambiar `SERVICIOS_SIN_ESCALA` acá, en un solo lugar.
 */
export const SERVICIOS_SIN_ESCALA = false;
export const tramiteSinConvenioNiCategoria = (tramite) => SERVICIOS_SIN_ESCALA && tramite === "constancia_cuit";
