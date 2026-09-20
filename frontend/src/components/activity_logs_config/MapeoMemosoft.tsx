import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faSpinner, faClockRotateLeft, faTriangleExclamation, faSave, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { liquidacionAPI, ConceptoMemosoft, MemosoftEffect, MotivoConMapeo, ProblemaDeMapeo } from '../../api/liquidacion';
import { companiesAPI } from '../../api/companies';
import { activityLogTypesAPI } from '../../api/requestConfig';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ LE LIQUIDA A MEMOSOFT CADA MOTIVO DE NOVEDAD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Esta pantalla existe para que RRHH pueda cambiar a qué concepto del recibo va un motivo SIN QUE
 * NADIE TOQUE CÓDIGO. Si hay que desplegar para cambiar que "Enfermedad" pase de 0012 a 0010, el
 * cambio va a esperar semanas y mientras tanto se liquida mal.
 *
 * DOS COSAS QUE NO SON OBVIAS MIRANDO LA PANTALLA:
 *
 *   · Guardar NO PISA lo anterior. Lo que regía queda cerrado el día previo y lo nuevo arranca hoy,
 *     así volver a liquidar un mes viejo sigue usando las reglas de ese mes. Por eso cada motivo
 *     muestra su historial.
 *
 *   · Las HORAS EXTRA no están acá. Se liquidan haya o no novedad —alguien que trabajó su turno y
 *     se quedó dos horas más genera un 0015 igual—, así que son una regla global, arriba de todo, y
 *     no una configuración de cada motivo.
 */

type Empresa = { _id: string; razonSocial: string };

const efectoVacio = (): MemosoftEffect => ({
  conceptoCodigo: '',
  param: 'par1',
  unidad: 'cantidad',
  fuente: 'jornadas',
  aplicaA: 'titular',
  soloRegimen: null,
  empresaId: null,
  vigenteDesde: new Date().toISOString().slice(0, 10),
  vigenteHasta: null,
});

const ETIQUETA_FUENTE: Record<MemosoftEffect['fuente'], string> = {
  jornadas: 'Días de la novedad',
  horas50: 'Horas al 50%',
  horas100: 'Horas al 100%',
  fijo: 'Valor fijo',
  manual: 'Lo carga una persona',
};

const selectClass =
  'text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500';

