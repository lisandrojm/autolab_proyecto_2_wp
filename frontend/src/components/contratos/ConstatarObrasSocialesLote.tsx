import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faSearch, faArrowUpRightFromSquare, faSpinner, faCheck, faCopy, faCircleCheck, faCircleQuestion, faXmark, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { projectsAPI } from '../../api/projects';
import { formatRnos } from '../../utils/rnos';
import { AfipValues } from './afipCompleteness';

/**
 * Constatar la obra social de MUCHOS contratos de una sentada.
 *
 * Es la pantalla real del trámite. El modal por contrato sirve para el caso suelto —entró uno, se lo
 * constata—, pero el trabajo verdadero llega en tandas: se abre Simplificación Registral una vez, se
 * la deja en otra pestaña y se van pasando los CUIL uno atrás del otro por Registrar Nuevas Altas. Si
 * para cada persona hay que abrir su modal, leerlo entero y cerrarlo, el trámite cuesta diez veces
 * más que la consulta.
 *
 * Por eso acá: el link a ARCA está UNA vez arriba, cada fila trae su CUIL ya formateado y con botón
 * de copiar, y las dos respuestas posibles se contestan sin salir de la fila. Se guarda fila por fila
 * —no hay "guardar todo" al final— así que interrumpir la tanda a la mitad no pierde nada de lo ya
 * consultado.
 *
 * La consulta sigue siendo manual y no se puede automatizar: Simplificación Registral es una app web
 * con clave fiscal, sin webservice, y el único WS conectado (Consulta Padrón A13) no devuelve el RNOS
 * de un trabajador. Lo que sí se puede es no repetirla: lo que ARCA contesta queda fijo.
 */

/** Entrada de Simplificación Registral con clave fiscal (la pantalla que pide con qué CUIT operar). */
const MISIMPLIFICACION_URL = 'https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/login/indexContribuyente.aspx';

const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');

const sinAcentos = (s: string): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const formatCuil = (v: string): string => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v || '');
};

const soloDigitos = (v: string): string => String(v || '').replace(/\D/g, '');

/** Una fila del lote: el contrato y los valores ya resueltos por el checklist. */
export type FilaConstatacion = { row: ContractOverviewRow; valores: AfipValues };

type EstadoFila = { guardando?: boolean; error?: string };

/**
 * Buscador de la fila: elegir ES guardar.
 *
 * No hay paso de confirmación a propósito: acá la fuente ya está fijada —se está mirando la pantalla
 * de altas de ARCA— así que un botón extra solo agregaría un click por persona. Lo que se guarda
 * queda fijo, y para eso está el candado de la fila ya resuelta.
 */
