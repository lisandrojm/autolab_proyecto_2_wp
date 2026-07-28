import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter, faXmark } from "@fortawesome/free-solid-svg-icons";
import { InfoModal } from "../ui/InfoModal";
import { Contract } from "../../api/users";
import { formatDate, isContractVigente } from "./ContractCard";

export interface ContractFilterState {
  cliente: string;
  proyecto: string;
  tipo: string;
  vigencia: "all" | "vigente" | "no_vigente";
  ultimo: "all" | "ultimo" | "anteriores";
  desde: string;
  hasta: string;
}

export const emptyContractFilters: ContractFilterState = {
  cliente: "all",
  proyecto: "all",
  tipo: "all",
  vigencia: "all",
  ultimo: "all",
  desde: "",
  hasta: "",
};

/** Compara una fecha "YYYY-MM-DD" con un límite del mismo formato (ambos inclusive). */
const inRange = (fecha?: string, from?: string, to?: string): boolean => {
  const f = String(fecha || "").slice(0, 10);
  if (!f) return !from && !to;
  if (from && f < from) return false;
  if (to && f > to) return false;
  return true;
};

/** Aplica los filtros a un contrato. `clientId`/`projectId` solo se usan en la vista cross-proyecto. */
export const matchesContractFilters = (
  f: ContractFilterState,
  item: { contract: Contract; clientId?: string; projectId?: string; isLatest?: boolean },
): boolean => {
  if (f.cliente !== "all" && item.clientId !== f.cliente) return false;
  if (f.proyecto !== "all" && item.projectId !== f.proyecto) return false;
  if (f.tipo !== "all" && item.contract?.nombre_contrato !== f.tipo) return false;
  if (f.vigencia !== "all") {
    const vig = isContractVigente(item.contract?.fecha_baja_contrato);
    if (f.vigencia === "vigente" && !vig) return false;
    if (f.vigencia === "no_vigente" && vig) return false;
  }
  if (f.ultimo === "ultimo" && !item.isLatest) return false;
  if (f.ultimo === "anteriores" && item.isLatest) return false;
  if ((f.desde || f.hasta) && !inRange(item.contract?.fecha_alta_contrato, f.desde, f.hasta)) return false;
  return true;
};

interface Props {
  value: ContractFilterState;
  onChange: (next: ContractFilterState) => void;
  /** Opciones de cliente/proyecto. Si no se pasan, esos filtros se ocultan (vista de un solo proyecto). */
  clientes?: { id: string; name: string }[];
  proyectos?: { id: string; name: string }[];
  /** Tipos de contrato presentes en los datos. */
  tipos: string[];
}

const selectCls = "w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-2 text-gray-700 dark:text-gray-200";
const labelCls = "block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1";

/** Filtro aplicado, con el texto que se muestra en el badge y el patch que lo quita. */
interface Chip {
  key: string;
  label: string;
  clear: Partial<ContractFilterState>;
}

const buildChips = (
  value: ContractFilterState,
  clientes?: { id: string; name: string }[],
  proyectos?: { id: string; name: string }[],
): Chip[] => {
  const chips: Chip[] = [];
  if (value.cliente !== "all") {
    const name = clientes?.find((c) => c.id === value.cliente)?.name || value.cliente;
    // Quitar el cliente deja sin sentido el proyecto elegido dentro de ese cliente → se limpian juntos.
    chips.push({ key: "cliente", label: `Cliente: ${name}`, clear: { cliente: "all", proyecto: "all" } });
  }
  if (value.proyecto !== "all") {
    const name = proyectos?.find((p) => p.id === value.proyecto)?.name || value.proyecto;
    chips.push({ key: "proyecto", label: `Proyecto: ${name}`, clear: { proyecto: "all" } });
  }
  if (value.tipo !== "all") chips.push({ key: "tipo", label: `Tipo: ${value.tipo}`, clear: { tipo: "all" } });
  if (value.vigencia !== "all") chips.push({ key: "vigencia", label: value.vigencia === "vigente" ? "Vigente" : "No vigente", clear: { vigencia: "all" } });
  if (value.ultimo !== "all") chips.push({ key: "ultimo", label: value.ultimo === "ultimo" ? "Último contrato" : "Contratos anteriores", clear: { ultimo: "all" } });
  if (value.desde) chips.push({ key: "desde", label: `Desde: ${formatDate(value.desde)}`, clear: { desde: "" } });
  if (value.hasta) chips.push({ key: "hasta", label: `Hasta: ${formatDate(value.hasta)}`, clear: { hasta: "" } });
  return chips;
};

