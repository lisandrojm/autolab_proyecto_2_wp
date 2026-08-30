import type { FuenteResumen } from '../../api/paritarias';
import { formatearInstante } from '../../utils/fechas';

/**
 * CÓMO SE LEE EL ESTADO DE UNA FUENTE. Una sola vez, para las dos pantallas.
 *
 * EL BUG QUE ESTO EXISTE PARA IMPEDIR
 *
 * `/arca/fuentes-paritaria` decía «vigilando» y `/convenios` decía «vigilancia pausada» sobre las
 * mismas tres fuentes, el mismo día. No fallaba en un caso raro: fallaba en todas las filas, que es
 * lo que descarta el dato y señala al código. Eran dos lecturas paralelas del mismo campo, y una de
 * las dos lo recibía `undefined` y lo evaluaba como `false`.
 *
 * UN CARTEL DE ESTADO QUE MIENTE ES PEOR QUE NO TENERLO
 *
 * Ese error mentía hacia el lado alarmista —decía «pausada» sobre algo que corría— y el costo no es
 * el susto: es que cuando una fuente se pause DE VERDAD nadie lo va a registrar, porque ese texto ya
 * está siempre. El error simétrico es peor todavía: decir «vigilando» sobre una fuente apagada deja
 * pasar una paritaria sin que nadie se entere.
 *
 * Por eso ausente NO es `false`. Si `activa` no llegó, no sabemos si está vigilando, y eso se dice.
 */

export type Vigilancia = 'activa' | 'pausada' | 'desconocida';

/** Para no llenar la consola: un aviso por fuente, no uno por render. */
const yaAvisado = new Set<string>();

/**
 * Si la rutina diaria toca esta fuente.
 *
 * `desconocida` significa que el server no mandó el campo — un backend desactualizado, o una
 * proyección que se lo comió. Es un error de consulta y se reporta como tal: asumir `false` sería
 * inventar un estado, que es exactamente cómo empezó este bug.
 */
export const vigilanciaDe = (f: Pick<FuenteResumen, '_id' | 'nombre' | 'activa'>): Vigilancia => {
  if (f.activa === true) return 'activa';
  if (f.activa === false) return 'pausada';
  if (!yaAvisado.has(f._id)) {
    yaAvisado.add(f._id);
    console.error(`[PARITARIAS] La fuente «${f.nombre}» (${f._id}) llegó sin el campo «activa». No se puede saber si está vigilando: la respuesta del server está incompleta o desactualizada. NO se asume que está pausada.`);
  }
  return 'desconocida';
};

/** Qué decir cuando no está activa. `null` cuando sí lo está: no hay nada que aclarar. */
export const avisoDeVigilancia = (v: Vigilancia): string | null => {
  if (v === 'pausada') return 'vigilancia pausada';
  if (v === 'desconocida') return 'no se pudo leer si está vigilando';
  return null;
};

/**
 * La última revisión, en una línea, con FECHA Y HORA.
 *
 * La hora no es un adorno: con revisión diaria, «30/8» no responde si corrió hoy temprano o quedó de
 * ayer. `ultimaRevision` es un instante, así que se convierte a hora local — al revés de las
 * vigencias, que son fechas de calendario y no se convierten (ver `utils/fechas.ts`).
 */
export const textoUltimaRevision = (f: Pick<FuenteResumen, 'ultimaRevision' | 'conProblema'>): string => {
  if (!f.ultimaRevision) return 'sin revisar todavía';
  if (f.conProblema) return `la última revisión falló · ${formatearInstante(f.ultimaRevision)}`;
  return `revisado el ${formatearInstante(f.ultimaRevision)}`;
};
