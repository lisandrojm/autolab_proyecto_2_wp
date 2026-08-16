import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faUser, faChevronLeft, faChevronRight, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { EmpresaContextLayout } from '../../components/empresa/EmpresaContextLayout';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { SearchAndFilters } from '../../components/ui/SearchAndFilters';
import { EstadoBadge } from '../../components/EstadoSelect';
import { isContractVigente, formatDate } from '../../components/team/EmployeeContractsModal';
import { cuitDisplay } from '../../components/contratos/ConstanciaBulk';
import { usersAPI, ContractOverviewRow } from '../../api/users';
import { Company } from '../../api/companies';

const PAGE_SIZE = 25;

/**
 * Los contratos de ESTA empleadora: los que la eligieron como Empresa del Contrato.
 *
 * El corte es por la empleadora FIJADA en el contrato, no por las candidatas que ofrece el proyecto:
 * para ARCA la empleadora de un alta es la que efectivamente se eligió. Un contrato que todavía no
 * la fijó no es de nadie y no aparece acá — aparece en la grilla global, que es donde se asigna.
 */
export const EmpresaContratosPage: React.FC = () => (
  <EmpresaContextLayout titulo="Contratos" icono={faFileContract}>
    {(empresa) => <ContratosBody empresa={empresa} />}
  </EmpresaContextLayout>
);

const ContratosBody: React.FC<{ empresa: Company }> = ({ empresa }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ContractOverviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [vigencia, setVigencia] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(
    async (p: number) => {
      try {
        setCargando(true);
        const resp = await usersAPI.listContractsOverview({ page: p, limit: PAGE_SIZE, empresaContratoId: empresa._id, search: search || undefined, vigencia: vigencia || undefined });
        setRows(resp.rows);
        setTotal(resp.total);
        setTotalPages(resp.totalPages);
      } finally {
        setCargando(false);
      }
    },
    [empresa._id, search, vigencia],
  );

  // Cualquier cambio de filtro vuelve a la página 1 (debounced, como la grilla global).
  useEffect(() => {
    const h = setTimeout(() => {
      setPage(1);
      cargar(1);
    }, 300);
    return () => clearTimeout(h);
  }, [cargar]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 flex items-start gap-2">
        <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-800 dark:text-blue-300">
          Los contratos que eligieron a <strong>{empresa.razonSocial}</strong> como Empresa del Contrato. Los que todavía no tienen empleadora fijada no aparecen acá: se les asigna desde Contratos → Gestión de Contratos.
        </p>
      </div>

      <SearchAndFilters
        searchTerm={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por persona, proyecto o contrato..."
        radioFilters={[
          {
            label: 'Contratos',
            value: vigencia,
            onChange: setVigencia,
            options: [
              { label: 'Vigentes', value: 'vigente' },
              { label: 'No Vigentes', value: 'novigente' },
              { label: 'Todos', value: '' },
            ],
          },
        ]}
      />

      {cargando ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando contratos..." />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={faFileContract} title="Sin contratos" description={search || vigencia ? 'Ningún contrato de esta empleadora coincide con los filtros.' : `Todavía ningún contrato eligió a ${empresa.razonSocial} como empleadora.`} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Persona</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap w-px">CUIT</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proyecto</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Alta / Baja</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {rows.map((r) => {
                  const vigente = isContractVigente(r.fecha_alta_contrato, r.fecha_baja_contrato);
                  return (
                    <tr key={`${r._id}-${r.contractIndex}`} onClick={() => navigate(`/projects/${r.projectId}/team`)} title="Ir al equipo del proyecto" className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FontAwesomeIcon icon={faUser} className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{r.userName}</p>
                            <p className="text-xs text-gray-500 truncate">{r.userEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-mono whitespace-nowrap w-px">{cuitDisplay(r.cuit, r.sinCuit)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{r.projectName}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 hidden lg:table-cell">{r.nombre_contrato || '—'}</td>
                      <td className="px-4 py-3">{r.nombre_estado_empleado ? <EstadoBadge name={r.nombre_estado_empleado} className="text-[10px] whitespace-nowrap" /> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${vigente ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>{vigente ? 'VIGENTE' : 'NO VIGENTE'}</span>
                        <div className="mt-1">
                          {formatDate(r.fecha_alta_contrato)} — {r.fecha_baja_contrato ? formatDate(r.fecha_baja_contrato) : '—'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-bold text-gray-700 dark:text-gray-300">{total}</span> contrato(s) de {empresa.razonSocial}
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const p = Math.max(1, page - 1);
                    setPage(p);
                    cargar(p);
                  }}
                  disabled={page === 1}
                  className="p-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300"
                >
                  <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => {
                    const p = Math.min(totalPages, page + 1);
                    setPage(p);
                    cargar(p);
                  }}
                  disabled={page === totalPages}
                  className="p-1.5 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 dark:text-gray-300"
                >
                  <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
