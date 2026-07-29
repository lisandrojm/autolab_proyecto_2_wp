import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { usersAPI, ManagedContract } from "../../api/users";
import { projectsAPI } from "../../api/projects";
import { companiesAPI } from "../../api/companies";
import { contratoFrameAPI, ContratoFrameItem } from "../../api/contratosFrame";
import { releasesAPI, Release } from "../../api/release";
import { sweetAlert } from "../../utils/sweetAlert";
import { ContractCard, EmpresaOption, findTemplate, templateHasContent, buildDownloadFileName } from "./ContractCard";
import { ContractFiltersBar, ContractFilterState, emptyContractFilters, matchesContractFilters } from "./ContractFilters";
import { getContratoActivo } from "../../utils/contratoVigencia";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  userName?: string;
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
}

/**
 * Gestión de TODOS los contratos de una persona (cross-proyecto/cliente): lista con formato de tarjetas,
 * filtros (cliente, proyecto, tipo, vigencia, rango de fechas) y descarga de contrato/release por tarjeta.
 */
export const MemberContractsManagerModal: React.FC<Props> = ({ isOpen, onClose, userId, userName, contratoFrames, releases }) => {
  const [rows, setRows] = useState<ManagedContract[]>([]);
  const [loading, setLoading] = useState(false);
  // Empresas del ABM: fallback para los proyectos que no tienen ninguna configurada (mismo criterio que
  // el modal de contratos del proyecto). Se resuelve acá y no solo en el backend para no depender de él.
  const [allEmpresas, setAllEmpresas] = useState<EmpresaOption[]>([]);

  const [filters, setFilters] = useState<ContractFilterState>(emptyContractFilters);

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
    setFilters(emptyContractFilters);
    load();
  }, [isOpen, userId, load]);

  useEffect(() => {
    if (!isOpen || allEmpresas.length > 0) return;
    companiesAPI
      .list()
      .then((cs) => setAllEmpresas(cs.map((c) => ({ id: c._id, label: c.razonSocial })).filter((e) => e.label)))
      .catch(() => setAllEmpresas([])); // sin permisos → se muestran solo las del proyecto
  }, [isOpen, allEmpresas.length]);

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
    rows.filter((r) => filters.cliente === "all" || r.clientId === filters.cliente).forEach((r) => r.projectId && m.set(r.projectId, r.projectName || r.projectId));
    return [...m].map(([id, name]) => ({ id, name }));
  }, [rows, filters.cliente]);

  const tipos = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.contract?.nombre_contrato && s.add(r.contract.nombre_contrato));
    return [...s];
  }, [rows]);

  // El contrato resaltado de cada proyecto es el que RIGE hoy (el vigente más reciente, que puede
  // ser un tiempo indeterminado con contratos vencidos cargados después), igual que la fila de la
  // tabla del equipo y que el modal de Gestionar equipo.
  const indiceQueRigePorProyecto = useMemo(() => {
    const porProyecto = new Map<string, ManagedContract[]>();
    rows.forEach((r) => {
      if (!porProyecto.has(r.projectId)) porProyecto.set(r.projectId, []);
      porProyecto.get(r.projectId)!.push(r);
    });

    const m = new Map<string, number>();
    porProyecto.forEach((filas, projectId) => {
      const ordenadas = [...filas].sort((a, b) => a.contractIndex - b.contractIndex);
      const queRige = getContratoActivo(ordenadas.map((f) => f.contract) as any[]);
      const fila = ordenadas.find((f) => f.contract === queRige);
      if (fila) m.set(projectId, fila.contractIndex);
    });
    return m;
  }, [rows]);

  const isLatest = (r: ManagedContract) => indiceQueRigePorProyecto.get(r.projectId) === r.contractIndex;

  const filtered = useMemo(
    () => rows.filter((r) => matchesContractFilters(filters, { contract: r.contract, clientId: r.clientId, projectId: r.projectId, isLatest: isLatest(r) })),
    [rows, filters, indiceQueRigePorProyecto],
  );

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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={userName || "Empleado"} subtitle="Gestión de contratos (todos los proyectos)" size="lg" zIndex={60}>
      <div className="space-y-4">
        <ContractFiltersBar value={filters} onChange={setFilters} clientes={clientes} proyectos={proyectos} tipos={tipos} />

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
                contratoEmpresas={r.contratoEmpresas.length > 0 ? r.contratoEmpresas : allEmpresas}
                releaseEmpresas={r.releaseEmpresas.length > 0 ? r.releaseEmpresas : allEmpresas}
                isLatest={isLatest(r)}
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
