import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { faFolder, faFileLines, faDownload, faTrash, faPen, faUpload, faFolderPlus, faRotate, faChevronRight, faSpinner, faTriangleExclamation, faPlug, faFileZipper } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { dropboxAPI, DropboxEntry, DropboxStatus } from "../../api/dropbox";
import { sweetAlert } from "../../utils/sweetAlert";

const formatSize = (n?: number): string => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

/*
  Tope de la descarga masiva, en BYTES y no en cantidad de archivos.

  El ZIP se arma entero en memoria del lado del server, y Dropbox corta las descargas que se pasan de
  este tamaño. Lo que decide es el peso: 300 PDF de 200 KB entran cómodos, 5 videos no. Por eso el
  viejo tope de "50 archivos" no protegía nada y sí frenaba el caso normal.

  Tiene que coincidir con ZIP_MAX_TOTAL_BYTES del backend. Se chequea igual acá para poder decirlo
  ANTES —con el total a la vista mientras se tilda— en vez de dejar que se descubra a los 40 segundos
  de espera, cuando el server rechaza la tanda entera y hay que empezar de nuevo.
*/
const ZIP_MAX_BYTES = 200 * 1024 * 1024;

const formatDate = (s?: string): string => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

interface DropboxTabProps {
  /** Reporta hacia el contenedor la cantidad de items visibles (según filtro) para mostrarla junto al título. */
  onCountChange?: (count: number | undefined) => void;
  /**
   * Si se pasa, este tab navega esa carpeta (fuera del `rootPath` configurado del tenant, p. ej. "/ARCA")
   * en vez de la carpeta raíz normal — todas las llamadas al backend van con `full=true` para poder leer
   * y escribir ahí (ver `full` en `frontend/src/api/dropbox.ts` y en `server/src/routes/dropbox.ts`).
   */
  fixedRoot?: string;
  /** Nombre a mostrar para `fixedRoot` en el primer breadcrumb (si no, se deriva del path). */
  rootLabel?: string;
}

