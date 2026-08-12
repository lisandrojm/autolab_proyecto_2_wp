import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCircleInfo, faDownload, faFilePdf, faFileZipper, faFolderOpen, faPen, faRotateRight, faSpinner, faTrash, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
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
 * Cuenta los archivos de las 3 carpetas de Dropbox de una sola vez, para mostrar el número en las
 * pestañas apenas se entra a "Gestión de Contratos" (sin esperar a que el usuario abra cada una).
 * Cada carpeta que falle (sin config, sin conexión, etc.) cuenta como 0 en vez de tirar la página abajo.
 */
export const fetchDropboxCounts = async (): Promise<Record<TipoBandejaDropbox, number>> => {
  const cfg = await firmaDigitalAPI.config();
  const carpetas: Record<TipoBandejaDropbox, string | null | undefined> = {
    para_firmar: cfg?.outboxCarpeta,
    enviado_firma: cfg?.pendienteFirmaCarpeta,
    firmados: cfg?.firmadosCarpeta,
  };
  const tipos = Object.keys(carpetas) as TipoBandejaDropbox[];
  const counts = await Promise.all(
    tipos.map(async (tipo) => {
      const path = carpetas[tipo];
      if (!path) return 0;
      try {
        const res = await dropboxAPI.list(path, true);
        return (res.entries || []).filter((e) => e.tag === "file").length;
      } catch {
        return 0;
      }
    }),
  );
  return Object.fromEntries(tipos.map((tipo, i) => [tipo, counts[i]])) as Record<TipoBandejaDropbox, number>;
};

/**
 * Instructivo de cómo enviar a firmar en Dropbox Sign. Se muestra en dos lugares (el ⓘ del paso
 * "Para Firmar" del stepper y el ⓘ de la propia pestaña), así que vive acá para no duplicarlo.
 */
export const InstructivoParaFirmar: React.FC = () => (
          <div className="space-y-4">
            <p className="text-sm text-gray-700 dark:text-gray-200">
              Lo que aparece en esta pestaña es lo que hay en la carpeta <strong>Outbox</strong> de Dropbox: contratos ya generados y <strong>listos para importar</strong> en Dropbox Sign. Todavía no se
              envió nada a firmar.
            </p>

            <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2 list-decimal list-inside">
              <li>
                Entrá a Dropbox Sign (botón <strong>Ir a Dropbox Sign</strong>) y elegí <strong>Firmar documentos</strong>.
              </li>
              <li>
                En <em>Seleccionar documentos para firmar</em>, elegí el origen <strong>Dropbox</strong>.
              </li>
              <li>
                Navegá a la carpeta <span className="font-mono text-xs">HelloSign/Outbox</span> y seleccioná el archivo.
              </li>
              <li>
                <strong>Agregar firmantes</strong>: cargá nombre y correo de quien tiene que firmar.
              </li>
              <li>
                <strong>Insertar campos</strong>: colocá el campo de firma donde corresponda en el documento.
              </li>
              <li>
                En <em>Revisar y enviar</em>, apretá <strong>Enviar para firmar</strong>.
              </li>
            </ol>

            {/* El CC no es un detalle administrativo: es lo que dispara la detección del envío. */}
            <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-1">IMPORTANTE — antes de enviar</p>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                En <em>Revisar y enviar</em>, agregá en <strong>CC</strong> el correo <span className="font-mono text-xs">rrhh@frame.com.ar</span>.
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300/90 mt-1.5">
                Ese aviso de Dropbox Sign es la única forma que tiene el sistema de enterarse de que el documento se envió: con él, el archivo pasa solo de <strong>Outbox</strong> a{" "}
                <strong>Pendbox</strong> y aparece en <strong>Enviado a la firma</strong>. Si no lo ponés, el contrato queda figurando como no enviado y se corre el riesgo de mandarlo dos veces.
              </p>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300">
              Cuando vuelve firmado queda en <span className="font-mono text-xs">Requested signatures</span> y se ve en la pestaña <strong>Firmados</strong>.
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              El envío y la firma se hacen en Dropbox Sign, no en la aplicación. Desde acá sí podés descargar, renombrar o eliminar los archivos de Outbox antes de importarlos.
            </p>
          </div>
);

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
 * En "para_firmar" y "firmados" el archivo todavía no está en manos de Dropbox Sign (el primero) o ya
 * volvió (el último), así que se puede descargar, renombrar o eliminar directo desde acá — misma
 * lógica que el explorador de "Dropbox | Documentos" (selección, ZIP masivo, editar, eliminar). En
 * "enviado_firma" la solicitud ya está en curso en Dropbox Sign: no se ofrece ninguna acción para no
 * pisar lo que está pasando ahí.
 */