export const MapeoMemosoft: React.FC = () => {
  const [cargando, setCargando] = useState(true);
  const [motivos, setMotivos] = useState<MotivoConMapeo[]>([]);
  const [conceptos, setConceptos] = useState<ConceptoMemosoft[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  /** El borrador por motivo. Sólo los que se están editando: el resto se muestra desde el servidor. */
  const [borradores, setBorradores] = useState<Record<string, MemosoftEffect[]>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<Record<string, ProblemaDeMapeo[]>>({});
  const [verHistorial, setVerHistorial] = useState<Record<string, boolean>>({});

  /* Las horas extra, que son globales. */
  const [horasExtra, setHorasExtra] = useState<{ codigo50: string; codigo100: string; param: 'par1' | 'par2'; unidad: 'cantidad' | 'importe' }>({
    codigo50: '',
    codigo100: '',
    param: 'par1',
    unidad: 'cantidad',
  });
  const [guardandoHE, setGuardandoHE] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [mapeo, listaEmpresas, settings] = await Promise.all([
          liquidacionAPI.getMapeo(),
          companiesAPI.list({ slim: true }).catch(() => [] as any[]),
          activityLogTypesAPI.getGeneralSettings().catch(() => null as any),
        ]);
        setMotivos(mapeo.motivos);
        setConceptos(mapeo.conceptos);
        setEmpresas((listaEmpresas || []).map((e: any) => ({ _id: e._id, razonSocial: e.razonSocial })));
        if (settings?.memosoftHorasExtra) {
          setHorasExtra({
            codigo50: settings.memosoftHorasExtra.codigo50 || '',
            codigo100: settings.memosoftHorasExtra.codigo100 || '',
            param: settings.memosoftHorasExtra.param || 'par1',
            unidad: settings.memosoftHorasExtra.unidad || 'cantidad',
          });
        }
      } catch (error) {
        console.error('No se pudo cargar el mapeo de liquidación', error);
        sweetAlert.error('Error', 'No se pudo cargar el mapeo de liquidación.');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  /*
    Un código puede estar en varias empresas con la misma descripción. Para el selector alcanza con
    uno por código; cuál empresa aplica se elige aparte, en el efecto.
  */
  const conceptosUnicos = useMemo(() => {
    const porCodigo = new Map<string, ConceptoMemosoft>();
    conceptos.forEach((c) => { if (!porCodigo.has(c.codigo)) porCodigo.set(c.codigo, c); });
    return [...porCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [conceptos]);

  const conceptoDe = (codigo: string) => conceptosUnicos.find((c) => c.codigo === codigo);

  const editar = (motivoId: string, efectos: MemosoftEffect[]) => setBorradores((b) => ({ ...b, [motivoId]: efectos }));

  const empezarAEditar = (motivo: MotivoConMapeo) => editar(motivo._id, motivo.vigentes.map((e) => ({ ...e })));

  const cambiarEfecto = (motivoId: string, i: number, cambio: Partial<MemosoftEffect>) => {
    const actual = borradores[motivoId] || [];
    editar(motivoId, actual.map((e, idx) => (idx === i ? { ...e, ...cambio } : e)));
  };

  /**
   * Al elegir el concepto se proponen el parámetro y la unidad QUE EL CATÁLOGO DICE.
   *
   * No es una comodidad: el servidor rechaza el mapeo si no coinciden, y dejar que la persona los
   * elija a mano sólo sirve para que se equivoque y reciba un error que no esperaba.
   */
  const elegirConcepto = (motivoId: string, i: number, codigo: string) => {
    const concepto = conceptoDe(codigo);
    if (!concepto) return cambiarEfecto(motivoId, i, { conceptoCodigo: codigo });
    const param = concepto.usaPar1 ? 'par1' : 'par2';
    const unidad = (param === 'par1' ? concepto.unidadPar1 : concepto.unidadPar2) || 'cantidad';
    cambiarEfecto(motivoId, i, { conceptoCodigo: codigo, param, unidad: unidad as 'cantidad' | 'importe' });
  };

  const guardar = async (motivo: MotivoConMapeo) => {
    const efectos = borradores[motivo._id] || [];
    setGuardando(motivo._id);
    setProblemas((p) => ({ ...p, [motivo._id]: [] }));
    try {
      const guardado = await liquidacionAPI.guardarMapeo(
        motivo._id,
        efectos.map((e) => ({
          conceptoCodigo: e.conceptoCodigo,
          param: e.param,
          unidad: e.unidad,
          fuente: e.fuente,
          valorFijo: e.fuente === 'fijo' ? Number(e.valorFijo || 0) : undefined,
          aplicaA: e.aplicaA,
          soloRegimen: e.soloRegimen || null,
          empresaId: e.empresaId || null,
          nota: e.nota,
        })),
      );
      setMotivos((lista) => lista.map((m) => (m._id === motivo._id ? { ...m, vigentes: guardado.vigentes, historial: guardado.historial } : m)));
      setBorradores((b) => { const { [motivo._id]: _, ...resto } = b; return resto; });
      sweetAlert.success('Guardado', `El mapeo de "${motivo.name}" rige desde hoy. Lo anterior quedó en el historial.`);
    } catch (error: any) {
      // El servidor rechaza el conjunto entero: guardar la mitad dejaría un mapeo a medias.
      const detalle: ProblemaDeMapeo[] = error?.response?.data?.problemas || [];
      if (detalle.length) setProblemas((p) => ({ ...p, [motivo._id]: detalle }));
      else sweetAlert.error('Error', 'No se pudo guardar el mapeo.');
    } finally {
      setGuardando(null);
    }
  };

  const guardarHorasExtra = async () => {
    setGuardandoHE(true);
    try {
      await activityLogTypesAPI.updateGeneralSettings({ memosoftHorasExtra: { ...horasExtra, vigenteDesde: new Date().toISOString().slice(0, 10) } });
      sweetAlert.success('Guardado', 'Las horas extra ya se liquidan con esos conceptos.');
    } catch (error) {
      console.error(error);
      sweetAlert.error('Error', 'No se pudo guardar la configuración de horas extra.');
    } finally {
      setGuardandoHE(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
        <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando el mapeo…
      </div>
    );
  }

  if (conceptosUnicos.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
        <FontAwesomeIcon icon={faTriangleExclamation} className="mr-2" />
        No hay conceptos de Memosoft cargados todavía. Hasta que estén, no se puede mapear ningún motivo.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─────────── Horas extra: la regla global ─────────── */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/40">
        <div className="flex items-start gap-2 mb-3">
          <FontAwesomeIcon icon={faCircleInfo} className="text-blue-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Horas extra</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Se liquidan haya o no novedad, para el titular y para el reemplazante. Por eso se configuran una vez acá y no en cada motivo.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            <span className="block mb-1">Al 50%</span>
            <select className={selectClass} value={horasExtra.codigo50} onChange={(e) => setHorasExtra({ ...horasExtra, codigo50: e.target.value })}>
              <option value="">No se liquidan</option>
              {conceptosUnicos.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.descripcion}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600 dark:text-gray-300">
            <span className="block mb-1">Al 100%</span>
            <select className={selectClass} value={horasExtra.codigo100} onChange={(e) => setHorasExtra({ ...horasExtra, codigo100: e.target.value })}>
              <option value="">No se liquidan</option>
              {conceptosUnicos.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.descripcion}</option>
              ))}
            </select>
          </label>

          <label className="text-xs text-gray-600 dark:text-gray-300">
            <span className="block mb-1">Parámetro</span>
            <select className={selectClass} value={horasExtra.param} onChange={(e) => setHorasExtra({ ...horasExtra, param: e.target.value as 'par1' | 'par2' })}>
              <option value="par1">par1</option>
              <option value="par2">par2</option>
            </select>
          </label>

          <button
            onClick={guardarHorasExtra}
            disabled={guardandoHE}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors"
          >
            <FontAwesomeIcon icon={guardandoHE ? faSpinner : faSave} spin={guardandoHE} className="mr-1.5" />
            Guardar
          </button>
        </div>
      </div>

      {/* ─────────── Un bloque por motivo ─────────── */}
      {motivos.map((motivo) => {
        const editando = borradores[motivo._id] !== undefined;
        const efectos = editando ? borradores[motivo._id] : motivo.vigentes;
        const cerrados = motivo.historial.filter((e) => e.vigenteHasta);
        const misProblemas = problemas[motivo._id] || [];

        return (
          <div key={motivo._id} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{motivo.name}</span>
                {!motivo.isActive && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">inactivo</span>}
                {efectos.length === 0 && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">no liquida nada</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {cerrados.length > 0 && (
                  <button
                    onClick={() => setVerHistorial((v) => ({ ...v, [motivo._id]: !v[motivo._id] }))}
                    className="text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <FontAwesomeIcon icon={faClockRotateLeft} className="mr-1" />
                    Historial ({cerrados.length})
                  </button>
                )}

                {!editando ? (
                  <button onClick={() => empezarAEditar(motivo)} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline">
                    Editar
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setBorradores((b) => { const { [motivo._id]: _, ...resto } = b; return resto; })}
                      className="text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => guardar(motivo)}
                      disabled={guardando === motivo._id}
                      className="text-[11px] px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                    >
                      <FontAwesomeIcon icon={guardando === motivo._id ? faSpinner : faSave} spin={guardando === motivo._id} className="mr-1" />
                      Guardar
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="px-4 py-3 space-y-2">
              {efectos.length === 0 && !editando && (
                <p className="text-xs text-gray-400 dark:text-gray-500">Este motivo no genera ningún concepto en el recibo.</p>
              )}

              {efectos.map((efecto, i) => {
                const concepto = conceptoDe(efecto.conceptoCodigo);
                if (!editando) {
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{efecto.conceptoCodigo}</span>
                      <span>{concepto?.descripcion || 'concepto desconocido'}</span>
                      <span className="text-gray-400">·</span>
                      <span>{efecto.param} ({efecto.unidad})</span>
                      <span className="text-gray-400">·</span>
                      <span>{ETIQUETA_FUENTE[efecto.fuente]}</span>
                      <span className="text-gray-400">·</span>
                      <span>{efecto.aplicaA === 'titular' ? 'al titular' : 'al reemplazante'}</span>
                      {efecto.soloRegimen && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">sólo {efecto.soloRegimen}</span>}
                      {efecto.empresaId && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                          sólo {empresas.find((e) => e._id === efecto.empresaId)?.razonSocial || 'una empresa'}
                        </span>
                      )}
                      {efecto.nota && <span className="text-gray-400 italic">— {efecto.nota}</span>}
                    </div>
                  );
                }

                return (
                  <div key={i} className="flex flex-wrap items-center gap-2 p-2 rounded border border-gray-100 dark:border-gray-800">
                    <select className={selectClass} value={efecto.conceptoCodigo} onChange={(e) => elegirConcepto(motivo._id, i, e.target.value)}>
                      <option value="">Elegir concepto…</option>
                      {conceptosUnicos.map((c) => (
                        <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.descripcion}</option>
                      ))}
                    </select>

                    {/* El parámetro y la unidad los dicta el catálogo: se muestran, no se eligen. */}
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">{efecto.param} · {efecto.unidad}</span>

                    <select className={selectClass} value={efecto.fuente} onChange={(e) => cambiarEfecto(motivo._id, i, { fuente: e.target.value as MemosoftEffect['fuente'] })}>
                      {(Object.keys(ETIQUETA_FUENTE) as MemosoftEffect['fuente'][]).map((f) => (
                        <option key={f} value={f}>{ETIQUETA_FUENTE[f]}</option>
                      ))}
                    </select>

                    {efecto.fuente === 'fijo' && (
                      <input
                        type="number"
                        className={`${selectClass} w-24`}
                        value={efecto.valorFijo ?? ''}
                        placeholder="Valor"
                        onChange={(e) => cambiarEfecto(motivo._id, i, { valorFijo: Number(e.target.value) })}
                      />
                    )}

                    <select className={selectClass} value={efecto.aplicaA} onChange={(e) => cambiarEfecto(motivo._id, i, { aplicaA: e.target.value as 'titular' | 'reemplazante' })}>
                      <option value="titular">Al titular</option>
                      <option value="reemplazante">Al reemplazante</option>
                    </select>

                    <select className={selectClass} value={efecto.soloRegimen || ''} onChange={(e) => cambiarEfecto(motivo._id, i, { soloRegimen: (e.target.value || null) as any })}>
                      <option value="">Los dos regímenes</option>
                      <option value="mensual">Sólo mensuales</option>
                      <option value="jornalero">Sólo jornaleros</option>
                    </select>

                    <select className={selectClass} value={efecto.empresaId || ''} onChange={(e) => cambiarEfecto(motivo._id, i, { empresaId: e.target.value || null })}>
                      <option value="">Todas las empresas</option>
                      {empresas.map((e) => (
                        <option key={e._id} value={e._id}>{e.razonSocial}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => editar(motivo._id, efectos.filter((_, idx) => idx !== i))}
                      className="text-xs text-red-500 hover:text-red-600 px-1"
                      title="Quitar"
                    >
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </div>
                );
              })}

              {editando && (
                <button
                  onClick={() => editar(motivo._id, [...efectos, efectoVacio()])}
                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <FontAwesomeIcon icon={faPlus} className="mr-1" />
                  Agregar concepto
                </button>
              )}

              {misProblemas.length > 0 && (
                <div className="rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-2 text-xs text-red-700 dark:text-red-300">
                  <p className="font-medium mb-1">No se guardó nada. Hay que corregir esto primero:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    {misProblemas.map((p, i) => <li key={i}>{p.problema}</li>)}
                  </ul>
                </div>
              )}

              {verHistorial[motivo._id] && cerrados.length > 0 && (
                <div className="mt-2 pt-2 border-t border-dashed border-gray-200 dark:border-gray-700 space-y-1">
                  {cerrados.map((e, i) => (
                    <div key={i} className="text-[11px] text-gray-400 dark:text-gray-500">
                      <span className="font-mono">{e.conceptoCodigo}</span> · {e.param} ({e.unidad}) · {e.aplicaA} —{' '}
                      rigió del {e.vigenteDesde} al {e.vigenteHasta}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
