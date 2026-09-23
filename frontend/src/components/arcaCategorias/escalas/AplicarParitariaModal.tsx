import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faArrowRight, faCircleInfo, faPercent } from '@fortawesome/free-solid-svg-icons';

import { AcuerdoParitario, escalasConvenioAPI, PreviewParitaria } from '../../../api/escalasConvenio';
import { Modal } from '../../ui/Modal';
import { sweetAlert } from '../../../utils/sweetAlert';
import { pesos, porciento, Th } from './piezas';

/**
 * APLICAR UNA PARITARIA POR PORCENTAJE, con previsualización editable.
 *
 * Hasta ahora había dos formas de mover una escala: tipear los doce grupos a mano, o bajar la plantilla de Excel,
 * editarla y subirla. Ninguna de las dos entiende de porcentajes, que es cómo están escritas las actas.
 *
 * POR QUÉ EL PREVIEW ES EDITABLE Y NO SÓLO INFORMATIVO
 *
 * Porque el porcentaje NO reproduce el acta al centavo. Verificado con el acta de 634/11: los básicos sí cierran
 * exacto (1.132.832,62 × 1,048 = 1.187.208,59), pero de los siete adicionales, seis dan un centavo distinto del
 * que publica el acta. Si el sistema guardara lo que calcula, estaría pagando un importe que el acuerdo no dice.
 * Así que propone, deja corregir, y lo que se guarda es lo confirmado.
 *
 * El botón de importar Excel sigue existiendo y no cambió: para un acta que publica importes absolutos, sigue
 * siendo el camino más corto.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  convenio: string;
  fecha: string;
  acuerdos: AcuerdoParitario[];
  onAplicado: () => void;
}

export const AplicarParitariaModal: React.FC<Props> = ({ isOpen, onClose, convenio, fecha, acuerdos, onAplicado }) => {
  const [porcentaje, setPorcentaje] = useState('');
  const [baseFecha, setBaseFecha] = useState(fecha);
  const [desde, setDesde] = useState('');
  const [acuerdoId, setAcuerdoId] = useState('');
  const [tramo, setTramo] = useState('');
  const [incluirAdicionales, setIncluirAdicionales] = useState(true);
  const [incluirPequenas, setIncluirPequenas] = useState(true);

  const [preview, setPreview] = useState<PreviewParitaria | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  /* Las correcciones a mano, por grupo y por adicional. Vacío = se usa lo propuesto. */
  const [basicoEditado, setBasicoEditado] = useState<Record<string, string>>({});
  const [adicionalEditado, setAdicionalEditado] = useState<Record<string, string>>({});

  /** Los tramos de los acuerdos cargados, para poder elegir uno en vez de tipear el porcentaje. */
  const tramosDisponibles = useMemo(() => acuerdos.flatMap((a) => a.tramos.map((t) => ({ acuerdoId: a._id, acuerdoTitulo: a.titulo, ...t }))), [acuerdos]);

  const limpiar = () => {
    setPreview(null);
    setBasicoEditado({});
    setAdicionalEditado({});
  };

  const elegirTramo = (clave: string) => {
    const t = tramosDisponibles.find((x) => `${x.acuerdoId}|${x.codigo}` === clave);
    if (!t) return;
    setPorcentaje(String(t.porcentaje));
    setDesde(t.desde?.slice(0, 10) || '');
    setAcuerdoId(t.acuerdoId);
    setTramo(t.codigo);
    // La base del tramo, cuando el acta la resuelve como fecha: es sobre esa escala que se aplica el aumento.
    if (t.baseDesde) setBaseFecha(t.baseDesde.slice(0, 10));
    limpiar();
  };

  const previsualizar = async () => {
    const pct = Number(porcentaje);
    if (!Number.isFinite(pct) || pct === 0) return void sweetAlert.error('Poné el porcentaje del tramo.');
    if (!desde) return void sweetAlert.error('Poné desde cuándo rige el tramo nuevo.');
    setCargando(true);
    try {
      const r = await escalasConvenioAPI.preview({ convenio, porcentaje: pct, baseFecha, desde, incluirAdicionales, incluirPequenasEmpresas: incluirPequenas });
      setPreview(r);
      setBasicoEditado({});
      setAdicionalEditado({});
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo previsualizar.');
    } finally {
      setCargando(false);
    }
  };

  const aplicar = async () => {
    if (!preview) return;
    const r = await sweetAlert.confirm(
      '¿Aplicar la paritaria?',
      `Se crea el período que rige desde el ${desde} para ${preview.escala.length} grupo(s), se cierra el anterior el día antes, y si el tramo rige hoy la escala vigente de los grupos se actualiza (eso impacta en los contratos nuevos).`,
      'Sí, aplicar'
    );
    if (!r.isConfirmed) return;

    setAplicando(true);
    try {
      const escala = preview.escala.map((f) => {
        const editado = basicoEditado[String(f.grupo ?? '')];
        const basico = editado !== undefined && editado !== '' ? Number(editado) : f.basicoPropuesto;
        return { grupo: f.grupo, basico, adicionalPct: f.propuesta.adicionalPct, presentismoPct: f.propuesta.presentismoPct };
      });
      const adicionales = incluirAdicionales
        ? preview.adicionales
            .filter((a) => a.montoPropuesto !== null)
            .map((a) => {
              const editado = adicionalEditado[a.clave];
              return { codigo: a.clave, monto: editado !== undefined && editado !== '' ? Number(editado) : a.montoPropuesto };
            })
        : [];
      const pequenasEmpresas = incluirPequenas ? preview.pequenasEmpresas : [];

      const resultado = await escalasConvenioAPI.aplicar({ convenio, desde, acuerdoId: acuerdoId || null, tramo, origen: 'acta', escala, adicionales, pequenasEmpresas });
      const espejados = (resultado?.grupos || []).filter((g: any) => g.espejado).length;
      sweetAlert.success('Paritaria aplicada', `${escala.length} grupo(s) con período nuevo${espejados ? `, ${espejados} espejado(s) en la escala vigente` : ''}.`);
      limpiar();
      onAplicado();
      onClose();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo aplicar.');
    } finally {
      setAplicando(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-between gap-3 w-full">
      <span className="text-[11px] text-gray-500 dark:text-gray-400 max-w-md">{preview ? 'Los importes se pueden corregir antes de confirmar: lo que se guarda es lo que se ve.' : 'La previsualización no escribe nada.'}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
          Cerrar
        </button>
        <button type="button" onClick={() => void previsualizar()} disabled={cargando} className="px-4 py-2 text-sm font-semibold rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50">
          {cargando ? 'Calculando…' : preview ? 'Recalcular' : 'Previsualizar'}
        </button>
        <button type="button" onClick={() => void aplicar()} disabled={!preview || aplicando} className="btn-primary disabled:opacity-40">
          {aplicando ? 'Aplicando…' : 'Aplicar paritaria'}
        </button>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Aplicar paritaria por porcentaje" subtitle={`Convenio ${convenio}`} size="95" footer={footer}>
      <div className="space-y-4">
        {tramosDisponibles.length > 0 && (
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Tomar un tramo de un acuerdo cargado</span>
            <select onChange={(e) => elegirTramo(e.target.value)} defaultValue="" className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
              <option value="">Cargar los datos a mano…</option>
              {tramosDisponibles.map((t) => (
                <option key={`${t.acuerdoId}|${t.codigo}`} value={`${t.acuerdoId}|${t.codigo}`}>
                  {t.codigo} · {t.porcentaje} % sobre {t.base || 'la base'} ({t.regimen}) — {t.acuerdoTitulo}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              <FontAwesomeIcon icon={faPercent} className="h-3 w-3 mr-1" />
              Aumento
            </span>
            <input type="number" step="0.01" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-right font-mono" placeholder="4.8" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Sobre la escala vigente al</span>
            <input type="date" value={baseFecha} onChange={(e) => setBaseFecha(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">El tramo nuevo rige desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Acuerdo</span>
            <select value={acuerdoId} onChange={(e) => setAcuerdoId(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
              <option value="">Sin vincular</option>
              {acuerdos.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.titulo}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={incluirAdicionales} onChange={(e) => setIncluirAdicionales(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Aumentar también los adicionales
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={incluirPequenas} onChange={(e) => setIncluirPequenas(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            y el capítulo de pequeñas empresas
          </label>
        </div>

        {preview && (
          <>
            <div className="rounded border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-0.5" />
              <span>
                {preview.aviso}
                {preview.baseTomadaDe === 'convenio-grupos' && <> La base fue la escala vigente de los grupos: este convenio todavía no tiene períodos cargados.</>}
              </span>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200">Escala por grupo</div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <Th className="text-left">Grupo</Th>
                      <Th className="text-right">Básico actual</Th>
                      <Th className="text-right">Básico propuesto (editable)</Th>
                      <Th className="text-right hidden lg:table-cell">% Adic.</Th>
                      <Th className="text-right hidden lg:table-cell">Adicional</Th>
                      <Th className="text-right hidden xl:table-cell">Presentismo</Th>
                      <Th className="text-right">Total actual</Th>
                      <Th className="text-right">Total propuesto</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {preview.escala.map((f) => {
                      const clave = String(f.grupo ?? '');
                      return (
                        <tr key={clave} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                          <td className="px-4 py-2 text-sm font-bold text-gray-900 dark:text-gray-100">{f.grupo == null ? '—' : `G${f.grupo}`}</td>
                          <td className="px-4 py-2 text-right text-sm font-mono text-gray-500 dark:text-gray-400">{pesos(f.basicoActual)}</td>
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={basicoEditado[clave] ?? String(f.basicoPropuesto)}
                              onChange={(e) => setBasicoEditado({ ...basicoEditado, [clave]: e.target.value })}
                              className="w-32 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-right font-mono"
                            />
                          </td>
                          <td className="px-4 py-2 text-right text-xs font-mono text-gray-600 dark:text-gray-300 hidden lg:table-cell">{porciento(f.propuesta.adicionalPct)}</td>
                          <td className="px-4 py-2 text-right text-sm font-mono text-gray-700 dark:text-gray-300 hidden lg:table-cell">{pesos(f.propuesta.adicionalMonto)}</td>
                          <td className="px-4 py-2 text-right text-sm font-mono text-gray-700 dark:text-gray-300 hidden xl:table-cell">{pesos(f.propuesta.presentismoMonto)}</td>
                          <td className="px-4 py-2 text-right text-sm font-mono text-gray-500 dark:text-gray-400">{pesos(f.totalActual)}</td>
                          <td className="px-4 py-2 text-right text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">
                            <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3 mr-1 text-green-600 dark:text-green-400" />
                            {pesos(f.propuesta.total)}
                            {f.avisos.length > 0 && (
                              <span className="block text-[11px] text-amber-600 dark:text-amber-400" title={f.avisos.join('\n')}>
                                {f.avisos.length} aviso(s)
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {incluirAdicionales && preview.adicionales.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-200">Adicionales</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <Th className="text-left">Adicional</Th>
                        <Th className="text-right">Actual</Th>
                        <Th className="text-right">Propuesto (editable)</Th>
                        <Th className="text-left">Avisos</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {preview.adicionales.map((a) => (
                        <tr key={a.clave}>
                          <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                            {a.nombre || a.clave}
                            <span className="block font-mono text-[11px] text-gray-500 dark:text-gray-400">{a.clave}</span>
                          </td>
                          <td className="px-4 py-2 text-right text-sm font-mono text-gray-500 dark:text-gray-400">{pesos(a.monto)}</td>
                          <td className="px-4 py-2 text-right">
                            {a.montoPropuesto === null ? (
                              <span className="text-xs text-amber-600 dark:text-amber-400">sin importe base</span>
                            ) : (
                              <input
                                type="number"
                                step="0.01"
                                value={adicionalEditado[a.clave] ?? String(a.montoPropuesto)}
                                onChange={(e) => setAdicionalEditado({ ...adicionalEditado, [a.clave]: e.target.value })}
                                className="w-32 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm text-right font-mono"
                              />
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{a.avisos.join(' · ') || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-start gap-2">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5 mt-0.5 text-blue-600 dark:text-blue-400" />
              <span>
                Al confirmar: se crea un período por grupo con vigencia desde el {desde || '—'}, se cierra el anterior el día antes, y el presentismo y el total se recalculan del básico. Si el tramo rige hoy, la escala vigente
                del grupo se actualiza — y eso es lo que ven los contratos nuevos.
              </span>
            </p>
          </>
        )}
      </div>
    </Modal>
  );
};
