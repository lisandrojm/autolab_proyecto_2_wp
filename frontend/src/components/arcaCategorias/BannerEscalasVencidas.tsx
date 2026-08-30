import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClockRotateLeft, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { InfoModal } from '../ui/InfoModal';
import { formatearFechaCalendario } from '../../utils/fechas';
import { arcaCategoriasAPI, EscalasVencidas } from '../../api/arcaCategorias';

/**
 * El cuarto de la familia: convenios cuya escala declara una vigencia que ya pasó.
 *
 *   1. Categoría sin convenio ni código           → banner de huérfanas
 *   2. Función FRAME sin categoría válida         → BannerFuncionesRotas
 *   3. Contrato apuntando a categoría inexistente → BannerContratosHuerfanos
 *   4. Escala vencida                             → este
 *
 * ES EL ÚNICO QUE NO VA EN ROJO, y la diferencia es de fondo: los otros tres señalan cosas rotas —un
 * alta que no se puede generar—, y este señala una que funciona y está desactualizada. Una escala
 * vencida sigue siendo la última paritaria pactada: el alta sale, con el último importe conocido.
 *
 * Por eso va en ámbar y no bloquea nada. Si gritara como los otros tres, en dos semanas —que es lo
 * que tarda una paritaria en vencerse— la pantalla tendría un cartel rojo permanente, y el día que
 * apareciera uno de los que sí importan nadie lo iba a mirar.
 *
 * Lo que evita es concreto: que alguien genere un TXT creyendo que el importe está al día.
 */
export const BannerEscalasVencidas: React.FC = () => {
  const [datos, setDatos] = useState<EscalasVencidas | null>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    arcaCategoriasAPI
      .escalasVencidas()
      .then(setDatos)
      // Si falla, silencio: un aviso sobre la vigencia de los sueldos, disparado por un error de red,
      // diría algo falso sobre los datos.
      .catch(() => setDatos(null));
  }, []);

  if (!datos || datos.total === 0) return null;

  const convenios = datos.porConvenio;
  /** Las vigencias son fechas de CALENDARIO: no se convierten de huso. Ver `utils/fechas.ts`. */
  const fmt = formatearFechaCalendario;

  return (
    <>
      <div className="flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
        <FontAwesomeIcon icon={faClockRotateLeft} className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs text-amber-800 dark:text-amber-300 min-w-0 truncate mr-0.5">
          {convenios.length === 1 ? (
            <>
              La escala de <strong>{convenios[0].convenio}</strong> venció el {fmt(convenios[0].vigenciaHasta)}
            </>
          ) : (
            <>
              Hay <strong>{convenios.length} convenios</strong> con la escala vencida
            </>
          )}
          <span className="hidden sm:inline text-amber-700/80 dark:text-amber-400/80"> — el alta se genera igual, con el último importe pactado</span>
        </span>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          title="Ver desde cuándo y qué convenios"
          aria-label="Ver los convenios con la escala vencida"
          className="shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
        >
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
        </button>
      </div>

      <InfoModal isOpen={abierto} onClose={() => setAbierto(false)} title={convenios.length === 1 ? 'Un convenio con la escala vencida' : `${convenios.length} convenios con la escala vencida`} size="md">
        <div className="space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            La paritaria declaró hasta cuándo regían estos importes y esa fecha ya pasó. <strong>No bloquea nada</strong>: el alta se genera con el último importe pactado, que es lo correcto mientras no
            haya uno nuevo. El aviso existe para que nadie mande un TXT creyendo que el número está al día.
          </p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            {convenios.map((c) => (
              <div key={c.convenio} className="px-3 py-2.5 flex items-baseline justify-between gap-3 flex-wrap text-sm">
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {c.convenio}
                  <span className="font-normal text-gray-500 dark:text-gray-400"> · {c.escalas === 1 ? '1 escala' : `${c.escalas} escalas`}</span>
                </span>
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  venció el {fmt(c.vigenciaHasta)} · hace {c.diasVencida} día{c.diasVencida === 1 ? '' : 's'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Se actualiza con el botón <strong>Paritaria</strong> del convenio: se baja la plantilla, se pisan los importes con los del acuerdo nuevo y se sube. Las columnas{' '}
            <span className="font-mono text-[11px]">vigenciaDesde</span> y <span className="font-mono text-[11px]">vigenciaHasta</span> son las del acuerdo, no las del día de la carga — si quedan
            vacías, este aviso no puede volver a avisar.
          </p>
        </div>
      </InfoModal>
    </>
  );
};
