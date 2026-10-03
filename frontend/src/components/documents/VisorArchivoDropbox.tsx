import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faDownload, faCheck, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";

/*
  VER UN ARCHIVO DE DROPBOX SIN BAJARLO.

  Los `.json` de la carpeta Registros (lo que ARCA contestó al registrarse cada persona), los de DDBB y
  cualquier archivo de texto se leían bajándolos y abriéndolos con otra cosa. Acá se muestran en un
  modal, con el JSON indentado y coloreado, y con «Copiar» y «Descargar» a mano por si hace falta.

  El contenido llega del server ya RECORTADO si pesa más de lo que conviene meter en el DOM (ver
  `/dropbox/ver`). Un JSON recortado no se puede indentar —ya no es JSON válido—, así que se muestra tal
  cual, con el aviso; para verlo entero está la descarga.
*/

/** Extensiones que se abren acá en vez de bajarse. */
const EXTENSIONES_VISIBLES = ["json", "txt", "csv", "log", "md", "xml", "ndjson"];

export const esArchivoVisible = (nombre: string): boolean => EXTENSIONES_VISIBLES.includes(String(nombre).split(".").pop()?.toLowerCase() || "");

export interface ArchivoParaVer {
  nombre: string;
  contenido: string;
  bytes: number;
  recortado: boolean;
  limite: number;
  modificado?: string;
}

const formatearTamano = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);

/** JSON indentado, o null si no es JSON (o llegó recortado). */
const indentarJson = (texto: string): string | null => {
  try {
    return JSON.stringify(JSON.parse(texto), null, 2);
  } catch {
    return null;
  }
};

/*
  Coloreado mínimo de JSON, sin librería: claves, strings, números, booleanos/null y puntuación. Es
  un tokenizador por expresión regular sobre el texto YA indentado por `JSON.stringify`, que garantiza
  un formato predecible (una clave o un valor por línea).
*/
const TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

const colorear = (json: string): React.ReactNode[] => {
  const partes: React.ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of json.matchAll(TOKEN)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) partes.push(json.slice(ultimo, inicio));
    if (m[1] !== undefined) {
      if (m[2] !== undefined) {
        partes.push(
          <span key={i++} className="text-sky-700 dark:text-sky-300">
            {m[1]}
          </span>,
          m[2],
        );
      } else {
        partes.push(
          <span key={i++} className="text-emerald-700 dark:text-emerald-300">
            {m[1]}
          </span>,
        );
      }
    } else if (m[3] !== undefined) {
      partes.push(
        <span key={i++} className="text-amber-700 dark:text-amber-300">
          {m[3]}
        </span>,
      );
    } else if (m[4] !== undefined) {
      partes.push(
        <span key={i++} className="text-fuchsia-700 dark:text-fuchsia-300 font-semibold">
          {m[4]}
        </span>,
      );
    }
    ultimo = inicio + m[0].length;
  }
  if (ultimo < json.length) partes.push(json.slice(ultimo));
  return partes;
};

export const VisorArchivoDropbox: React.FC<{
  archivo: ArchivoParaVer | null;
  onClose: () => void;
  /** Baja el archivo entero (link temporal de Dropbox). */
  onDescargar?: () => void;
}> = ({ archivo, onClose, onDescargar }) => {
  const [copiado, setCopiado] = useState(false);
  const esJson = !!archivo && /\.(json|ndjson)$/i.test(archivo.nombre);
  const indentado = useMemo(() => (archivo && esJson && !archivo.recortado ? indentarJson(archivo.contenido) : null), [archivo, esJson]);
  const texto = indentado ?? archivo?.contenido ?? "";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* sin permiso de portapapeles: el texto se puede seleccionar a mano */
    }
  };

  return (
    <Modal
      isOpen={!!archivo}
      onClose={onClose}
      title={archivo?.nombre || ""}
      subtitle={archivo ? `${formatearTamano(archivo.bytes)}${archivo.modificado ? ` · modificado ${new Date(archivo.modificado).toLocaleString("es-AR")}` : ""}` : undefined}
      size="xl"
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="text-xs text-gray-500 flex items-center gap-2">
            {archivo?.recortado && (
              <>
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-amber-500" />
                Se muestran los primeros {formatearTamano(archivo.limite)}; para verlo entero, descargalo.
              </>
            )}
            {archivo && esJson && !archivo.recortado && indentado === null && (
              <>
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-amber-500" />
                El archivo no es un JSON válido: se muestra tal cual.
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={copiar} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-2">
              <FontAwesomeIcon icon={copiado ? faCheck : faCopy} /> {copiado ? "Copiado" : "Copiar"}
            </button>
            {onDescargar && (
              <button type="button" onClick={onDescargar} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-2">
                <FontAwesomeIcon icon={faDownload} /> Descargar
              </button>
            )}
          </div>
        </div>
      }
    >
      <pre className="max-h-[65vh] overflow-auto rounded bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 text-[12px] leading-relaxed font-mono text-gray-800 dark:text-gray-200 whitespace-pre">{indentado !== null ? colorear(indentado) : texto}</pre>
    </Modal>
  );
};
