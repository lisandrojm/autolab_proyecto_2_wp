import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPenToSquare, faTrash, faFilePdf, faUpload, faCircleInfo, faFileContract, faDownload } from '@fortawesome/free-solid-svg-icons';

import { AcuerdoParitario, escalasConvenioAPI, TramoParitario } from '../../../api/escalasConvenio';
import { InfoModal } from '../../ui/InfoModal';
import { EmptyState } from '../../ui/EmptyState';
import { sweetAlert } from '../../../utils/sweetAlert';
import { formatearFechaCalendario } from '../../../utils/fechas';
import { porciento, Th } from './piezas';

/**
 * Los ACUERDOS PARITARIOS: de dónde salió cada importe.
 *
 * Es el documento que le faltaba a todo el módulo. El sistema ya detectaba los PDF publicados por los gremios
 * (el módulo de paritarias) y ya guardaba escalas, pero no había NADA que uniera las dos cosas: un importe no
 * tenía forma de decir de qué acta venía. Con esto, cada período de escala y cada importe de adicional puede
 * apuntar a un acuerdo con su expediente y su PDF.
 *
 * LOS TRAMOS SON UNA LISTA, NO UN PORCENTAJE. El acuerdo 2025-2026 de 634/11 tiene dos tramos acumulativos
 * (+9,5 % y +4,8 %) y además un régimen alternativo con otro escalonamiento y una absorción en el medio. El
 * «14,76 % total» que dice el acta es información DERIVADA: la calcula el server encadenando los tramos, y por
 * eso no se guarda en ningún campo que pueda quedar viejo.
 */

const ESTADOS_HOMOLOGACION: Array<{ valor: NonNullable<AcuerdoParitario['homologacion']>['estado']; texto: string }> = [
  { valor: 'a_confirmar', texto: 'A confirmar' },
  { valor: 'sin_homologar', texto: 'Sin homologar' },
  { valor: 'en_tramite', texto: 'En trámite' },
  { valor: 'homologado', texto: 'Homologado' },
];

interface FormAcuerdo {
  titulo: string;
  convenios: string;
  partes: string;
  expediente: string;
  firmadoEl: string;
  periodoDesde: string;
  periodoHasta: string;
  estadoHomologacion: NonNullable<AcuerdoParitario['homologacion']>['estado'];
  resolucion: string;
  clausulaTexto: string;
  clausulaAplica: boolean;
  regimenDescripcion: string;
  tramos: TramoParitario[];
}

const TRAMO_VACIO: TramoParitario = { codigo: '', desde: '', porcentaje: 0, base: '', acumulativo: true, regimen: 'general', nota: '' };

const aFormulario = (a: AcuerdoParitario | null, convenio: string): FormAcuerdo => ({
  titulo: a?.titulo || '',
  convenios: (a?.convenios || [convenio]).join(', '),
  partes: (a?.partes || []).join(', '),
  expediente: a?.expediente || '',
  firmadoEl: a?.firmadoEl?.slice(0, 10) || '',
  periodoDesde: a?.periodoParitario?.desde?.slice(0, 10) || '',
  periodoHasta: a?.periodoParitario?.hasta?.slice(0, 10) || '',
  estadoHomologacion: a?.homologacion?.estado || 'a_confirmar',
  resolucion: a?.homologacion?.resolucion || '',
  clausulaTexto: a?.clausulaAbsorcion?.texto || '',
  clausulaAplica: a?.clausulaAbsorcion?.aplica || false,
  regimenDescripcion: a?.regimenAlternativo?.descripcion || '',
  tramos: (a?.tramos || []).map((t) => ({ ...t, desde: t.desde?.slice(0, 10) || '', baseDesde: t.baseDesde?.slice(0, 10) || '' })),
});

interface Props {
  convenio: string;
  acuerdos: AcuerdoParitario[];
  canManage: boolean;
  onRecargar: () => void;
}

