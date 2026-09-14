import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faPlus, faTrash, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { sweetAlert } from '../../utils/sweetAlert';
import { mensajeErrorApi } from '../../utils/errorApi';
import { SimpleCatalogItem } from '../../api/simpleCatalog';
import { tiposEntidadAPI, TipoEntidadFinanciera, RotuloCbu, ROTULOS_CBU } from '../../api/tiposEntidadFinanciera';

/**
 * ═══════════════════════════════════════════════════════════════════════
 * ENTIDADES FINANCIERAS → TIPOS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Los tipos eran una lista fija en el código. Acá se crean, se renombran y se apagan, y cada uno dice
 * qué datos bancarios pide: es lo que arma la cascada del registro y de la ficha de usuario. Un tipo
 * INACTIVO deja de ofrecerse en los selectores —el de la entidad, el del registro, el de la ficha—, pero
 * quien ya lo tiene cargado lo conserva.
 *
 * No se borra uno en uso (lo corta el server): para sacarlo de circulación está «Inactivo».
 */

interface Props {
  /** Las entidades del catálogo, para contar cuántas usa cada tipo. */
  entidades: SimpleCatalogItem[];
  /** Avisa a la página que los tipos cambiaron, para refrescar el selector de «Tipo» de las entidades. */
  onCambio: () => void;
}

type Formulario = { nombre: string; activo: boolean; pideTipoCuenta: boolean; pideNroCuenta: boolean; rotuloCbu: RotuloCbu };
const VACIO: Formulario = { nombre: '', activo: true, pideTipoCuenta: true, pideNroCuenta: true, rotuloCbu: 'CBU' };

const inputClass = 'w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white';

