import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListCheck } from '@fortawesome/free-solid-svg-icons';
import { SimpleCatalogItem } from '../../api/simpleCatalog';
import { Modal } from '../ui/Modal';
import { ConvenioSelector } from '../empresas/ConvenioSelector';
import { sweetAlert } from '../../utils/sweetAlert';
import { paritariasAPI, EstadoParitarias } from '../../api/paritarias';

/**
 * CUÁNTO SABEMOS SOBRE DÓNDE PUBLICAN SUS PARITARIAS LOS CONVENIOS.
 *
 * SON DOS NÚMEROS DISTINTOS Y EL SEGUNDO ES EL QUE IMPORTA
 *
 * El del catálogo (X de 2.669) es cobertura preventiva: se mide en porcentaje y no se termina nunca.
 * La curva de signatarios lo dice sin ambigüedad — 52 entidades cubren el 25 % del catálogo, pero
 * **1.403 entidades tienen un solo convenio cada una**, o sea el 52,6 % restante en la cola larga. A
 * diez minutos por entidad, cubrir el catálogo entero es medio año de trabajo a tiempo completo. No
 * es una meta: es un fondo contra el cual medirse.
 *
 * El de los convenios EN USO sí se termina, y es chico: hoy son los que alguna empresa registró.
 * Ese es el objetivo real —cero en «nadie miró» entre los que alguien usa— y por eso va destacado y
 * con los convenios nombrados, no contados. Un número manda a buscar cuáles son; una lista se puede
 * empezar a resolver.
 *
 * NINGUNO DE LOS DOS ES UNA LISTA DE DEUDAS. Un convenio que ninguna empresa registra no necesita
 * fuente todavía: la necesita el día que se registra, y ese día el trabajo es de una sola entidad.
 */

interface Props {
  /** El catálogo completo. Llega del manager, que ya lo tiene: no se vuelve a pedir. */
  todos: SimpleCatalogItem[];
  vigilancia: EstadoParitarias['porConvenio'];
  declarado: EstadoParitarias['declarado'];
  /**
   * Los convenios en uso que nadie revisó. Viene del SERVER y no se recalcula acá: es el mismo dato
   * que alimenta el aviso de la ficha de empresa, y dos cálculos paralelos del mismo hecho ya nos
   * hicieron decir dos cosas distintas de la misma fuente.
   */
  enUsoSinRevisar: EstadoParitarias['enUsoSinRevisar'];
  onCambiado: () => Promise<void> | void;
}

