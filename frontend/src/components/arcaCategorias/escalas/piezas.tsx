import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faCircleQuestion, faFileContract, faCalculator, faPenToSquare, faFileExcel, faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';

import { DiferenciaEscala, OrigenDeDato } from '../../../api/escalasConvenio';

/**
 * Las piezas chicas que comparten las cuatro sub-pestañas de escalas.
 *
 * Están juntas porque son lo que da coherencia al conjunto: el mismo chip ámbar de «a confirmar», el mismo chip
 * de «no cierra con el acta» y el mismo formato de plata en todas las tablas. Repetidas por componente, se
 * desalinean solas y el usuario ve tres maneras distintas de decir lo mismo.
 */

/** Plata como en el resto del módulo ARCA. `—` cuando no hay dato, que no es lo mismo que cero. */
export const pesos = (valor: number | null | undefined): string => {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
};

/** Porcentaje con hasta 4 decimales: es lo que deja ver un 23,5025 % donde el acta dice 23,5 %. */
export const porciento = (valor: number | null | undefined): string => {
  if (valor === null || valor === undefined) return '—';
  return `${Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 4 })} %`;
};

const ETIQUETA_ORIGEN: Record<OrigenDeDato, { texto: string; clase: string; ayuda: string }> = {
  acta: { texto: 'Acta', clase: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', ayuda: 'El importe sale del acuerdo paritario.' },
  excel: { texto: 'Excel', clase: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', ayuda: 'Cargado por importación de planilla.' },
  manual: { texto: 'Manual', clase: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200', ayuda: 'Lo cargó o lo corrigió una persona desde la pantalla.' },
  'estado-actual': { texto: 'Estado previo', clase: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200', ayuda: 'Es la foto de la escala que ya estaba cargada cuando se versionó el convenio.' },
  derivado: { texto: 'Derivado', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', ayuda: 'Calculado con un porcentaje. Nadie lo cotejó todavía contra el acta.' },
};

/** De dónde salió un importe. Es la diferencia entre «esto lo dice el acta» y «esto lo calculó alguien». */
export const ChipOrigen: React.FC<{ origen: OrigenDeDato }> = ({ origen }) => {
  const e = ETIQUETA_ORIGEN[origen] ?? ETIQUETA_ORIGEN.manual;
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${e.clase}`} title={e.ayuda}>
      {e.texto}
    </span>
  );
};

/**
 * «A confirmar»: el acta publica el importe pero no dice cómo se calcula ni si es remunerativo.
 *
 * Va en ámbar y no en rojo a propósito: no está roto, está incompleto. Rojo sería mentir sobre la urgencia y
 * terminaría ignorándose como se ignora cualquier alarma que suena siempre.
 */
export const ChipAConfirmar: React.FC<{ texto?: string; ayuda?: string }> = ({ texto = 'A confirmar', ayuda }) => (
  <span
    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    title={ayuda || 'El acta no lo dice. Hay que confirmarlo antes de usarlo para liquidar.'}
  >
    <FontAwesomeIcon icon={faCircleQuestion} className="h-3 w-3" />
    {texto}
  </span>
);

/** El acta no cierra con su propia cuenta. Se muestra el desvío, nunca se corrige el importe. */
export const ChipDiferencia: React.FC<{ diferencias?: DiferenciaEscala[] }> = ({ diferencias }) => {
  if (!diferencias?.length) return null;
  const detalle = diferencias.map((d) => `${d.campo}: acta ${d.acta}, cuenta ${d.calculado} (${d.delta > 0 ? '+' : ''}${d.delta})`).join(' · ');
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
      title={`El importe que rige es el del acta. La cuenta da otro número:\n${detalle}`}
    >
      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
      No cierra
    </span>
  );
};

/** Cómo se lee el carácter remunerativo, con `null` como un valor propio. */
export const textoRemunerativo = (remunerativo: boolean | null): string => (remunerativo === true ? 'Sí' : remunerativo === false ? 'No' : 'A confirmar');

export const TEXTO_TIPO_CALCULO: Record<string, string> = {
  monto_fijo: 'Monto fijo',
  mensual: 'Mensual',
  por_anio_antiguedad: 'Por año de antigüedad',
  por_evento: 'Por evento',
  porcentaje: 'Porcentaje',
  a_confirmar: 'A confirmar',
};

/**
 * El selector de «ver a la fecha», que gobierna las cuatro sub-pestañas.
 *
 * Es un `<input type="date">` y no un selector de período con opciones: el período no es una lista cerrada —se
 * consulta cualquier día— y un combo de tramos escondería justamente el caso que interesa, el de una fecha en la
 * que NO hay escala cargada.
 */
export const SelectorFecha: React.FC<{ valor: string; onCambiar: (fecha: string) => void; etiqueta?: string }> = ({ valor, onCambiar, etiqueta = 'Ver escala al' }) => (
  <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
    <FontAwesomeIcon icon={faClockRotateLeft} className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
    <span className="font-semibold">{etiqueta}</span>
    <input
      type="date"
      value={valor}
      onChange={(e) => onCambiar(e.target.value)}
      className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500"
    />
  </label>
);

/** Botón de acción de tabla, con el mismo tamaño en todas las sub-pestañas. */
export const BotonIcono: React.FC<{ icono: typeof faPenToSquare; titulo: string; onClick: () => void; color?: string; disabled?: boolean }> = ({ icono, titulo, onClick, color = 'text-blue-600 dark:text-blue-400', disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} title={titulo} className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 ${color}`}>
    <FontAwesomeIcon icon={icono} className="h-4 w-4" />
  </button>
);

/** Encabezado de tabla con la receta del módulo: mayúsculas chicas, tracking ancho. */
export const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <th className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 ${className}`}>{children}</th>
);

export const ICONOS = { acta: faFileContract, calcular: faCalculator, editar: faPenToSquare, excel: faFileExcel };
