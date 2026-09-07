import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faSearch, faXmark } from '@fortawesome/free-solid-svg-icons';
import { SeccionEmpleador } from './EmpresaContextLayout';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { HerenciaGlobal } from '../arca/HerenciaGlobal';
import { useGuardarEmpresa } from './useGuardarEmpresa';
import { SimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { Company } from '../../api/companies';

/**
 * EL VALOR POR DEFECTO DE UNA EMPLEADORA, MARCADO SOBRE EL NOMENCLADOR.
 *
 * Reemplaza a la pantalla «Defaults de ARCA», que juntaba tres códigos en un formulario con combos.
 * Ese formulario tenía dos problemas y los dos venían de estar lejos del dato:
 *
 *   · Se elegía sin el contexto del nomenclador —sin ver los códigos, ni los repetidos, ni de qué
 *     grupo era cada uno—. En Tipos de Servicio hay 49 nombres duplicados entre los dos grupos: dos
 *     opciones idénticas en el combo que escriben números distintos en las posiciones 107-109.
 *   · Editaba con un `<select>` campos que en otras pantallas se marcan con ★. Dos gestos para la
 *     misma decisión, y en el caso del grupo llegaron a ser dos editores del MISMO campo, donde el
 *     último en guardar pisaba al otro sin decir nada.
 *
 * Acá se marca sobre la lista real, con el mismo click que ya usan Convenios y Domicilios: se guarda
 * al instante, sin «Guardar cambios». Y arriba se dice qué tiene marcado la instalación, para que
 * pisarla sea una decisión y no un accidente.
 */

interface Props {
  empresa: Company;
  recargar: () => Promise<void>;
  /** La clave de `Company.defaultsArca` que marca esta pantalla. */
  campo: 'tipoServicio' | 'modalidadContratacion' | 'modalidadLiquidacion';
  /** El nomenclador del que se elige. */
  api: SimpleCatalogApi;
  /** Cómo se nombra lo que se marca, para los tooltips ("el tipo de servicio"). */
  queEs: string;
  /** Dónde cae en el archivo de altas. Es el dato que justifica que esto exista. */
  nota: string;
  /**
   * Acota la lista al grupo que la empleadora tiene marcado (solo Tipos de Servicio).
   *
   * El grupo no viaja al TXT: filtra qué tipos se ofrecen, igual que en Simplificación Registral.
   * Sin filtrar son 293 opciones con 49 nombres repetidos.
   */
  filtrarPorGrupoDeLaEmpresa?: boolean;
}

/** El grupo con el que quedó clasificado un tipo en el nomenclador. Vacío = todavía sin clasificar. */
const grupoDelItem = (t: SimpleCatalogItem): string => String((t as { grupo?: unknown }).grupo ?? '');

export const DefaultArcaEmpresa: React.FC<Props> = ({ empresa, recargar, campo, api, queEs, nota, filtrarPorGrupoDeLaEmpresa }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [items, setItems] = useState<SimpleCatalogItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState('');
  const [soloDelGrupo, setSoloDelGrupo] = useState(true);

  useEffect(() => {
    api
      .list()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setCargando(false));
  }, [api]);

  const marcado = String(empresa.defaultsArca?.[campo] || '');
  const grupoEmpresa = String(empresa.defaultsArca?.grupoTipoServicio || '');
  const acotaPorGrupo = !!filtrarPorGrupoDeLaEmpresa && !!grupoEmpresa;

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return items.filter((i) => {
      if (acotaPorGrupo && soloDelGrupo && grupoDelItem(i) !== grupoEmpresa) return false;
      if (!texto) return true;
      return `${i.externalId || ''} ${i.name || ''}`.toLowerCase().includes(texto);
    });
  }, [items, q, acotaPorGrupo, soloDelGrupo, grupoEmpresa]);

  const nombreDe = (codigo: string): string => {
    const i = items.find((x) => String(x.externalId || '') === codigo);
    return i ? `${i.externalId} — ${i.name}` : '';
  };

  /**
   * Marca o desmarca. Volver a clickear el marcado lo SACA: es la única forma de dejar a esta
   * empleadora sin default propio y que vuelva a heredar el de la instalación.
   */
  const marcar = (codigo: string) => {
    const nuevo = marcado === codigo ? '' : codigo;
    guardar(
      { defaultsArca: { [campo]: nuevo } } as Partial<Company>,
      nuevo ? `${nombreDe(nuevo)} es ahora ${queEs} por defecto de ${empresa.razonSocial}.` : `${empresa.razonSocial} vuelve a heredar ${queEs} de la instalación.`,
    );
  };

  if (cargando) return <LoadingSpinner message="Cargando el nomenclador..." />;

  return (
    <SeccionEmpleador>
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{nota}</p>
        <HerenciaGlobal campo={campo} valorEmpresa={marcado} nombreDe={nombreDe} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar por código o nombre...`} className="w-full pl-9 pr-8 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200" />
          {q && (
            <button type="button" onClick={() => setQ('')} title="Limpiar la búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Solo aparece si hay algo que acotar: un filtro que no filtra nada es una pregunta sin
            respuesta útil, y acá además explicaría mal por qué la lista está entera. */}
        {acotaPorGrupo && (
          <button type="button" onClick={() => setSoloDelGrupo((v) => !v)} className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${soloDelGrupo ? 'bg-blue-50 dark:bg-blue-900/25 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            {soloDelGrupo ? `Del grupo ${grupoEmpresa} (${visibles.length})` : `Los ${items.length}`}
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">No hay ninguno que coincida.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[520px] overflow-y-auto">
          {visibles.map((i) => {
            const codigo = String(i.externalId || '');
            const esDefecto = !!codigo && codigo === marcado;
            return (
              <div key={i._id} className="flex items-center gap-3 px-3 py-2">
                <button type="button" onClick={() => marcar(codigo)} disabled={guardando || !codigo} title={esDefecto ? `Es ${queEs} por defecto. Click para quitarlo.` : `Marcar como ${queEs} por defecto de esta empleadora`} className={`shrink-0 transition-colors disabled:opacity-50 ${esDefecto ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-gray-600 hover:text-amber-500'}`}>
                  <FontAwesomeIcon icon={faStar} className="h-3.5 w-3.5" />
                </button>
                <span className="shrink-0 font-mono text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{codigo || '—'}</span>
                <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{i.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </SeccionEmpleador>
  );
};