const PickerFila: React.FC<{ catalogo: SimpleCatalogItem[]; disabled?: boolean; onElegir: (os: SimpleCatalogItem) => void }> = ({ catalogo, disabled, onElegir }) => {
  const [q, setQ] = useState('');
  const [foco, setFoco] = useState(false);

  const resultados = useMemo(() => {
    const term = sinAcentos(q.trim());
    const digitos = soloDigitos(q);
    if (!term) return [];
    return catalogo.filter((o) => (digitos && String(o.externalId || '').includes(digitos)) || sinAcentos(o.name).includes(term)).slice(0, 12);
  }, [catalogo, q]);

  return (
    <div className="relative">
      <FontAwesomeIcon icon={faSearch} className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFoco(true)}
        // El blur se demora: sin eso, el click en un resultado cierra la lista antes de dispararse.
        onBlur={() => window.setTimeout(() => setFoco(false), 150)}
        placeholder="RNOS o nombre…"
        className="input-field w-full pl-8 py-1.5 text-xs"
      />
      {foco && q.trim() !== '' && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900 shadow-lg">
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">Sin resultados para «{q}».</li>
          ) : (
            resultados.map((o) => (
              <li key={o._id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQ('');
                    setFoco(false);
                    onElegir(o);
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-baseline gap-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <span className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-400 shrink-0" title={`RNOS ${formatRnos(o.externalId)}`}>
                    {soloDigitos(o.externalId)}
                  </span>
                  <span className="text-xs text-gray-800 dark:text-gray-200 min-w-0">{o.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

const CeldaCuil: React.FC<{ cuil: string }> = ({ cuil }) => {
  const [copiado, setCopiado] = useState(false);
  if (!cuil) return <span className="text-[11px] text-amber-700 dark:text-amber-400">sin CUIL</span>;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(formatCuil(cuil));
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1500);
        } catch {
          /* Si el navegador bloquea el portapapeles, el CUIL igual queda a la vista para copiarlo a mano. */
        }
      }}
      title="Copiar el CUIL para pegarlo en Registrar Nuevas Altas"
      className="group inline-flex items-center gap-2 font-mono text-xs text-gray-800 dark:text-gray-100 hover:text-blue-700 dark:hover:text-blue-400"
    >
      {formatCuil(cuil)}
      <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className={`h-3 w-3 ${copiado ? 'text-green-600' : 'text-gray-400 group-hover:text-blue-600'}`} />
    </button>
  );
};

export const ConstatarObrasSocialesLote: React.FC<{
  /** Filas del filtro vigente (ya acotadas a la empleadora elegida por las pestañas de arriba). */
  filas: FilaConstatacion[];
  /** Razón social de la empleadora activa, o vacío si están todas. */
  empleadora?: string;
  onGuardado: (row: ContractOverviewRow, patch: Partial<ContractOverviewRow>) => void;
}> = ({ filas, empleadora, onGuardado }) => {
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const [verTodas, setVerTodas] = useState(false);

  useEffect(() => {
    obrasSocialesApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  const clave = (r: ContractOverviewRow) => `${r._id}-${r.contractIndex}`;

  const pendientes = useMemo(() => filas.filter((f) => f.valores.constatacion === 'sin_constatar'), [filas]);

  /**
   * Las que estaban pendientes al ABRIR la pantalla, congeladas.
   *
   * Sin esto, cada fila guardada se sale sola de la lista y las de abajo suben un renglón: se pierde
   * el acuse de recibo de lo que se acaba de hacer y el cursor termina en otra persona. Congelado, la
   * fila se queda en su lugar y pasa a verde, que es lo que uno espera al contestar un formulario.
   */
  const [claveInicial] = useState(() => new Set(filas.filter((f) => f.valores.constatacion === 'sin_constatar').map((f) => `${f.row._id}-${f.row.contractIndex}`)));
  const visibles = verTodas ? filas : filas.filter((f) => claveInicial.has(`${f.row._id}-${f.row.contractIndex}`));

  const guardar = async (f: FilaConstatacion, accion: { obraSocial: SimpleCatalogItem } | { noFigura: true }) => {
    const k = clave(f.row);
    setEstados((prev) => ({ ...prev, [k]: { guardando: true } }));
    try {
      const ref = f.row.contratoId || f.row.contractIndex;
      const payload = 'noFigura' in accion ? ({ noFigura: true, constatadaEn: 'arca' } as const) : ({ obraSocialId: Number((accion.obraSocial.data as { id?: number } | undefined)?.id), origen: 'constatada', constatadaEn: 'arca' } as const);

      if (!('noFigura' in accion) && !Number.isFinite(payload.obraSocialId as number)) {
        throw new Error('Esa obra social no tiene código interno. Revisala en Configuración → ARCA → Obras Sociales.');
      }

      const res = await projectsAPI.updateObraSocialContrato(f.row.projectId, f.row.userId, ref as never, payload as never);
      onGuardado(f.row, {
        osId: res.obraSocialId ?? null,
        obraSocialOrigen: (res.obraSocialOrigen || '') as ContractOverviewRow['obraSocialOrigen'],
        obraSocialConstatadaEn: (res.obraSocialConstatadaEn || '') as ContractOverviewRow['obraSocialConstatadaEn'],
        obraSocialConstatadaEl: res.obraSocialConstatadaEl || '',
        obraSocialNoFigura: 'noFigura' in accion,
        // Lo que devolvió ARCA queda fijo: la fila pasa a lectura con candado.
        obraSocialBloqueada: true,
      });
      setEstados((prev) => ({ ...prev, [k]: {} }));
    } catch (e: any) {
      // El error se muestra EN la fila y no en un alert: interrumpir la tanda con un modal por cada
      // obra social que la empleadora no tiene registrada rompe el ritmo de la consulta.
      setEstados((prev) => ({ ...prev, [k]: { error: e?.response?.data?.error || e?.message || 'No se pudo guardar.' } }));
    }
  };

  return (
    <div className="space-y-4">
      {/* El link va UNA vez y arriba: se abre en otra pestaña y se queda ahí toda la tanda. */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2.5 flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1 text-[11px] text-gray-700 dark:text-gray-300 space-y-1">
          <p>
            Simplificación Registral → <strong>Relaciones Laborales</strong> → <em>Registrar Nuevas Altas</em>. Dejalo abierto en otra pestaña: copiá el CUIL de cada fila, mirá qué obra social precompleta ARCA y contestá acá. <strong>No completes el alta ahí</strong> — el alta sale del TXT.
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Se guarda fila por fila y lo que contesta ARCA queda fijo. <strong>Que no devuelva ninguna también es una respuesta</strong>: se registra con fecha, rige la del convenio y esa persona no vuelve a aparecer como pendiente.
          </p>
        </div>
        <a href={MISIMPLIFICACION_URL} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700">
          Abrir ARCA
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
        </a>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-600 dark:text-gray-300">
          <strong>{pendientes.length}</strong> sin constatar{empleadora ? <> en {empleadora}</> : ' (todas las empleadoras)'} · {filas.length - pendientes.length} ya resueltas
        </p>
        <label className="inline-flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} />
          Mostrar también las ya constatadas
        </label>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-8 text-center">
          <FontAwesomeIcon icon={faCircleCheck} className="h-5 w-5 text-green-600 dark:text-green-500" />
          <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">No queda ninguna por constatar con estos filtros.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2">Persona</th>
                <th className="text-left px-3 py-2">CUIL</th>
                <th className="text-left px-3 py-2">Obra social hoy</th>
                <th className="text-left px-3 py-2 w-[38%]">¿Qué devolvió ARCA?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900">
              {visibles.map((f) => {
                const k = clave(f.row);
                const est = estados[k] || {};
                const constatada = f.valores.constatacion !== 'sin_constatar';
                return (
                  <tr key={k} className={constatada ? 'bg-green-50/40 dark:bg-green-900/10' : undefined}>
                    <td className="px-3 py-2 align-top">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{f.row.userName}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {f.row.projectName}
                        {f.row.nombre_contrato ? ` · ${f.row.nombre_contrato}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <CeldaCuil cuil={f.row.cuit || ''} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      {f.valores.rnos ? (
                        <p className="flex items-baseline gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-400" title={`RNOS ${formatRnos(f.valores.rnos)}`}>
                            {soloDigitos(f.valores.rnos)}
                          </span>
                          <span className="text-xs text-gray-700 dark:text-gray-200 min-w-0">{f.valores.nombreObraSocial || '—'}</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-amber-700 dark:text-amber-400">sin resolver</p>
                      )}
                      {/* Lo que se ve acá puede venir del convenio: decirlo evita constatar "confirmando"
                          lo que la pantalla ya mostraba, que es como se cuelan los falsos positivos. */}
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{f.valores.rnosOrigen === 'constatada' ? 'constatada' : f.valores.rnosOrigen === 'convenio' || f.valores.rnosOrigen === 'override' ? `del convenio ${f.valores.convenioCategoria || ''}`.trim() : f.valores.rnosOrigen === 'empresa' ? 'de la empleadora' : f.valores.rnosOrigen === 'manual' ? 'cargada a mano' : f.valores.rnosOrigen === 'heredada-usuario' ? 'de la ficha de la persona' : ''}</p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {est.guardando ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-2 py-1.5">
                          <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
                          Guardando…
                        </p>
                      ) : f.valores.constatacion === 'no_figura' ? (
                        <p className="text-[11px] text-green-700 dark:text-green-400 inline-flex items-center gap-1.5 py-1.5">
                          <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                          <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5 opacity-60" />
                          No devolvió ninguna — rige la del convenio
                        </p>
                      ) : f.valores.constatacion === 'afiliada' ? (
                        <p className="text-[11px] text-green-700 dark:text-green-400 inline-flex items-center gap-1.5 py-1.5">
                          <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                          {f.row.obraSocialConstatadaEn === 'arca' ? 'La devolvió ARCA' : 'Constatada'}
                          {/* El candado dice por qué no hay nada que tocar en esta fila. Corregir un
                              valor sellado se hace desde el modal del contrato, que exige confirmar. */}
                          {(f.row.obraSocialBloqueada || f.row.obraSocialConstatadaEn === 'arca') && <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5 opacity-60" />}
                        </p>
                      ) : (
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <PickerFila catalogo={catalogo} onElegir={(os) => guardar(f, { obraSocial: os })} />
                          </div>
                          <button type="button" onClick={() => guardar(f, { noFigura: true })} title="ARCA no devolvió obra social para este CUIL: se registra la consulta y rige la del convenio" className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <FontAwesomeIcon icon={faCircleQuestion} className="h-3 w-3" />
                            No devolvió
                          </button>
                        </div>
                      )}
                      {est.error && (
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5 flex items-start gap-1.5">
                          <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                          <span className="min-w-0">{est.error}</span>
                          <button type="button" onClick={() => setEstados((prev) => ({ ...prev, [k]: {} }))} className="shrink-0 text-gray-400 hover:text-gray-600">
                            <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                          </button>
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ConstatarObrasSocialesLote;
