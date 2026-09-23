import React, { useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faPenToSquare, faTrash, faCircleInfo, faTriangleExclamation, faBuilding } from '@fortawesome/free-solid-svg-icons';

import { escalasConvenioAPI, FilaPequenasEmpresas } from '../../../api/escalasConvenio';
import { InfoModal } from '../../ui/InfoModal';
import { EmptyState } from '../../ui/EmptyState';
import { sweetAlert } from '../../../utils/sweetAlert';
import { formatearFechaCalendario } from '../../../utils/fechas';
import { ChipOrigen, pesos, Th } from './piezas';

/**
 * El capítulo de PEQUEÑAS EMPRESAS del acta.
 *
 * Acá el sueldo no se expresa por mes: el acuerdo publica el valor de la SEMANA DE LABOR de 9 horas de lunes a
 * viernes, el de la jornada adicional y el de las dos horas extra. Es otra unidad de medida, no otro importe, y
 * por eso es una tabla aparte y no una escala más — si «básico» significara una cosa en un capítulo y otra en el
 * otro, cualquier cálculo que lea el campo quedaría mal.
 *
 * LA VALIDACIÓN QUE AVISA Y NO CORRIGE: la jornada adicional tendría que ser la semana ÷ 5. Cuando no da, se
 * muestra el desvío y se guarda igual. El importe que se paga es el del acta, incluso si el acta no cierra.
 */

interface FormFila {
  grupo: string;
  desde: string;
  hasta: string;
  semana9hsLunVie: string;
  jornadaAdicional9hs: string;
  horaExtra50: string;
  horaExtra100: string;
}

const FORM_VACIO: FormFila = { grupo: '', desde: '', hasta: '', semana9hsLunVie: '', jornadaAdicional9hs: '', horaExtra50: '', horaExtra100: '' };

const redondear2 = (n: number) => Math.round(n * 100 + Number.EPSILON) / 100;

interface Props {
  convenio: string;
  fecha: string;
  filas: FilaPequenasEmpresas[];
  canManage: boolean;
  onRecargar: () => void;
}