export const ContractDropboxTab: React.FC<{ tipo: TipoBandejaDropbox; onCount?: (n: number) => void }> = ({ tipo, onCount }) => {
  const [entries, setEntries] = useState<DropboxEntry[]>([]);
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [descargandoZip, setDescargandoZip] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  /** Explicación de cómo se importan los contratos desde Outbox (modal del ⓘ). */
  const [infoOpen, setInfoOpen] = useState(false);

  /** "enviado_firma" queda de solo lectura: la solicitud ya está en curso en Dropbox Sign. */
  const permiteAcciones = tipo !== "enviado_firma";
  const MAX_ZIP_FILES = 50; // debe coincidir con ZIP_MAX_FILES del backend

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setSelected(new Set()); // la selección es por carpeta; al recargar se limpia
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

  const toggleSelected = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const allSelected = filtradas.length > 0 && filtradas.every((e) => selected.has(e.path));

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filtradas.forEach((e) => next.delete(e.path));
      else filtradas.forEach((e) => next.add(e.path));
      return next;
    });
  };

  const handleBulkDownload = async () => {
    const paths = Array.from(selected);
    if (paths.length === 0) return;
    if (paths.length > MAX_ZIP_FILES) {
      sweetAlert.error("Demasiados archivos", `Máximo ${MAX_ZIP_FILES} archivos por descarga. Deseleccioná algunos.`);
      return;
    }
    setDescargandoZip(true);
    try {
      const blob = await dropboxAPI.downloadZip(paths, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contratos_${tipo}_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSelected(new Set());
    } catch (e: any) {
      // Con responseType "blob" el error del server también llega como Blob: lo leemos para mostrar el mensaje.
      let msg = "No se pudo generar el ZIP.";
      try {
        const txt = await e?.response?.data?.text?.();
        if (txt) msg = JSON.parse(txt).error || msg;
      } catch {
        /* dejamos el mensaje genérico */
      }
      sweetAlert.error("Error", msg);
    } finally {
      setDescargandoZip(false);
    }
  };

  const handleRename = async (entry: DropboxEntry) => {
    const newName = window.prompt("Nuevo nombre:", entry.name);
    if (!newName || newName.trim() === "" || newName === entry.name) return;
    const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
    try {
      await dropboxAPI.move(entry.path, `${parent}/${newName.trim()}`, true);
      await load();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo renombrar.");
    }
  };

  const handleDelete = async (entry: DropboxEntry) => {
    const res = await sweetAlert.confirm("¿Eliminar?", `Se va a eliminar "${entry.name}" de Dropbox. Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!res.isConfirmed) return;
    setEliminando(entry.path);
    try {
      await dropboxAPI.remove(entry.path, true);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(entry.path);
        return next;
      });
      await load();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo eliminar.");
    } finally {
      setEliminando(null);
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
        <Modal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title="Cómo enviarlos a firmar en Dropbox Sign" size="md" zIndex={80}>
          <InstructivoParaFirmar />
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

      {/* Barra de selección masiva — igual que en "Dropbox | Documentos" */}
      {permiteAcciones && selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selected.size} archivo{selected.size === 1 ? "" : "s"} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap">
              Deseleccionar
            </button>
            <button onClick={handleBulkDownload} disabled={descargandoZip} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60">
              <FontAwesomeIcon icon={descargandoZip ? faSpinner : faFileZipper} spin={descargandoZip} /> Descargar {selected.size} (ZIP)
            </button>
          </div>
        </div>
      )}

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
                  {permiteAcciones && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        className="cursor-pointer accent-blue-600"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !allSelected && filtradas.some((e) => selected.has(e.path));
                        }}
                        onChange={toggleSelectAll}
                        title="Seleccionar todos los archivos"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Contrato</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Tamaño</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Modificado</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtradas.map((e) => (
                  <tr key={e.path} className={`hover:bg-gray-50 dark:hover:bg-gray-900/20 ${selected.has(e.path) ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}>
                    {permiteAcciones && (
                      <td className="px-4 py-3">
                        <input type="checkbox" className="cursor-pointer accent-blue-600" checked={selected.has(e.path)} onChange={() => toggleSelected(e.path)} />
                      </td>
                    )}
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
                      <div className="flex items-center justify-end gap-1">
                        {/* "Enviado a la firma" queda de solo lectura: la solicitud ya está en curso en Dropbox Sign. */}
                        {permiteAcciones ? (
                          <>
                            <button type="button" onClick={() => descargar(e)} disabled={descargando === e.path} title="Descargar" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50">
                              <FontAwesomeIcon icon={descargando === e.path ? faSpinner : faDownload} spin={descargando === e.path} className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => handleRename(e)} title="Renombrar" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                              <FontAwesomeIcon icon={faPen} className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => handleDelete(e)} disabled={eliminando === e.path} title="Eliminar" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50">
                              <FontAwesomeIcon icon={eliminando === e.path ? faSpinner : faTrash} spin={eliminando === e.path} className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">Esperando la firma</span>
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
