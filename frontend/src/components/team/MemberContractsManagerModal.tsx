import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faFileLines, faXmark, faFilter } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { usersAPI, ManagedContract } from "../../api/users";
import { projectsAPI } from "../../api/projects";
import { contratoFrameAPI, ContratoFrameItem } from "../../api/contratosFrame";
import { releasesAPI, Release } from "../../api/release";
import { sweetAlert } from "../../utils/sweetAlert";
import { ContractCard, findTemplate, templateHasContent, isContractVigente, buildDownloadFileName } from "./ContractCard";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  userName?: string;
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
}

/** Compara una fecha "YYYY-MM-DD" con un límite del mismo formato (ambos inclusive). */
const inRange = (fecha?: string, from?: string, to?: string): boolean => {
  const f = String(fecha || "").slice(0, 10);
  if (!f) return !from && !to;
  if (from && f < from) return false;
  if (to && f > to) return false;
  return true;
};

/**
 * Gestión de TODOS los contratos de una persona (cross-proyecto/cliente): lista con formato de tarjetas,
 * filtros (cliente, proyecto, tipo, vigencia, rango de fechas) y descarga de contrato/release por tarjeta.
 */
export const MemberContractsManagerModal: React.FC<Props> = ({ isOpen, onClose, userId, userName, contratoFrames, releases }) => {
  const [rows, setRows] = useState<ManagedContract[]>([]);
  const [loading, setLoading] = useState(false);

  const [fCliente, setFCliente] = useState("all");
  const [fProyecto, setFProyecto] = useState("all");
  const [fTipo, setFTipo] = useState("all");
  const [fVigencia, setFVigencia] = useState<"all" | "vigente" | "no_vigente">("all");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");

  const navigate = useNavigate();
  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);
  const userLike = { firstName: userName || "", lastName: "" } as any;

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    usersAPI
      .getAllContracts(userId)
      .then(setRows)
      .catch(() => sweetAlert.error("Error", "No se pudieron cargar los contratos de la persona."))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!isOpen || !userId) return;
    setFCliente("all");
    setFProyecto("all");
    setFTipo("all");
    setFVigencia("all");
    setFDesde("");
    setFHasta("");
    load();
  }, [isOpen, userId, load]);

  // Editar: ir al equipo del proyecto y abrir el editor del miembro precargado con ese contrato.
  const handleEdit = (r: ManagedContract) => {
    if (!userId) return;
    onClose();
    navigate(`/projects/${r.projectId}/team`, { state: { openWizardFor: { userId, contractIndex: r.contractIndex } } });
  };

  // Eliminar: borra SOLO ese contrato (por índice) del proyecto.
  const handleDelete = async (r: ManagedContract) => {
    if (!userId) return;
    const res = await sweetAlert.confirm("¿Eliminar contrato?", `Se eliminará este contrato de "${r.projectName}". Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!res.isConfirmed) return;
    try {
      await projectsAPI.deleteMemberContract(r.projectId, userId, r.contractIndex);
      sweetAlert.success("Contrato eliminado", "El contrato fue eliminado.");
      load();
    } catch {
      sweetAlert.error("Error", "No se pudo eliminar el contrato.");
    }
  };

  // Opciones de filtro derivadas de los contratos
  const clientes = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => r.clientId && m.set(r.clientId, r.clientName || r.clientId));
    return [...m].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const proyectos = useMemo(() => {
    const m = new Map<string, string>();
    rows.filter((r) => fCliente === "all" || r.clientId === fCliente).forEach((r) => r.projectId && m.set(r.projectId, r.projectName || r.projectId));
    return [...m].map(([id, name]) => ({ id, name }));
  }, [rows, fCliente]);

  const tipos = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.contract?.nombre_contrato && s.add(r.contract.nombre_contrato));
    return [...s];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fCliente !== "all" && r.clientId !== fCliente) return false;
      if (fProyecto !== "all" && r.projectId !== fProyecto) return false;
      if (fTipo !== "all" && r.contract?.nombre_contrato !== fTipo) return false;
      if (fVigencia !== "all") {
        const vig = isContractVigente(r.contract?.fecha_baja_contrato);
        if (fVigencia === "vigente" && !vig) return false;
        if (fVigencia === "no_vigente" && vig) return false;
      }
      if ((fDesde || fHasta) && !inRange(r.contract?.fecha_alta_contrato, fDesde, fHasta)) return false;
      return true;
    });
  }, [rows, fCliente, fProyecto, fTipo, fVigencia, fDesde, fHasta]);

  // El "último contrato" de cada proyecto es el de mayor índice en su UserProject: es el que se ve en la
  // fila de la tabla del equipo, y se resalta igual que en el modal de Gestionar equipo.
  const lastIndexByProject = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const cur = m.get(r.projectId);
      if (cur == null || r.contractIndex > cur) m.set(r.projectId, r.contractIndex);
    });
    return m;
  }, [rows]);

  const anyFilter = fCliente !== "all" || fProyecto !== "all" || fTipo !== "all" || fVigencia !== "all" || !!fDesde || !!fHasta;
  const clearAll = () => {
    setFCliente("all");
    setFProyecto("all");
    setFTipo("all");
    setFVigencia("all");
    setFDesde("");
    setFHasta("");
  };

  const handleDownloadContract = async (r: ManagedContract, empresaId?: string) => {
    const template = findTemplate(r.contract, contratoFrames);
    if (!templateHasContent(template)) {
      sweetAlert.error("Sin contenido", "La plantilla de este tipo de contrato todavía no tiene contenido redactado.");
      return;
    }
    if (!userId) return;
    const fileName = buildDownloadFileName("Contrato", userLike, r.contract);
    try {
      await contratoFrameAPI.downloadFilled(template as ContratoFrameItem, { userId, projectId: r.projectId, contractIndex: r.contractIndex, empresaId }, fileName);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el contrato.");
    }
  };

  const handleDownloadRelease = async (r: ManagedContract, release: Release, empresaId?: string) => {
    if (!userId) return;
    const fileName = buildDownloadFileName("Release", userLike, r.contract, release.name);
    try {
      await releasesAPI.downloadFilled(release, { userId, projectId: r.projectId, contractIndex: r.contractIndex, empresaId }, fileName);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el release.");
    }
  };

  const selectCls = "text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-gray-700 dark:text-gray-200";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={userName || "Empleado"} subtitle="Gestión de contratos (todos los proyectos)" size="lg" zIndex={60}>
      <div className="space-y-4">
        {/* Filtros */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            <FontAwesomeIcon icon={faFilter} className="h-3 w-3" /> Filtros
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className={selectCls} value={fCliente} onChange={(e) => { setFCliente(e.target.value); setFProyecto("all"); }}>
              <option value="all">Cliente: todos</option>
              {clientes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <select className={selectCls} value={fProyecto} onChange={(e) => setFProyecto(e.target.value)}>
              <option value="all">Proyecto: todos</option>
              {proyectos.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            <select className={selectCls} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
              <option value="all">Tipo: todos</option>
              {tipos.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
            <select className={selectCls} value={fVigencia} onChange={(e) => setFVigencia(e.target.value as any)}>
              <option value="all">Vigencia: todas</option>
              <option value="vigente">Vigente</option>
              <option value="no_vigente">No vigente</option>
            </select>
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">Desde<input type="date" className={selectCls} value={fDesde} onChange={(e) => setFDesde(e.target.value)} /></label>
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">Hasta<input type="date" className={selectCls} value={fHasta} onChange={(e) => setFHasta(e.target.value)} /></label>
            {anyFilter && (
              <button type="button" onClick={clearAll} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline">
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" /> Limpiar
              </button>
            )}
          </div>
        </div>

        {/* Pestaña Contratos (mismo header que el modal de contratos del proyecto) */}
        <div className="flex items-end justify-between border-b border-gray-200 dark:border-gray-700">
          <span className="inline-flex items-center gap-2 px-1 pb-2 text-sm font-semibold text-blue-600 dark:text-blue-400 border-b-2 border-blue-500">
            <FontAwesomeIcon icon={faFileContract} className="h-4 w-4" />
            Contratos
          </span>
          <span className="pb-2 text-xs text-gray-500">{filtered.length} de {rows.length}</span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Cargando contratos…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
            <FontAwesomeIcon icon={faFileLines} className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500">{rows.length === 0 ? "Esta persona no tiene contratos." : "Ningún contrato coincide con los filtros."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r, idx) => (
              <ContractCard
                key={`${r.projectId}-${r.contractIndex}-${idx}`}
                contract={r.contract}
                contratoFrames={contratoFrames}
                activeReleases={activeReleases}
                contratoEmpresas={r.contratoEmpresas}
                releaseEmpresas={r.releaseEmpresas}
                isLatest={lastIndexByProject.get(r.projectId) === r.contractIndex}
                extraBadges={
                  <>
                    {r.clientName && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{r.clientName}</span>}
                    {r.projectName && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{r.projectName}</span>}
                  </>
                }
                onEdit={() => handleEdit(r)}
                onDelete={() => handleDelete(r)}
                editTitle="Editar contrato (ir al equipo del proyecto)"
                deleteTitle="Eliminar este contrato"
                onDownloadContract={(empresaId) => handleDownloadContract(r, empresaId)}
                onDownloadRelease={(release, empresaId) => handleDownloadRelease(r, release, empresaId)}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MemberContractsManagerModal;
