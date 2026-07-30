import React, { useEffect, useMemo, useState } from 'react';
import { SearchAndFilters } from '../ui/SearchAndFilters';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { InfoModal } from '../ui/InfoModal';
import { sweetAlert } from '../../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faFileContract, faGrip, faTable, faFileInvoiceDollar, faInfinity, faFileSignature, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { contratosAPI, ContratoItem } from '../../api/contratos';
import { contratoFrameAPI, ContratoFrameItem } from '../../api/contratosFrame';
import { infoAPI, InfoItem } from '../../api/info';
import { EstadoBadge } from '../EstadoSelect';

const normalizar = (s: string): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

interface FormState {
  name: string;
  cantidadJornadas: string;
  multiplicadorDiario: string;
  esTiempoIndeterminado: boolean;
  requiereFirma: boolean;
  isActive: boolean;
  /** Estados (no globales) que van a quedar vinculados a TODAS las Plantillas de este Contrato. */
  estadoIds: string[];
}

const FORM_VACIO: FormState = { name: '', cantidadJornadas: '', multiplicadorDiario: '', esTiempoIndeterminado: false, requiereFirma: true, isActive: true, estadoIds: [] };

const BadgeTiempoIndeterminado: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
    <FontAwesomeIcon icon={faInfinity} className="h-2.5 w-2.5" />
    Tiempo indeterminado
  </span>
);

