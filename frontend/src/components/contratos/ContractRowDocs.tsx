import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf, faUpload, faDownload, faSpinner, faLock, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { ContractOverviewRow, Contract } from "../../api/users";
import { ContratoFrameItem, contratoFrameAPI } from "../../api/contratosFrame";
import { InfoItem } from "../../api/info";
import { Release, releasesAPI } from "../../api/release";
import { projectsAPI } from "../../api/projects";
import { afipAPI } from "../../api/afip";
import { estadoImpositivoDelContrato, findTemplate, templateHasContent, DownloadMenu } from "../team/ContractCard";
import { getImageUrl, downloadFileFromUrl } from "../../utils/imageHelpers";
import { sweetAlert } from "../../utils/sweetAlert";
import { AccionesConstanciaArchivada } from "./ConstanciaBulk";

/* --------- Handlers de descarga/subida compartidos (tabla Contratos + Gestión de Contratos) --------- */


export const downloadContractRow = async (record: ContractOverviewRow, contratoFrames: ContratoFrameItem[], empresaId?: string) => {
  const template = findTemplate(record as unknown as Contract, contratoFrames);
  if (!templateHasContent(template)) {
    sweetAlert.error("Sin contenido", "La plantilla de este tipo de contrato todavía no tiene contenido redactado.");
    return;
  }
  try {
    await contratoFrameAPI.downloadFilled(template as ContratoFrameItem, { userId: record.userId, projectId: record.projectId, contractIndex: record.contractIndex, empresaId });
  } catch {
    sweetAlert.error("Error", "No se pudo descargar el contrato.");
  }
};

export const downloadReleaseRow = async (record: ContractOverviewRow, release: Release, empresaId?: string) => {
  try {
    await releasesAPI.downloadFilled(release, { userId: record.userId, projectId: record.projectId, contractIndex: record.contractIndex, empresaId });
  } catch {
    sweetAlert.error("Error", "No se pudo descargar el release.");
  }
};

/** Sube el PDF de "Alta". El refetch de la lista queda a cargo del que llama (varía por pantalla). */
export const uploadAltaRow = async (record: ContractOverviewRow, file: File) => {
  await projectsAPI.uploadAltaDocumento(record.projectId, record.userId, record.contractIndex, file);
};

/* --------- UI: cabeceras y celdas --------- */

