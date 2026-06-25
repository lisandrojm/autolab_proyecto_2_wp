import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faDownload, faUpload, faPlus, faEdit, faTrash, faTimes, faFileExcel } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { ViewToggle, ViewMode } from "../components/ui/ViewToggle";
import { sweetAlert } from "../utils/sweetAlert";
import { fuzzyMatch } from "../utils/searchHelpers";
import { contratoFrameAPI, ContratoFrameItem } from "../api/contratosFrame";

const emptyForm = { nombre: "", externalId: "", cantidadJornadas: "", multiplicadorDiario: "", rutaArchivo: "" };

export const ContratosFramePage: React.FC = () => {
  const [items, setItems] = useState<ContratoFrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Vista (Tabla vs Tarjetas)
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode("cards");
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem("contratosViewMode");
      if (saved === "table" || saved === "cards") setViewMode(saved as ViewMode);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    if (isLarge) localStorage.setItem("contratosViewMode", viewMode);
  }, [viewMode, isLarge]);
  const effectiveViewMode: ViewMode = isLarge ? viewMode : "cards";

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ContratoFrameItem | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await contratoFrameAPI.list());
    } catch {
      sweetAlert.error("Error", "No se pudieron cargar los contratos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = items.filter((it) => !search.trim() || fuzzyMatch(it.name || "", search));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setShowModal(true);
  };

  const openEdit = (item: ContratoFrameItem) => {
    setEditing(item);
    setForm({
      nombre: item.name || "",
      externalId: item.externalId || "",
      cantidadJornadas: String(item.data?.cantidadJornadas ?? ""),
      multiplicadorDiario: String(item.data?.multiplicadorDiario ?? ""),
      rutaArchivo: item.data?.rutaArchivo || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      sweetAlert.error("Falta el nombre", "El nombre del contrato es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        externalId: form.externalId.trim(),
        cantidadJornadas: form.cantidadJornadas,
        multiplicadorDiario: form.multiplicadorDiario,
        rutaArchivo: form.rutaArchivo.trim(),
      };
      if (editing) {
        await contratoFrameAPI.update(editing._id, payload);
        sweetAlert.success("Actualizado", "Contrato actualizado correctamente.");
      } else {
        await contratoFrameAPI.create(payload);
        sweetAlert.success("Creado", "Contrato creado.");
      }
      setShowModal(false);
      await load();
    } catch {
      sweetAlert.error("Error", "No se pudo guardar el contrato.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: ContratoFrameItem) => {
    const result = await sweetAlert.confirm("¿Eliminar?", `Se eliminará "${item.name}". Esta acción no se puede deshacer.`);
    if (!result.isConfirmed) return;
    try {
      await contratoFrameAPI.remove(item._id);
      sweetAlert.success("Eliminado", "Contrato eliminado correctamente.");
      await load();
    } catch {
      sweetAlert.error("Error", "No se pudo eliminar el contrato.");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await contratoFrameAPI.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_contratos.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar la plantilla.");
    }
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const res = await contratoFrameAPI.importExcel(importFile);
      sweetAlert.success("Importación completada", `${res.count} contratos procesados.`);
      setShowImport(false);
      setImportFile(null);
      await load();
    } catch (err: any) {
      const details = err?.response?.data?.details;
      sweetAlert.error("Error al importar", Array.isArray(details) ? details.slice(0, 5).join("\n") : err?.response?.data?.error || "No se pudo importar el archivo.");
    } finally {
      setImporting(false);
    }
  };

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <button onClick={handleDownloadTemplate} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
        <FontAwesomeIcon icon={faDownload} /> Plantilla
      </button>
      <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
        <FontAwesomeIcon icon={faUpload} /> Importar Excel
      </button>
      <button onClick={openCreate} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        <FontAwesomeIcon icon={faPlus} /> Nuevo
      </button>
    </div>
  );

  const field = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white"
      />
    </div>
  );

  return (
    <PageLayout title="Contratos" subtitle="Catálogo de contratos de FRAME. Cargá registros manualmente o importá un Excel." faIcon={{ icon: faFileContract }} headerActions={headerActions}>
      <div className="mb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar contrato..." className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white" />
        {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
          {items.length === 0 ? 'Todavía no hay contratos. Cargá uno con "Nuevo" o importá un Excel.' : "No hay resultados para la búsqueda."}
        </div>
      ) : effectiveViewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
          {filtered.map((item) => (
            <Card
              key={item._id}
              onClick={() => openEdit(item)}
              className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
              header={{
                title: item.name,
                icon: faFileContract,
                badges: item.externalId ? [{ text: `ID ${item.externalId}`, variant: "blue" }] : [],
              }}
              footer={{
                actions: [
                  { icon: faEdit, onClick: (e) => { e.stopPropagation(); openEdit(item); }, title: "Editar", variant: "default" },
                  { icon: faTrash, onClick: (e) => { e.stopPropagation(); handleDelete(item); }, title: "Eliminar", variant: "default" },
                ],
              }}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Jornadas</label>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.data?.cantidadJornadas ?? "—"}</div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Mult. Diario</label>
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.data?.multiplicadorDiario ?? "—"}</div>
                </div>
              </div>
            </Card>
          ))}
          <Card variant="create" onClick={openCreate} header={{ title: "Nuevo", subtitle: "Agregar contrato", icon: faFileContract }} />
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Jornadas</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mult. Diario</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Externo</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filtered.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{item.data?.cantidadJornadas ?? "—"}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{item.data?.multiplicadorDiario ?? "—"}</td>
                  <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{item.externalId || "—"}</td>
                  <td className="px-5 py-3 text-sm text-right">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-3" title="Editar"><FontAwesomeIcon icon={faEdit} /></button>
                    <button onClick={() => handleDelete(item)} className="text-rose-600 hover:text-rose-800 dark:text-rose-400" title="Eliminar"><FontAwesomeIcon icon={faTrash} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? "Editar" : "Nuevo"} Contrato</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {field("Nombre *", "nombre")}
              {field("Cantidad de Jornadas", "cantidadJornadas", "number")}
              {field("Multiplicador Diario", "multiplicadorDiario", "number")}
              {field("Ruta Archivo", "rutaArchivo", "text")}
              {field("ID Externo (opcional)", "externalId", "text", "ID de FRAME")}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Importar Contratos desde Excel</h3>
              <button onClick={() => { setShowImport(false); setImportFile(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><FontAwesomeIcon icon={faTimes} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Descargá la plantilla, completala y subila acá. Los contratos se actualizan/crean por nombre o ID externo.</p>
              <label className="flex items-center gap-3 px-4 py-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30">
                <FontAwesomeIcon icon={faFileExcel} className="text-emerald-600 text-xl" />
                <span className="text-sm text-gray-600 dark:text-gray-300">{importFile ? importFile.name : "Seleccionar archivo .xlsx"}</span>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
              <button onClick={() => { setShowImport(false); setImportFile(null); }} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Cancelar</button>
              <button onClick={handleImport} disabled={!importFile || importing} className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">{importing ? "Importando..." : "Importar"}</button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