export const DropboxTab: React.FC<DropboxTabProps> = ({ onCountChange, fixedRoot, rootLabel }) => {
  const full = !!fixedRoot;
  const [status, setStatus] = useState<DropboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<DropboxEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [rootPath, setRootPath] = useState(fixedRoot || "/HelloSign");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Form de conexión (solo admin, cuando no está conectado)
  const [form, setForm] = useState({ appKey: "", appSecret: "", refreshToken: "", rootPath: "/HelloSign" });
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const s = await dropboxAPI.status();
      setStatus(s);
      if (!fixedRoot) setRootPath(s.rootPath);
      if (s.connected) await loadFolder(fixedRoot || s.rootPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo obtener el estado de Dropbox.");
    } finally {
      setLoading(false);
    }
  };

  const loadFolder = async (path: string) => {
    setBusy(true);
    setSelected(new Set()); // la selección es por carpeta; al navegar/recargar se limpia
    try {
      const r = await dropboxAPI.list(path, full);
      setEntries(r.entries);
      setCurrentPath(r.path);
      if (!fixedRoot) setRootPath(r.rootPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo listar la carpeta.");
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    if (!form.appKey || !form.appSecret || !form.refreshToken) {
      sweetAlert.error("Faltan datos", "Completá App key, App secret y Refresh token.");
      return;
    }
    setConnecting(true);
    try {
      const s = await dropboxAPI.connect(form);
      sweetAlert.success("Dropbox conectado", `Cuenta: ${s.accountEmail || "conectada"}.`);
      await loadStatus();
    } catch (e: any) {
      sweetAlert.error("No se pudo conectar", e?.response?.data?.error || "Revisá las credenciales.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const res = await sweetAlert.confirm("¿Desconectar Dropbox?", "Se borrarán las credenciales de esta organización. Los archivos en Dropbox no se tocan.", "Sí, desconectar");
    if (!res.isConfirmed) return;
    try {
      await dropboxAPI.disconnect();
      await loadStatus();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo desconectar.");
    }
  };

  const handleDownload = async (entry: DropboxEntry) => {
    try {
      const link = await dropboxAPI.tempLink(entry.path, full, entry.id);
      window.open(link, "_blank");
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo generar el enlace de descarga.");
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

  const handleBulkDownload = async () => {
    // Path + id de cada tildado: el server valida con el path y baja con el id, que es lo único que
    // no depende de cómo se llame el archivo (ver `dropboxAPI.downloadZip`).
    const items = entries.filter((e) => selected.has(e.path)).map((e) => ({ path: e.path, id: e.id }));
    if (items.length === 0) return;
    if (excedePeso) {
      sweetAlert.error(
        "La selección pesa demasiado",
        `Son ${formatSize(bytesSeleccionados)} y el máximo por descarga es ${formatSize(ZIP_MAX_BYTES)} — más que eso lo corta Dropbox. Deseleccioná algunos y bajalos en dos tandas.`,
      );
      return;
    }
    setBusy(true);
    setZipRecibidos(0);
    setZipTotal(undefined);
    try {
      const blob = await dropboxAPI.downloadZip(items, full, (recibidos, total) => {
        setZipRecibidos(recibidos);
        if (total) setZipTotal(total);
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documentos_${new Date().toISOString().slice(0, 10)}.zip`;
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
      setBusy(false);
      setZipRecibidos(null);
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (const f of files) await dropboxAPI.upload(currentPath, f, full);
      sweetAlert.success("Listo", `${files.length} archivo(s) subido(s).`);
      await loadFolder(currentPath);
    } catch (err: any) {
      sweetAlert.error("Error", err?.response?.data?.error || "No se pudo subir el archivo.");
      setBusy(false);
    }
  };

  const handleCreateFolder = async () => {
    const res = await sweetAlert.prompt("Nueva carpeta", { text: "Se va a crear dentro de la carpeta actual.", placeholder: "Nombre de la carpeta", confirmText: "Crear" });
    if (!res.isConfirmed) return;
    const name = String(res.value || "").trim();
    try {
      await dropboxAPI.createFolder(`${currentPath.replace(/\/$/, "")}/${name}`, full);
      await loadFolder(currentPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo crear la carpeta.");
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
      await dropboxAPI.move(entry.path, `${parent}/${newName}`, full);
      await loadFolder(currentPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo renombrar.");
    }
  };

  const handleDelete = async (entry: DropboxEntry) => {
    const res = await sweetAlert.confirm(entry.tag === "folder" ? "¿Eliminar la carpeta?" : "¿Eliminar el archivo?", `Se va a eliminar "${entry.name}" de Dropbox.${entry.tag === "folder" ? " Se borra con todo lo que tenga adentro." : ""} Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!res.isConfirmed) return;
    try {
      await dropboxAPI.remove(entry.path, full);
      await loadFolder(currentPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo eliminar.");
    }
  };

  /**
   * ELIMINAR TODO LO TILDADO, de a uno contra Dropbox.
   *
   * La API no tiene borrado en lote, así que se recorre. Se hace en SERIE y no en paralelo: son
   * borrados, y un `Promise.all` que falla a la mitad deja la mitad borrada sin poder decir cuál —
   * de a uno se sabe exactamente qué se fue y qué quedó, que es lo único que sirve para reintentar.
   *
   * Un fallo NO corta la tanda: se sigue con el resto y al final se informa. Cortar en el primer
   * error obligaría a destildar a mano los que ya se borraron para volver a intentar.
   *
   * SOLO ARCHIVOS. Las carpetas no se pueden tildar en esta tabla (ver el `<td>` del check), así que
   * acá no hay riesgo de llevarse una entera con lo que tenga adentro sin que nadie lo haya pedido.
   */
  const handleBulkDelete = async () => {
    /*
      Sale de `entries` y NO de la lista filtrada, por el mismo motivo que el peso del ZIP: el filtro
      de texto esconde filas pero no las destilda. Tomando lo visible se borraría menos de lo que el
      contador dice — y el que se salva es el que no está a la vista, o sea el que nadie va a notar.
    */
    const aBorrar = entries.filter((e) => e.tag === "file" && selected.has(e.path));
    if (aBorrar.length === 0) return;

    // Se nombran los primeros: «¿Eliminar 12 archivos?» sin decir cuáles se confirma a ciegas.
    const muestra = aBorrar
      .slice(0, 5)
      .map((e) => `• ${e.name}`)
      .join("\n");
    const res = await sweetAlert.confirm(
      aBorrar.length === 1 ? "¿Eliminar el archivo?" : `¿Eliminar ${aBorrar.length} archivos?`,
      `Se van a eliminar de Dropbox y no se puede deshacer.\n\n${muestra}${aBorrar.length > 5 ? `\n…y ${aBorrar.length - 5} más.` : ""}`,
      "Sí, eliminar",
    );
    if (!res.isConfirmed) return;

    setBusy(true);
    const fallaron: string[] = [];
    try {
      for (const e of aBorrar) {
        try {
          await dropboxAPI.remove(e.path, full);
        } catch {
          fallaron.push(e.name);
        }
      }
      setSelected(new Set());
      await loadFolder(currentPath);
      const borrados = aBorrar.length - fallaron.length;
      if (fallaron.length === 0) sweetAlert.success("Listo", `Se ${borrados === 1 ? "eliminó 1 archivo" : `eliminaron ${borrados} archivos`}.`);
      else
        sweetAlert.warningAlert(
          "Quedaron algunos sin eliminar",
          `Se eliminaron ${borrados} de ${aBorrar.length}.\n\nNo se pudo con:\n${fallaron.slice(0, 5).map((n) => `• ${n}`).join("\n")}${fallaron.length > 5 ? `\n…y ${fallaron.length - 5} más.` : ""}`,
        );
    } finally {
      setBusy(false);
    }
  };

  // Breadcrumbs relativos al rootPath (o a `fixedRoot`, para las vistas de solo lectura).
  const crumbs = useMemo(() => {
    const root = fixedRoot || rootPath;
    const rel = currentPath.startsWith(root) ? currentPath.slice(root.length) : "";
    const segs = rel.split("/").filter(Boolean);
    const list = [{ name: rootLabel || root.split("/").filter(Boolean).pop() || "HelloSign", path: root }];
    let acc = root;
    for (const s of segs) {
      acc = `${acc}/${s}`;
      list.push({ name: s, path: acc });
    }
    return list;
  }, [currentPath, rootPath, fixedRoot, rootLabel]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const arr = term ? entries.filter((e) => e.name.toLowerCase().includes(term)) : entries;
    // Carpetas primero, luego archivos; ambos alfabéticos.
    return [...arr].sort((a, b) => {
      if (a.tag !== b.tag) return a.tag === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [entries, search]);

  // Archivos seleccionables en la vista actual (las carpetas no se tildan).
  const fileEntries = useMemo(() => filtered.filter((e) => e.tag === "file"), [filtered]);
  const allFilesSelected = fileEntries.length > 0 && fileEntries.every((e) => selected.has(e.path));
  /**
   * Peso de lo tildado, sumado a medida que se selecciona.
   *
   * Se calcula sobre `entries` y no sobre `filtered`: el filtro de texto esconde filas pero no las
   * destilda, así que sumar lo visible daría de menos justo cuando alguien selecciona todo, filtra y
   * agrega más — que es como se arma una tanda grande.
   */
  /**
   * Bytes del ZIP ya recibidos, o `null` si no arrancó.
   *
   * `0` no es lo mismo que `null`: 0 significa "el server está armando el ZIP y todavía no mandó
   * nada", que es la etapa larga. Distinguirlos es lo que evita que un minuto sin movimiento se lea
   * como colgado.
   */
  const [zipRecibidos, setZipRecibidos] = useState<number | null>(null);
  const [zipTotal, setZipTotal] = useState<number | undefined>(undefined);

  const bytesSeleccionados = useMemo(() => entries.reduce((acc, e) => (selected.has(e.path) ? acc + (e.size || 0) : acc), 0), [entries, selected]);
  const excedePeso = bytesSeleccionados > ZIP_MAX_BYTES;

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilesSelected) fileEntries.forEach((e) => next.delete(e.path));
      else fileEntries.forEach((e) => next.add(e.path));
      return next;
    });
  };

  // Informa el conteo (según filtro) al contenedor para mostrarlo junto al título; sólo cuando hay conexión.
  useEffect(() => {
    onCountChange?.(status?.connected ? filtered.length : undefined);
  }, [filtered, status?.connected, onCountChange]);

  // Al desmontar, limpia el conteo del título.
  useEffect(() => () => onCountChange?.(undefined), [onCountChange]);

  if (loading) {
    // Mismo spinner que el resto de la app (Novedades, Contratos): este componente lo renderizan
    // tanto "Dropbox | Documentos" como las pestañas de Contratos, así que la carga se ve igual
    // en las dos.
    return <LoadingSpinner message="Cargando Dropbox..." />;
  }

  // ── No conectado ──
  if (!status?.connected) {
    if (!status?.canManageConnection) {
      return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500">
          <FontAwesomeIcon icon={faDropbox} className="h-10 w-10 text-blue-500 mb-3" />
          <p className="font-semibold text-gray-700 dark:text-gray-200">Dropbox no está conectado</p>
          <p className="text-sm mt-1">Pedile a un administrador que conecte la cuenta de Dropbox de la organización.</p>
        </div>
      );
    }
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <FontAwesomeIcon icon={faDropbox} className="h-7 w-7 text-blue-600" />
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Conectar Dropbox</h3>
            <p className="text-xs text-gray-500">Credenciales de la app de Dropbox de tu organización (se guardan cifradas).</p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">App key</label>
            <input className="input-field w-full" value={form.appKey} onChange={(e) => setForm({ ...form, appKey: e.target.value })} placeholder="App key de Dropbox" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">App secret</label>
            <input type="password" className="input-field w-full" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} placeholder="App secret" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Refresh token</label>
            <input type="password" className="input-field w-full" value={form.refreshToken} onChange={(e) => setForm({ ...form, refreshToken: e.target.value })} placeholder="Refresh token (offline)" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Carpeta raíz</label>
            <input className="input-field w-full" value={form.rootPath} onChange={(e) => setForm({ ...form, rootPath: e.target.value })} placeholder="/HelloSign" />
          </div>
          <button type="button" onClick={handleConnect} disabled={connecting} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {connecting ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faPlug} />}
            {connecting ? "Conectando..." : "Conectar"}
          </button>
          <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
            Generá estas credenciales en la App Console de Dropbox (permisos files.content.read/write, con acceso "offline" para obtener el refresh token).
          </p>
        </div>
      </div>
    );
  }

  // ── Conectado: explorador ──
  return (
    <div className="space-y-4">
      {/* Cuenta conectada / Desconectar — arriba a la derecha */}
      {(status.accountEmail || status.canManageConnection) && (
        <div className="flex items-center justify-end gap-2">
          {status.accountEmail && <span className="text-[11px] text-gray-400">Cuenta: {status.accountEmail}</span>}
          {status.canManageConnection && (
            <button onClick={handleDisconnect} className="text-[11px] text-red-500 hover:text-red-600 whitespace-nowrap">Desconectar</button>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <FontAwesomeIcon icon={faDropbox} className="text-blue-600" />
          {crumbs.map((c, i) => (
            <span key={c.path} className="flex items-center gap-2">
              {i > 0 && <FontAwesomeIcon icon={faChevronRight} className="text-gray-300 text-[10px]" />}
              <button onClick={() => loadFolder(c.path)} className={`hover:text-blue-600 transition-colors ${i === crumbs.length - 1 ? "font-bold text-gray-900 dark:text-gray-100" : "text-gray-500"}`}>
                {c.name}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => loadFolder(currentPath)} title="Actualizar" className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"><FontAwesomeIcon icon={faRotate} className={busy ? "animate-spin" : ""} /></button>
          <button onClick={handleCreateFolder} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-2"><FontAwesomeIcon icon={faFolderPlus} /> Carpeta</button>
          <button onClick={handleUploadClick} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-2"><FontAwesomeIcon icon={faUpload} /> Subir</button>
          {/*
            ELIMINAR LO TILDADO. Apagado hasta que haya algo tildado, y ROJO recién ahí.

            Está siempre en la barra y no aparece solo cuando hay selección: un botón que se agrega
            corre a los otros dos de lugar justo cuando alguien va a hacer click. Apagado ocupa el
            mismo espacio y además enseña que existe.

            El rojo llega con la selección y no antes: en gris permanente sería un botón destructivo
            compitiendo por atención con «Subir» todo el tiempo. Encendido dice cuántos se lleva, así
            el número está a la vista antes de apretar y no solo en la confirmación.
          */}
          <button
            onClick={handleBulkDelete}
            disabled={busy || selected.size === 0}
            title={selected.size === 0 ? "Tildá archivos en la lista para poder eliminarlos juntos" : `Eliminar de Dropbox los ${selected.size} archivo(s) tildados`}
            className={`text-xs py-1.5 px-3 rounded-md flex items-center gap-2 font-semibold transition-colors ${
              selected.size === 0
                ? "border border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                : "bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
            }`}
          >
            <FontAwesomeIcon icon={busy && selected.size > 0 ? faSpinner : faTrash} spin={busy && selected.size > 0} />
            {selected.size > 0 ? `Eliminar (${selected.size})` : "Eliminar"}
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          className="input-field flex-1"
          placeholder="Filtrar por nombre (ej: 426_LN, contrato, apellido)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Barra de selección masiva */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5">
          {/* El peso al lado de la cantidad: es lo único que puede frenar la descarga, así que se ve
              mientras se tilda y no recién al apretar el botón. */}
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {selected.size} archivo{selected.size === 1 ? "" : "s"} seleccionado{selected.size === 1 ? "" : "s"}
            {bytesSeleccionados > 0 && (
              <span className={excedePeso ? "text-red-600 dark:text-red-400 font-semibold" : "text-blue-600/70 dark:text-blue-300/70"}> · {formatSize(bytesSeleccionados)}</span>
            )}
            {excedePeso && <span className="text-red-600 dark:text-red-400 font-semibold"> — máximo {formatSize(ZIP_MAX_BYTES)}</span>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap">
              Deseleccionar
            </button>
            <button
              onClick={handleBulkDownload}
              disabled={busy || excedePeso}
              title={
                excedePeso
                  ? `La selección pesa ${formatSize(bytesSeleccionados)} y el máximo es ${formatSize(ZIP_MAX_BYTES)}: más que eso lo corta Dropbox. Deseleccioná algunos.`
                  : `Bajar los ${selected.size} tildados en un ZIP (${formatSize(bytesSeleccionados)})`
              }
              className="btn-primary text-xs py-1.5 px-3 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={busy ? faSpinner : faFileZipper} spin={busy} />{" "}
              {/* Mientras trabaja, el botón cuenta lo que va pasando: primero "Preparando" —el server
                  bajando de Dropbox y armando el ZIP, que es la etapa larga— y después los MB que van
                  llegando. Un spinner solo, sin números, no distingue "tardando" de "colgado". */}
              {busy ? (zipRecibidos ? `Bajando ${formatSize(zipRecibidos)}${zipTotal ? ` de ${formatSize(zipTotal)}` : ""}` : `Preparando ${selected.size} archivos…`) : `Descargar ${selected.size} (ZIP)`}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    className="cursor-pointer accent-blue-600"
                    checked={allFilesSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allFilesSelected && fileEntries.some((e) => selected.has(e.path));
                    }}
                    disabled={fileEntries.length === 0}
                    onChange={toggleSelectAll}
                    title="Seleccionar todos los archivos"
                  />
                </th>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Tamaño</th>
                <th className="px-4 py-3 font-semibold">Modificado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {busy && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6">
                    <LoadingSpinner size="sm" message="Cargando archivos..." />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 italic">{search ? "No hay resultados para el filtro." : "Carpeta vacía."}</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.path} className={`hover:bg-gray-50 dark:hover:bg-gray-800/40 ${e.tag === "file" && selected.has(e.path) ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}>
                    <td className="px-4 py-2.5">
                      {e.tag === "file" && (
                        <input
                          type="checkbox"
                          className="cursor-pointer accent-blue-600"
                          checked={selected.has(e.path)}
                          onChange={() => toggleSelected(e.path)}
                        />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {e.tag === "folder" ? (
                        <button onClick={() => loadFolder(e.path)} className="flex items-center gap-2 font-medium text-gray-800 dark:text-gray-100 hover:text-blue-600">
                          <FontAwesomeIcon icon={faFolder} className="text-amber-500" /> {e.name}
                        </button>
                      ) : (
                        <span className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                          <FontAwesomeIcon icon={faFileLines} className="text-blue-400" /> {e.name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{e.tag === "file" ? formatSize(e.size) : "—"}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{formatDate(e.serverModified)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {e.tag === "file" && (
                          <button onClick={() => handleDownload(e)} title="Descargar" className="p-2 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"><FontAwesomeIcon icon={faDownload} /></button>
                        )}
                        <button onClick={() => handleRename(e)} title="Renombrar" className="p-2 rounded text-gray-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30"><FontAwesomeIcon icon={faPen} /></button>
                        <button onClick={() => handleDelete(e)} title="Eliminar" className="p-2 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"><FontAwesomeIcon icon={faTrash} /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
