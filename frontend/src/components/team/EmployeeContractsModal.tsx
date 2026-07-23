import React, { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faDownload, faEdit, faTrash, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { User, Contract } from "../../api/users";
import { contratoFrameAPI, ContratoFrameItem } from "../../api/contratosFrame";
import { releasesAPI, Release } from "../../api/release";
import { sweetAlert } from "../../utils/sweetAlert";

interface EmployeeContractsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  projectId: string;
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
  /** Razón social de la empresa seteada en el proyecto (contratoEmpresa / releaseEmpresa). */
  contratoEmpresaLabel?: string;
  releaseEmpresaLabel?: string;
  onEdit: (user: User) => void;
  onDelete: (userId: string) => void;
}

const formatMoney = (n?: number): string => (n != null && !isNaN(n) ? `$${Number(n).toLocaleString("es-AR")}` : "-");

const formatDate = (s?: string): string => {
  if (!s) return "";
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-AR");
};

/** Busca la plantilla de contrato (ContratoFrame) que corresponde al contrato. */
const findTemplate = (contract: Contract, contratoFrames: ContratoFrameItem[]): ContratoFrameItem | null => {
  if (contract.tipo_contrato_id != null) {
    const byId = contratoFrames.find((cf) => String(cf.data?.id) === String(contract.tipo_contrato_id));
    if (byId) return byId;
  }
  const name = (contract.nombre_contrato || "").trim().toLowerCase();
  if (!name) return null;
  return contratoFrames.find((cf) => (cf.data?.nombre || cf.name || "").trim().toLowerCase() === name) || null;
};

const templateHasFile = (cf: ContratoFrameItem | null): boolean => !!(cf && (cf.data?.fileUrl || cf.data?.fileName || cf.data?.rutaArchivo));

/**
 * Nomenclatura de descargas de contratos y releases:
 *   [proyecto]_[Contrato|Release]_[nombreDoc]_[YYYY_MM_DD]_[apellido]_[nombres].docx
 * `docName` es opcional (para releases es el nombre del release). La fecha es la de la descarga.
 */