export const AcuerdosParitariosTab: React.FC<Props> = ({ convenio, acuerdos, canManage, onRecargar }) => {
  const [form, setForm] = useState<FormAcuerdo | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoA, setSubiendoA] = useState<string | null>(null);
  const inputArchivo = useRef<HTMLInputElement | null>(null);
  const [acuerdoParaArchivo, setAcuerdoParaArchivo] = useState<string | null>(null);

  const abrirNuevo = () => {
    setEditandoId(null);
    setForm(aFormulario(null, convenio));
  };

  const abrirEdicion = (a: AcuerdoParitario) => {
    setEditandoId(a._id);
    setForm(aFormulario(a, convenio));
  };

  const guardar = async () => {
    if (!form) return;
    if (!form.titulo.trim()) return void sweetAlert.error('El título es obligatorio.');
    setGuardando(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        convenios: form.convenios
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        partes: form.partes
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
        expediente: form.expediente.trim(),
        firmadoEl: form.firmadoEl || null,
        periodoParitario: { desde: form.periodoDesde || null, hasta: form.periodoHasta || null },
        homologacion: { estado: form.estadoHomologacion, resolucion: form.resolucion.trim(), fecha: null },
        clausulaAbsorcion: { texto: form.clausulaTexto.trim(), aplica: form.clausulaAplica },
        regimenAlternativo: { descripcion: form.regimenDescripcion.trim() },
        tramos: form.tramos
          .filter((t) => t.codigo.trim() && t.desde)
          .map((t) => ({ ...t, codigo: t.codigo.trim(), porcentaje: Number(t.porcentaje || 0), baseDesde: t.baseDesde || null })),
      };
      if (editandoId) await escalasConvenioAPI.actualizarAcuerdo(editandoId, payload);
      else await escalasConvenioAPI.crearAcuerdo(payload);
      setForm(null);
      setEditandoId(null);
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo guardar el acuerdo.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (a: AcuerdoParitario) => {
    const r = await sweetAlert.confirm(`¿Borrar «${a.titulo}»?`, 'Los importes que cargó quedan como están: sólo pierden el vínculo con el acta.', 'Sí, borrar');
    if (!r.isConfirmed) return;
    try {
      await escalasConvenioAPI.borrarAcuerdo(a._id);
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo borrar.');
    }
  };

  const elegirArchivo = (acuerdoId: string) => {
    setAcuerdoParaArchivo(acuerdoId);
    inputArchivo.current?.click();
  };

  const subirArchivo = async (archivo: File) => {
    if (!acuerdoParaArchivo) return;
    setSubiendoA(acuerdoParaArchivo);
    try {
      await escalasConvenioAPI.subirActa(acuerdoParaArchivo, archivo);
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo subir el acta.');
    } finally {
      setSubiendoA(null);
      setAcuerdoParaArchivo(null);
      if (inputArchivo.current) inputArchivo.current.value = '';
    }
  };

  /* La descarga va por axios (lleva el token) y se abre como blob: un link directo daría 401. */
  const descargar = async (a: AcuerdoParitario) => {
    try {
      const blob = await escalasConvenioAPI.descargarActa(a._id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = a.archivo?.nombreOriginal || 'acta.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      sweetAlert.error('No se pudo descargar el acta.');
    }
  };

  const actualizarTramo = (indice: number, cambios: Partial<TramoParitario>) => {
    if (!form) return;
    setForm({ ...form, tramos: form.tramos.map((t, i) => (i === indice ? { ...t, ...cambios } : t)) });
  };

  return (
    <div className="space-y-4">
      <input ref={inputArchivo} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void subirArchivo(e.target.files[0])} />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-3xl flex items-start gap-2">
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5 mt-0.5 text-blue-600 dark:text-blue-400" />
          <span>
            Cada acuerdo es un acta: sus partes, su expediente, sus tramos y el PDF. Los períodos de escala y los importes de adicionales se cuelgan de acá, así que un importe siempre puede decir de dónde salió.
          </span>
        </p>
        {canManage && (
          <button type="button" onClick={abrirNuevo} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95 shrink-0">
            <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
            Acuerdo
          </button>
        )}
      </div>

      {acuerdos.length === 0 ? (
        <EmptyState icon={faFileContract} title="Este convenio no tiene acuerdos cargados" description="Cargá el acta con su expediente y sus tramos, y adjuntale el PDF. Después cada escala y cada adicional puede apuntar a ella." />
      ) : (
        <div className="space-y-3">
          {acuerdos.map((a) => (
            <div key={a._id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">{a.titulo}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {a.partes.length > 0 && <>{a.partes.join(' · ')} — </>}
                    convenios {a.convenios.join(', ') || '—'}
                    {a.firmadoEl && <> · firmado el {formatearFechaCalendario(a.firmadoEl)}</>}
                  </p>
                  {a.expediente && <p className="font-mono text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">{a.expediente}</p>}
                  <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px]">
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-bold uppercase tracking-wide ${a.homologacion?.estado === 'homologado' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'}`}>
                      {ESTADOS_HOMOLOGACION.find((e) => e.valor === a.homologacion?.estado)?.texto || 'A confirmar'}
                    </span>
                    {a.porcentajeAcumuladoGeneral !== undefined && a.porcentajeAcumuladoGeneral > 0 && (
                      <span className="text-gray-600 dark:text-gray-300" title="Calculado encadenando los tramos del régimen general. No se guarda: se deriva.">
                        acumulado {porciento(a.porcentajeAcumuladoGeneral)}
                      </span>
                    )}
                    {a.periodoParitario?.desde && (
                      <span className="text-gray-500 dark:text-gray-400">
                        período paritario {formatearFechaCalendario(a.periodoParitario.desde)} → {a.periodoParitario.hasta ? formatearFechaCalendario(a.periodoParitario.hasta) : '—'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {a.archivo?.ruta ? (
                    <button type="button" onClick={() => void descargar(a)} title={`Descargar ${a.archivo.nombreOriginal || 'el acta'}`} className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 px-1" title="El acta en PDF es la evidencia del importe. Sin ella, el dato depende de la memoria de quien lo cargó.">
                      sin PDF
                    </span>
                  )}
                  {canManage && (
                    <>
                      <button type="button" onClick={() => elegirArchivo(a._id)} disabled={subiendoA === a._id} title={a.archivo?.ruta ? 'Reemplazar el PDF del acta' : 'Adjuntar el PDF del acta'} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40">
                        <FontAwesomeIcon icon={subiendoA === a._id ? faDownload : faUpload} className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => abrirEdicion(a)} title="Editar el acuerdo" className="p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => void borrar(a)} title="Borrar el acuerdo" className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {a.tramos.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <Th className="text-left">Tramo</Th>
                        <Th className="text-left">Rige desde</Th>
                        <Th className="text-right">Aumento</Th>
                        <Th className="text-left">Base</Th>
                        <Th className="text-left">Régimen</Th>
                        <Th className="text-left hidden lg:table-cell">Nota</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {a.tramos.map((t) => (
                        <tr key={`${a._id}-${t.codigo}`}>
                          <td className="px-4 py-2 font-mono text-xs text-gray-900 dark:text-gray-100">{t.codigo}</td>
                          <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{formatearFechaCalendario(t.desde)}</td>
                          <td className="px-4 py-2 text-right text-sm font-mono font-semibold text-gray-900 dark:text-gray-100">{porciento(t.porcentaje)}</td>
                          <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">
                            {t.base || '—'}
                            {!t.acumulativo && <span className="block text-[11px] text-gray-500 dark:text-gray-400">no acumulativo</span>}
                            {t.absorbe && <span className="block text-[11px] text-amber-600 dark:text-amber-400">absorbe {t.absorbe}</span>}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.regimen === 'alternativo' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'}`}>
                              {t.regimen === 'alternativo' ? 'Alternativo' : 'General'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">{t.nota || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {a.clausulaAbsorcion?.aplica && (
                <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
                  <strong>Cláusula de absorción:</strong> {a.clausulaAbsorcion.texto || '(sin transcribir)'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <InfoModal
        isOpen={form !== null}
        onClose={() => setForm(null)}
        title={editandoId ? 'Editar acuerdo' : 'Nuevo acuerdo paritario'}
        size="xl"
        actions={[
          { label: 'Cancelar', onClick: () => setForm(null), variant: 'ghost' },
          { label: guardando ? 'Guardando…' : 'Guardar', onClick: () => void guardar(), variant: 'primary', disabled: guardando },
        ]}
      >
        {form && (
          <div className="space-y-4">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Título</span>
              <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="Paritaria 2025-2026 · 2.º tramo" />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Convenios alcanzados</span>
                <input value={form.convenios} onChange={(e) => setForm({ ...form, convenios: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono" placeholder="0634/11, 0131/75" />
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-1">Separados por coma. El 634/11 viene articulado con el 131/75: el básico sale de uno y el % del otro.</span>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Partes firmantes</span>
                <input value={form.partes} onChange={(e) => setForm({ ...form, partes: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="ATA, CAPIT, SATTSAID" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="block md:col-span-2">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Expediente</span>
                <input value={form.expediente} onChange={(e) => setForm({ ...form, expediente: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono" placeholder="RE-2026-…-APN-DTD#JGM" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Firmado el</span>
                <input type="date" value={form.firmadoEl} onChange={(e) => setForm({ ...form, firmadoEl: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Homologación</span>
                <select value={form.estadoHomologacion} onChange={(e) => setForm({ ...form, estadoHomologacion: e.target.value as FormAcuerdo['estadoHomologacion'] })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
                  {ESTADOS_HOMOLOGACION.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.texto}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Período paritario desde</span>
                <input type="date" value={form.periodoDesde} onChange={(e) => setForm({ ...form, periodoDesde: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">hasta</span>
                <input type="date" value={form.periodoHasta} onChange={(e) => setForm({ ...form, periodoHasta: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
              </label>
            </div>

            {/* ── Tramos ── */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Tramos</span>
                <button type="button" onClick={() => setForm({ ...form, tramos: [...form.tramos, { ...TRAMO_VACIO }] })} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  + Agregar tramo
                </button>
              </div>
              {form.tramos.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Sin tramos. Un acuerdo escalonado tiene uno por fecha de aplicación.</p>}
              <div className="space-y-2">
                {form.tramos.map((t, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end bg-gray-50 dark:bg-gray-900/40 rounded p-2">
                    <input value={t.codigo} onChange={(e) => actualizarTramo(i, { codigo: e.target.value })} placeholder="2026-04" className="md:col-span-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs font-mono" />
                    <input type="date" value={t.desde} onChange={(e) => actualizarTramo(i, { desde: e.target.value })} className="md:col-span-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs" />
                    <input type="number" step="0.01" value={t.porcentaje} onChange={(e) => actualizarTramo(i, { porcentaje: Number(e.target.value) })} placeholder="%" className="md:col-span-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs text-right font-mono" />
                    <input value={t.base || ''} onChange={(e) => actualizarTramo(i, { base: e.target.value })} placeholder="marzo 2026" className="md:col-span-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs" />
                    <select value={t.regimen} onChange={(e) => actualizarTramo(i, { regimen: e.target.value as TramoParitario['regimen'] })} className="md:col-span-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-xs">
                      <option value="general">General</option>
                      <option value="alternativo">Alternativo</option>
                    </select>
                    <label className="md:col-span-2 inline-flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                      <input type="checkbox" checked={t.acumulativo} onChange={(e) => actualizarTramo(i, { acumulativo: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      Acumulativo
                    </label>
                    <button type="button" onClick={() => setForm({ ...form, tramos: form.tramos.filter((_, j) => j !== i) })} title="Quitar el tramo" className="md:col-span-1 p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 justify-self-end">
                      <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.clausulaAplica} onChange={(e) => setForm({ ...form, clausulaAplica: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">El acuerdo tiene cláusula de absorción</span>
              </label>
              {form.clausulaAplica && (
                <textarea value={form.clausulaTexto} onChange={(e) => setForm({ ...form, clausulaTexto: e.target.value })} rows={2} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="Transcribir el texto del artículo." />
              )}
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Régimen alternativo (descripción)</span>
                <input value={form.regimenDescripcion} onChange={(e) => setForm({ ...form, regimenDescripcion: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="Art. 3.2: pequeñas productoras y canales del interior" />
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-1">Las empresas que se le asignan se eligen en la pestaña «Ficha del convenio».</span>
              </label>
            </div>
          </div>
        )}
      </InfoModal>
    </div>
  );
};
