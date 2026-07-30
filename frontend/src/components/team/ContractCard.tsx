import React from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faEdit, faTrash, faArrowUpRightFromSquare, faCircleInfo, faFilePdf, faFileSignature } from "@fortawesome/free-solid-svg-icons";
import { InfoModal } from "../ui/InfoModal";
import { User, Contract } from "../../api/users";
import { ContratoFrameItem } from "../../api/contratosFrame";
import { Release } from "../../api/release";
import { EstadoBadge } from "../EstadoSelect";

/** Empresa vinculada al proyecto (id + razón social) para elegir con cuál descargar. */
export interface EmpresaOption {
  id: string;
  label: string;
}

/**
 * Botón de descarga que, si el proyecto tiene más de una empresa, abre un menú para elegir con cuál
 * generar el documento. Con 0 o 1 empresa descarga directo (usando esa empresa o el fallback del backend).
 */
export const DownloadMenu: React.FC<{ empresas: EmpresaOption[]; onDownload: (empresaId?: string) => void; title: string }> = ({ empresas, onDownload, title }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (empresas.length <= 1) {
    return (
      <button
        type="button"
        onClick={() => onDownload(empresas[0]?.id)}
        title={title}
        className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0"
      >
        <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Elegir empresa para descargar"
        className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
      >
        <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
      </button>
      {open && (
        // Se abre hacia arriba: las tarjetas suelen quedar al pie del modal y el menú se cortaba.
        <div className="absolute right-0 bottom-full z-50 mb-1 w-56 max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">Descargar con:</p>
          {empresas.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setOpen(false);
                onDownload(e.id);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <span className="truncate">{e.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Badge "No se envía a firmar": reemplaza el botón de descarga cuando el Contrato/ReleaseTipo lo tiene destildado. */
const NoSeEnviaAFirmar: React.FC = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-50 text-gray-500 dark:bg-gray-700/30 dark:text-gray-400 border border-gray-200 dark:border-gray-700 shrink-0 whitespace-nowrap"
    title="Este documento no se envía a firmar"
  >
    <FontAwesomeIcon icon={faFileSignature} className="h-2.5 w-2.5" />
    No se envía a firmar
  </span>
);

export const formatMoney = (n?: number): string => (n != null && !isNaN(n) ? `$${Number(n).toLocaleString("es-AR")}` : "-");

export const formatDate = (s?: string): string => {
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

/** Un contrato está vigente si no tiene fecha de baja o su baja es hoy o futura (comparación en fecha local). */
export const isContractVigente = (baja?: string): boolean => {
  if (!baja) return true; // sin baja → tiempo indeterminado → vigente
  const iso = String(baja).substring(0, 10);
  const parts = iso.split("-");
  let bajaDate: Date | null = null;
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    bajaDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } else {
    const d = new Date(baja);
    if (!isNaN(d.getTime())) bajaDate = d;
  }
  if (!bajaDate) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  bajaDate.setHours(0, 0, 0, 0);
  return bajaDate.getTime() >= today.getTime();
};

/** Busca la plantilla de contrato (ContratoFrame) que corresponde al contrato. */
export const findTemplate = (contract: Contract, contratoFrames: ContratoFrameItem[]): ContratoFrameItem | null => {
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
export const templateHasContent = (cf: ContratoFrameItem | null): boolean =>
  !!cf?.content && cf.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;

/**
 * Nomenclatura de descargas de contratos y releases:
 *   [proyecto]_[Contrato|Release]_[nombreDoc]_[YYYY_MM_DD]_[apellido]_[nombres].pdf
 * `docName` es opcional (para releases es el nombre del release). La fecha es la de la descarga.
 * Ambos (contratos y releases) se redactan en la plataforma y se generan en PDF.
 */
export const buildDownloadFileName = (tipo: "Contrato" | "Release", user: User | null, contract: Contract | undefined, docName?: string): string => {
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

export interface ContractCardProps {
  contract: Contract;
  contratoFrames: ContratoFrameItem[];
  /** Releases ACTIVOS a ofrecer para descargar en la tarjeta. */
  activeReleases: Release[];
  /** Empresas del proyecto; si el contrato tiene una empresa fija guardada, esa tiene prioridad. */
  contratoEmpresas?: EmpresaOption[];
  releaseEmpresas?: EmpresaOption[];
  /** Resalta la tarjeta en azul y muestra el badge "Último contrato". */
  isLatest?: boolean;
  /** Badges extra antes de vigencia/estado (p. ej. cliente y proyecto en la vista cross-proyecto). */
  extraBadges?: React.ReactNode;
  /** Abre el editor del miembro precargado con ESTE contrato. También lo usa "Contrato inexistente". */
  onEdit?: () => void;
  onDelete?: () => void;
  editTitle?: string;
  deleteTitle?: string;
  onDownloadContract: (empresaId?: string) => void;
  onDownloadRelease: (release: Release, empresaId?: string) => void;
}

/**
 * Tarjeta de contrato compartida por el modal de contratos del proyecto (Gestionar equipo) y el de
 * gestión de contratos cross-proyecto: mismo layout, badges, bloques Contrato|Empresa y Release|Empresa.
 */
export const ContractCard: React.FC<ContractCardProps> = ({
  contract,
  contratoFrames,
  activeReleases,
  contratoEmpresas = [],
  releaseEmpresas = [],
  isLatest = false,
  extraBadges,
  onEdit,
  onDelete,
  editTitle = "Editar contrato",
  deleteTitle = "Eliminar",
  onDownloadContract,
  onDownloadRelease,
}) => {
  const [showInexistenteInfo, setShowInexistenteInfo] = React.useState(false);

  const cargo = contract.nombre_rol_frame || (contract as any).nombre_cargo || "Contrato";
  const template = findTemplate(contract, contratoFrames);
  const existeTemplate = !!template; // la plantilla existe en contratos-frame (aunque esté vacía)
  const canDownloadContract = templateHasContent(template);
  const tipoContrato = contract.nombre_contrato || template?.data?.nombre || template?.name || "Contrato";
  // Sin Contrato vinculado (aún no populado) se asume que sí se envía, para no ocultar la descarga de golpe.
  const contratoRequiereFirma = typeof template?.contratoId === "object" ? template.contratoId?.data?.requiereFirma !== false : true;

  // Empresa efectiva por-contrato: si el contrato tiene una empresa guardada, se usa SOLO esa
  // (descarga directa con ella); si no, se ofrecen todas las empresas del proyecto para elegir.
  const savedContratoEmpresaId = contract.empresaContratoId ? String(contract.empresaContratoId) : "";
  const savedContratoEmpresaLabel = contract.nombre_empresa_contrato || contratoEmpresas.find((e) => e.id === savedContratoEmpresaId)?.label || savedContratoEmpresaId;
  const effectiveContratoEmpresas: EmpresaOption[] = savedContratoEmpresaId ? [{ id: savedContratoEmpresaId, label: savedContratoEmpresaLabel }] : contratoEmpresas;

  const savedReleaseEmpresaId = contract.empresaReleaseId ? String(contract.empresaReleaseId) : "";
  const savedReleaseEmpresaLabel = contract.nombre_empresa_release || releaseEmpresas.find((e) => e.id === savedReleaseEmpresaId)?.label || savedReleaseEmpresaId;
  const effectiveReleaseEmpresas: EmpresaOption[] = savedReleaseEmpresaId ? [{ id: savedReleaseEmpresaId, label: savedReleaseEmpresaLabel }] : releaseEmpresas;

  const contratoEmpresa = effectiveContratoEmpresas.map((e) => e.label).join(" | ");
  const dateRange = `${formatDate(contract.fecha_alta_contrato)}${contract.fecha_baja_contrato ? ` - ${formatDate(contract.fecha_baja_contrato)}` : ""}`;
  const vigente = isContractVigente(contract.fecha_baja_contrato);
  const cardClass = isLatest
    ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
    : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40";
  const dividerClass = isLatest ? "border-blue-200/70 dark:border-blue-800/70" : "border-gray-200/70 dark:border-gray-700/70";

  return (
    <>
      <div className={`rounded-xl border ${cardClass} p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-lg font-bold text-gray-900 dark:text-white truncate">{cargo}</h4>
            {contract.nombre_contrato && <p className="text-sm text-gray-600 dark:text-gray-300">{contract.nombre_contrato}</p>}
          </div>
          {dateRange.trim() && <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap shrink-0">{dateRange}</span>}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {extraBadges}
          {isLatest && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              Último contrato
            </span>
          )}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold uppercase ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
            {vigente ? "Vigente" : "No vigente"}
          </span>
          {contract.nombre_estado_empleado && <EstadoBadge name={contract.nombre_estado_empleado} />}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-base font-semibold text-gray-900 dark:text-white">{formatMoney(contract.sueldo_mano)}</span>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button type="button" onClick={onEdit} title={editTitle} className="p-2 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={onDelete} title={deleteTitle} className="p-2 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Contrato: descarga con el nombre del tipo de contrato */}
        <div className={`mt-3 pt-3 border-t ${dividerClass}`}>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Contrato | Empresa</p>
          <div className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5">
            <span className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-1.5 flex-wrap min-w-0" title={contratoEmpresa ? `${tipoContrato} | ${contratoEmpresa}` : tipoContrato}>
              <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
              <span className="truncate">{tipoContrato}</span>
              {effectiveContratoEmpresas.map((emp) => (
                <span key={emp.id} className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 shrink-0" title={savedContratoEmpresaId ? "Empresa fija del contrato" : "Empresa del proyecto"}>
                  {emp.label}
                </span>
              ))}
            </span>
            {!contratoRequiereFirma ? (
              <NoSeEnviaAFirmar />
            ) : canDownloadContract ? (
              <DownloadMenu empresas={effectiveContratoEmpresas} onDownload={onDownloadContract} title="Descargar contrato" />
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
                  onClick={onEdit}
                  disabled={!onEdit}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 hover:underline disabled:no-underline disabled:cursor-default"
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
        <div className={`mt-3 pt-3 border-t ${dividerClass}`}>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Release | Empresa</p>
          {activeReleases.length === 0 ? (
            <p className="text-xs text-gray-500">No hay releases disponibles.</p>
          ) : (
            <div className="space-y-1.5">
              {activeReleases.map((r) => {
                const releaseEmpresa = effectiveReleaseEmpresas.map((e) => e.label).join(" | ");
                // Sin ReleaseTipo vinculado (aún no populado) se asume que sí se envía, para no ocultar la descarga de golpe.
                const releaseRequiereFirma = typeof r.releaseTipoId === "object" ? r.releaseTipoId?.requiereFirma !== false : true;
                return (
                  <div key={r._id} className="flex items-center justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5">
                    <span className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-1.5 flex-wrap min-w-0" title={releaseEmpresa ? `${r.name} | ${releaseEmpresa}` : r.name}>
                      <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
                      <span className="truncate">{r.name}</span>
                      {effectiveReleaseEmpresas.map((emp) => (
                        <span key={emp.id} className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-800/50 shrink-0" title={savedReleaseEmpresaId ? "Empresa fija del release" : "Empresa del proyecto"}>
                          {emp.label}
                        </span>
                      ))}
                    </span>
                    {releaseRequiereFirma ? (
                      <DownloadMenu empresas={effectiveReleaseEmpresas} onDownload={(empresaId) => onDownloadRelease(r, empresaId)} title="Descargar release" />
                    ) : (
                      <NoSeEnviaAFirmar />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

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

export default ContractCard;