/**
 * Filtros compartidos por el modal de contratos del proyecto y el de gestión cross-proyecto: un botón
 * abre el modal con los campos, y lo aplicado queda a la vista como badges que se pueden quitar de a uno.
 */
export const ContractFiltersBar: React.FC<Props> = ({ value, onChange, clientes, proyectos, tipos }) => {
  const [open, setOpen] = React.useState(false);
  const set = (patch: Partial<ContractFilterState>) => onChange({ ...value, ...patch });
  const chips = buildChips(value, clientes, proyectos);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <FontAwesomeIcon icon={faFilter} className="h-3 w-3 text-gray-400" />
          Filtros
          {chips.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">{chips.length}</span>
          )}
        </button>

        {chips.map((chip) => (
          <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 pl-2.5 pr-1.5 py-1 text-xs font-medium text-blue-700 dark:text-blue-300">
            {chip.label}
            <button
              type="button"
              onClick={() => set(chip.clear)}
              title={`Quitar filtro: ${chip.label}`}
              aria-label={`Quitar filtro: ${chip.label}`}
              className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors"
            >
              <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
            </button>
          </span>
        ))}

        {chips.length > 1 && (
          <button type="button" onClick={() => onChange(emptyContractFilters)} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline">
            <FontAwesomeIcon icon={faXmark} className="h-3 w-3" /> Limpiar todo
          </button>
        )}
      </div>

      <InfoModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Filtros"
        subtitle="Se aplican al instante sobre la lista de contratos"
        size="sm"
        zIndex={90}
        actions={[
          { label: "Limpiar", onClick: () => onChange(emptyContractFilters), variant: "secondary", disabled: chips.length === 0 },
          { label: "Listo", onClick: () => setOpen(false), variant: "primary" },
        ]}
      >
        <div className="space-y-3">
          {clientes && (
            <div>
              <label className={labelCls}>Cliente</label>
              {/* Cambiar de cliente invalida el proyecto elegido → se resetea. */}
              <select className={selectCls} value={value.cliente} onChange={(e) => set({ cliente: e.target.value, proyecto: "all" })}>
                <option value="all">Todos</option>
                {clientes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
          )}
          {proyectos && (
            <div>
              <label className={labelCls}>Proyecto</label>
              <select className={selectCls} value={value.proyecto} onChange={(e) => set({ proyecto: e.target.value })}>
                <option value="all">Todos</option>
                {proyectos.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </div>
          )}
          <div>
            <label className={labelCls}>Tipo de contrato</label>
            <select className={selectCls} value={value.tipo} onChange={(e) => set({ tipo: e.target.value })}>
              <option value="all">Todos</option>
              {tipos.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Vigencia</label>
            <select className={selectCls} value={value.vigencia} onChange={(e) => set({ vigencia: e.target.value as ContractFilterState["vigencia"] })}>
              <option value="all">Todas</option>
              <option value="vigente">Vigente</option>
              <option value="no_vigente">No vigente</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Último contrato</label>
            <select className={selectCls} value={value.ultimo} onChange={(e) => set({ ultimo: e.target.value as ContractFilterState["ultimo"] })}>
              <option value="all">Todos</option>
              <option value="ultimo">Solo el último contrato</option>
              <option value="anteriores">Solo contratos anteriores</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Desde</label>
              <input type="date" className={selectCls} value={value.desde} onChange={(e) => set({ desde: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Hasta</label>
              <input type="date" className={selectCls} value={value.hasta} onChange={(e) => set({ hasta: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">El rango Desde/Hasta se aplica sobre la fecha de alta del contrato.</p>
        </div>
      </InfoModal>
    </>
  );
};

export default ContractFiltersBar;
