import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCircleInfo, faDownload, faFilePdf, faFolderOpen, faRotateRight, faSpinner, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { dropboxAPI, DropboxEntry } from "../../api/dropbox";
import { firmaDigitalAPI } from "../../api/firmaDigital";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { sweetAlert } from "../../utils/sweetAlert";

/** Dropbox Sign (ex HelloSign): donde se firman los contratos que se mandan desde acá. */
const DROPBOX_SIGN_URL = "https://www.dropbox.com/sign";

/** Nombre de la carpeta de Dropbox que alimenta cada bandeja (para el mensaje de "no se encontró"). */
const CARPETA_ESPERADA: Record<TipoBandejaDropbox, string> = {
  para_firmar: "Outbox",
  enviado_firma: "Pendbox",
  firmados: "Requested signatures",
};

const fmtTamanio = (bytes?: number): string => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const fmtFecha = (iso?: string): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export type TipoBandejaDropbox = "para_firmar" | "enviado_firma" | "firmados";

/**
 * Pestañas que muestran contratos que no viven en la base sino en carpetas de Dropbox. Son las tres
 * etapas del circuito de firma, en orden:
 *
 * 1. `para_firmar` — carpeta "Outbox": contratos generados, listos para IMPORTAR en Dropbox Sign y
 *    enviarlos a firmar desde ahí. Todavía no se envió nada.
 * 2. `enviado_firma` — carpeta "Pendbox": la solicitud YA se envió desde Dropbox Sign (se detecta
 *    por el mail de aviso, que es la única forma de saberlo) y ahora se espera la firma. El archivo
 *    llega acá moviéndose desde Outbox, así Outbox queda solo con lo no enviado y no se puede
 *    mandar dos veces por error.
 * 3. `firmados` — carpeta "Requested signatures": Dropbox Sign deja acá lo que ya volvió firmado.
 *
 * En las dos primeras no hay acciones sobre el archivo: el envío y la firma se hacen en Dropbox Sign.
 */
export const ContractDropboxTab: React.FC<{ tipo: TipoBandejaDropbox; onCount?: (n: number) => void }> = ({ tipo, onCount }) => {
  const [entries, setEntries] = useState<DropboxEntry[]>([]);
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  /** Explicación de cómo se importan los contratos desde Outbox (modal del ⓘ). */
  const [infoOpen, setInfoOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const cfg = await firmaDigitalAPI.config();
      const path = tipo === "para_firmar" ? cfg?.outboxCarpeta : tipo === "enviado_firma" ? cfg?.pendienteFirmaCarpeta : cfg?.firmadosCarpeta;
      setCarpeta(path || null);
      if (!path) {
        setEntries([]);
        return;
      }
      const res = await dropboxAPI.list(path, true);
      // Solo archivos: las subcarpetas que arma Dropbox Sign no son contratos.
      setEntries((res.entries || []).filter((e) => e.tag === "file"));
    } catch (e: any) {
      setEntries([]);
      setError(e?.response?.data?.error || e?.message || "No se pudo leer la carpeta de Dropbox.");
    } finally {
      setLoading(false);
    }
  }, [tipo]);

  useEffect(() => {
    load();
  }, [load]);

  const filtradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  }, [entries, filtro]);

  // El padre muestra la cantidad en la pestaña.
  useEffect(() => {
    onCount?.(entries.length);
  }, [entries.length, onCount]);

  const descargar = async (entry: DropboxEntry) => {
    setDescargando(entry.path);
    try {
      const url = await dropboxAPI.tempLink(entry.path, true);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo abrir el archivo.");
    } finally {
      setDescargando(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mismo patrón que "Cargar en ARCA": el botón, y al lado el ⓘ con la explicación. */}
      {tipo === "para_firmar" && (
        <div className="flex items-center justify-end gap-2">
          <a
            href={DROPBOX_SIGN_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir Dropbox Sign para firmar los contratos de Outbox"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0 whitespace-nowrap"
          >
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-4 w-4" />
            Ir a Dropbox Sign
          </a>
          <button type="button" onClick={() => setInfoOpen(true)} title="Cómo se importan los contratos desde Outbox" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
            <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
          </button>
        </div>
      )}

      {infoOpen && (
        <Modal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title="Cómo enviarlos a firmar" size="sm" zIndex={80}>
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              Lo que aparece en esta pestaña es lo que hay en la carpeta <strong>Outbox</strong> de Dropbox: contratos generados desde <strong>Firma digital</strong> que están <strong>listos para importar</strong> en
              Dropbox Sign. Todavía no se envió nada a firmar.
            </p>
            <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
              <li>Este botón abre Dropbox Sign en una pestaña nueva.</li>
              <li>
                Una vez ahí, importá los documentos desde la carpeta <strong>Outbox</strong>.
              </li>
              <li>Enviálos a firmar desde Dropbox Sign.</li>
              <li>
                Cuando vuelven firmados quedan en <strong>Requested signatures</strong> y pasan a verse en la pestaña <strong>Firmados</strong>.
              </li>
            </ol>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">El envío y la firma se hacen en Dropbox Sign, no en la aplicación: por eso acá no hay ninguna acción sobre los archivos.</p>
          </div>
        </Modal>
      )}

      <div className="flex items-center gap-3">
        <input
          type="text"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por nombre de archivo..."
          className="flex-1 px-4 py-2.5 rounded-lg text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <button type="button" onClick={() => load()} disabled={loading} title="Volver a leer la carpeta" className="px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
          <FontAwesomeIcon icon={loading ? faSpinner : faRotateRight} spin={loading} className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Leyendo la carpeta de Dropbox..." />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-8 w-8 text-red-500" />
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">No se pudo leer la carpeta</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">{error}</p>
          <button type="button" onClick={() => load()} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            Reintentar
          </button>
        </div>
      ) : !carpeta ? (
        <EmptyState
          icon={faFolderOpen}
          title={`No se encontró la carpeta "${CARPETA_ESPERADA[tipo]}"`}
          description={
            tipo === "enviado_firma"
              ? 'Esta carpeta hay que crearla a mano en Dropbox, con el nombre exacto "Pendbox", como hermana de "Outbox" dentro de la misma estructura de Dropbox Sign. Hasta que exista, esta bandeja queda vacía.'
              : "Revisá que la cuenta de Dropbox esté conectada y que la carpeta de Dropbox Sign exista con ese nombre (Documentos → Dropbox)."
          }
        />
      ) : filtradas.length === 0 ? (
        <EmptyState icon={faFilePdf} title={entries.length === 0 ? "No hay contratos en esta carpeta" : "Sin resultados"} description={entries.length === 0 ? carpeta : "Probá con otro texto en el filtro."} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar max-h-[640px]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Tamaño</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Modificado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtradas.map((e) => (
                  <tr key={e.path} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
                        <span className="truncate max-w-[520px]" title={e.name}>
                          {e.name}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtTamanio(e.size)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtFecha(e.serverModified)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end">
                        {/* En "Pendiente" la firma se completa en Dropbox Sign, así que acá no se ofrece
                            ninguna acción sobre el archivo: la única salida es el botón de arriba. */}
                        {tipo === "firmados" ? (
                          <button type="button" onClick={() => descargar(e)} disabled={descargando === e.path} title="Abrir el contrato firmado" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50">
                            <FontAwesomeIcon icon={descargando === e.path ? faSpinner : faDownload} spin={descargando === e.path} className="h-4 w-4" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">{tipo === "para_firmar" ? "Se importa desde Dropbox Sign" : "Esperando la firma"}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