const BadgeFirma: React.FC<{ activo: boolean }> = ({ activo }) => (
  <span
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
      activo
        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-100 dark:border-green-800'
        : 'bg-gray-50 text-gray-500 dark:bg-gray-700/30 dark:text-gray-400 border-gray-200 dark:border-gray-700'
    }`}
  >
    <FontAwesomeIcon icon={faFileSignature} className="h-2.5 w-2.5" />
    {activo ? 'Se envía a firmar' : 'No se envía a firmar'}
  </span>
);

/** Botón de acción del footer de una tarjeta: mismo color/hover/tooltip que usa Clientes (Card.tsx, variant "default"). */
const CardFooterAction: React.FC<{ icon: typeof faEdit; title: string; onClick: () => void }> = ({ icon, title, onClick }) => (
  <div className="relative group/action flex items-center">
    <button onClick={onClick} className="p-1 rounded transition-colors hover:text-gray-800 dark:hover:text-gray-300 text-gray-600 dark:text-gray-400">
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
    </button>
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/action:opacity-100 dark:bg-gray-700">
      {title}
    </span>
  </div>
);

export const ContractTypesTab: React.FC = () => {
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [plantillas, setPlantillas] = useState<ContratoFrameItem[]>([]);
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showFirmaInfo, setShowFirmaInfo] = useState(false);
  const [editando, setEditando] = useState<ContratoItem | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  // Selección de Estados al abrir el modal: para diffear contra `form.estadoIds` al guardar.
  const [estadoIdsOriginal, setEstadoIdsOriginal] = useState<string[]>([]);

  // Vista tarjetas/tabla, como el resto de los ABM: la tabla solo en pantallas grandes.
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('contratosAbmViewMode');
      if (saved === 'table' || saved === 'cards') setViewMode(saved);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) localStorage.setItem('contratosAbmViewMode', viewMode);
  }, [viewMode, isLarge]);

  const cargar = async () => {
    try {
      setLoading(true);
      const [tiposDeContrato, listaPlantillas, listaEstados] = await Promise.all([contratosAPI.list(), contratoFrameAPI.list(), infoAPI.listEstados()]);
      setContratos(tiposDeContrato);
      setPlantillas(listaPlantillas);
      setEstados(listaEstados);
    } catch (e) {
      console.error('Error cargando contratos:', e);
      sweetAlert.error('Error', 'No se pudieron cargar los contratos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = normalizar(searchTerm);
    if (!q) return contratos;
    return contratos.filter((c) => normalizar(c.name).includes(q));
  }, [contratos, searchTerm]);

  // Cuántas Plantillas ("Plantillas | Contratos") tiene asignadas cada Contrato.
  const plantillasPorContrato = useMemo(() => {
    const conteo = new Map<string, number>();
    plantillas.forEach((p) => {
      const id = typeof p.contratoId === 'object' ? p.contratoId?._id : p.contratoId;
      if (id) conteo.set(id, (conteo.get(id) || 0) + 1);
    });
    return conteo;
  }, [plantillas]);

  /**
   * Estados (Configuración → Estados) que aplican a cada Contrato: los Estados no se vinculan al
   * Contrato directamente sino a sus Plantillas, así que se resuelve por ahí. Un Estado sin ningún
   * tipo de contrato marcado se ofrece para todos, así que aplica igual.
   */
  const estadosPorContrato = useMemo(() => {
    const plantillaIdsPorContrato = new Map<string, Set<string>>();
    plantillas.forEach((p) => {
      const contratoId = typeof p.contratoId === 'object' ? p.contratoId?._id : p.contratoId;
      if (!contratoId) return;
      if (!plantillaIdsPorContrato.has(contratoId)) plantillaIdsPorContrato.set(contratoId, new Set());
      plantillaIdsPorContrato.get(contratoId)!.add(p._id);
    });

    const mapa = new Map<string, InfoItem[]>();
    contratos.forEach((c) => {
      const misPlantillas = plantillaIdsPorContrato.get(c._id) || new Set<string>();
      const aplican = estados.filter((e) => {
        const vinculados: string[] = e.data?.contratoFrameIds || [];
        if (vinculados.length === 0) return true; // sin ninguno marcado = aplica a todos
        return vinculados.some((id) => misPlantillas.has(String(id)));
      });
      mapa.set(c._id, aplican);
    });
    return mapa;
  }, [contratos, plantillas, estados]);

  /** Ids de las Plantillas que ya tiene asignadas un Contrato (vacío si todavía no tiene ninguna). */
  const plantillaIdsDe = (contratoId: string): string[] =>
    plantillas.filter((p) => (typeof p.contratoId === 'object' ? p.contratoId?._id : p.contratoId) === contratoId).map((p) => String(p._id));

  /** Estados (no globales) que ya aplican a alguna de las Plantillas de ese Contrato. */
  const estadoIdsDe = (contratoId: string): string[] => {
    const misPlantillas = plantillaIdsDe(contratoId);
    return estados.filter((e) => (e.data?.contratoFrameIds || []).some((id: string) => misPlantillas.includes(String(id)))).map((e) => e._id);
  };

  const abrirCrear = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setEstadoIdsOriginal([]);
    setShowModal(true);
  };

  const abrirEditar = (contrato: ContratoItem) => {
    const seleccionActual = estadoIdsDe(contrato._id);
    setEditando(contrato);
    setForm({
      name: contrato.name,
      cantidadJornadas: String(contrato.data?.cantidadJornadas ?? ''),
      multiplicadorDiario: String(contrato.data?.multiplicadorDiario ?? ''),
      esTiempoIndeterminado: !!contrato.data?.esTiempoIndeterminado,
      requiereFirma: contrato.data?.requiereFirma !== false,
      isActive: contrato.isActive !== false,
      estadoIds: seleccionActual,
    });
    setEstadoIdsOriginal(seleccionActual);
    setShowModal(true);
  };

  const toggleEstado = (id: string) => {
    setForm((prev) => ({
      ...prev,
      estadoIds: prev.estadoIds.includes(id) ? prev.estadoIds.filter((x) => x !== id) : [...prev.estadoIds, id],
    }));
  };

  /** Los Estados impositivos son mutuamente excluyentes: tildar uno destilda cualquier otro. */
  const toggleEstadoImpositivo = (id: string) => {
    setForm((prev) => {
      const yaEstaba = prev.estadoIds.includes(id);
      const impositivoIds = new Set(estados.filter((e) => e.data?.esImpositivo).map((e) => e._id));
      const sinImpositivos = prev.estadoIds.filter((x) => !impositivoIds.has(x));
      return { ...prev, estadoIds: yaEstaba ? sinImpositivos : [...sinImpositivos, id] };
    });
  };

  /**
   * Aplica la selección de Estados del modal a TODAS las Plantillas del Contrato: tildar un Estado
   * lo vincula a todas, destildarlo lo desvincula de todas (así lo pidió el usuario). Los Estados
   * globales (sin ningún tipo marcado) no se tocan: no hay forma de "restringirlos" desde acá.
   */
  const sincronizarEstados = async (contratoId: string) => {
    const misPlantillas = plantillaIdsDe(contratoId);
    if (misPlantillas.length === 0) return;

    const antes = new Set(estadoIdsOriginal);
    const despues = new Set(form.estadoIds);
    const cambiaron = estados.filter((e) => (e.data?.contratoFrameIds || []).length > 0 && antes.has(e._id) !== despues.has(e._id));

    for (const estado of cambiaron) {
      const nuevosIds = new Set((estado.data?.contratoFrameIds || []).map(String));
      if (despues.has(estado._id)) {
        misPlantillas.forEach((id) => nuevosIds.add(id));
      } else {
        misPlantillas.forEach((id) => nuevosIds.delete(id));
      }
      try {
        await infoAPI.updateEstado(estado._id, {
          name: estado.name,
          color: estado.data?.color,
          nombreEnContrato: estado.data?.nombreEnContrato,
          esImpositivo: estado.data?.esImpositivo,
          contratoFrameIds: Array.from(nuevosIds),
        });
      } catch (e: any) {
        sweetAlert.error(`No se pudo vincular "${estado.name}"`, e?.response?.data?.error || 'Intentá editarlo desde la pestaña Estados de Contratos.');
      }
    }
  };

  const guardar = async () => {
    const name = form.name.trim();
    if (!name) {
      sweetAlert.error('Falta el nombre', 'El contrato necesita un nombre.');
      return;
    }

    const payload = {
      nombre: name,
      cantidadJornadas: form.cantidadJornadas,
      multiplicadorDiario: form.multiplicadorDiario,
      esTiempoIndeterminado: form.esTiempoIndeterminado,
      requiereFirma: form.requiereFirma,
      isActive: form.isActive,
    };

    try {
      setSaving(true);
      if (editando) {
        await contratosAPI.update(editando._id, payload);
        await sincronizarEstados(editando._id);
        sweetAlert.success('Contrato actualizado', 'Los cambios se guardaron con éxito.');
      } else {
        await contratosAPI.create(payload);
        sweetAlert.success('Contrato creado', 'Ya podés asignarle una Plantilla desde Plantillas | Contratos.');
      }
      setShowModal(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo guardar el contrato.');
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (contrato: ContratoItem) => {
    const enUso = plantillasPorContrato.get(contrato._id) || 0;
    if (enUso > 0) {
      sweetAlert.error('No se puede eliminar', `Hay ${enUso} plantilla${enUso === 1 ? '' : 's'} asignada${enUso === 1 ? '' : 's'} a este contrato. Reasignalas o eliminalas primero desde Plantillas | Contratos.`);
      return;
    }
    const result = await sweetAlert.confirm('¿Eliminar contrato?', `Se va a eliminar "${contrato.name}".`);
    if (!result.isConfirmed) return;
    try {
      await contratosAPI.remove(contrato._id);
      sweetAlert.success('Eliminado', 'El contrato fue eliminado.');
      await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo eliminar el contrato.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
        <div className="flex-1 w-full">
          <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar contrato..." />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={abrirCrear} title="Nuevo contrato" aria-label="Nuevo contrato" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <FontAwesomeIcon icon={faPlus} />
          </button>
          {isLarge && (
            <div className="flex items-center gap-2">
              <button onClick={() => setViewMode('cards')} title="Vista de tarjetas" className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'cards' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode('table')} title="Vista de tabla" className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === 'table' ? 'bg-blue-500 text-white border-blue-500' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando contratos..." />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={faFileContract} title={searchTerm ? 'Sin resultados' : 'Todavía no hay contratos'} description={searchTerm ? 'Probá con otra búsqueda.' : 'Creá el primer contrato para poder asignarle una Plantilla.'} />
      ) : viewMode === 'table' ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Jornadas</th>
                  <th className="px-4 py-3 font-semibold">Mult. Diario</th>
                  <th className="px-4 py-3 font-semibold">Tiempo Indet.</th>
                  <th className="px-4 py-3 font-semibold">Firma</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Plantillas</th>
                  <th className="px-4 py-3 font-semibold">Estados</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtrados.map((contrato) => {
                  const cantPlantillas = plantillasPorContrato.get(contrato._id) || 0;
                  const misEstados = estadosPorContrato.get(contrato._id) || [];
                  return (
                    <tr key={contrato._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100">{contrato.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{contrato.data?.cantidadJornadas ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{contrato.data?.multiplicadorDiario ?? '—'}</td>
                      <td className="px-4 py-3">{contrato.data?.esTiempoIndeterminado ? <BadgeTiempoIndeterminado /> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-4 py-3">
                        <BadgeFirma activo={contrato.data?.requiereFirma !== false} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${contrato.isActive === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                          {contrato.isActive === false ? 'Inactivo' : 'Activo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {cantPlantillas} plantilla{cantPlantillas === 1 ? '' : 's'}
                      </td>
                      <td className="px-4 py-3">
                        {misEstados.length === 0 ? (
                          <span className="text-xs text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {misEstados.map((e) => (
                              <EstadoBadge key={e._id} name={e.name} className="text-[10px]" />
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <CardFooterAction icon={faEdit} title="Editar contrato" onClick={() => abrirEditar(contrato)} />
                          <CardFooterAction icon={faTrash} title="Eliminar contrato" onClick={() => eliminar(contrato)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtrados.map((contrato) => {
            const cantPlantillas = plantillasPorContrato.get(contrato._id) || 0;
            const misEstados = estadosPorContrato.get(contrato._id) || [];
            return (
              <div key={contrato._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className={`inline-flex items-center w-fit px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${contrato.isActive === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                    {contrato.isActive === false ? 'Inactivo' : 'Activo'}
                  </span>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{contrato.name}</span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                  <span>
                    <strong>{contrato.data?.cantidadJornadas ?? 0}</strong> jornadas
                  </span>
                  <span>
                    Multiplicador <strong>{contrato.data?.multiplicadorDiario ?? 0}</strong>
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {contrato.data?.esTiempoIndeterminado && <BadgeTiempoIndeterminado />}
                  <BadgeFirma activo={contrato.data?.requiereFirma !== false} />
                </div>

                {misEstados.length > 0 && (
                  <div className="flex flex-col gap-1 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estados</label>
                    <div className="flex flex-wrap gap-1">
                      {misEstados.map((e) => (
                        <EstadoBadge key={e._id} name={e.name} className="text-[10px]" />
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-gray-100 dark:border-gray-700/60">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    {cantPlantillas} plantilla{cantPlantillas === 1 ? '' : 's'} asignada{cantPlantillas === 1 ? '' : 's'}
                  </span>
                  <div className="flex items-center gap-1">
                    <CardFooterAction icon={faEdit} title="Editar contrato" onClick={() => abrirEditar(contrato)} />
                    <CardFooterAction icon={faTrash} title="Eliminar contrato" onClick={() => eliminar(contrato)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editando ? 'Editar Contrato' : 'Nuevo Contrato'}
        subtitle={editando ? editando.name : 'Se va a poder asignar a una o varias Plantillas'}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>
              Cancelar
            </button>
            <button onClick={guardar} className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : editando ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nombre *</label>
            <input className="input-field w-full" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Plazo fijo 5x7" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cantidad de Jornadas</label>
              <input type="number" className="input-field w-full" value={form.cantidadJornadas} onChange={(e) => setForm((p) => ({ ...p, cantidadJornadas: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Multiplicador Diario</label>
              <input type="number" className="input-field w-full" value={form.multiplicadorDiario} onChange={(e) => setForm((p) => ({ ...p, multiplicadorDiario: e.target.value }))} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.esTiempoIndeterminado} onChange={(e) => setForm((p) => ({ ...p, esTiempoIndeterminado: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
            <span className="text-gray-700 dark:text-gray-300">Es tiempo indeterminado</span>
          </label>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.requiereFirma} onChange={(e) => setForm((p) => ({ ...p, requiereFirma: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
              <span className="text-gray-700 dark:text-gray-300">Se envía a firmar</span>
            </label>
            <button type="button" onClick={() => setShowFirmaInfo(true)} className="text-gray-400 hover:text-blue-500 transition-colors" title="¿Qué significa?" aria-label="Información sobre envío a firmar">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
            <span className="text-gray-700 dark:text-gray-300">Contrato activo</span>
          </label>

          {(() => {
            const misPlantillaIds = editando ? plantillaIdsDe(editando._id) : [];
            const estadosImpositivos = estados.filter((e) => e.data?.esImpositivo);
            const estadosRegulares = estados.filter((e) => !e.data?.esImpositivo && (e.data?.contratoFrameIds || []).length > 0);
            const estadosGlobales = estados.filter((e) => (e.data?.contratoFrameIds || []).length === 0);
            const estadosNoGlobales = estadosImpositivos.length + estadosRegulares.length;
            return (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                  Estados
                  {misPlantillaIds.length > 0 ? <span className="ml-1.5 normal-case tracking-normal text-gray-500 dark:text-gray-400">({form.estadoIds.length} de {estadosNoGlobales})</span> : null}
                </label>
                {!editando ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">
                    Vas a poder elegir los Estados una vez que le asignes una Plantilla a este Contrato desde <strong>Plantillas | Contratos</strong>.
                  </p>
                ) : misPlantillaIds.length === 0 ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">
                    Este Contrato todavía no tiene ninguna Plantilla asignada: asignale una desde <strong>Plantillas | Contratos</strong> para poder elegir sus Estados.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {estadosImpositivos.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 ml-1 flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
                          Estados impositivos — elegí uno solo
                        </p>
                        <div className="rounded-lg border border-purple-200 dark:border-purple-800/60 divide-y divide-purple-100 dark:divide-purple-800/40 overflow-hidden">
                          {estadosImpositivos.map((estado) => {
                            const checked = form.estadoIds.includes(estado._id);
                            return (
                              <label key={estado._id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors">
                                <input type="checkbox" checked={checked} onChange={() => toggleEstadoImpositivo(estado._id)} className="rounded-full border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer" />
                                <EstadoBadge name={estado.name} className="text-[10px]" />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between gap-2 ml-1">
                        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Estados no impositivos</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, estadoIds: [...p.estadoIds.filter((id) => !estadosRegulares.some((e) => e._id === id)), ...estadosRegulares.map((e) => e._id)] }))}
                            disabled={estadosRegulares.length === 0 || estadosRegulares.every((e) => form.estadoIds.includes(e._id))}
                            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                          >
                            Seleccionar todos
                          </button>
                          <span className="text-gray-300 dark:text-gray-600">·</span>
                          <button
                            type="button"
                            onClick={() => setForm((p) => ({ ...p, estadoIds: p.estadoIds.filter((id) => !estadosRegulares.some((e) => e._id === id)) }))}
                            disabled={!estadosRegulares.some((e) => form.estadoIds.includes(e._id))}
                            className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                          >
                            Limpiar
                          </button>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1 mb-1.5 mt-0.5">
                        Se aplica a todas las Plantillas de este Contrato. Los Estados sin ningún tipo marcado se ofrecen siempre y no se pueden restringir acá.
                      </p>
                      <div className="max-h-52 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60">
                        {estadosRegulares.length === 0 && estadosGlobales.length === 0 ? (
                          <p className="px-3 py-3 text-sm text-gray-500">No hay más estados cargados.</p>
                        ) : (
                          <>
                            {estadosRegulares.map((estado) => {
                              const checked = form.estadoIds.includes(estado._id);
                              return (
                                <label key={estado._id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                                  <input type="checkbox" checked={checked} onChange={() => toggleEstado(estado._id)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                                  <EstadoBadge name={estado.name} className="text-[10px]" />
                                </label>
                              );
                            })}
                            {estadosGlobales.map((estado) => (
                              <label key={estado._id} className="flex items-center gap-3 px-3 py-2 opacity-60 cursor-not-allowed" title="Se aplica a todos los tipos de contrato">
                                <input type="checkbox" checked disabled className="rounded border-gray-300 text-blue-600 cursor-not-allowed" />
                                <EstadoBadge name={estado.name} className="text-[10px]" />
                                <span className="ml-auto text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">todos</span>
                              </label>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </Modal>

      <InfoModal
        isOpen={showFirmaInfo}
        onClose={() => setShowFirmaInfo(false)}
        title="Se envía a firmar"
        size="sm"
        zIndex={120}
        actions={[{ label: 'Entendido', onClick: () => setShowFirmaInfo(false), variant: 'primary' }]}
      >
        <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <p>
            Con esta opción <strong>activada</strong>, en Contratos del proyecto se va a poder descargar el contrato de este tipo para enviarlo a firmar.
          </p>
          <p>
            Si la <strong>desactivás</strong>, ese botón de descarga no aparece: en su lugar se muestra el aviso <strong>"No se envía a firmar"</strong>.
          </p>
        </div>
      </InfoModal>
    </div>
  );
};

export default ContractTypesTab;
