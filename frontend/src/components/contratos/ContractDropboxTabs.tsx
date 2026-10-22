import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCircleInfo, faDownload, faFilePdf, faFileZipper, faFolderOpen, faPen, faRotateRight, faSpinner, faTrash, faTriangleExclamation, faPaperPlane, faListCheck } from "@fortawesome/free-solid-svg-icons";
import { dropboxAPI, DropboxEntry } from "../../api/dropbox";
import { firmaDigitalAPI } from "../../api/firmaDigital";
import { useBotFirma, PanelBotFirma, BadgeFirma, InstructivoParaFirmar } from "./FirmaBotParaFirmar";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";
import { sweetAlert } from "../../utils/sweetAlert";
import { BotonOrden, useOrdenTabla } from "../ui/OrdenTabla";

/** Dropbox Sign (ex HelloSign): donde se firman los contratos que se mandan desde acá. */
const DROPBOX_SIGN_URL = "https://www.dropbox.com/sign";

/** Nombre de la carpeta de Dropbox que alimenta cada bandeja (para el mensaje de "no se encontró"). */
const CARPETA_ESPERADA: Record<TipoBandejaDropbox, string> = {
  para_firmar: "Outbox",
  enviado_firma: "Pendbox",
  firmados: "Requested signatures",
};

