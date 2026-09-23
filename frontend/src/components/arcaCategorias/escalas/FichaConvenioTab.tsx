import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleInfo, faUpRightFromSquare, faBuilding, faCheck } from '@fortawesome/free-solid-svg-icons';

import { AcuerdoParitario, escalasConvenioAPI } from '../../../api/escalasConvenio';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../../api/simpleCatalog';
import { companiesAPI, Company } from '../../../api/companies';
import { sweetAlert } from '../../../utils/sweetAlert';

/**
 * FICHA DEL CONVENIO: quién es este CCT y qué empresas están en el régimen alternativo.
 *
 * Los datos del convenio (código, actividad, signatario, sindicato) se editan en su propio ABM —`/convenios`— y
 * acá se muestran nomás, con el link para ir a cambiarlos. Duplicar ese formulario habría dado dos lugares donde
 * editar lo mismo, que es como los dos quedan distintos.
 *
 * LO QUE SÍ SE EDITA ACÁ es la asignación de empresas al régimen alternativo, y va del lado del ACUERDO, no de la
 * empresa: «estas productoras convinieron el art. 3.2 de esta acta». Guardado como un flag en la empresa, nadie
 * sabría a qué acta corresponde y habría que migrarlo en la paritaria siguiente.
 */

const conveniosApi = createSimpleCatalogApi('/convenios');
const sindicatosApi = createSimpleCatalogApi('/sindicatos');

interface Props {
  convenio: string;
  acuerdos: AcuerdoParitario[];
  canManage: boolean;
  onRecargar: () => void;
}

export const FichaConvenioTab: React.FC<Props> = ({ convenio, acuerdos, canManage, onRecargar }) => {
  const [ficha, setFicha] = useState<SimpleCatalogItem | null>(null);
  const [sindicato, setSindicato] = useState<SimpleCatalogItem | null>(null);
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  /* El régimen alternativo vive en un acuerdo. Si hay varios, se edita el más reciente: es el que está en vigor. */
  const acuerdoConRegimen = useMemo(() => acuerdos.find((a) => a.regimenAlternativo?.descripcion) || acuerdos[0] || null, [acuerdos]);
  const [seleccionadas, setSeleccionadas] = useState<string[]>([]);

  useEffect(() => {
    setSeleccionadas(acuerdoConRegimen?.regimenAlternativo?.empresaIds || []);
  }, [acuerdoConRegimen]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      try {
        const [convs, emps] = await Promise.all([conveniosApi.list(), companiesAPI.list({ slim: true })]);
        if (!vivo) return;
        const item = (convs as SimpleCatalogItem[]).find((c) => String(c.externalId || '').trim() === convenio) || null;
        setFicha(item);
        setEmpresas(emps);
        const sindicatoId = item?.sindicatoId ? String(item.sindicatoId) : '';
        if (sindicatoId) {
          const sinds = await sindicatosApi.list();
          if (!vivo) return;
          setSindicato((sinds as SimpleCatalogItem[]).find((s) => String(s._id) === sindicatoId) || null);
        } else {
          setSindicato(null);
        }
      } catch {
        if (vivo) setFicha(null);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [convenio]);

  const guardarRegimen = async () => {
    if (!acuerdoConRegimen) return;
    setGuardando(true);
    try {
      await escalasConvenioAPI.actualizarAcuerdo(acuerdoConRegimen._id, {
        regimenAlternativo: { descripcion: acuerdoConRegimen.regimenAlternativo?.descripcion || '', empresaIds: seleccionadas },
      });
      onRecargar();
      sweetAlert.success('Régimen alternativo actualizado');
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const alternar = (id: string) => setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const hayCambios = useMemo(() => {
    const antes = [...(acuerdoConRegimen?.regimenAlternativo?.empresaIds || [])].sort().join(',');
    return antes !== [...seleccionadas].sort().join(',');
  }, [acuerdoConRegimen, seleccionadas]);

  const dato = (etiqueta: string, valor: React.ReactNode) => (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{etiqueta}</dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{valor || '—'}</dd>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Datos del convenio</h3>
          <Link to={`/convenios?buscar=${encodeURIComponent(convenio)}`} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5">
            Editar en Convenios
            <FontAwesomeIcon icon={faUpRightFromSquare} className="h-3 w-3" />
          </Link>
        </div>

        {cargando ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>
        ) : !ficha ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            El código <span className="font-mono">{convenio}</span> no está en el catálogo de Convenios. Las categorías existen igual, pero el CCT no tiene ficha: conviene darlo de alta ahí.
          </p>
        ) : (
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {dato('Código', <span className="font-mono">{ficha.externalId}</span>)}
            {dato('Actividad', ficha.name)}
            {dato('Signatario', (ficha.signatario as string) || '')}
            {dato(
              'Sindicato',
              sindicato ? (
                <Link to={`/sindicatos?buscar=${encodeURIComponent(sindicato.name)}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {sindicato.name}
                  {sindicato.sigla ? ` (${sindicato.sigla as string})` : ''}
                </Link>
              ) : (
                ''
              )
            )}
          </dl>
        )}
      </div>

      {/* ── Partes del acuerdo vigente ── */}
      {acuerdos.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3">Partes del último acuerdo</h3>
          <div className="flex flex-wrap gap-2">
            {(acuerdos[0].partes || []).length === 0 ? (
              <span className="text-sm text-gray-500 dark:text-gray-400">El acuerdo no tiene partes cargadas.</span>
            ) : (
              acuerdos[0].partes.map((p) => (
                <span key={p} className="inline-flex items-center rounded bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {p}
                </span>
              ))
            )}
          </div>
          {acuerdos[0].convenios.length > 1 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Alcanza también a <span className="font-mono">{acuerdos[0].convenios.filter((c) => c !== convenio).join(', ')}</span>: son convenios articulados y se mueven juntos.
            </p>
          )}
        </div>
      )}

      {/* ── Régimen alternativo ── */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Régimen alternativo</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-2xl flex items-start gap-2">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5 mt-0.5 text-blue-600 dark:text-blue-400" />
              <span>{acuerdoConRegimen?.regimenAlternativo?.descripcion || 'El acuerdo no describe un régimen alternativo. Se carga en la pestaña de Acuerdos.'}</span>
            </p>
          </div>
          {canManage && acuerdoConRegimen && (
            <button type="button" onClick={() => void guardarRegimen()} disabled={!hayCambios || guardando} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm font-semibold disabled:opacity-40 shrink-0">
              {guardando ? 'Guardando…' : 'Guardar asignación'}
            </button>
          )}
        </div>

        {!acuerdoConRegimen ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Hace falta un acuerdo cargado para asignarle empresas.</p>
        ) : empresas.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay empresas cargadas.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
            {empresas.map((e) => {
              const elegida = seleccionadas.includes(e._id);
              return (
                <button
                  key={e._id}
                  type="button"
                  disabled={!canManage}
                  onClick={() => alternar(e._id)}
                  className={`flex items-center gap-2 rounded border px-3 py-2 text-left text-sm transition-colors ${
                    elegida ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-200' : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                  } disabled:cursor-default`}
                >
                  <FontAwesomeIcon icon={elegida ? faCheck : faBuilding} className={`h-3.5 w-3.5 shrink-0 ${elegida ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                  <span className="truncate">{e.razonSocial}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