export const PequenasEmpresasTab: React.FC<Props> = ({ convenio, fecha, filas, canManage, onRecargar }) => {
  const [form, setForm] = useState<FormFila | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  /** Los desvíos contra la regla del acta (semana ÷ 5), para poder mostrarlos fila por fila. */
  const desvios = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) {
      const esperada = redondear2(f.semana9hsLunVie / 5);
      const delta = redondear2(f.jornadaAdicional9hs - esperada);
      if (Math.abs(delta) >= 0.01) m.set(f._id, delta);
    }
    return m;
  }, [filas]);

  const abrirNuevo = () => {
    setEditandoId(null);
    setForm({ ...FORM_VACIO, desde: fecha });
  };

  const abrirEdicion = (f: FilaPequenasEmpresas) => {
    setEditandoId(f._id);
    setForm({
      grupo: String(f.grupo),
      desde: f.desde?.slice(0, 10) || '',
      hasta: f.hasta?.slice(0, 10) || '',
      semana9hsLunVie: String(f.semana9hsLunVie ?? ''),
      jornadaAdicional9hs: String(f.jornadaAdicional9hs ?? ''),
      horaExtra50: String(f.horaExtra50 ?? ''),
      horaExtra100: String(f.horaExtra100 ?? ''),
    });
  };

  const guardar = async () => {
    if (!form) return;
    if (!form.grupo) return void sweetAlert.error('El grupo es obligatorio.');
    if (!form.desde) return void sweetAlert.error('La vigencia desde es obligatoria.');

    setGuardando(true);
    try {
      const payload = {
        convenio,
        grupo: Number(form.grupo),
        desde: form.desde,
        hasta: form.hasta || null,
        semana9hsLunVie: Number(form.semana9hsLunVie || 0),
        jornadaAdicional9hs: Number(form.jornadaAdicional9hs || 0),
        horaExtra50: Number(form.horaExtra50 || 0),
        horaExtra100: Number(form.horaExtra100 || 0),
      };
      const r = editandoId ? await escalasConvenioAPI.actualizarPequenasEmpresas(editandoId, payload) : await escalasConvenioAPI.crearPequenasEmpresas(payload);
      setForm(null);
      setEditandoId(null);
      onRecargar();
      // El aviso se muestra DESPUÉS de guardar, no en lugar de guardar: es información, no un rechazo.
      if (r?.avisoJornada) sweetAlert.error('Guardado, con una diferencia', r.avisoJornada);
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (f: FilaPequenasEmpresas) => {
    const r = await sweetAlert.confirm(`¿Borrar el grupo ${f.grupo}?`, `Se borra la fila que rige desde el ${formatearFechaCalendario(f.desde)}.`, 'Sí, borrar');
    if (!r.isConfirmed) return;
    try {
      await escalasConvenioAPI.borrarPequenasEmpresas(f._id);
      onRecargar();
    } catch (e: any) {
      sweetAlert.error(e?.response?.data?.error || 'No se pudo borrar.');
    }
  };

  const jornadaEsperada = form ? redondear2(Number(form.semana9hsLunVie || 0) / 5) : 0;
  const desvioForm = form ? redondear2(Number(form.jornadaAdicional9hs || 0) - jornadaEsperada) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-3xl flex items-start gap-2">
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5 mt-0.5 text-blue-600 dark:text-blue-400" />
          <span>
            El capítulo del acta para las pequeñas productoras: el valor se expresa por <strong>semana de labor de 9 h de lunes a viernes</strong>, más la jornada adicional y las horas extra. Los importes son del período que
            rige al {formatearFechaCalendario(fecha)}.
          </span>
        </p>
        {canManage && (
          <button type="button" onClick={abrirNuevo} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95 shrink-0">
            <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
            Grupo
          </button>
        )}
      </div>

      {filas.length === 0 ? (
        <EmptyState
          icon={faBuilding}
          title="Sin valores de pequeñas empresas para esta fecha"
          description="Los cuatro valores por grupo (semana, jornada adicional y las dos horas extra) salen del capítulo correspondiente del acta. No se pueden derivar de la escala mensual: hay que cargarlos."
        />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <Th className="text-left">Grupo</Th>
                  <Th className="text-right">Semana 9 h (lun–vie)</Th>
                  <Th className="text-right">Jornada adicional 9 h</Th>
                  <Th className="text-right">Hora extra 50 %</Th>
                  <Th className="text-right">Hora extra 100 %</Th>
                  <Th className="text-left hidden lg:table-cell">Vigencia</Th>
                  {canManage && <Th className="text-right">Acciones</Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filas.map((f) => {
                  const desvio = desvios.get(f._id);
                  return (
                    <tr key={f._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Grupo {f.grupo}</span>
                        <div className="mt-1">
                          <ChipOrigen origen={f.origen} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-gray-900 dark:text-gray-100">{pesos(f.semana9hsLunVie)}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-gray-900 dark:text-gray-100">
                        {pesos(f.jornadaAdicional9hs)}
                        {desvio !== undefined && (
                          <span className="block text-[11px] text-amber-600 dark:text-amber-400" title={`La semana ÷ 5 da ${pesos(redondear2(f.semana9hsLunVie / 5))}. El importe del acta es el que se paga.`}>
                            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mr-1" />
                            {desvio > 0 ? '+' : ''}
                            {desvio} vs semana ÷ 5
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-gray-700 dark:text-gray-300">{pesos(f.horaExtra50)}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-gray-700 dark:text-gray-300">{pesos(f.horaExtra100)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                        {formatearFechaCalendario(f.desde)} → {f.hasta ? formatearFechaCalendario(f.hasta) : 'sin fin'}
                        {f.tramo && <span className="block font-mono">{f.tramo}</span>}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button type="button" onClick={() => abrirEdicion(f)} title="Editar" className="p-1.5 rounded text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                              <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => void borrar(f)} title="Borrar" className="p-1.5 rounded text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <InfoModal
        isOpen={form !== null}
        onClose={() => setForm(null)}
        title={editandoId ? 'Editar valores de pequeñas empresas' : 'Nuevos valores de pequeñas empresas'}
        subtitle={`Convenio ${convenio}`}
        size="lg"
        actions={[
          { label: 'Cancelar', onClick: () => setForm(null), variant: 'ghost' },
          { label: guardando ? 'Guardando…' : 'Guardar', onClick: () => void guardar(), variant: 'primary', disabled: guardando },
        ]}
      >
        {form && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Grupo</span>
                <input type="number" min={1} value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value })} disabled={Boolean(editandoId)} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm disabled:opacity-60" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Vigencia desde</span>
                <input type="date" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Hasta (inclusive, opcional)</span>
                <input type="date" value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm" />
              </label>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(
                [
                  ['semana9hsLunVie', 'Semana 9 h (lun–vie)'],
                  ['jornadaAdicional9hs', 'Jornada adicional 9 h'],
                  ['horaExtra50', 'Hora extra 50 %'],
                  ['horaExtra100', 'Hora extra 100 %'],
                ] as Array<[keyof FormFila, string]>
              ).map(([campo, etiqueta]) => (
                <label className="block" key={campo}>
                  <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">{etiqueta}</span>
                  <input type="number" step="0.01" value={form[campo]} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-right font-mono" />
                </label>
              ))}
            </div>

            {Number(form.semana9hsLunVie || 0) > 0 && (
              <div className={`rounded border px-3 py-2 text-xs ${Math.abs(desvioForm) >= 0.01 ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300' : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300'}`}>
                La semana ÷ 5 da <strong>{pesos(jornadaEsperada)}</strong>.
                {Math.abs(desvioForm) >= 0.01 ? (
                  <>
                    {' '}
                    La jornada que cargaste difiere en <strong>{desvioForm}</strong>. Se guarda igual: el importe que se paga es el del acta.
                  </>
                ) : (
                  ' Coincide con la jornada adicional cargada.'
                )}
              </div>
            )}
          </div>
        )}
      </InfoModal>
    </div>
  );
};
