import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faFileWord, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { renderAsync } from "docx-preview";

import { Modal } from "../ui/Modal";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { contratoFrameAPI, ContratoFrameItem } from "../../api/contratosFrame";

interface ContratoViewerModalProps {
  contrato: ContratoFrameItem | null;
  isOpen: boolean;
  onClose: () => void;
}

type FileKind = "pdf" | "docx" | "other";

const getFileKind = (fileName?: string): FileKind => {
  const ext = (fileName || "").split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  return "other";
};

export function ContratoViewerModal({ contrato, isOpen, onClose }: ContratoViewerModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const fileName = contrato?.data?.fileName;
  const kind = getFileKind(fileName);

  useEffect(() => {
    if (!isOpen || !contrato) return;

    let revokedUrl: string | null = null;
    let cancelled = false;

    const load = async () => {
      // .doc viejo u otros formatos: no se previsualizan
      if (kind === "other") return;

      try {
        setLoading(true);
        setError(null);
        const blob = await contratoFrameAPI.getFileBlob(contrato);
        if (cancelled) return;

        if (kind === "pdf") {
          const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
          revokedUrl = url;
          setPdfUrl(url);
        } else if (kind === "docx") {
          if (docxContainerRef.current) {
            docxContainerRef.current.innerHTML = "";
            await renderAsync(blob, docxContainerRef.current, undefined, {
              className: "docx",
              inWrapper: true,
              ignoreWidth: false,
              ignoreHeight: false,
            });
          }
        }
      } catch (e) {
        if (!cancelled) setError("No se pudo cargar la previsualización del archivo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
      setPdfUrl(null);
      if (docxContainerRef.current) docxContainerRef.current.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contrato?._id]);

  const handleDownload = () => {
    if (contrato) contratoFrameAPI.download(contrato).catch(() => {});
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={contrato ? `${contrato.name}` : "Visualizar archivo"}
      subtitle={fileName}
      size="full"
      zIndex={60}
      footer={
        <div className="flex justify-end w-full">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
          >
            <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
            Descargar
          </button>
        </div>
      }
    >
      <div className="h-full min-h-[60vh]">
        {loading && (
          <div className="flex justify-center items-center py-20">
            <LoadingSpinner message="Cargando archivo..." />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-10 w-10 text-amber-500" />
            <p className="text-sm text-gray-600 dark:text-gray-300">{error}</p>
            <button type="button" onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
              <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
              Descargar archivo
            </button>
          </div>
        )}

        {!loading && !error && kind === "other" && (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <FontAwesomeIcon icon={faFileWord} className="h-10 w-10 text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Este formato no se puede previsualizar{fileName ? ` (${fileName.split(".").pop()?.toUpperCase()})` : ""}. Descargá el archivo para verlo.
            </p>
            <button type="button" onClick={handleDownload} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
              <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
              Descargar archivo
            </button>
          </div>
        )}

        {/* PDF */}
        {!loading && !error && kind === "pdf" && pdfUrl && <iframe title="Visor PDF" src={pdfUrl} className="w-full h-[78svh] rounded-md border border-gray-200 dark:border-gray-700 bg-white" />}

        {/* DOCX */}
        {!error && kind === "docx" && <div ref={docxContainerRef} className={`overflow-auto ${loading ? "hidden" : ""} max-h-[78svh] bg-gray-100 dark:bg-gray-200 rounded-md p-2`} />}
      </div>
    </Modal>
  );
}
