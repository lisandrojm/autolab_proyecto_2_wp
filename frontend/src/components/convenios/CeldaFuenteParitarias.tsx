import React from 'react';
import { EstadoParitarias } from '../../api/paritarias';
import { EstadoFuenteConvenio } from '../../api/paritarias';
import { ConvenioFila } from './ConveniosTable';
import { vigilanciaDe, avisoDeVigilancia, textoUltimaRevision } from '../paritarias/estadoFuente';
import { formatearInstante } from '../../utils/fechas';

/**
 * La celda «Fuente de paritarias»: dónde se publican los acuerdos de un convenio.
 *
 * Vivía adentro de ConveniosPage. Se extrajo para que la ficha de empresa muestre exactamente lo
 * mismo — es el precedente de `ConveniosTable`, que se unificó justo porque eran dos tablas de la
 * misma entidad con encabezados distintos y ya habían divergido.
 *
 * `onAnotar` es opcional y es lo único que cambia entre las dos pantallas: sin él la celda queda de
 * SOLO LECTURA. En la ficha de empresa se usa así a propósito — ahí se registra qué convenios tiene
 * el CUIT, y dónde publica sus acuerdos un gremio es una propiedad del convenio que se administra en
 * Configuración → ARCA → Convenios. Ofrecer «asignar fuente» desde dos lugares distintos invitaría a
 * editar un dato global creyendo que se toca algo de esta empleadora.
 */
interface Props {
  convenio: ConvenioFila;
  /** Por código de convenio, qué fuentes lo alimentan. */
  vigilancia: EstadoParitarias['porConvenio'];
  /** Por `_id` de convenio, lo declarado a mano. */
  declarado: EstadoParitarias['declarado'];
  /** Si se puede anotar desde acá. Sin esto, la celda no ofrece acciones. */
  onAnotar?: (c: ConvenioFila) => void;
}

/**
 * En qué estado está la fuente de este convenio.
 *
 * `con_fuente` se DERIVA de los enlaces, no de un campo: si hay una fuente que lista el código, está
 * cubierto, y si le sacan la última deja de estarlo sin que haya nada que actualizar.
 */
export const estadoFuenteDe = (c: ConvenioFila, vigilancia: EstadoParitarias['porConvenio'], declarado: EstadoParitarias['declarado']): EstadoFuenteConvenio => {
  const asignadas = vigilancia[String(c.externalId || '').trim()] || [];
  if (asignadas.length > 0) return 'con_fuente';
  const d = declarado[c._id]?.estado;
  return d === 'sin_fuente_conocida' || d === 'no_aplica' ? d : 'sin_revisar';
};

export const CeldaFuenteParitarias: React.FC<Props> = ({ convenio, vigilancia, declarado, onAnotar }) => {
  const estado = estadoFuenteDe(convenio, vigilancia, declarado);
  const dec = declarado[convenio._id];

  if (estado === 'con_fuente') {
    const asignadas = vigilancia[String(convenio.externalId || '').trim()] || [];
    const rota = asignadas.some((f) => f.conProblema);
    /*
      Que exista la fuente no quiere decir que se esté bajando: son dos cosas, y callar la segunda
      haría creer que el convenio está cubierto cuando su vigilancia está pausada.

      Se lee con `vigilanciaDe`, EL MISMO lector que usa el ABM. La versión anterior preguntaba
      `!f.activa` acá y algo distinto allá, y con el campo ausente esta pantalla escribía «pausada»
      sobre las tres fuentes que la otra mostraba corriendo.
    */
    const avisos = [...new Set(asignadas.map((f) => avisoDeVigilancia(vigilanciaDe(f))).filter(Boolean))];
    const noSeSabe = asignadas.some((f) => vigilanciaDe(f) === 'desconocida');
    return (
      <span className="text-gray-700 dark:text-gray-200">
        {asignadas.map((f) => f.entidad).join(', ')}
        <span className={`block text-[11px] ${rota ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{textoUltimaRevision(asignadas[0])}</span>
        {avisos.map((a) => (
          // El estado que no se pudo leer va en ROJO y no en ámbar: no es «pausada», es que la
          // consulta vino incompleta. Confundirlos volvería a esconder el problema.
          <span key={a} className={`block text-[11px] ${noSeSabe ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
            {a}
          </span>
        ))}
      </span>
    );
  }

  if (estado === 'no_aplica') {
    // Sin acción, como pide el caso 9999/99: no tiene paritaria y no la va a tener.
    return (
      <span className="text-gray-400 dark:text-gray-600" title={dec?.nota || 'No tiene paritaria y no la va a tener.'}>
        No aplica
        {dec?.revisadaEl && <span className="block text-[11px]">marcado el {formatearInstante(dec.revisadaEl)}</span>}
      </span>
    );
  }

  if (estado === 'sin_fuente_conocida') {
    const titulo = `${dec?.nota || 'Se buscó y no se encontró página que publique sus acuerdos.'}${dec?.revisadaPor ? ` — ${dec.revisadaPor}` : ''}`;
    const contenido = (
      <>
        Sin fuente conocida
        <span className="block text-[11px]">revisado el {formatearInstante(dec?.revisadaEl)}</span>
      </>
    );
    // Sin `onAnotar` es texto, no un botón: un control que no hace nada al apretarlo se lee como roto.
    if (!onAnotar)
      return (
        <span className="text-gray-400 dark:text-gray-600" title={titulo}>
          {contenido}
        </span>
      );
    return (
      <button type="button" onClick={() => onAnotar(convenio)} title={titulo} className="text-left text-gray-400 dark:text-gray-600 hover:text-blue-600 dark:hover:text-blue-400">
        {contenido}
      </button>
    );
  }

  return (
    // Gris y sin ícono de alerta: que nadie haya buscado todavía dónde publica un gremio que ninguna
    // empresa usa no es un error que haya que arreglar hoy.
    <span className="text-gray-400 dark:text-gray-600">
      Sin revisar
      {onAnotar && (
        <button type="button" onClick={() => onAnotar(convenio)} className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">
          asignar fuente
        </button>
      )}
    </span>
  );
};
