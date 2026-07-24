import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faDownload, faEdit, faTrash, faFileLines, faArrowUpRightFromSquare, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { InfoModal } from "../ui/InfoModal";
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
  // Fechas "YYYY-MM-DD" (o ISO): armar DD/MM/YYYY con la parte de fecha tal cual, sin new Date().
  // new Date("2026-03-17") se interpreta como UTC medianoche y en AR (UTC-3) retrocede al día anterior.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("es-AR");
};

/** Busca la plantilla de contrato (ContratoFrame) que corresponde al contrato. */
const findTemplate = (contract: Contract, contratoFrames: ContratoFrameItem[]): ContratoFrameItem | null => {
  // El nombre es la clave confiable: el wizard guarda el nombre exacto de la contratos-frame.
  const name = (contract.nombre_contrato || "").trim().toLowerCase();
  if (name) {
    const byName = contratoFrames.find((cf) => (cf.data?.nombre || cf.name || "").trim().toLowerCase() === name);
    if (byName) return byName;
  }
  // Fallback por ID Externo, solo con ids válidos (> 0). El 0 es un sentinel de "sin id" y matchearía
  // cualquier contratos-frame con data.id 0 → descargaría un contrato equivocado.
  const tid = Number(contract.tipo_contrato_id);
  if (Number.isFinite(tid) && tid > 0) {
    const byId = contratoFrames.find((cf) => cf.data?.id != null && Number(cf.data.id) === tid);
    if (byId) return byId;
  }
  return null;
};

/**
 * El contrato se puede generar si la plantilla tiene contenido REAL redactado. El editor devuelve
 * "<p></p>" cuando está vacío (truthy como string), así que se mira el texto sin etiquetas.
 */
const templateHasContent = (cf: ContratoFrameItem | null): boolean =>
  !!cf?.content && cf.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

/**
 * Nomenclatura de descargas de contratos y releases:
 *   [proyecto]_[Contrato|Release]_[nombreDoc]_[YYYY_MM_DD]_[apellido]_[nombres].pdf
 * `docName` es opcional (para releases es el nombre del release). La fecha es la de la descarga.
 * Ambos (contratos y releases) se redactan en la plataforma y se generan en PDF.
 */
const buildDownloadFileName = (tipo: "Contrato" | "Release", user: User | null, contract: Contract | undefined, docName?: string): string => {
  const proyecto = (contract as any)?.proyecto_id ?? contract?.nombre_proyecto ?? "";
  const nombres = (user?.firstName || "").trim();
  const apellido = (user?.lastName || "").trim();
  const persona = [apellido, nombres].filter(Boolean).join("_");
  const d = new Date();
  const fecha = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}_${String(d.getDate()).padStart(2, "0")}`;
  const parts = [String(proyecto).trim(), tipo, (docName || "").trim(), fecha, persona].filter((p) => p && p.trim() !== "");
  const ext = "pdf";
  return `${parts.join("_").replace(/[\\/:*?"<>|]/g, "_")}.${ext}`;
};

export const EmployeeContractsModal: React.FC<EmployeeContractsModalProps> = ({ isOpen, onClose, user, projectId, contratoFrames, releases, contratoEmpresaLabel, releaseEmpresaLabel, onEdit, onDelete }) => {
  const fullName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "";
  const [showInexistenteInfo, setShowInexistenteInfo] = React.useState(false);

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
    if (!templateHasContent(template)) {
      sweetAlert.error("Sin contenido", "La plantilla de este tipo de contrato todavía no tiene contenido redactado.");
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
    <>
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
              const existeTemplate = !!template; // la plantilla existe en contratos-frame (aunque esté vacía)
              const canDownloadContract = templateHasContent(template);
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
                      {canDownloadContract ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadContract(contract, idx)}
                        title="Descargar contrato"
                        className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0"
                      >
                        <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                      </button>
                      ) : existeTemplate ? (
                        // La plantilla existe pero está vacía → redactarla en /contratos-frame.
                        <div className="flex items-center gap-2 shrink-0">
                          <Link
                            to={`/contratos-frame?edit=${template!._id}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                            title="Redactar el contenido de esta plantilla de contrato"
                          >
                            Sin contenido
                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
                          </Link>
                          <span className="p-1.5 text-gray-400 dark:text-gray-500 opacity-40 cursor-not-allowed" title="La plantilla de este tipo de contrato no tiene contenido redactado">
                            <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                          </span>
                        </div>
                      ) : (
                        // El tipo de contrato no existe como plantilla → info (qué hacer) + link a editar el miembro.
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setShowInexistenteInfo(true)}
                            className="text-red-500 hover:text-red-600 transition-colors"
                            title="Qué significa 'Contrato inexistente'"
                            aria-label="Información: contrato inexistente"
                          >
                            <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => user && onEdit(user)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline"
                            title="Editar el miembro para asignar un contrato existente"
                          >
                            Contrato inexistente
                            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
                          </button>
                        </div>
                      )}
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

    <InfoModal
      isOpen={showInexistenteInfo}
      onClose={() => setShowInexistenteInfo(false)}
      title="Contrato inexistente"
      subtitle="Qué significa y cómo resolverlo"
      size="sm"
      zIndex={100}
      actions={[{ label: "Entendido", onClick: () => setShowInexistenteInfo(false), variant: "primary" }]}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          El tipo de contrato de esta persona <strong>no existe como plantilla</strong> en Plantillas | Contratos,
          así que no se puede generar el PDF para enviar a firmar.
        </p>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Editá el miembro (el link <strong>"Contrato inexistente"</strong> abre <strong>Configurar Miembro</strong>) y
              elegí un <strong>tipo de contrato existente</strong> en el selector.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Si el tipo que necesitás no está en la lista, creá su plantilla en <strong>Plantillas | Contratos</strong> y volvé a asignarla.
            </span>
          </li>
        </ul>
      </div>
    </InfoModal>
    </>
  );
};
