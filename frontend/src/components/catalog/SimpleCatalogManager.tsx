import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faDownload, faUpload, faPlus, faEdit, faTrash, faTimes, faFileExcel } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../ui/PageLayout";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { sweetAlert } from "../../utils/sweetAlert";
import { fuzzyMatch } from "../../utils/searchHelpers";
import { SimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";

interface SimpleCatalogManagerProps {
  title: string;
  subtitle?: string;
  icon: IconDefinition;
  /** Etiqueta singular, ej. "banco", "obra social". */
  entityLabel: string;
  api: SimpleCatalogApi;
  /** Nombre base para el archivo descargado, ej. "bancos". */
  templateBaseName: string;
}

export const SimpleCatalogManager: React.FC<SimpleCatalogManagerProps> = ({ title, subtitle, icon, entityLabel, api, templateBaseName }) => {
  const [items, setItems] = useState<SimpleCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // ABM modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SimpleCatalogItem | null>(null);
  const [nombre, setNombre] = useState("");
  const [externalId, setExternalId] = useState("");
  const [saving, setSaving] = useState(false);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.list();
      setItems(data);
    } catch {
      sweetAlert.error("Error", `No se pudieron cargar los registros de ${entityLabel}.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((it) => !search.trim() || fuzzyMatch(it.name || "", search));

  const openCreate = () => {
    setEditing(null);
    setNombre("");
    setExternalId("");
    setShowModal(true);
  };

  const openEdit = (item: SimpleCatalogItem) => {
    setEditing(item);
    setNombre(item.name || "");
    setExternalId(item.externalId || "");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!nombre.trim()) {
      sweetAlert.error("Falta el nombre", "El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.update(editing._id, { nombre: nombre.trim(), externalId: externalId.trim() });
        sweetAlert.success("Actualizado", `${title} actualizado correctamente.`);
      } else {
        await api.create({ nombre: nombre.trim(), externalId: externalId.trim() });
        sweetAlert.success("Creado", `Registro de ${entityLabel} creado.`);
      }
      setShowModal(false);
      await load();
    } catch {
      sweetAlert.error("Error", "No se pudo guardar el registro.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: SimpleCatalogItem) => {
    const result = await sweetAlert.confirm("¿Eliminar?", `Se eliminará "${item.name}". Esta acción no se puede deshacer.`);
    if (!result.isConfirmed) return;
    try {
      await api.remove(item._id);
      sweetAlert.success("Eliminado", "Registro eliminado correctamente.");
      await load();
    } catch {
      sweetAlert.error("Error", "No se pudo eliminar el registro.");
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await api.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `plantilla_${templateBaseName}.xlsx`;
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
      const res = await api.importExcel(importFile);
      sweetAlert.success("Importación completada", `${res.count} registros procesados.`);
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

  return (
    <PageLayout title={title} subtitle={subtitle} faIcon={{ icon }} headerActions={headerActions}>
      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Buscar ${entityLabel}...`}
          className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        />
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
          {items.length === 0 ? `Todavía no hay registros de ${entityLabel}. Cargá uno con "Nuevo" o importá un Excel.` : "No hay resultados para la búsqueda."}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Externo</th>
                <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
              {filtered.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20">
                  <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.name}</td>
                  <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 font-mono">{item.externalId || "—"}</td>
                  <td className="px-5 py-3 text-sm text-right">
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-3" title="Editar">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button onClick={() => handleDelete(item)} className="text-rose-600 hover:text-rose-800 dark:text-rose-400" title="Eliminar">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ABM Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? "Editar" : "Nuevo"} {title}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ID Externo (opcional)</label>
                <input type="text" value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="ID de FRAME" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 dark:border-gray-700 px-5 py-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Importar {title} desde Excel</h3>
              <button onClick={() => { setShowImport(false); setImportFile(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">Descargá la plantilla, completala y subila acá. Los registros se actualizan/crean por nombre o ID externo.</p>
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
