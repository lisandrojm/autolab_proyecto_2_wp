import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { SimpleCatalogItem } from '../../api/simpleCatalog';
import { formatRnos } from '../../utils/rnos';

/**
 * LA tabla de convenios. Una sola, usada por el nomenclador y por la ficha de empresa.
 *
 * Antes eran dos tablas distintas mostrando la misma entidad, y ya habían divergido: una llamaba
 * "Nombre" a lo que la otra llamaba "Actividad", el código iba último en una y primero en la otra, y
 * el signatario solo aparecía en el nomenclador —justo donde menos falta hace—. En la ficha es
 * imprescindible: `0131/75` y `0634/11` comparten la actividad "TELEVISIÓN" y sin el signatario se
 * ven idénticos salvo por el código.
 *
 * Las columnas se llaman como las llama ARCA en su propia pantalla: **Actividad**, no "Nombre".
 *
 * Lo único que legítimamente cambia entre los dos lados son las ACCIONES —en el nomenclador se edita
 * el convenio, en la ficha se lo registra o se le pisa la obra social—, así que van por slot.
 */
export interface ConvenioFila extends SimpleCatalogItem {
  obraSocialDefaultId?: number | null;
  signatario?: string;
}

export interface ConvenioObraSocial {
  /** La obra social que resuelve para esta fila, ya considerando la excepción si la hay. */
  os?: SimpleCatalogItem;
  /** `true` si la que resuelve viene de una excepción de la empleadora y no del CCT. */
  esOverride?: boolean;
  /** `true` si la excepción todavía no se guardó. */
  pendiente?: boolean;
  /** `true` si la obra social no está entre las registradas por la empleadora: ARCA la rechaza. */
  noRegistrada?: boolean;
  /** `true` para 9999/99: no tiene sindicato, la obra social la define la empresa. */
  sinSindicato?: boolean;
}

interface Props {
  convenios: ConvenioFila[];
  /** Cómo se resuelve la obra social de cada fila. Sin esto, la columna muestra la sindical del CCT. */
  obraSocialDe?: (c: ConvenioFila) => ConvenioObraSocial;
  /** Columna extra solo del nomenclador: en cuántas empresas está registrado. */
  renderEmpresas?: (c: ConvenioFila) => React.ReactNode;
  /** Acciones de la fila. Es lo único que cambia entre el nomenclador y la ficha. */
  renderAcciones?: (c: ConvenioFila) => React.ReactNode;
  /** Dónde mandar a cargar la obra social cuando falta (el dato es del CCT, no de la empresa). */
  ayudaSinObraSocial?: string;
}

export const ConveniosTable: React.FC<Props> = ({ convenios, obraSocialDe, renderEmpresas, renderAcciones, ayudaSinObraSocial = 'Asignásela al convenio en Configuración → ARCA → Convenios.' }) => (
  <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-xl">
    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-900/50">
        <tr className="text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
          {/* El código va PRIMERO: es el identificador y con lo que se busca. */}
          <th className="px-4 py-2.5 whitespace-nowrap w-px">Código</th>
          <th className="px-4 py-2.5">Actividad</th>
          <th className="px-4 py-2.5">Signatario</th>
          <th className="px-4 py-2.5">Obra social</th>
          {renderEmpresas && <th className="px-4 py-2.5 whitespace-nowrap w-px">Empresas</th>}
          {renderAcciones && <th className="px-4 py-2.5 text-right whitespace-nowrap w-px">Acciones</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
        {convenios.map((c) => {
          const r = obraSocialDe?.(c) ?? { os: undefined };
          return (
            <tr key={c._id} className={`hover:bg-gray-50 dark:hover:bg-gray-900/20 ${r.noRegistrada ? 'bg-red-50/60 dark:bg-red-950/20' : ''}`}>
              <td className="px-4 py-3 align-top font-mono text-xs font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">{c.externalId || '—'}</td>
              <td className="px-4 py-3 align-top text-sm text-gray-900 dark:text-gray-100 max-w-[18rem]">{c.name}</td>
              <td className="px-4 py-3 align-top text-xs text-gray-500 dark:text-gray-400 max-w-[18rem]">{c.signatario || '—'}</td>
              <td className="px-4 py-3 align-top">
                {r.sinSindicato && !r.os ? (
                  <span className="text-xs text-gray-500 dark:text-gray-400 italic">Sin sindicato → la define la empresa, en Obras Sociales.</span>
                ) : r.os ? (
                  <>
                    <span className={`block text-sm ${r.noRegistrada ? 'text-red-700 dark:text-red-400 font-semibold' : 'text-gray-900 dark:text-gray-100'}`}>
                      <span className="font-mono text-xs opacity-70 mr-1.5">{formatRnos(r.os.externalId)}</span>
                      {r.os.name}
                    </span>
                    {/* De dónde sale: lo normal es "del convenio". La excepción se marca como tal. */}
                    <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] ${r.esOverride ? 'text-amber-700 dark:text-amber-400 font-semibold' : 'text-gray-400'}`}>
                      {r.esOverride && <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />}
                      {r.esOverride ? 'pisada por esta empresa' : 'del convenio'}
                      {r.pendiente && <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-[10px] font-bold uppercase tracking-wide">sin guardar</span>}
                    </span>
                    {r.noRegistrada && <span className="block text-[11px] text-red-700 dark:text-red-400 mt-0.5">No está entre las registradas por esta empleadora: ARCA va a rechazar estas altas.</span>}
                  </>
                ) : (
                  <span className="text-xs text-amber-700 dark:text-amber-400">Sin obra social cargada. {ayudaSinObraSocial}</span>
                )}
              </td>
              {renderEmpresas && <td className="px-4 py-3 align-top text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">{renderEmpresas(c)}</td>}
              {renderAcciones && <td className="px-4 py-3 align-top text-right whitespace-nowrap">{renderAcciones(c)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
