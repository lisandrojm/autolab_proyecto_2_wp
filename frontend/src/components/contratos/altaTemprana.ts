import { InfoItem } from '../../api/info';

/**
 * ¿ESTE CONTRATO GENERA ALTA TEMPRANA ANTE ARCA? Una sola expresión, un solo lugar.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Había dos fuentes de verdad para el mismo hecho: un switch «Este tipo de contrato genera alta
 * temprana ante ARCA» y el ESTADO IMPOSITIVO elegido, cuya definición ya dice si el trámite es alta
 * temprana o constancia de CUIT. Podían contradecirse, y las dos contradicciones costaban:
 *
 *   switch ON  + estado de Constancia de CUIT  → códigos cargados que nunca van al TXT
 *   switch OFF + estado de Alta temprana       → un alta que sale sin códigos
 *
 * El estado impositivo gana: es el que ya decide el resto del circuito (qué bandeja muestra el
 * contrato, qué carpeta de Dropbox lo hace avanzar). El switch se eliminó y el booleano pasa a
 * derivarse acá.
 *
 * LA CLAVE ES `alta_temprana_afip`, NO `alta_temprana_arca`
 *
 * El organismo se llama ARCA y así se muestra en pantalla, pero la clave guardada en los estados
 * sigue siendo la vieja. Renombrarla es una migración de datos aparte —hay estados en producción
 * guardados con ese valor— y hacerla de paso, dentro de un cambio de UI, es como se rompe un flujo
 * sin que nadie lo note hasta el próximo alta.
 */

/** El trámite impositivo que exige alta temprana. Ver el comentario de arriba sobre el nombre. */
export const TRAMITE_ALTA_TEMPRANA = 'alta_temprana_afip';

type EstadoConTramite = Pick<InfoItem, 'name'> & { data?: { esImpositivo?: boolean; tipoImpositivo?: string } };

/**
 * `true` si el estado es impositivo Y su trámite es alta temprana.
 *
 * Se exige `esImpositivo` además del trámite: un estado que dejó de ser impositivo puede conservar
 * el `tipoImpositivo` viejo en la base, y mirar solo el trámite lo daría por vigente.
 */
export const estadoGeneraAltaTemprana = (estado: EstadoConTramite | null | undefined): boolean => !!estado?.data?.esImpositivo && estado.data.tipoImpositivo === TRAMITE_ALTA_TEMPRANA;

/**
 * El estado impositivo elegido entre un conjunto de ids. Hay uno solo por diseño.
 *
 * Devuelve `null` cuando no se eligió ninguno, que NO es lo mismo que haber elegido uno que no es de
 * alta temprana: en el primer caso todavía no se decidió nada.
 */
export const estadoImpositivoElegido = (estados: InfoItem[], idsElegidos: string[]): InfoItem | null =>
  estados.find((e) => e.data?.esImpositivo && idsElegidos.includes(e._id)) || null;

/** El booleano derivado, para un conjunto de estados elegidos. Es lo que reemplaza al switch. */
export const generaAltaTempranaARCA = (estados: InfoItem[], idsElegidos: string[]): boolean => estadoGeneraAltaTemprana(estadoImpositivoElegido(estados, idsElegidos));