const buildDownloadFileName = (tipo: "Contrato" | "Release", user: User | null, contract: Contract | undefined, docName?: string): string => {
  const proyecto = (contract as any)?.proyecto_id ?? contract?.nombre_proyecto ?? "";
  const nombres = (user?.firstName || "").trim();
  const apellido = (user?.lastName || "").trim();
  const persona = [apellido, nombres].filter(Boolean).join("_");
  const d = new Date();
  const fecha = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}`;
  const parts = [String(proyecto).trim(), tipo, (docName || "").trim(), fecha, persona].filter((p) => p && p.trim() !== "");
  return `${parts.join("_").replace(/[\\/:*?"<>|]/g, "_")}.docx`;
};

export const EmployeeContractsModal: React.FC<EmployeeContractsModalProps> = ({ isOpen, onClose, user, projectId, contratoFrames, releases, contratoEmpresaLabel, releaseEmpresaLabel, onEdit, onDelete }) => {
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

  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);

  const handleDownloadContract = async (contract: Contract, displayIndex: number) => {
    const template = findTemplate(contract, contratoFrames);
    if (!templateHasFile(template)) {
      sweetAlert.error("Sin plantilla", "No hay una plantilla de contrato disponible para este tipo de contrato.");
      return;
    }
    if (!user) return;
    // `contracts` está invertido para mostrar el más reciente primero → índice original en BD
    const originalIndex = contracts.length - 1 - displayIndex;
    const fileName = buildDownloadFileName("Contrato", user, contracts[displayIndex]);
    try {
      await contratoFrameAPI.downloadFilled(template as ContratoFrameItem, { userId: user._id, projectId, contractIndex: originalIndex }, fileName);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el contrato.");
    }
  };

  const handleDownloadRelease = async (release: Release, displayIndex: number) => {
    if (!user) return;
    // `contracts` está invertido para mostrar el más reciente primero → índice original en BD
    const originalIndex = contracts.length - 1 - displayIndex;
    const fileName = buildDownloadFileName("Release", user, contracts[displayIndex], release.name);
    try {
      await releasesAPI.downloadFilled(release, { userId: user._id, projectId, contractIndex: originalIndex }, fileName);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el release.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={fullName || "Empleado"} subtitle="Contratos en el proyecto" size="lg" zIndex={60}>
      <div className="space-y-4">
        {/* Pestaña Contratos */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <span className="inline-flex items-center gap-2 px-1 pb-2 text-sm font-semibold text-blue-600 dark:text-blue-400 border-b-2 border-blue-500">
            <FontAwesomeIcon icon={faFileContract} className="h-4 w-4" />
            Contratos
          </span>
        </div>

        {contracts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
            <FontAwesomeIcon icon={faFileLines} className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500">Este empleado no tiene contratos en el proyecto.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {contracts.map((contract, idx) => {
              const cargo = contract.nombre_rol_frame || (contract as any).nombre_cargo || "Contrato";
              const template = findTemplate(contract, contratoFrames);
              const canDownloadContract = templateHasFile(template);
              const tipoContrato = contract.nombre_contrato || template?.data?.nombre || template?.name || "Contrato";
              const contratoEmpresa = contratoEmpresaLabel || "";
              const dateRange = `${formatDate(contract.fecha_alta_contrato)}${contract.fecha_baja_contrato ? ` - ${formatDate(contract.fecha_baja_contrato)}` : ""}`;

              return (
                <div key={idx} className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-lg font-bold text-gray-900 dark:text-white truncate">{cargo}</h4>
                      {contract.nombre_contrato && <p className="text-sm text-gray-600 dark:text-gray-300">{contract.nombre_contrato}</p>}
                    </div>
                    {dateRange.trim() && <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap shrink-0">{dateRange}</span>}
                  </div>

                  {contract.nombre_estado_empleado && (
                    <span className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-green-300 text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800">{contract.nombre_estado_empleado}</span>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-base font-semibold text-gray-900 dark:text-white">{formatMoney(contract.sueldo_mano)}</span>
                    <div className="flex items-center gap-1">
                      {user && (
                        <button type="button" onClick={() => onEdit(user)} title="Editar contrato" className="p-2 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                      )}
                      {user && (
                        <button type="button" onClick={() => onDelete(user._id)} title="Eliminar del proyecto" className="p-2 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Contrato: descarga con el nombre del tipo de contrato */}
                  <div className="mt-3 pt-3 border-t border-blue-200/70 dark:border-blue-800/70">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Contrato | Empresa</p>
                    <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5">
                      <span className="text-sm text-gray-700 dark:text-gray-200 truncate" title={contratoEmpresa ? `${tipoContrato} | ${contratoEmpresa}` : tipoContrato}>
                        {tipoContrato}
                        {contratoEmpresa && <span className="text-gray-500 dark:text-gray-400"> | {contratoEmpresa}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDownloadContract(contract, idx)}
                        disabled={!canDownloadContract}
                        title={canDownloadContract ? "Descargar contrato" : "No hay plantilla para este tipo de contrato"}
                        className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Releases: lista con descarga directa */}
                  <div className="mt-3 pt-3 border-t border-blue-200/70 dark:border-blue-800/70">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Release | Empresa</p>
                    {activeReleases.length === 0 ? (
                      <p className="text-xs text-gray-500">No hay releases disponibles.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {activeReleases.map((r) => {
                          const releaseEmpresa = releaseEmpresaLabel || "";
                          return (
                          <div key={r._id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5">
                            <span className="text-sm text-gray-700 dark:text-gray-200 truncate" title={releaseEmpresa ? `${r.name} | ${releaseEmpresa}` : r.name}>
                              {r.name}
                              {releaseEmpresa && <span className="text-gray-500 dark:text-gray-400"> | {releaseEmpresa}</span>}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDownloadRelease(r, idx)}
                              title="Descargar release"
                              className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0"
                            >
                              <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
};
