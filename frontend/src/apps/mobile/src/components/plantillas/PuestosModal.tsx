import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";
import { RoleFrameItem } from "../../../../../api/roleFrames";
import { OpcionAreaTurno } from "./useCatalogosContratacion";

/*
  ARMAR EL EQUIPO POR ROLES: «1 director, 1 playout, 2 cámaras, 1 microfonista…».

  Se busca el rol empresa y se elige cuántos puestos de ese rol hacen falta. Opcionalmente, en qué área
  y turno: todos los que se agregan de una vez toman ese turno, con su horario y sus días (después cada
  puesto se puede cambiar). Lo mismo con el tipo de contrato: si todos van con el mismo, se elige acá;
  si no, en cada puesto. Quién ocupa cada puesto se elige en los equipos. Se agregan en el orden en
  que se fueron eligiendo.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  roleFrames: RoleFrameItem[];
  /** Las áreas y turnos del proyecto. `undefined` = plantilla general (sin áreas). */
  areas?: OpcionAreaTurno[] | null;
  /** Los tipos de contrato que se pueden elegir, con su etiqueta («Jornada · PEDIDO DE ARCA»). */
  contratos: { _id: string; etiqueta: string }[];
  onAgregar: (puestos: { rolId: string; cantidad: number }[], turno: OpcionAreaTurno | null, contratoId: string) => void;
}

export default function PuestosModal({ isOpen, onClose, roleFrames, areas, contratos, onAgregar }: Props) {
  const [busca, setBusca] = useState("");
  const [turno, setTurno] = useState("");
  const [contratoId, setContratoId] = useState("");
  // Un array y no un Map: el orden en que se eligen es el orden de los puestos.
  const [elegidos, setElegidos] = useState<{ rolId: string; cantidad: number }[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setBusca("");
    setElegidos([]);
    setTurno("");
    setContratoId("");
  }, [isOpen]);
  const turnoElegido = (areas || []).find((o) => `${o.areaId}::${o.shiftId}` === turno) || null;

  const roles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return [...roleFrames].filter((r) => !q || r.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [roleFrames, busca]);
  const nombre = useMemo(() => new Map(roleFrames.map((r) => [r._id, r.name])), [roleFrames]);
  const cantidadDe = (id: string) => elegidos.find((e) => e.rolId === id)?.cantidad || 0;
  const cambiar = (id: string, delta: number) =>
    setElegidos((prev) => {
      const actual = prev.find((e) => e.rolId === id);
      const n = Math.max(0, Math.min(20, (actual?.cantidad || 0) + delta));
      if (!actual) return n > 0 ? [...prev, { rolId: id, cantidad: n }] : prev;
      return n === 0 ? prev.filter((e) => e.rolId !== id) : prev.map((e) => (e.rolId === id ? { ...e, cantidad: n } : e));
    });
  const total = elegidos.reduce((s, e) => s + e.cantidad, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agregar puestos por rol"
      subtitle={total ? `${total} puesto${total === 1 ? "" : "s"}: ${elegidos.map((e) => `${e.cantidad} ${nombre.get(e.rolId)}`).join(", ")}` : "Elegí los roles y cuántos de cada uno"}
      size="lg"
      zIndex={90}
      footer={
        <div className="flex w-full gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-white">
            Cancelar
          </button>
          <button
            type="button"
            disabled={total === 0}
            onClick={() => {
              onAgregar(elegidos, turnoElegido, contratoId);
              onClose();
            }}
            className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            Agregar {total || ""}
          </button>
        </div>
      }
    >
      <div className="flex h-[60vh] flex-col gap-3">
        <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" aria-label="Tipo de contrato de estos puestos">
          <option value="">Tipo de contrato: lo elijo después en cada puesto</option>
          {contratos.map((c) => (
            <option key={c._id} value={c._id}>
              {c.etiqueta}
            </option>
          ))}
        </select>
        {areas !== undefined && (
          <select value={turno} onChange={(e) => setTurno(e.target.value)} className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white" aria-label="Área y turno de estos puestos">
            <option value="">Área y turno: lo elijo después en cada puesto</option>
            {(areas || []).map((o) => (
              <option key={`${o.areaId}::${o.shiftId}`} value={`${o.areaId}::${o.shiftId}`}>
                {o.areaNombre} · {o.turnoNombre} {o.inicio && o.fin ? `· ${o.inicio} a ${o.fin}` : ""}
              </option>
            ))}
          </select>
        )}
        <div className="relative shrink-0">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar rol (Director, Cámara, Microfonista…)" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
        </div>
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {roles.map((r) => {
            const n = cantidadDe(r._id);
            return (
              <div key={r._id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${n ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60"}`}>
                <button type="button" onClick={() => cambiar(r._id, n ? 0 : 1)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {r.name}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => cambiar(r._id, -1)} disabled={!n} aria-label={`Uno menos de ${r.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 dark:border-slate-700">
                    <FontAwesomeIcon icon={faMinus} className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-slate-900 dark:text-white">{n}</span>
                  <button type="button" onClick={() => cambiar(r._id, 1)} aria-label={`Uno más de ${r.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
          {roles.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay roles que coincidan.</p>}
        </div>
      </div>
    </Modal>
  );
}
