import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPenToSquare, faTrash, faClockRotateLeft, faCircleInfo, faCheck } from '@fortawesome/free-solid-svg-icons';

import { AdicionalConValor, escalasConvenioAPI, TipoCalculoAdicional, ValorDeAdicional } from '../../../api/escalasConvenio';
import { InfoModal } from '../../ui/InfoModal';
import { EmptyState } from '../../ui/EmptyState';
import { sweetAlert } from '../../../utils/sweetAlert';
import { formatearFechaCalendario } from '../../../utils/fechas';
import { ChipAConfirmar, ChipOrigen, pesos, porciento, Th, TEXTO_TIPO_CALCULO, textoRemunerativo } from './piezas';

/**
 * ABM de los ADICIONALES del convenio: el apartado que faltaba.
 *
 * El acta de 634/11 paga siete conceptos además del básico —antigüedad, comidas, meriendas, exteriores, subida a
 * torre, guardería y ropa— y hasta ahora ninguno existía en el sistema: el "bruto" de la pantalla era sólo básico
 * + adicional + presentismo, que no es lo que cobra la persona.
 *
 * LA COLUMNA MÁS IMPORTANTE DE ESTA TABLA ES «REMUNERATIVO», Y CASI SIEMPRE DICE «A CONFIRMAR».
 *
 * No es un dato que falte cargar por descuido: el acta no lo publica. De él depende la base de aportes, así que
 * mostrarlo como «No» —el default natural de un booleano— sería afirmar algo que nadie verificó. Por eso el
 * modelo guarda `null` y la pantalla lo dice con el chip ámbar.
 */

const TIPOS: Array<{ valor: TipoCalculoAdicional; texto: string }> = [
  { valor: 'a_confirmar', texto: 'A confirmar' },
  { valor: 'monto_fijo', texto: 'Monto fijo' },
  { valor: 'mensual', texto: 'Mensual' },
  { valor: 'por_anio_antiguedad', texto: 'Por año de antigüedad' },
  { valor: 'por_evento', texto: 'Por evento' },
  { valor: 'porcentaje', texto: 'Porcentaje' },
];

interface FormAdicional {
  codigo: string;
  nombre: string;
  tipoCalculo: TipoCalculoAdicional;
  /** `''` = a confirmar. Los tres estados son distintos y el select los distingue. */
  remunerativo: '' | 'si' | 'no';
  confirmado: boolean;
  base: '' | 'basico' | 'basico_mas_adicional' | 'total';
  unidad: string;
  condicion: string;
  orden: number;
}

const FORM_VACIO: FormAdicional = { codigo: '', nombre: '', tipoCalculo: 'a_confirmar', remunerativo: '', confirmado: false, base: '', unidad: '', condicion: '', orden: 0 };

interface Props {
  convenio: string;
  fecha: string;
  adicionales: AdicionalConValor[];
  canManage: boolean;
  onRecargar: () => void;
}

