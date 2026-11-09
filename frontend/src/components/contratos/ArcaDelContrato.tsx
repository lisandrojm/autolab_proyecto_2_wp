import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilePdf, faFileCode, faSpinner } from "@fortawesome/free-solid-svg-icons";
import type { ContractOverviewRow } from "../../api/users";
import { afipAPI } from "../../api/afip";
import { getImageUrl } from "../../utils/imageHelpers";
import { sweetAlert } from "../../utils/sweetAlert";
import { ChipConstancia } from "./HistorialAltasArca";
import type { FilaConArca, SituacionArca } from "./situacionArca";

/* Las celdas de la columna «ARCA» y «Documentos» del padrón de Contratados. La regla, en `situacionArca.ts`. */

const fechaCorta = (iso: string) => (iso ? new Date(iso).toLocaleDateString("es-AR") : "");

/**
 * Lo que el tipo de contrato manda a generar y a firmar (09/11/2026: «hay una diferencia grande entre
 * Sin contrato porque no se generó o porque no lleva»). Mismo criterio que Generar Documentos.
 */
export interface DocumentosQueLleva {
  contrato: boolean;
  release: boolean;
  /** «Se envía a firmar el alta de ARCA» del tipo. */
  firmaAlta: boolean;
}

/** La celda «ARCA» del padrón: la situación y, debajo, el archivo que la prueba. */
export const CeldaArca: React.FC<{ r: FilaConArca; s: SituacionArca; lleva?: DocumentosQueLleva }> = ({ r, s, lleva }) => {
  const [abriendo, setAbriendo] = useState(false);
  if (!s.texto) return <span className="text-xs text-gray-300 dark:text-gray-600" title={s.titulo}>—</span>;

  /* El JSON del Padrón vive en Dropbox: el link vence a las pocas horas, por eso se pide al tocar. */
  const verJson = async () => {
    setAbriendo(true);
    try {
      const url = await afipAPI.constanciaLink({ projectId: r.projectId, userId: r.userId, contractIndex: r.contractIndex });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo abrir el JSON en Dropbox.");
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <span title={s.titulo} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit whitespace-nowrap ${s.clase}`}>
        {s.texto}
      </span>
      {s.fecha && <span className="text-[10px] text-gray-400">el {fechaCorta(s.fecha)}</span>}
      {/* Altas que no van a firma: su constancia se archiva y no se espera «Firmada». */}
      {lleva && !lleva.firmaAlta && (s.grupo === "con_alta" || s.grupo === "sin_alta" || s.grupo === "sin_confirmar") && (
        <span title="El tipo de contrato no manda el alta a firma: la constancia se archiva en «Alta temprana de Arca / No firmar»." className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">
          El alta no se firma
        </span>
      )}
      {/* Por dónde va la constancia: abre el documento en Documentos, en su carpeta de hoy. */}
      {r.constanciaArca && <ChipConstancia ciclo={r.constanciaArca} />}
      {r.altaDocumentoUrl && (
        <a href={getImageUrl(r.altaDocumentoUrl)} target="_blank" rel="noopener noreferrer" title={r.altaDocumentoNombre || "Constancia de alta"} className="inline-flex items-center gap-1 text-[11px] text-gray-700 dark:text-gray-200 hover:underline">
          <FontAwesomeIcon icon={faFilePdf} className="h-3.5 w-3.5 text-violet-600" />
          Constancia de alta
        </a>
      )}
      {s.grupo === "servicios" && r.constanciaAfipDropboxSubidaAt && (
        <button type="button" onClick={verJson} disabled={abriendo} title="Abrir en Dropbox el JSON del Padrón que confirma el CUIT" className="inline-flex items-center gap-1 text-[11px] text-gray-700 dark:text-gray-200 hover:underline disabled:opacity-50 disabled:cursor-wait">
          <FontAwesomeIcon icon={abriendo ? faSpinner : faFileCode} spin={abriendo} className="h-3.5 w-3.5 text-violet-600" />
          JSON del Padrón
        </button>
      )}
    </div>
  );
};

/**
 * La celda «Documentos»: el contrato y los releases generados. Lo que falta dice por qué: «No lleva»
 * (el tipo no lo genera) en gris, o «Sin generar» (lo lleva y todavía no está) en ámbar.
 */
export const CeldaDocumentosGenerados: React.FC<{ r: ContractOverviewRow; lleva?: DocumentosQueLleva }> = ({ r, lleva }) => {
  const releases = (r.firmaReleases || []).filter((x) => x.url);
  const link = (url: string, nombre: string, texto: string) => (
    <a key={url} href={getImageUrl(url)} target="_blank" rel="noopener noreferrer" title={nombre || texto} className="inline-flex items-center gap-1 text-[11px] text-gray-700 dark:text-gray-200 hover:underline whitespace-nowrap">
      <FontAwesomeIcon icon={faFilePdf} className="h-3.5 w-3.5 text-violet-600" />
      {texto}
    </a>
  );
  const falta = (doc: "contrato" | "release") =>
    lleva && !lleva[doc] ? (
      <span className="text-[11px] text-gray-400 dark:text-gray-500" title={`Este tipo de contrato no genera ${doc === "contrato" ? "el contrato" : "release"}`}>
        No lleva {doc}
      </span>
    ) : (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" title={`El tipo de contrato lo lleva y no se generó (Generar Documentos)`}>
        {doc === "contrato" ? "Contrato" : "Release"} sin generar
      </span>
    );
  return (
    <div className="flex flex-col items-start gap-1">
      {r.firmaContratoUrl ? link(r.firmaContratoUrl, r.firmaContratoNombre || "", "Contrato") : falta("contrato")}
      {releases.length > 0 ? releases.map((x) => link(x.url, x.nombre, releases.length > 1 ? x.nombre || "Release" : "Release")) : falta("release")}
    </div>
  );
};