export const PanelCoberturaFuentes: React.FC<Props> = ({ todos, vigilancia, declarado, enUsoSinRevisar, onCambiado }) => {
  const [abierto, setAbierto] = useState(false);
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cuenta = useMemo(() => {
    let conFuente = 0;
    let revisados = 0;
    let noAplica = 0;
    for (const c of todos) {
      if ((vigilancia[String(c.externalId || '').trim()] || []).length > 0) conFuente++;
      else if (declarado[c._id]?.estado === 'sin_fuente_conocida') revisados++;
      else if (declarado[c._id]?.estado === 'no_aplica') noAplica++;
    }
    return { conFuente, revisados, noAplica, sabido: conFuente + revisados + noAplica };
  }, [todos, vigilancia, declarado]);

  const marcar = async () => {
    if (elegidos.length === 0) return;
    setGuardando(true);
    try {
      const r = await paritariasAPI.declararEstadoFuenteMasivo(elegidos, 'sin_fuente_conocida', nota.trim());
      // Los salteados se nombran, no se cuentan: son los que tienen una fuente que los vigila, y
      // quien marcó sesenta necesita saber CUÁLES quedaron afuera para no darlos por hechos.
      const detalle = r.salteados.length > 0 ? `${r.marcados} marcado(s). No se tocaron ${r.salteados.length}: ${r.salteados.join('; ')}` : `${r.marcados} convenio(s) marcados como revisados sin fuente.`;
      sweetAlert.success('Listo', detalle);
      setElegidos([]);
      setNota('');
      setAbierto(false);
      await onCambiado();
    } catch (e: any) {
      sweetAlert.error('No se pudo guardar', e?.response?.data?.error || 'Revisá la selección.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="text-xs text-gray-600 dark:text-gray-300">
            Sabemos dónde se publican las paritarias de <strong className="text-gray-900 dark:text-gray-100">{cuenta.sabido}</strong> de {todos.length} convenios
            <span className="text-gray-500 dark:text-gray-400">
              {' '}
              ({cuenta.conFuente} con fuente{cuenta.revisados > 0 && `, ${cuenta.revisados} revisado(s) sin fuente`}
              {cuenta.noAplica > 0 && `, ${cuenta.noAplica} sin paritaria`})
            </span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Dónde publica sus acuerdos un gremio es dato de la plataforma: sirve igual aunque hoy ninguna empresa use ese convenio. Anotar que se buscó y no hay nada también cuenta.
            </span>
          </div>
          {/*
            Marcar de a muchos, porque así llega el trabajo: por ENTIDAD, no por convenio. Un gremio
            que no publica cubre todos los suyos de una — la Federación de la Alimentación firma once—.
            Si hay que marcarlos de a uno, no se marca ninguno.
          */}
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800"
          >
            <FontAwesomeIcon icon={faListCheck} className="h-3 w-3" />
            Marcar varios como revisados
          </button>
        </div>

        {/*
          LO QUE SÍ HAY QUE TERMINAR. Va abajo y destacado: es la única parte de todo esto que tiene
          final, y es trabajo que alguien pidió sin saberlo al registrar una empresa con ese convenio.
        */}
        {enUsoSinRevisar.length > 0 && (
          <p className="text-xs text-amber-800 dark:text-amber-300 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1.5">
            <strong>
              {enUsoSinRevisar.length} convenio(s) que alguna empresa usa siguen sin revisar
            </strong>
            : {enUsoSinRevisar.slice(0, 6).map((c) => c.externalId || c.name).join(', ')}
            {enUsoSinRevisar.length > 6 && ` y ${enUsoSinRevisar.length - 6} más`}.
          </p>
        )}
      </div>

      <Modal
        isOpen={abierto}
        onClose={() => !guardando && setAbierto(false)}
        title="Marcar como revisados sin fuente"
        subtitle="Para los gremios que no publican sus escalas en una página estable"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setAbierto(false)} className="btn-secondary" disabled={guardando}>
              Cancelar
            </button>
            <button onClick={marcar} className="btn-primary" disabled={guardando || elegidos.length === 0}>
              {guardando ? 'Guardando...' : `Marcar ${elegidos.length || ''}`.trim()}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            <strong>No es un fracaso</strong>: muchos gremios publican en noticias sueltas, en redes o en un PDF que cambia de URL. Dejar anotado que <em>ya se buscó</em> es lo que evita que la
            próxima persona repita la búsqueda entera.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Convenios</label>
            <ConvenioSelector convenios={todos} value={elegidos} onChange={setElegidos} textoVacio="Buscá los convenios de la entidad que revisaste y tildalos." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Dónde se buscó</label>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: el sitio del gremio no tiene sección de acuerdos; solo publican en Facebook"
              className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            />
            <p className="text-[11px] text-gray-500 mt-1">Se guarda en todos los seleccionados, junto con quién y cuándo.</p>
          </div>
          {/* Se avisa ANTES, no después: quien tildó sesenta tiene que saber que los que ya tienen
              fuente no se van a tocar, en vez de descubrirlo en el resumen del final. */}
          <p className="text-[11px] text-gray-500 dark:text-gray-400">Los que ya tengan una fuente que los vigila se saltean: se informan al final, por nombre.</p>
        </div>
      </Modal>
    </>
  );
};
