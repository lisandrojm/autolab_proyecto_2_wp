import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faSpinner, faXmark, faCheck } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";
import { usersAPI, User } from "../../../../../api/users";
import { RoleFrameItem } from "../../../../../api/roleFrames";
import { esContratoVigente, fechaISO } from "../../../../../utils/contratoVigencia";

/*
  ELEGIR PERSONAS PARA UNA PLANTILLA DE EQUIPO: una o varias de una vez.

  Mismo buscador que el alta individual (el server busca por nombre, apellido o email y filtra por rol)
  y el mismo badge de su contrato que rige (sin contrato / vigente / no vigente, con alta y baja). Lo
  distinto: con `multiple` se tildan varias y se confirman juntas; y la lista se pagina con «Cargar
  más» en vez de cortar en las primeras 50.
*/
const POR_PAGINA = 50;

export interface PersonaElegida {
  _id: string;
  nombre: string;
  rolesFrame: string[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  titulo: string;
  multiple?: boolean;
  /** Los que no se pueden elegir (ya están en la plantilla). */
  excluir?: string[];
  roleFrames: RoleFrameItem[];
  onElegir: (personas: PersonaElegida[]) => void;
  /** Acota la lista al equipo de un proyecto (para elegir a quién se reemplaza). */
  projectId?: string;
  /** El rol con que arranca el filtro (el del puesto que se está completando). Se puede sacar. */
  rolInicial?: string;
}

const nombreDe = (u: any) => (u?.metadata?.fullName || `${u?.firstName || ""} ${u?.lastName || ""}`).trim() || u?.email || "Sin nombre";
const ddmmaa = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};

export default function PersonaPickerModal({ isOpen, onClose, titulo, multiple = false, excluir = [], roleFrames, onElegir, projectId, rolInicial }: Props) {
  const [texto, setTexto] = useState("");
  const [rol, setRol] = useState("");
  const [personas, setPersonas] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [buscando, setBuscando] = useState(false);
  const [elegidas, setElegidas] = useState<Map<string, PersonaElegida>>(new Map());
  const pedido = useRef(0);

  useEffect(() => {
    if (!isOpen) return;
    setElegidas(new Map());
    setTexto("");
    setRol(rolInicial || "");
  }, [isOpen, rolInicial]);

  const buscar = (nuevaPagina: number) => {
    const id = ++pedido.current;
    setBuscando(true);
    usersAPI
      .list({ page: nuevaPagina, limit: POR_PAGINA, metadataActivo: "true", picker: true, email: texto.trim() || undefined, rolFrame: rol || undefined, projectId: projectId || undefined } as any)
      .then((r: any) => {
        if (id !== pedido.current) return;
        setPersonas((prev) => (nuevaPagina === 1 ? r.users || [] : [...prev, ...(r.users || [])]));
        setTotal(r.pagination?.total ?? (r.users || []).length);
        setPagina(nuevaPagina);
      })
      .catch(() => id === pedido.current && nuevaPagina === 1 && setPersonas([]))
      .finally(() => id === pedido.current && setBuscando(false));
  };

  // 300 ms de espera: escribir «Martínez» es una consulta, no ocho.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => buscar(1), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, texto, rol, projectId]);

  const excluidos = useMemo(() => new Set(excluir), [excluir]);
  const rolesOrdenados = useMemo(() => [...roleFrames].sort((a, b) => a.name.localeCompare(b.name)), [roleFrames]);

  const tocar = (u: User) => {
    const p: PersonaElegida = { _id: u._id, nombre: nombreDe(u), rolesFrame: ((u.metadata as any)?.roles_frame || []).map((r: any) => (typeof r === "object" ? String(r._id) : String(r))) };
    if (!multiple) {
      onElegir([p]);
      onClose();
      return;
    }
    setElegidas((prev) => {
      const m = new Map(prev);
      if (m.has(u._id)) m.delete(u._id);
      else m.set(u._id, p);
      return m;
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={titulo}
      subtitle={multiple ? `${elegidas.size} elegida${elegidas.size === 1 ? "" : "s"}` : undefined}
      size="lg"
      zIndex={90}
      footer={
        multiple ? (
          <div className="flex w-full gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-white">
              Cancelar
            </button>
            <button
              type="button"
              disabled={elegidas.size === 0}
              onClick={() => {
                onElegir([...elegidas.values()]);
                onClose();
              }}
              className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Agregar {elegidas.size || ""}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex h-[60vh] flex-col gap-3">
        {multiple && elegidas.size > 0 && (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {[...elegidas.values()].map((p) => (
              <span key={p._id} className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/40 bg-blue-500/15 py-1 pl-2.5 pr-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-300">
                {p.nombre}
                <button type="button" onClick={() => setElegidas((prev) => { const m = new Map(prev); m.delete(p._id); return m; })} aria-label={`Quitar ${p.nombre}`} className="rounded-full p-0.5 hover:bg-blue-500/25">
                  <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex shrink-0 gap-2">
          <div className="relative flex-1">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, apellido o email…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
          </div>
          <select value={rol} onChange={(e) => setRol(e.target.value)} className="w-32 rounded-xl border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200" aria-label="Filtrar por rol">
            <option value="">Todos los roles</option>
            {rolesOrdenados.map((r) => (
              <option key={r._id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <p className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
          {buscando && personas.length === 0 ? "Buscando…" : `${total} persona${total === 1 ? "" : "s"}${total > personas.length ? ` · se muestran ${personas.length}` : ""}`}
        </p>
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {personas.map((u) => {
            const ya = excluidos.has(u._id);
            const marcada = elegidas.has(u._id);
            const c = (u as any).contratoQueRige;
            const vigente = c ? esContratoVigente(c) : null;
            return (
              <button
                key={u._id}
                type="button"
                disabled={ya}
                onClick={() => tocar(u)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-40 ${marcada ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/60"}`}
              >
                {multiple && (
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${marcada ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 dark:border-slate-600"}`}>{marcada && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{nombreDe(u)}</p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {ya ? "Ya está en la plantilla" : c ? `Alta ${ddmmaa(fechaISO(c.fecha_alta_contrato))} · Baja ${fechaISO(c.fecha_baja_contrato) ? ddmmaa(fechaISO(c.fecha_baja_contrato)) : "—"}` : u.email}
                  </p>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${vigente === null ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" : vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
                  {vigente === null ? "Sin contrato" : vigente ? "Vigente" : "No vigente"}
                </span>
              </button>
            );
          })}
          {personas.length < total && (
            <button type="button" onClick={() => buscar(pagina + 1)} disabled={buscando} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-xs font-bold text-slate-500 dark:border-slate-600">
              {buscando && <FontAwesomeIcon icon={faSpinner} spin />}
              Cargar más ({total - personas.length})
            </button>
          )}
          {!buscando && personas.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No hay personas que coincidan.</p>}
        </div>
      </div>
    </Modal>
  );
}
