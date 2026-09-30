import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuilding, faStar, faXmark, faSpinner, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { EmpresaContextLayout, SeccionEmpleador } from '../../components/empresa/EmpresaContextLayout';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { SeleccionMultiple } from '../../components/ui/SeleccionMultiple';
import { useGuardarEmpresa } from '../../components/empresa/useGuardarEmpresa';
import { infoAPI, InfoItem } from '../../api/info';
import { Company } from '../../api/companies';
import { ordenarSedes } from '../../utils/sedesProyecto';

/**
 * LAS SEDES DE ESTA EMPRESA, y cuál es la favorita (★ «Por defecto»).
 *
 * La favorita es la que aparece preseleccionada en el campo Sede de un proyecto al elegir esta
 * empresa como Empresa del Contrato, y queda primera —la principal, la que precarga el alta de
 * contratos— por encima del orden general de Sedes. El resto de las sedes elegidas en el proyecto
 * sigue ese orden general (Configuración → Sedes → Ordenar).
 */
export const EmpresaSedesPage: React.FC = () => (
  <EmpresaContextLayout titulo="Sedes" icono={faBuilding}>
    {(empresa, recargar) => <SedesBody empresa={empresa} recargar={recargar} />}
  </EmpresaContextLayout>
);

const SedesBody: React.FC<{ empresa: Company; recargar: () => Promise<void> }> = ({ empresa, recargar }) => {
  const { guardar, guardando } = useGuardarEmpresa(empresa, recargar);
  const [catalogo, setCatalogo] = useState<InfoItem[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ids, setIds] = useState<number[]>((empresa.sedeIds || []).map(Number));
  const [favorita, setFavorita] = useState<number | null>(empresa.sedeFavoritaId ?? null);

  useEffect(() => {
    // Ya viene en el orden general de Sedes.
    infoAPI
      .listSedes()
      .then(setCatalogo)
      .catch(() => setCatalogo([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    setIds((empresa.sedeIds || []).map(Number));
    setFavorita(empresa.sedeFavoritaId ?? null);
  }, [empresa]);

  const porId = useMemo(() => new Map(catalogo.map((s) => [Number(s.data?.id), s])), [catalogo]);
  /** Siempre en el orden general, no en el que se fueron agregando. */
  const elegidas = useMemo(() => ordenarSedes(ids, catalogo), [ids, catalogo]);
  const nombre = (id: number) => porId.get(id)?.name || porId.get(id)?.data?.nombre || `Sede ${id}`;

  const cambiar = (nuevos: number[]) => {
    setIds(nuevos);
    // La favorita tiene que ser una de sus sedes: si se la saca, deja de ser favorita.
    if (favorita != null && !nuevos.includes(favorita)) setFavorita(null);
  };

  const guardadas = ordenarSedes((empresa.sedeIds || []).map(Number), catalogo);
  const sucio = elegidas.join(',') !== guardadas.join(',') || favorita !== (empresa.sedeFavoritaId ?? null);

  if (cargando) return <LoadingSpinner message="Cargando sedes..." />;

  return (
    <SeccionEmpleador>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <SeleccionMultiple
            label={<span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sedes de la empresa</span>}
            titulo="Sedes de la empresa"
            placeholder="Elegí las sedes con las que trabaja esta empresa…"
            placeholderBusqueda="Buscar sede..."
            vacio="No hay sedes cargadas. Se crean en Configuración → Sedes."
            opciones={catalogo.filter((s) => s.data?.id != null).map((s) => ({ id: String(s.data.id), nombre: s.name || s.data?.nombre || `Sede ${s.data.id}` }))}
            valor={elegidas.map(String)}
            onChange={(v) => cambiar(v.map(Number))}
          />
        </div>
        <button
          onClick={() => guardar({ sedeIds: elegidas, sedeFavoritaId: favorita }, `Sedes guardadas para ${empresa.razonSocial}.`)}
          disabled={guardando || !sucio}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {guardando && <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4" />}
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">Orden</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sede</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">
                <span className="inline-flex items-center gap-1.5">
                  Por defecto
                  <FontAwesomeIcon icon={faCircleInfo} title="Se preselecciona en el proyecto al elegir esta empresa como Empresa del Contrato, y queda como sede principal." className="h-3 w-3 text-gray-400 normal-case" />
                </span>
              </th>
              <th className="px-4 py-3 w-px" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {elegidas.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  Todavía no hay sedes para esta empresa. Agregalas arriba.
                </td>
              </tr>
            ) : (
              elegidas.map((id) => {
                const esFavorita = favorita === id;
                return (
                  <tr key={id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                    {/* El orden general (Configuración → Sedes), no una posición propia de la empresa. */}
                    <td className="px-4 py-2.5 text-sm font-mono text-gray-500 dark:text-gray-400">{porId.get(id)?.data?.orden ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        <FontAwesomeIcon icon={faBuilding} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        {nombre(id)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => setFavorita(esFavorita ? null : id)}
                        aria-pressed={esFavorita}
                        title={esFavorita ? 'Es la sede por defecto. Click para quitarla.' : `Usar ${nombre(id)} por defecto para esta empresa`}
                        className={`transition-colors ${esFavorita ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 dark:text-gray-600 hover:text-amber-500'}`}
                      >
                        <FontAwesomeIcon icon={faStar} className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => cambiar(ids.filter((x) => x !== id))} title={`Quitar ${nombre(id)} de esta empresa`} aria-label={`Quitar ${nombre(id)}`} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                        <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        En un proyecto, las sedes elegidas quedan en el orden general de Sedes, salvo la ★ de la Empresa del Contrato, que va primera y es la principal. Si el proyecto todavía no tiene sede, al elegir esta empresa se preselecciona la ★.
      </p>
    </SeccionEmpleador>
  );
};