export const AdicionalesConvenioTab: React.FC<Props> = ({ convenio, fecha, adicionales, canManage, onRecargar }) => {
  const [form, setForm] = useState<FormAdicional | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  /* Historial de importes de un adicional. Se carga on demand: son pocos y se miran de a uno. */
  const [historialDe, setHistorialDe] = useState<AdicionalConValor | null>(null);
  const [historial, setHistorial] = useState<ValorDeAdicional[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  /* Alta de un importe nuevo para un período. */
  const [formValor, setFormValor] = useState<{ desde: string; hasta: string; monto: string; porcentaje: string; cerrarAnterior: boolean } | null>(null);

  const generales = useMemo(() => adicionales.filter((a) => a.capitulo === 'general'), [adicionales]);
  const dePequenas = useMemo(() => adicionales.filter((a) => a.capitulo === 'pequenas_empresas'), [adicionales]);
  const sinConfirmar = useMemo(() => adicionales.filter((a) => !a.confirmado).length, [adicionales]);

  const abrirNuevo = () => {
    setEditandoId(null);
    setForm({ ...FORM_VACIO, orden: adicionales.length + 1 });
  };

  const abrirEdicion = (a: AdicionalConValor) => {
    setEditandoId(a._id);
    setForm({
      codigo: a.codigo,
      nombre: a.nombre,
      tipoCalculo: a.tipoCalculo,
      remunerativo: a.remunerativo === true ? 'si' : a.remunerativo === false ? 'no' : '',
      confirmado: a.confirmado,
      base: (a.base as FormAdicional['base']) || '',
      unidad: a.unidad || '',
      condicion: a.condicion || '',
      orden: a.orden,
    });
  };

  const guardar = async () => {
    if (!form) return;
    if (!form.nombre.trim()) return void sweetAlert.error('El nombre es obligatorio.');
    if (!editandoId && !form.codigo.trim()) return void sweetAlert.error('El código es obligatorio: es la clave del adicional dentro del convenio.');
    if (form.tipoCalculo === 'porcentaje' && !form.base) return void sweetAlert.error('Un adicional porcentual necesita saber sobre qué se calcula.');

    setGuardando(true);
    try {
      const payload = {
        convenio,
        codigo: form.codigo.trim().toLowerCase(),
        nombre: form.nombre.trim(),
        tipoCalculo: form.tipoCalculo,
        // El `null` viaja explícito: es «no se sabe», y el server lo distingue de `false`.
        remunerativo: form.remunerativo === 'si' ? true : form.remunerativo === 'no' ? false : null,
        confirmado: form.confirmado,
        base: form.tipoCalculo === 'porcentaje' ? form.base : null,
        unidad: form.unidad.trim(),
        condicion: form.condicion.trim(),
        orden: Number(form.orden || 0),
      };
      if (editandoId) await escalasConvenioAPI.actualizarAdicional(editandoId, payload);
      else await escalasConvenioAPI.crearAdicional(payload);
      setForm(null);
      setEditandoId(null);
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo guardar el adicional.');
    } finally {
      setGuardando(false);
    }
  };

  const confirmarRapido = async (a: AdicionalConValor) => {
    /* Atajo para el caso más común: ya se sabe que es remunerativo y el tipo es el correcto. */
    const r = await sweetAlert.confirm(`¿Confirmar «${a.nombre}»?`, `Se va a marcar como ${TEXTO_TIPO_CALCULO[a.tipoCalculo]} y ${textoRemunerativo(a.remunerativo)}. Si el carácter todavía no se sabe, editalo primero.`, 'Sí, confirmar');
    if (!r.isConfirmed) return;
    try {
      await escalasConvenioAPI.actualizarAdicional(a._id, { confirmado: true });
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo confirmar.');
    }
  };

  const borrar = async (a: AdicionalConValor) => {
    const r = await sweetAlert.confirm(`¿Borrar «${a.nombre}»?`, 'Se borran también todos sus importes históricos. Si ya se usó para liquidar, conviene darlo de baja en lugar de borrarlo.', 'Sí, borrar');
    if (!r.isConfirmed) return;
    try {
      await escalasConvenioAPI.borrarAdicional(a._id);
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo borrar.');
    }
  };

  const verHistorial = useCallback(async (a: AdicionalConValor) => {
    setHistorialDe(a);
    setCargandoHistorial(true);
    try {
      setHistorial(await escalasConvenioAPI.valoresDeAdicional(a._id));
    } catch {
      setHistorial([]);
    } finally {
      setCargandoHistorial(false);
    }
  }, []);

  const guardarValor = async () => {
    if (!historialDe || !formValor) return;
    if (!formValor.desde) return void sweetAlert.error('La vigencia desde es obligatoria.');
    if (!formValor.monto && !formValor.porcentaje) return void sweetAlert.error('Poné un importe o un porcentaje.');
    try {
      await escalasConvenioAPI.crearValor(historialDe._id, {
        desde: formValor.desde,
        hasta: formValor.hasta || null,
        monto: formValor.monto ? Number(formValor.monto) : null,
        porcentaje: formValor.porcentaje ? Number(formValor.porcentaje) : null,
        cerrarAnterior: formValor.cerrarAnterior,
      });
      setFormValor(null);
      await verHistorial(historialDe);
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo guardar el importe.');
    }
  };

  const borrarValor = async (v: ValorDeAdicional) => {
    const r = await sweetAlert.confirm('¿Borrar este importe?', `Se borra el valor que rige desde el ${formatearFechaCalendario(v.desde)}.`, 'Sí, borrar');
    if (!r.isConfirmed) return;
    try {
      await escalasConvenioAPI.borrarValor(v._id);
      if (historialDe) await verHistorial(historialDe);
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo borrar.');
    }
  };

  useEffect(() => {
    if (!historialDe) setFormValor(null);
  }, [historialDe]);

  const tabla = (lista: AdicionalConValor[], titulo: string) => (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{titulo}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">{lista.length} adicional(es)</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <Th className="text-left">Adicional</Th>
              <Th className="text-left">Tipo</Th>
              <Th className="text-left">Remunerativo</Th>
              <Th className="text-right">Valor al {formatearFechaCalendario(fecha)}</Th>
              <Th className="text-left hidden lg:table-cell">Vigencia</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {lista.map((a) => (
              <tr key={a._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{a.nombre}</span>
                    {!a.confirmado && <ChipAConfirmar />}
                  </div>
                  <span className="block font-mono text-[11px] text-gray-500 dark:text-gray-400">{a.codigo}</span>
                  {a.condicion && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{a.condicion}</span>}
                </td>
                <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                  {TEXTO_TIPO_CALCULO[a.tipoCalculo] || a.tipoCalculo}
                  {a.unidad && <span className="block text-xs text-gray-500 dark:text-gray-400">{a.unidad}</span>}
                </td>
                <td className="px-4 py-3 text-sm">
                  {a.remunerativo === null ? <ChipAConfirmar texto="No se sabe" ayuda="El acta no dice si es remunerativo. Mientras siga así, no entra en la base de aportes del cálculo." /> : <span className={a.remunerativo ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-gray-600 dark:text-gray-300'}>{textoRemunerativo(a.remunerativo)}</span>}
                </td>
                <td className="px-4 py-3 text-right text-sm font-mono text-gray-900 dark:text-gray-100">
                  {a.tipoCalculo === 'porcentaje' ? porciento(a.porcentaje) : pesos(a.monto)}
                  {a.monto === null && a.porcentaje === null && <span className="block text-[11px] text-amber-600 dark:text-amber-400">sin importe para esa fecha</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                  {a.valorDesde ? (
                    <>
                      {formatearFechaCalendario(a.valorDesde)} → {a.valorHasta ? formatearFechaCalendario(a.valorHasta) : 'sin fin'}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => void verHistorial(a)} title="Ver el historial de importes" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <FontAwesomeIcon icon={faClockRotateLeft} className="h-4 w-4" />
                    </button>
                    {canManage && !a.confirmado && (
                      <button type="button" onClick={() => void confirmarRapido(a)} title="Confirmar el tipo de cálculo y el carácter" className="p-1.5 rounded text-green-600 dark:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                      </button>
                    )}
                    {canManage && (
                      <>
                        <button type="button" onClick={() => abrirEdicion(a)} title="Editar el adicional" className="p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => void borrar(a)} title="Borrar el adicional y sus importes" className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-3xl flex items-start gap-2">
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5 mt-0.5 text-blue-600 dark:text-blue-400" />
          <span>
            Lo que el acuerdo paga <strong>además</strong> del básico. El importe se guarda por período de vigencia, así que cambiar la fecha de arriba muestra lo que regía ese día.
            {sinConfirmar > 0 && <> Hay <strong>{sinConfirmar}</strong> sin confirmar: el acta publica el importe pero no dice cómo se calcula ni si es remunerativo.</>}
          </span>
        </p>
        {canManage && (
          <button type="button" onClick={abrirNuevo} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95 shrink-0">
            <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
            Adicional
          </button>
        )}
      </div>

      {adicionales.length === 0 ? (
        <EmptyState icon={faCircleInfo} title="Este convenio no tiene adicionales cargados" description="Los adicionales son los conceptos que el acta paga además del básico: antigüedad, comidas, viáticos, ropa. Se cargan de a uno, o por seed desde el acta." />
      ) : (
        <>
          {tabla(generales, 'Régimen general')}
          {dePequenas.length > 0 && tabla(dePequenas, 'Capítulo de pequeñas empresas')}
        </>
      )}

      {/* ── Alta / edición del adicional ── */}
      <InfoModal
        isOpen={form !== null}
        onClose={() => setForm(null)}
        title={editandoId ? 'Editar adicional' : 'Nuevo adicional'}
        subtitle={`Convenio ${convenio}`}
        size="lg"
        actions={[
          { label: 'Cancelar', onClick: () => setForm(null), variant: 'ghost' },
          { label: guardando ? 'Guardando…' : 'Guardar', onClick: () => void guardar(), variant: 'primary', disabled: guardando },
        ]}
      >
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Nombre</span>
                <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="Antigüedad" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Código</span>
                <input
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  disabled={Boolean(editandoId)}
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono disabled:opacity-60"
                  placeholder="antiguedad"
                />
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-1">{editandoId ? 'No se cambia: es la clave con la que se guardaron los importes.' : 'Sin espacios ni tildes. Es la clave dentro del convenio.'}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Tipo de cálculo</span>
                <select value={form.tipoCalculo} onChange={(e) => setForm({ ...form, tipoCalculo: e.target.value as TipoCalculoAdicional })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
                  {TIPOS.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.texto}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">¿Remunerativo?</span>
                <select value={form.remunerativo} onChange={(e) => setForm({ ...form, remunerativo: e.target.value as FormAdicional['remunerativo'] })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
                  <option value="">A confirmar</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Unidad (sólo para mostrar)</span>
                <input value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="por comida" />
              </label>
            </div>

            {form.tipoCalculo === 'porcentaje' && (
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">¿Sobre qué se calcula el porcentaje?</span>
                <select value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value as FormAdicional['base'] })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm">
                  <option value="">Elegir…</option>
                  <option value="basico">Básico</option>
                  <option value="basico_mas_adicional">Básico + adicional</option>
                  <option value="total">Total (bruto de la escala)</option>
                </select>
              </label>
            )}

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Condición / notas</span>
              <textarea value={form.condicion} onChange={(e) => setForm({ ...form, condicion: e.target.value })} rows={2} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" placeholder="A quién aplica, requisitos, lo que el acta diga en prosa." />
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" checked={form.confirmado} onChange={(e) => setForm({ ...form, confirmado: e.target.checked })} className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-xs text-gray-600 dark:text-gray-300">
                <strong>Confirmado.</strong> Marcalo sólo cuando el tipo de cálculo y el carácter remunerativo estén verificados contra el acta o con quien liquida. Mientras esté sin marcar, la liquidación de referencia lo va a
                arrastrar como advertencia — que es lo correcto.
              </span>
            </label>
          </div>
        )}
      </InfoModal>

      {/* ── Historial de importes ── */}
      <InfoModal
        isOpen={historialDe !== null}
        onClose={() => setHistorialDe(null)}
        title={`Historial de importes · ${historialDe?.nombre || ''}`}
        subtitle="Cada fila es un período de vigencia. El último sin fin de vigencia es el que rige."
        size="lg"
        actions={canManage ? [{ label: 'Agregar importe', onClick: () => setFormValor({ desde: '', hasta: '', monto: '', porcentaje: '', cerrarAnterior: true }), variant: 'primary' }] : undefined}
      >
        {cargandoHistorial ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Todavía no tiene ningún importe cargado.</p>
        ) : (
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <Th className="text-left">Desde</Th>
                <Th className="text-left">Hasta</Th>
                <Th className="text-right">Importe</Th>
                <Th className="text-left">Origen</Th>
                {canManage && <Th className="text-right">Acciones</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {historial.map((v) => (
                <tr key={v._id}>
                  <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">{formatearFechaCalendario(v.desde)}</td>
                  <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300">{v.hasta ? formatearFechaCalendario(v.hasta) : <span className="text-green-700 dark:text-green-400 font-semibold">vigente</span>}</td>
                  <td className="px-4 py-2 text-right text-sm font-mono">{v.porcentaje != null ? porciento(v.porcentaje) : pesos(v.monto)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <ChipOrigen origen={v.origen} />
                      {v.tramo && <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{v.tramo}</span>}
                    </div>
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <button type="button" onClick={() => void borrarValor(v)} title="Borrar este importe" className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {formValor && (
          <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wide">Nuevo importe</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Desde</span>
                <input type="date" value={formValor.desde} onChange={(e) => setFormValor({ ...formValor, desde: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Hasta (opcional)</span>
                <input type="date" value={formValor.hasta} onChange={(e) => setFormValor({ ...formValor, hasta: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Importe</span>
                <input type="number" step="0.01" value={formValor.monto} onChange={(e) => setFormValor({ ...formValor, monto: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-right font-mono" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">o Porcentaje</span>
                <input type="number" step="0.0001" value={formValor.porcentaje} onChange={(e) => setFormValor({ ...formValor, porcentaje: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-right font-mono" />
              </label>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={formValor.cerrarAnterior} onChange={(e) => setFormValor({ ...formValor, cerrarAnterior: e.target.checked })} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-xs text-gray-600 dark:text-gray-300">Cerrar el importe anterior el día antes (lo normal al cargar un tramo nuevo).</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setFormValor(null)} className="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">
                Cancelar
              </button>
              <button type="button" onClick={() => void guardarValor()} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold">
                Guardar importe
              </button>
            </div>
          </div>
        )}
      </InfoModal>
    </div>
  );
};