/** Las cabeceras de las columnas de documentos (mismo estilo que el resto de la tabla). */
export const ContractDocsHeaders: React.FC<{
  /** Si son false, se ocultan esas columnas (p. ej. en "Alta temprana de ARCA" confunden). */
  showContrato?: boolean;
  showRelease?: boolean;
  /** Texto de la primera columna. Por defecto genérico; en pantallas donde el trámite es siempre el mismo (p. ej. Constancia de CUIT) conviene pasar uno específico. */
  altaLabel?: string;
}> = ({ showContrato = true, showRelease = true, altaLabel = "Alta ARCA / Servicios" }) => (
  /*
    EL FONDO OPACO NO ES DECORACIÓN: estas celdas viven en un `<thead>` sticky.

    El `<thead>` ya declara `bg-gray-50 dark:bg-gray-900`, pero con `border-collapse: collapse` el
    navegador no pinta el fondo del thead ni del tr cuando están sticky — por eso en estas tablas
    TODAS las cabeceras repiten el color en el `<th>`. Estas tres se habían quedado sin él, así que
    al scrollear las filas se veían pasando por debajo del título.
  */
  <>
    <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900">{altaLabel}</th>
    {showContrato && <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900">Contrato | Empresa</th>}
    {showRelease && <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900">Release | Empresa</th>}
  </>
);

/**
 * Las tres celdas de documentos del contrato ACTIVO de la fila (mismo comportamiento que la tarjeta del
 * modal): "Alta ARCA/Servicios" (ver/subir), "Contrato | Empresa" y "Release | Empresa" (descargar,
 * con menú de empresa cuando el proyecto tiene más de una). Devuelve tres <td> para insertar en la fila.
 */
export const ContractDocsColumns: React.FC<{
  record: ContractOverviewRow;
  contratoFrames: ContratoFrameItem[];
  allEstados: InfoItem[];
  activeReleases: Release[];
  onDownloadContract: (record: ContractOverviewRow, empresaId?: string) => void;
  onDownloadRelease: (record: ContractOverviewRow, release: Release, empresaId?: string) => void;
  onUploadAlta: (record: ContractOverviewRow, file: File) => Promise<void>;
  /** Si es false, el documento de Alta no se puede subir desde acá (se muestra un candado). */
  canUploadAlta?: boolean;
  /** Si son false, se ocultan esas columnas (p. ej. en "Alta temprana de ARCA" confunden). */
  showContrato?: boolean;
  showRelease?: boolean;
  /** Oculta la etiqueta ("Alta ARCA"/"Alta Servicios") dentro de la celda, para no repetir lo que ya dice la cabecera de la columna. */
  hideAltaLabel?: boolean;
  /** Recargar la tabla después de borrar la constancia archivada. Sin esto no se ofrece el tacho. */
  onConstanciaEliminada?: () => void;
}> = ({
  record,
  contratoFrames,
  allEstados,
  activeReleases,
  onDownloadContract,
  onDownloadRelease,
  onUploadAlta,
  canUploadAlta = true,
  showContrato = true,
  showRelease = true,
  hideAltaLabel = false,
  onConstanciaEliminada,
}) => {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [abriendoConstancia, setAbriendoConstancia] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const asContract = record as unknown as Contract;
  const template = findTemplate(asContract, contratoFrames);
  const canDownloadContract = templateHasContent(template);
  const tipoContrato = record.nombre_contrato || template?.data?.nombre || template?.name || "Contrato";
  const estadoImpositivo = estadoImpositivoDelContrato(asContract, contratoFrames, allEstados);
  const tituloAlta = estadoImpositivo?.data?.etiquetaSecundaria?.trim() || (estadoImpositivo?.data?.tipoImpositivo === "alta_temprana_afip" ? "Alta ARCA" : "Documento de Servicios");
  // Constancia de CUIT ya no se satisface subiendo un PDF a mano: el "documento" es el JSON que
  // "Validar CUIT" archiva solo en Dropbox al confirmar el CUIT activo en ARCA (constanciaAfipDropboxSubidaAt).
  // altaDocumentoUrl queda como reliquia del flujo viejo — no cuenta más para este trámite.
  const esConstanciaCuit = estadoImpositivo?.data?.tipoImpositivo === "constancia_cuit";
  // Si el contrato requiere Alta (tiene estado impositivo) y todavía no se subió/archivó el documento,
  // se bloquea la descarga del Contrato y del Release hasta que se cargue.
  const requiereAlta = !!estadoImpositivo;
  const altaCargada = esConstanciaCuit ? !!record.constanciaAfipDropboxSubidaAt : !!record.altaDocumentoUrl;
  const descargaBloqueada = requiereAlta && !altaCargada;
  const tituloBloqueo = esConstanciaCuit ? "Validá el CUIT en ARCA (pestaña Constancia de CUIT) para poder descargar" : `Subí primero el documento de ${tituloAlta} para poder descargar`;

  // Empresa efectiva: si el contrato tiene una fija guardada, esa sola; si no, las del proyecto.
  const savedContratoEmpresaId = record.empresaContratoId || "";
  const contratoEmpresas = record.contratoEmpresas || [];
  const savedContratoEmpresaLabel = record.nombre_empresa_contrato || contratoEmpresas.find((e) => e.id === savedContratoEmpresaId)?.label || savedContratoEmpresaId;
  const effectiveContratoEmpresas = savedContratoEmpresaId ? [{ id: savedContratoEmpresaId, label: savedContratoEmpresaLabel }] : contratoEmpresas;

  const savedReleaseEmpresaId = record.empresaReleaseId || "";
  const releaseEmpresas = record.releaseEmpresas || [];
  const savedReleaseEmpresaLabel = record.nombre_empresa_release || releaseEmpresas.find((e) => e.id === savedReleaseEmpresaId)?.label || savedReleaseEmpresaId;
  const effectiveReleaseEmpresas = savedReleaseEmpresaId ? [{ id: savedReleaseEmpresaId, label: savedReleaseEmpresaLabel }] : releaseEmpresas;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      sweetAlert.error("Formato no válido", "Solo se permiten archivos PDF.");
      return;
    }
    if (record.altaDocumentoUrl) {
      const confirm = await sweetAlert.confirm("Reemplazar documento", `Ya hay un documento cargado (${record.altaDocumentoNombre || tituloAlta}). Si continuás, se reemplazará por el nuevo archivo.`, "Sí, reemplazar", "Cancelar");
      if (!confirm.isConfirmed) return;
    }
    try {
      setUploading(true);
      await onUploadAlta(record, file);
    } catch {
      sweetAlert.error("Error", "No se pudo subir el documento.");
    } finally {
      setUploading(false);
    }
  };

  /** Pide un link temporal (Dropbox lo vence a las pocas horas, por eso se pide al vuelo) y lo abre
   *  en una pestaña nueva — la "vista del archivo" real en Dropbox, no una copia nuestra. */
  const handleVerConstancia = async () => {
    setAbriendoConstancia(true);
    try {
      const url = await afipAPI.constanciaLink({ projectId: record.projectId, userId: record.userId, contractIndex: record.contractIndex });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo abrir la constancia en Dropbox.");
    } finally {
      setAbriendoConstancia(false);
    }
  };

  const handleDownloadAlta = async () => {
    if (!record.altaDocumentoUrl) return;
    try {
      setDownloading(true);
      await downloadFileFromUrl(record.altaDocumentoUrl, record.altaDocumentoNombre || `${tituloAlta}.pdf`);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el documento.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      {/* Alta ARCA / Servicios: ver o subir el PDF (solo si el contrato tiene un estado impositivo). */}
      <td className="px-4 py-3" onClick={stop}>
        {estadoImpositivo ? (
          <div className="flex flex-col gap-1 min-w-[160px]">
            {!hideAltaLabel && <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{tituloAlta}</span>}
            <div className="flex items-center gap-2">
              {esConstanciaCuit ? (
                altaCargada ? (
                  <>
                    <button
                      type="button"
                      onClick={handleVerConstancia}
                      disabled={abriendoConstancia}
                      title="Ver el archivo en Dropbox"
                      className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5 min-w-0 hover:underline disabled:opacity-50 disabled:cursor-wait"
                    >
                      <FontAwesomeIcon icon={abriendoConstancia ? faSpinner : faFilePdf} spin={abriendoConstancia} className="h-4 w-4 text-violet-600 shrink-0" />
                      Archivado en Dropbox
                    </button>
                    {/* Las acciones del archivo, pegadas al archivo. Sin `onConstanciaEliminada` sale
                        solo el ⓘ: borrar exige que la tabla sepa recargarse, o queda mostrando algo
                        que ya no existe. */}
                    <AccionesConstanciaArchivada row={record} onEliminado={onConstanciaEliminada} />
                  </>
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 shrink-0" />
                    Sin documento
                  </span>
                )
              ) : record.altaDocumentoUrl ? (
                <a href={getImageUrl(record.altaDocumentoUrl)} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5 min-w-0 hover:underline" title={record.altaDocumentoNombre || tituloAlta}>
                  <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
                  <span className="truncate max-w-[110px]">{record.altaDocumentoNombre || "Ver documento"}</span>
                </a>
              ) : (
                <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 shrink-0" />
                  Sin documento
                </span>
              )}
              {!esConstanciaCuit && record.altaDocumentoUrl && (
                <button type="button" onClick={handleDownloadAlta} disabled={downloading} title="Descargar documento" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                  <FontAwesomeIcon icon={downloading ? faSpinner : faDownload} spin={downloading} className="h-4 w-4" />
                </button>
              )}
              {esConstanciaCuit ? null : canUploadAlta ? (
                <>
                  <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} title={record.altaDocumentoUrl ? "Reemplazar documento" : "Subir PDF"} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                    <FontAwesomeIcon icon={uploading ? faSpinner : faUpload} spin={uploading} className="h-4 w-4" />
                  </button>
                  <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFile} />
                </>
              ) : (
                <span className="p-1.5 text-gray-300 dark:text-gray-600 cursor-not-allowed shrink-0" title="La carga del documento de Alta se hace desde Gestión de Contratos">
                  <FontAwesomeIcon icon={faLock} className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>

      {/* Contrato | Empresa: nombre + empresa(s) + descarga (menú si hay más de una empresa). */}
      {showContrato && (
        <td className="px-4 py-3" onClick={stop}>
          <div className="flex items-center justify-between gap-2 min-w-[220px]">
            <span className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5 flex-wrap min-w-0" title={tipoContrato}>
              <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
              <span className="truncate max-w-[130px]">{tipoContrato}</span>
              {effectiveContratoEmpresas.map((emp) => (
                <span key={emp.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800/50 shrink-0 whitespace-nowrap">
                  {emp.label}
                </span>
              ))}
            </span>
            {descargaBloqueada ? (
              <span className="p-1.5 text-gray-300 dark:text-gray-600 cursor-not-allowed shrink-0" title={tituloBloqueo}>
                <FontAwesomeIcon icon={faLock} className="h-3.5 w-3.5" />
              </span>
            ) : canDownloadContract ? (
              <DownloadMenu empresas={effectiveContratoEmpresas} onDownload={(empresaId) => onDownloadContract(record, empresaId)} title="Descargar contrato" />
            ) : (
              <span className="text-xs text-gray-400 shrink-0" title="La plantilla de este tipo de contrato no tiene contenido redactado">Sin contenido</span>
            )}
          </div>
        </td>
      )}

      {/* Release | Empresa: por cada release activo, nombre + empresa(s) + descarga. */}
      {showRelease && (
        <td className="px-4 py-3" onClick={stop}>
          {activeReleases.length === 0 ? (
            <span className="text-xs text-gray-400">—</span>
          ) : (
            <div className="flex flex-col gap-1.5 min-w-[220px]">
              {activeReleases.map((r) => (
                <div key={r._id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-1.5 flex-wrap min-w-0" title={r.name}>
                    <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
                    <span className="truncate max-w-[130px]">{r.name}</span>
                    {effectiveReleaseEmpresas.map((emp) => (
                      <span key={emp.id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 border border-teal-100 dark:border-teal-800/50 shrink-0 whitespace-nowrap">
                        {emp.label}
                      </span>
                    ))}
                  </span>
                  {descargaBloqueada ? (
                    <span className="p-1.5 text-gray-300 dark:text-gray-600 cursor-not-allowed shrink-0" title={tituloBloqueo}>
                      <FontAwesomeIcon icon={faLock} className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <DownloadMenu empresas={effectiveReleaseEmpresas} onDownload={(empresaId) => onDownloadRelease(record, r, empresaId)} title="Descargar release" />
                  )}
                </div>
              ))}
            </div>
          )}
        </td>
      )}
    </>
  );
};

/* --------- Acciones de la fila: editar / eliminar ESE contrato --------- */

/** Cabecera de la columna de acciones (misma que la tabla de Contratos). */
/** El fondo opaco, por lo mismo que en `ContractDocsHeaders`: es la última celda de un thead sticky. */
export const ContractActionsHeader: React.FC = () => <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right whitespace-nowrap bg-gray-50 dark:bg-gray-900">Acciones</th>;

/**
 * Editar y eliminar el contrato de la fila, con el mismo comportamiento que la tabla de Contratos:
 * editar abre el equipo del proyecto con el wizard precargado en ese contrato, y eliminar borra solo
 * ese contrato (por índice), no a la persona del proyecto.
 */
export const ContractActionsButtons: React.FC<{ record: ContractOverviewRow; onDeleted: () => void }> = ({ record, onDeleted }) => {
  const navigate = useNavigate();
  const [borrando, setBorrando] = useState(false);

  const editar = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/projects/${record.projectId}/team`, { state: { openWizardFor: { userId: record.userId, contractIndex: record.contractIndex } } });
  };

  const eliminar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await sweetAlert.confirm("¿Eliminar contrato?", `Se eliminará este contrato de "${record.projectName}". Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!res.isConfirmed) return;
    try {
      setBorrando(true);
      await projectsAPI.deleteMemberContract(record.projectId, record.userId, record.contractIndex);
      sweetAlert.success("Contrato eliminado", "El contrato fue eliminado.");
      onDeleted();
    } catch {
      sweetAlert.error("Error", "No se pudo eliminar el contrato.");
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <button type="button" onClick={editar} title="Editar este contrato" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
        <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
      </button>
      <button type="button" onClick={eliminar} disabled={borrando} title="Eliminar este contrato" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
        <FontAwesomeIcon icon={borrando ? faSpinner : faTrash} spin={borrando} className="h-4 w-4" />
      </button>
    </div>
  );
};

/** Los mismos botones como celda de tabla. */
export const ContractActionsCell: React.FC<{ record: ContractOverviewRow; onDeleted: () => void }> = ({ record, onDeleted }) => (
  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
    <ContractActionsButtons record={record} onDeleted={onDeleted} />
  </td>
);
