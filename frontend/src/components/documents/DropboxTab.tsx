import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder, faFileLines, faDownload, faTrash, faPen, faUpload, faFolderPlus, faRotate, faChevronRight, faSpinner, faTriangleExclamation, faPlug } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { dropboxAPI, DropboxEntry, DropboxStatus } from "../../api/dropbox";
import { sweetAlert } from "../../utils/sweetAlert";

const formatSize = (n?: number): string => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (s?: string): string => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const DropboxTab: React.FC = () => {
  const [status, setStatus] = useState<DropboxStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<DropboxEntry[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [rootPath, setRootPath] = useState("/HelloSign");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
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
      setRootPath(s.rootPath);
      if (s.connected) await loadFolder(s.rootPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo obtener el estado de Dropbox.");
    } finally {
      setLoading(false);
    }
  };

  const loadFolder = async (path: string) => {
    setBusy(true);
    try {
      const r = await dropboxAPI.list(path);
      setEntries(r.entries);
      setCurrentPath(r.path);
      setRootPath(r.rootPath);
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
      const link = await dropboxAPI.tempLink(entry.path);
      window.open(link, "_blank");
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo generar el enlace de descarga.");
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setBusy(true);
    try {
      for (const f of files) await dropboxAPI.upload(currentPath, f);
      sweetAlert.success("Listo", `${files.length} archivo(s) subido(s).`);
      await loadFolder(currentPath);
    } catch (err: any) {
      sweetAlert.error("Error", err?.response?.data?.error || "No se pudo subir el archivo.");
      setBusy(false);
    }
  };

  const handleCreateFolder = async () => {
    const name = window.prompt("Nombre de la nueva carpeta:");
    if (!name || !name.trim()) return;
    try {
      await dropboxAPI.createFolder(`${currentPath.replace(/\/$/, "")}/${name.trim()}`);
      await loadFolder(currentPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo crear la carpeta.");
    }
  };

  const handleRename = async (entry: DropboxEntry) => {
    const newName = window.prompt("Nuevo nombre:", entry.name);
    if (!newName || newName.trim() === "" || newName === entry.name) return;
    const parent = entry.path.substring(0, entry.path.lastIndexOf("/"));
    try {
      await dropboxAPI.move(entry.path, `${parent}/${newName.trim()}`);
      await loadFolder(currentPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo renombrar.");
    }
  };

  const handleDelete = async (entry: DropboxEntry) => {
    const res = await sweetAlert.confirm("¿Eliminar?", `Se va a eliminar "${entry.name}" de Dropbox. Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!res.isConfirmed) return;
    try {
      await dropboxAPI.remove(entry.path);
      await loadFolder(currentPath);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo eliminar.");
    }
  };

  // Breadcrumbs relativos al rootPath.
  const crumbs = useMemo(() => {
    const rel = currentPath.startsWith(rootPath) ? currentPath.slice(rootPath.length) : "";
    const segs = rel.split("/").filter(Boolean);
    const list = [{ name: rootPath.split("/").filter(Boolean).pop() || "HelloSign", path: rootPath }];
    let acc = rootPath;
    for (const s of segs) {
      acc = `${acc}/${s}`;
      list.push({ name: s, path: acc });
    }
    return list;
  }, [currentPath, rootPath]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const arr = term ? entries.filter((e) => e.name.toLowerCase().includes(term)) : entries;
    // Carpetas primero, luego archivos; ambos alfabéticos.
    return [...arr].sort((a, b) => {
      if (a.tag !== b.tag) return a.tag === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [entries, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando Dropbox...
      </div>
    );
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
        {status.accountEmail && <span className="text-[11px] text-gray-400 hidden sm:inline">Cuenta: {status.accountEmail}</span>}
        {status.canManageConnection && (
          <button onClick={handleDisconnect} className="text-[11px] text-red-500 hover:text-red-600 whitespace-nowrap">Desconectar</button>
        )}
      </div>

      {/* Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Tamaño</th>
                <th className="px-4 py-3 font-semibold">Modificado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {busy && filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400"><FontAwesomeIcon icon={faSpinner} spin /> Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400 italic">{search ? "No hay resultados para el filtro." : "Carpeta vacía."}</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.path} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
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
