import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClockRotateLeft, faFileContract, faFileLines, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { User, Contract, usersAPI } from "../../api/users";
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

  /*
    DE ENTRADA, SÓLO EL CONTRATO QUE RIGE.

    Este modal se abre desde la tabla de Gestionar Equipo, y esa tabla ya no trae el historial de nadie:
    traerlo para las 25 filas de una página eran 354 contratos completos, y era la mayor parte de lo que
    tardaba la pantalla en cargar. Cada fila viene con el contrato que rige, que es el que el modal
    muestra desplegado y el único que se mira casi siempre.

    El resto —el historial— se pide al tocar «Ver historial», para UNA persona, a
    `GET /users/:id/contracts`. Mientras no se pida, no viaja.

    Si el usuario llega con sus contratos adentro (la ficha completa, `GET /users/:id`), se usan esos
    y no se pide nada: el modal sigue sirviendo a quien lo abra con un usuario ya hidratado.
  */
  const [historial, setHistorial] = useState<Contract[] | null>(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  /** Documentos de alta subidos con el modal abierto: índice en la BD → campos nuevos del contrato. */
  const [altaSubida, setAltaSubida] = useState<Record<number, { altaDocumentoUrl?: string; altaDocumentoNombre?: string }>>({});

  /** Los contratos embebidos en el usuario, si los trajo (índice = posición en el array del UserProject). */
  const contratosEmbebidos = useMemo(() => {
    if (!user) return [] as Contract[];
    const projectMeta = user.metadata?.projects?.find((p) => {
      const pId = p.projectId;
      const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
      return String(idToCheck) === String(projectId);
    });
    return (projectMeta?.contracts || []) as Contract[];
  }, [user, projectId]);

  /**
   * Lo que se muestra, con la posición de cada contrato EN EL ARRAY DE LA BASE al lado: editar,
   * descargar y subir el alta van por índice, así que mostrar un contrato suelto no puede perderlo.
   */
  const conIndice = useMemo(() => {
    const conParche = (c: Contract, indiceBD: number) => ({ contrato: altaSubida[indiceBD] ? ({ ...c, ...altaSubida[indiceBD] } as Contract) : c, indiceBD });
    if (historial) return historial.map(conParche);
    if (contratosEmbebidos.length > 0) return contratosEmbebidos.map(conParche);
    const rige = user?.lastContract;
    return rige ? [conParche(rige, typeof user?.lastContractIndex === "number" ? user.lastContractIndex : -1)] : [];
  }, [historial, contratosEmbebidos, user, altaSubida]);

  /** Cuántos contratos tiene en total, aunque estén sin traer (lo cuenta el server). */
  const totalContratos = historial ? historial.length : contratosEmbebidos.length > 0 ? contratosEmbebidos.length : (user?.contractCount ?? conIndice.length);
  const faltaElHistorial = !historial && contratosEmbebidos.length === 0 && totalContratos > conIndice.length;

  const verHistorial = async () => {
    if (!user || cargandoHistorial) return;
    setCargandoHistorial(true);
    try {
      setHistorial(await usersAPI.contratosDelProyecto(user._id, projectId));
    } catch {
      sweetAlert.error("Error", "No se pudo traer el historial de contratos.");
    } finally {
      setCargandoHistorial(false);
    }
  };

  /** Los contratos en el orden de la base: sobre este orden se elige cuál rige. */
  const contratosEnBD = useMemo(() => conIndice.map((x) => x.contrato), [conIndice]);

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
  const indiceEnBD = (contract: Contract) => conIndice.find((x) => x.contrato === contract)?.indiceBD ?? -1;

  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);

  // Filtros: los mismos que la gestión cross-proyecto, sin cliente/proyecto (acá son fijos).
  const [filters, setFilters] = useState<ContractFilterState>(emptyContractFilters);
  useEffect(() => {
    if (!isOpen) return;
    setFilters(emptyContractFilters);
    // El historial es de una persona y un proyecto: si cambia cualquiera de los dos, se pide de nuevo.
    setHistorial(null);
    setAltaSubida({});
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
          <span className="pb-2 text-xs text-gray-500">{visible.length} de {totalContratos}</span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
            <FontAwesomeIcon icon={faFileLines} className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500">{totalContratos === 0 ? "Este empleado no tiene contratos en el proyecto." : "Ningún contrato coincide con los filtros."}</p>
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
                /* Se guarda el parche acá también: el modal ya no lee el array del usuario, así que el
                   documento recién subido no volvería solo. */
                onUploadAltaDocumento={
                  user && onUploadAltaDocumento
                    ? async (file) => {
                        const iBD = indiceEnBD(contract);
                        await onUploadAltaDocumento(user, iBD, file);
                        setAltaSubida((prev) => ({ ...prev, [iBD]: { altaDocumentoUrl: URL.createObjectURL(file), altaDocumentoNombre: file.name } }));
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {/* El historial no viaja con la tabla: se pide acá, para esta persona, y sólo si lo piden. */}
        {faltaElHistorial && (
          <button
            type="button"
            onClick={verHistorial}
            disabled={cargandoHistorial}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-60"
          >
            <FontAwesomeIcon icon={cargandoHistorial ? faSpinner : faClockRotateLeft} className={`h-4 w-4 ${cargandoHistorial ? "animate-spin" : ""}`} />
            {cargandoHistorial ? "Trayendo el historial…" : `Ver historial (${totalContratos - conIndice.length} contrato${totalContratos - conIndice.length === 1 ? "" : "s"} anterior${totalContratos - conIndice.length === 1 ? "" : "es"})`}
          </button>
        )}
      </div>
    </Modal>
  );
};