/*
  Tope de la descarga masiva, en BYTES y no en cantidad de archivos: el ZIP se arma entero en memoria
  del server y Dropbox corta las descargas que se pasan de este tamaño. Tiene que coincidir con
  ZIP_MAX_TOTAL_BYTES del backend; se chequea igual acá para decirlo mientras se tilda, y no a los 40
  segundos de espera cuando el server rechaza la tanda entera.
*/
const ZIP_MAX_BYTES = 200 * 1024 * 1024;

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
export { InstructivoParaFirmar } from "./FirmaBotParaFirmar";

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
 *    Cuando aparece, el escaneo de carpetas del server saca el original de Pendbox (y le pone el
 *    código al firmado si volvió sin él), así «Enviado a la firma» queda solo con lo pendiente.
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
  // El bot de envío a la firma: estado por archivo, corrida en vivo y acciones (sólo en «Para Firmar»).
  const nombresDeArchivos = useMemo(() => entries.map((e) => e.name), [entries]);
  const bot = useBotFirma(nombresDeArchivos, tipo === "para_firmar");
  const enColaTotal = useMemo(() => [...bot.estados.values()].filter((e) => e.estado === "en_cola" || e.estado === "seco" || e.estado === "limite").length, [bot.estados]);
  const seleccionadosNombres = useMemo(() => entries.filter((e) => selected.has(e.path)).map((e) => e.name), [entries, selected]);

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

  /**
   * Peso de lo tildado, sumado a medida que se selecciona. Sobre `entries` y no sobre lo filtrado: el
   * filtro esconde filas pero no las destilda, y sumar solo lo visible daría de menos.
   */
  /**
   * Bytes del ZIP ya recibidos, o `null` si no arrancó. `0` no es lo mismo que `null`: 0 es "el
   * server está armando el ZIP y todavía no mandó nada", que es la etapa larga.
   */
  const [zipRecibidos, setZipRecibidos] = useState<number | null>(null);
  const [zipTotal, setZipTotal] = useState<number | undefined>(undefined);

  const { ordenados, orden, alternar } = useOrdenTabla(
    filtradas,
    { fecha: (e) => e.serverModified || "", contrato: (e) => e.name, tamanio: (e) => e.size || 0 },
    { columna: "fecha", direccion: "desc" },
  );

  const bytesSeleccionados = useMemo(() => entries.reduce((acc, e) => (selected.has(e.path) ? acc + (e.size || 0) : acc), 0), [entries, selected]);
  const excedePeso = bytesSeleccionados > ZIP_MAX_BYTES;

  // El padre muestra la cantidad en la pestaña.
  useEffect(() => {
    onCount?.(entries.length);
  }, [entries.length, onCount]);

  const descargar = async (entry: DropboxEntry) => {
    setDescargando(entry.path);
    try {
      const url = await dropboxAPI.tempLink(entry.path, true, entry.id);
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
    // Path + id de cada tildado: el server valida con el path y baja con el id, que es lo único que
    // no depende de cómo se llame el archivo (ver `dropboxAPI.downloadZip`).
    const items = entries.filter((e) => selected.has(e.path)).map((e) => ({ path: e.path, id: e.id }));
    if (items.length === 0) return;
    if (excedePeso) {
      sweetAlert.error(
        "La selección pesa demasiado",
        `Son ${fmtTamanio(bytesSeleccionados)} y el máximo por descarga es ${fmtTamanio(ZIP_MAX_BYTES)} — más que eso lo corta Dropbox. Deseleccioná algunos y bajalos en dos tandas.`,
      );
      return;
    }
    setDescargandoZip(true);
    setZipRecibidos(0);
    setZipTotal(undefined);
    try {
      const blob = await dropboxAPI.downloadZip(items, true, (recibidos, total) => {
        setZipRecibidos(recibidos);
        if (total) setZipTotal(total);
      });
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
      /*
        Con responseType "blob" el error del server también llega como Blob: hay que leerlo para
        mostrar el mensaje. Y si no hay respuesta —timeout, red caída— el mensaje útil es el del
        propio error: quedarse con el genérico ahí escondía la única pista que había.
      */
      let msg = e?.message || "No se pudo generar el ZIP.";
      try {
        const txt = await e?.response?.data?.text?.();
        if (txt) msg = JSON.parse(txt).error || msg;
      } catch {
        /* nos quedamos con el mensaje del error */
      }
      sweetAlert.error("Error", msg);
    } finally {
      setDescargandoZip(false);
      setZipRecibidos(null);
    }
  };

  const handleRename = async (entry: DropboxEntry) => {
    const res = await sweetAlert.prompt("Renombrar", {
      text: `Se va a renombrar "${entry.name}" en Dropbox.`,
      valorInicial: entry.name,
      confirmText: "Renombrar",
      // El nombre viaja a Dropbox tal cual: la barra separa carpetas y rompería la ruta.
      validar: (v) => (v === entry.name ? "El nombre es el mismo." : v.includes("/") ? "El nombre no puede tener barras." : null),
    });
    if (!res.isConfirmed) return;
    const newName = String(res.value || "").trim();
    const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
    try {
      await dropboxAPI.move(entry.path, `${parent}/${newName}`, true);
      await load();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo renombrar.");
    }
  };

  const handleDelete = async (entry: DropboxEntry) => {
    const res = await sweetAlert.confirm("¿Eliminar el archivo?", `Se va a eliminar "${entry.name}" de Dropbox. Esta acción no se puede deshacer.`, "Sí, eliminar");
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
      {tipo === "para_firmar" && (
        <>
          <PanelBotFirma bot={bot} enCola={enColaTotal} />
          <div className="flex items-center justify-end gap-2 -mt-2">
            <a href={DROPBOX_SIGN_URL} target="_blank" rel="noopener noreferrer" title="Abrir Dropbox Sign (para mirar; el envío lo hace el sistema)" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
              Dropbox Sign
            </a>
            <button type="button" onClick={() => setInfoOpen(true)} title="Cómo se envían a firmar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
          </div>
        </>
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
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5">
          {/* El peso al lado de la cantidad: es lo único que puede frenar la descarga. */}
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selected.size} archivo{selected.size === 1 ? "" : "s"} seleccionado{selected.size === 1 ? "" : "s"}
            {bytesSeleccionados > 0 && (
              <span className={excedePeso ? "text-red-600 dark:text-red-400 font-semibold" : "text-blue-600/70 dark:text-blue-300/70"}> · {fmtTamanio(bytesSeleccionados)}</span>
            )}
            {excedePeso && <span className="text-red-600 dark:text-red-400 font-semibold"> — máximo {fmtTamanio(ZIP_MAX_BYTES)}</span>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap">
              Deseleccionar
            </button>
            {tipo === "para_firmar" && (
              <>
                <button
                  type="button"
                  onClick={() => bot.enviarALaFirma(seleccionadosNombres)}
                  disabled={!!bot.ocupado || !bot.cfg}
                  title="Encola los tildados y, si el bot está libre y hay cupo, arranca el envío"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-60"
                >
                  <FontAwesomeIcon icon={bot.ocupado === "encolando" ? faSpinner : faPaperPlane} spin={bot.ocupado === "encolando"} /> Enviar a la firma ({selected.size})
                </button>
                <button type="button" onClick={() => bot.quitarDeLaCola(seleccionadosNombres)} disabled={!!bot.ocupado} title="Saca de la cola los tildados que estén en cola" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60">
                  <FontAwesomeIcon icon={faListCheck} /> Quitar de la cola ({seleccionadosNombres.filter((n) => ["en_cola", "seco"].includes(bot.estados.get(n)?.estado || "")).length})
                </button>
              </>
            )}
            <button
              onClick={handleBulkDownload}
              disabled={descargandoZip || excedePeso}
              title={
                excedePeso
                  ? `La selección pesa ${fmtTamanio(bytesSeleccionados)} y el máximo es ${fmtTamanio(ZIP_MAX_BYTES)}: más que eso lo corta Dropbox. Deseleccioná algunos.`
                  : `Bajar los ${selected.size} tildados en un ZIP (${fmtTamanio(bytesSeleccionados)})`
              }
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={descargandoZip ? faSpinner : faFileZipper} spin={descargandoZip} />{" "}
              {/* Primero "Preparando" —el server bajando de Dropbox—, después los MB que van llegando:
                  un spinner sin números no distingue "tardando" de "colgado". */}
              {descargandoZip
                ? zipRecibidos
                  ? `Bajando ${fmtTamanio(zipRecibidos)}${zipTotal ? ` de ${fmtTamanio(zipTotal)}` : ""}`
                  : `Preparando ${selected.size} archivos…`
                : `Descargar ${selected.size} (ZIP)`}
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
          <div className="overflow-x-auto custom-scrollbar min-h-[22rem] max-h-[calc(100svh-var(--wp-sticky-top,220px)-1.5rem)]">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-4 py-3 w-10 bg-gray-50 dark:bg-gray-900">
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
                  {/* La fecha primero: es por lo que se ordena y lo primero que se mira. */}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900">
                    <BotonOrden columna="fecha" orden={orden} onAlternar={alternar}>
                      Fecha
                    </BotonOrden>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50 dark:bg-gray-900">
                    <BotonOrden columna="contrato" orden={orden} onAlternar={alternar}>
                      Contrato
                    </BotonOrden>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900">
                    <BotonOrden columna="tamanio" orden={orden} onAlternar={alternar}>
                      Tamaño
                    </BotonOrden>
                  </th>
                  {tipo === "para_firmar" && <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900">Firma</th>}
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider text-right bg-gray-50 dark:bg-gray-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {ordenados.map((e) => (
                  <tr key={e.path} className={`hover:bg-gray-50 dark:hover:bg-gray-900/20 ${selected.has(e.path) ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" className="cursor-pointer accent-blue-600" checked={selected.has(e.path)} onChange={() => toggleSelected(e.path)} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtFecha(e.serverModified)}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                        <FontAwesomeIcon icon={faFilePdf} className="h-4 w-4 text-violet-600 shrink-0" />
                        <span className="truncate max-w-[520px]" title={e.name}>
                          {e.name}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtTamanio(e.size)}</td>
                    {tipo === "para_firmar" && (
                      <td className="px-4 py-3">
                        <BadgeFirma e={bot.estados.get(e.name)} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/*
                          También en «Enviado a la firma» (antes era de solo lectura): borrar o renombrar
                          acá no toca la solicitud en Dropbox Sign, que ya tiene su copia; sirve para
                          sacar un archivo que se mandó mal.
                        */}
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
