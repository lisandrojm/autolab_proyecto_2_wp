import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { User, Contract } from "../../api/users";
import { contratoFrameAPI, ContratoFrameItem } from "../../api/contratosFrame";
import { releasesAPI, Release } from "../../api/release";
import { sweetAlert } from "../../utils/sweetAlert";
import { getContratoActivo, ordenarContratosDesc } from "../../utils/contratoVigencia";
import { ContractCard, EmpresaOption, findTemplate, templateHasContent } from "./ContractCard";
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

  /** Los contratos tal como están guardados en el UserProject: de acá salen los índices que se editan. */
  const contratosEnBD = useMemo(() => {
    if (!user) return [] as Contract[];
    const projectMeta = user.metadata?.projects?.find((p) => {
      const pId = p.projectId;
      const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
      return String(idToCheck) === String(projectId);
    });
    return (projectMeta?.contracts || []) as Contract[];
  }, [user, projectId]);

  // Del más reciente al más viejo: el último contrato arriba de todo.
  const contracts = useMemo(() => ordenarContratosDesc(contratosEnBD as any[]) as Contract[], [contratosEnBD]);

  /**
   * El contrato resaltado es el que RIGE hoy (el vigente más reciente), no el último cargado:
   * un tiempo indeterminado abierto puede tener detrás un contrato viejo ya vencido.
   *
   * Se elige sobre el orden de la BD y no sobre el de la pantalla: cuando varios contratos comparten
   * la fecha de alta, `getContratoActivo` se queda con el último que recorre, y ese tiene que ser el
   * último cargado (el que la lista muestra primero), no el primero.
   */
  const idxQueRige = useMemo(() => {
    const queRige = getContratoActivo(contratosEnBD as any[]);
    return queRige ? contracts.indexOf(queRige as any) : -1;
  }, [contratosEnBD, contracts]);

  /** Índice del contrato en el array del UserProject, que es el que esperan editar/descargar/subir. */
  const indiceEnBD = (contract: Contract) => contratosEnBD.indexOf(contract);

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

  const handleDownloadContract = async (contract: Contract, empresaId?: string) => {
    const template = findTemplate(contract, contratoFrames);
    if (!templateHasContent(template)) {
      sweetAlert.error("Sin contenido", "La plantilla de este tipo de contrato todavía no tiene contenido redactado.");
      return;
    }
    if (!user) return;
    const originalIndex = indiceEnBD(contract);
    try {
      await contratoFrameAPI.downloadFilled(template as ContratoFrameItem, { userId: user._id, projectId, contractIndex: originalIndex, empresaId });
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el contrato.");
    }
  };

  const handleDownloadRelease = async (release: Release, contract: Contract, empresaId?: string) => {
    if (!user) return;
    const originalIndex = indiceEnBD(contract);
    try {
      await releasesAPI.downloadFilled(release, { userId: user._id, projectId, contractIndex: originalIndex, empresaId });
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
                // El que rige va desplegado; el resto es historial y arranca plegado, para no tener
                // que scrollear cuatro tarjetas enteras hasta llegar al contrato que importa.
                colapsable={idx !== idxQueRige}
                onEdit={user ? () => onEdit(user, contract, indiceEnBD(contract)) : undefined}
                onDelete={user ? () => onDelete(user._id) : undefined}
                deleteTitle="Eliminar del proyecto"
                onDownloadContract={(empresaId) => handleDownloadContract(contract, empresaId)}
                onDownloadRelease={(release, empresaId) => handleDownloadRelease(release, contract, empresaId)}
                onUploadAltaDocumento={user && onUploadAltaDocumento ? (file) => onUploadAltaDocumento(user, indiceEnBD(contract), file) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
};