/** Interruptor sí/no. El mismo gesto que el Estado de las entidades. */
const Interruptor: React.FC<{ encendido: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode; title?: string }> = ({ encendido, onClick, disabled, children, title }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-pressed={encendido}
    className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${encendido ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50' : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
  >
    <span className={`relative inline-flex h-3.5 w-6 shrink-0 rounded-full transition-colors ${encendido ? 'bg-emerald-500' : 'bg-gray-400'}`}>
      <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${encendido ? 'left-3' : 'left-0.5'}`} />
    </span>
    {children}
  </button>
);

export const TiposEntidadFinancieraTab: React.FC<Props> = ({ entidades, onCambio }) => {
  const [tipos, setTipos] = useState<TipoEntidadFinanciera[] | null>(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<TipoEntidadFinanciera | null>(null);
  const [form, setForm] = useState<Formulario>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);

  const cargar = async () => {
    try {
      setTipos(await tiposEntidadAPI.list());
      setError('');
    } catch (e) {
      setTipos([]);
      setError(mensajeErrorApi(e, 'No se pudieron cargar los tipos').detalle);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  // Una entidad sin tipo cargado se ofrece como banco en todos lados: cuenta como «banco».
  const entidadesDe = (clave: string) => entidades.filter((e) => String((e as { tipoEntidad?: string }).tipoEntidad || 'banco') === clave).length;

  const abrirNuevo = () => {
    setEditando(null);
    setForm(VACIO);
    setAbierto(true);
  };

  const abrirEdicion = (t: TipoEntidadFinanciera) => {
    setEditando(t);
    setForm({ nombre: t.nombre, activo: t.activo, pideTipoCuenta: t.pideTipoCuenta, pideNroCuenta: t.pideNroCuenta, rotuloCbu: t.rotuloCbu });
    setAbierto(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      sweetAlert.error('Falta el nombre', 'El nombre es obligatorio.');
      return;
    }
    setGuardando(true);
    try {
      const payload = { ...form, nombre: form.nombre.trim() };
      if (editando) await tiposEntidadAPI.update(editando._id, payload);
      else await tiposEntidadAPI.create(payload);
      setAbierto(false);
      await cargar();
      onCambio();
    } catch (e) {
      const m = mensajeErrorApi(e, 'No se pudo guardar el tipo');
      sweetAlert.error(m.titulo, m.detalle);
    } finally {
      setGuardando(false);
    }
  };

  const alternarEstado = async (t: TipoEntidadFinanciera) => {
    const nuevo = !t.activo;
    const poner = (valor: boolean) => setTipos((prev) => (prev ? prev.map((x) => (x._id === t._id ? { ...x, activo: valor } : x)) : prev));
    setCambiando(t._id);
    poner(nuevo);
    try {
      await tiposEntidadAPI.update(t._id, { activo: nuevo });
      onCambio();
    } catch (e) {
      poner(!nuevo);
      const m = mensajeErrorApi(e, 'No se pudo cambiar el estado');
      sweetAlert.error(m.titulo, m.detalle);
    } finally {
      setCambiando(null);
    }
  };

  const eliminar = async (t: TipoEntidadFinanciera) => {
    const r = await sweetAlert.confirm('¿Eliminar tipo?', `Se eliminará «${t.nombre}». Si sólo querés que deje de ofrecerse, desactivalo.`, 'Sí, eliminar');
    if (!r.isConfirmed) return;
    try {
      await tiposEntidadAPI.remove(t._id);
      await cargar();
      onCambio();
    } catch (e) {
      const m = mensajeErrorApi(e, 'No se pudo eliminar el tipo');
      sweetAlert.error(m.titulo, m.detalle);
    }
  };

  const chipDato = (texto: string) => <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">{texto}</span>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600 dark:text-gray-300">Qué tipos de entidad hay y qué datos bancarios pide cada uno. Los inactivos no se ofrecen al elegir, pero quien ya los tiene los conserva.</p>
        <button type="button" onClick={abrirNuevo} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} /> Nuevo tipo
        </button>
      </div>

      {tipos === null ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">{error}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['Nombre', 'Datos que pide', 'Entidades', 'Estado'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {h}
                  </th>
                ))}
                <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              {tipos.map((t) => {
                const usadas = entidadesDe(t.clave);
                return (
                  <tr key={t._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                    <td className="px-5 py-3">
                      <p className={`text-sm font-medium ${t.activo ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>{t.nombre}</p>
                      <p className="font-mono text-[11px] text-gray-400">{t.clave}</p>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {t.pideTipoCuenta && chipDato('Tipo de cuenta')}
                        {t.pideNroCuenta && chipDato('Nro. de cuenta')}
                        {chipDato(t.rotuloCbu)}
                        {chipDato('Alias')}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{usadas}</td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <Interruptor encendido={t.activo} onClick={() => void alternarEstado(t)} disabled={cambiando === t._id} title={t.activo ? 'Desactivar: deja de ofrecerse en los selectores' : 'Activar: vuelve a ofrecerse en los selectores'}>
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </Interruptor>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-sm">
                      <button type="button" onClick={() => abrirEdicion(t)} className="mr-3 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300" title="Editar">
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      {/* En uso no se borra: el server también lo corta, pero se avisa antes de intentarlo. */}
                      <button type="button" onClick={() => void eliminar(t)} disabled={usadas > 0} className="text-gray-600 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:text-gray-300" title={usadas > 0 ? `Lo usan ${usadas} entidades: desactivalo en lugar de eliminarlo` : 'Eliminar'}>
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {tipos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    Todavía no hay tipos. Creá uno con «Nuevo tipo».
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        title={editando ? 'Editar tipo de entidad' : 'Nuevo tipo de entidad'}
        size="sm"
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <button type="button" onClick={() => setAbierto(false)} className="btn-secondary" disabled={guardando}>
              Cancelar
            </button>
            <button type="button" onClick={() => void guardar()} className="btn-primary" disabled={guardando}>
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre *</label>
            <input type="text" autoFocus value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Billetera Virtual" className={inputClass} />
            {editando && <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Clave <span className="font-mono">{editando.clave}</span>: no cambia al renombrar, es lo que tienen guardado las entidades y las personas.</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Estado</label>
            <Interruptor encendido={form.activo} onClick={() => setForm((f) => ({ ...f, activo: !f.activo }))}>
              {form.activo ? 'Activo' : 'Inactivo'}
            </Interruptor>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">Inactivo: no se ofrece al elegir el tipo de una entidad, al registrarse ni al cargar datos bancarios.</p>
          </div>

          <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Qué datos bancarios pide</p>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={form.pideTipoCuenta} onChange={(e) => setForm((f) => ({ ...f, pideTipoCuenta: e.target.checked }))} className="h-4 w-4 rounded" />
              Tipo de cuenta (caja de ahorro, cuenta corriente)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input type="checkbox" checked={form.pideNroCuenta} onChange={(e) => setForm((f) => ({ ...f, pideNroCuenta: e.target.checked }))} className="h-4 w-4 rounded" />
              Número de cuenta
            </label>
            <div className="flex items-center gap-2 pt-1">
              <label htmlFor="rotulo-cbu" className="text-sm text-gray-700 dark:text-gray-200">
                El número de 22 dígitos se llama
              </label>
              <select id="rotulo-cbu" value={form.rotuloCbu} onChange={(e) => setForm((f) => ({ ...f, rotuloCbu: e.target.value as RotuloCbu }))} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white">
                {ROTULOS_CBU.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">El CBU/CVU y el alias se piden siempre. Un banco da CBU; una billetera virtual, CVU.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
