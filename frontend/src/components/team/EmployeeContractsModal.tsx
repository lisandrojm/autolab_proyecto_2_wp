import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { User, Contract } from "../../api/users";
import { contratoFrameAPI, ContratoFrameItem } from "../../api/contratosFrame";
import { releasesAPI, Release } from "../../api/release";
import { sweetAlert } from "../../utils/sweetAlert";
import { getContratoActivo } from "../../utils/contratoVigencia";
import { ContractCard, EmpresaOption, findTemplate, templateHasContent, buildDownloadFileName } from "./ContractCard";
import { ContractFiltersBar, ContractFilterState, emptyContractFilters, matchesContractFilters } from "./ContractFilters";

// La UI de la tarjeta y sus helpers viven en ContractCard (compartidos con MemberContractsManagerModal).
// Se re-exportan para no romper los imports existentes (ContractsPage, etc.).
export type { EmpresaOption } from "./ContractCard";
export {
  DownloadMenu,
  ContractCard,
  formatMoney,
  formatDate,
  isContractVigente,
  findTemplate,
  templateHasContent,
  buildDownloadFileName,
} from "./ContractCard";

interface EmployeeContractsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  projectId: string;
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
  /** Empresas seteadas en el proyecto (contratoEmpresas / releaseEmpresas). Si hay varias, se elige al descargar. */
  contratoEmpresas?: EmpresaOption[];
  releaseEmpresas?: EmpresaOption[];
  /**
   * Abre el wizard de edición del miembro. Si se pasa `contract` + `contractIndex`, precarga y guarda
   * en ESE contrato (no en el último). `contractIndex` es el índice en el array original del UserProject.
   */
  onEdit: (user: User, contract?: Contract, contractIndex?: number) => void;
  onDelete: (userId: string) => void;
  /** Sube (o reemplaza) el PDF de "Alta ARCA"/"Alta Servicios" de un contrato puntual (por índice original). */
  onUploadAltaDocumento?: (user: User, contractIndex: number, file: File) => Promise<void>;
}

export const EmployeeContractsModal: React.FC<EmployeeContractsModalProps> = ({ isOpen, onClose, user, projectId, contratoFrames, releases, contratoEmpresas = [], releaseEmpresas = [], onEdit, onDelete, onUploadAltaDocumento }) => {
  const fullName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "";

  const contracts = useMemo(() => {
    if (!user) return [];
    const projectMeta = user.metadata?.projects?.find((p) => {
      const pId = p.projectId;
      const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
      return String(idToCheck) === String(projectId);
    });
    // más reciente primero
    return [...(projectMeta?.contracts || [])].reverse();
  }, [user, projectId]);

  /**
   * El contrato resaltado es el que RIGE hoy (el vigente más reciente), no el último cargado:
   * un tiempo indeterminado abierto puede tener detrás un contrato viejo ya vencido.
   */
  const idxQueRige = useMemo(() => {
    const queRige = getContratoActivo(contracts as any[]);
    return queRige ? contracts.indexOf(queRige as any) : -1;
  }, [contracts]);

  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);

  // Filtros: los mismos que la gestión cross-proyecto, sin cliente/proyecto (acá son fijos).
  const [filters, setFilters] = useState<ContractFilterState>(emptyContractFilters);
  useEffect(() => {
    if (isOpen) setFilters(emptyContractFilters);
  }, [isOpen, user?._id, projectId]);

  const tipos = useMemo(() => [...new Set(contracts.map((c) => c.nombre_contrato).filter((t): t is string => !!t))], [contracts]);

  // Se filtra conservando el índice de la tarjeta en la lista completa: de él dependen el índice original
  // en BD (edición/descarga) y el resaltado del último contrato.
  const visible = useMemo(
    () => contracts.map((contract, idx) => ({ contract, idx })).filter(({ contract, idx }) => matchesContractFilters(filters, { contract, isLatest: idx === idxQueRige })),
    [contracts, filters, idxQueRige],
  );

  const handleDownloadContract = async (contract: Contract, displayIndex: number, empresaId?: string) => {
    const template = findTemplate(contract, contratoFrames);
    if (!templateHasContent(template)) {
      sweetAlert.error("Sin contenido", "La plantilla de este tipo de contrato todavía no tiene contenido redactado.");
      return;
    }
    if (!user) return;
    // `contracts` está invertido para mostrar el más reciente primero → índice original en BD
    const originalIndex = contracts.length - 1 - displayIndex;
    const fileName = buildDownloadFileName("Contrato", user, contracts[displayIndex]);
    try {
      await contratoFrameAPI.downloadFilled(template as ContratoFrameItem, { userId: user._id, projectId, contractIndex: originalIndex, empresaId }, fileName);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el contrato.");
    }
  };

  const handleDownloadRelease = async (release: Release, displayIndex: number, empresaId?: string) => {
    if (!user) return;
    // `contracts` está invertido para mostrar el más reciente primero → índice original en BD
    const originalIndex = contracts.length - 1 - displayIndex;
    const fileName = buildDownloadFileName("Release", user, contracts[displayIndex], release.name);
    try {
      await releasesAPI.downloadFilled(release, { userId: user._id, projectId, contractIndex: originalIndex, empresaId }, fileName);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el release.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={fullName || "Empleado"} subtitle="Contratos en el proyecto" size="lg" zIndex={60}>
      <div className="space-y-4">
        <ContractFiltersBar value={filters} onChange={setFilters} tipos={tipos} />

        {/* Pestaña Contratos */}
        <div className="flex items-end justify-between border-b border-gray-200 dark:border-gray-700">
          <span className="inline-flex items-center gap-2 px-1 pb-2 text-sm font-semibold text-blue-600 dark:text-blue-400 border-b-2 border-blue-500">
            <FontAwesomeIcon icon={faFileContract} className="h-4 w-4" />
            Contratos
          </span>
          <span className="pb-2 text-xs text-gray-500">{visible.length} de {contracts.length}</span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
            <FontAwesomeIcon icon={faFileLines} className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500">{contracts.length === 0 ? "Este empleado no tiene contratos en el proyecto." : "Ningún contrato coincide con los filtros."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(({ contract, idx }) => (
              // Se resalta el contrato que RIGE hoy (tiempo indeterminado primero), que es el que
              // muestra la fila de la tabla del equipo — no necesariamente el último cargado.
              <ContractCard
                key={idx}
                contract={contract}
                contratoFrames={contratoFrames}
                activeReleases={activeReleases}
                contratoEmpresas={contratoEmpresas}
                releaseEmpresas={releaseEmpresas}
                isLatest={idx === idxQueRige}
                onEdit={user ? () => onEdit(user, contract, contracts.length - 1 - idx) : undefined}
                onDelete={user ? () => onDelete(user._id) : undefined}
                deleteTitle="Eliminar del proyecto"
                onDownloadContract={(empresaId) => handleDownloadContract(contract, idx, empresaId)}
                onDownloadRelease={(release, empresaId) => handleDownloadRelease(release, idx, empresaId)}
                onUploadAltaDocumento={user && onUploadAltaDocumento ? (file) => onUploadAltaDocumento(user, contracts.length - 1 - idx, file) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
