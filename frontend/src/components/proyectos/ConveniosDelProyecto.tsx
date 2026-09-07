import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck } from '@fortawesome/free-solid-svg-icons';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';

/**
 * LOS CONVENIOS BAJO LOS QUE CONTRATA ESTE PROYECTO.
 *
 * CUELGAN DE LA EMPRESA DEL CONTRATO, y por eso el selector no ofrece el nomenclador entero: ARCA
 * solo acepta categorías de los CCT que ESE CUIT registró, así que un convenio de otra empleadora
 * produce un alta rechazada. Sin empresa elegida no hay nada que ofrecer, y decirlo es más útil que
 * mostrar 2.669 opciones que después no van a servir.
 *
 * ACOTAR ES OPCIONAL. Vacío significa «todavía no se acotó», no «ninguno»: el alta ofrece entonces
 * todos los convenios de la empresa. Una productora con seis CCT registrados que en este proyecto
 * contrata bajo uno lo marca acá, y el alta deja de ofrecer los otros cinco.
 */

const conveniosApi = createSimpleCatalogApi('/convenios');

interface Props {
  /** Todas las empresas, para resolver qué convenios registró cada una. */
  companies: Array<{ _id: string; razonSocial: string; convenioIds?: string[] }>;
  /** Las empresas del contrato tildadas arriba. */
  empresasContrato: string[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export const ConveniosDelProyecto: React.FC<Props> = ({ companies, empresasContrato, value, onChange }) => {
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);

  useEffect(() => {
    conveniosApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  /** Los convenios que registraron las empresas del contrato elegidas, sin repetir. */
  const disponibles = useMemo(() => {
    const ids = new Set<string>();
    for (const e of companies) {
      if (!empresasContrato.includes(e._id)) continue;
      for (const id of e.convenioIds || []) ids.add(String(id));
    }
    return catalogo.filter((c) => ids.has(c._id)).sort((a, b) => String(a.externalId || '').localeCompare(String(b.externalId || '')));
  }, [companies, empresasContrato, catalogo]);

  /*
    SACAR UNA EMPRESA SE LLEVA SUS CONVENIOS.

    Sin esto, destildar la empleadora dejaba en el proyecto un convenio que ninguna de las que quedan
    tiene registrado: invisible en la lista —ya no se dibuja— y aplicándose igual en el alta, que
    ARCA rechaza. El error aparecería lejos de esta pantalla y sin rastro de dónde se originó.
  */
  useEffect(() => {
    if (catalogo.length === 0) return;
    const validos = new Set(disponibles.map((c) => c._id));
    const limpio = value.filter((id) => validos.has(id));
    if (limpio.length !== value.length) onChange(limpio);
  }, [disponibles, catalogo.length]);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  if (empresasContrato.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5">
        <p className="text-xs text-gray-500 dark:text-gray-400">Elegí primero la empresa del contrato: los convenios salen de los que esa empleadora tiene registrados ante ARCA.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 max-h-52 overflow-auto divide-y divide-gray-100 dark:divide-gray-700/60">
        {disponibles.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-gray-500">Esa empleadora no tiene convenios registrados. Se registran en Configuración → ARCA → Convenios.</p>
        ) : (
          disponibles.map((c) => {
            const checked = value.includes(c._id);
            return (
              <button type="button" key={c._id} onClick={() => toggle(c._id)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'}`}>{checked && <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5 text-white" />}</span>
                <span className="font-mono text-xs text-blue-700 dark:text-blue-400 shrink-0">{c.externalId}</span>
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{c.name}</span>
              </button>
            );
          })
        )}
      </div>
      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
        {value.length === 0 ? 'Sin acotar: el alta va a ofrecer todos los convenios de la empresa.' : `${value.length} de ${disponibles.length}. El alta va a ofrecer solo ${value.length === 1 ? 'ése' : 'ésos'}.`}
      </p>
    </div>
  );
};
