import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileContract, faDownload, faUpload, faPlus, faEdit, faTrash, faFileExcel, faPaperclip, faEye } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Modal } from "../components/ui/Modal";
import { Card } from "../components/ui/Card";
import { ViewToggle, ViewMode } from "../components/ui/ViewToggle";
import { sweetAlert } from "../utils/sweetAlert";
import { fuzzyMatch } from "../utils/searchHelpers";
import { contratoFrameAPI, ContratoFrameItem } from "../api/contratosFrame";
import { ContratoViewerModal } from "../components/contratos/ContratoViewerModal";

const emptyForm = { nombre: "", externalId: "", cantidadJornadas: "", multiplicadorDiario: "" };

export const ContratosFramePage: React.FC = () => {
  const HELP_KEY = "contratosFrame" as const;
  const helpEntry = getHelp(HELP_KEY);
  const [showInfo, setShowInfo] = useState(false);
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
  const [esTiempoIndeterminado, setEsTiempoIndeterminado] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const [viewing, setViewing] = useState<ContratoFrameItem | null>(null);

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
    setEsTiempoIndeterminado(false);
    setSelectedFile(null);
    setShowModal(true);
  };

  const openEdit = (item: ContratoFrameItem) => {
    setEditing(item);
    setForm({
      nombre: item.name || "",
      externalId: item.externalId || "",
      cantidadJornadas: String(item.data?.cantidadJornadas ?? ""),
      multiplicadorDiario: String(item.data?.multiplicadorDiario ?? ""),
    });
    setEsTiempoIndeterminado(!!item.data?.esTiempoIndeterminado);
    setSelectedFile(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim()) {
      sweetAlert.error("Falta el nombre", "El nombre del contrato es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const payload = new FormData();
      payload.append("nombre", form.nombre.trim());
      payload.append("externalId", form.externalId.trim());
      payload.append("cantidadJornadas", form.cantidadJornadas);
      payload.append("multiplicadorDiario", form.multiplicadorDiario);
      payload.append("esTiempoIndeterminado", String(esTiempoIndeterminado));
      if (selectedFile) payload.append("file", selectedFile);

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

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    handleSave();
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

  const handleDownloadFile = async (item: ContratoFrameItem) => {
    try {
      await contratoFrameAPI.download(item);
    } catch {
      sweetAlert.error("Error", "No se pudo descargar el archivo.");
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
        className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
      />
    </div>
  );

  return (
    <PageLayout title="Contratos" subtitle="Catálogo de contratos de FRAME. Cargá registros manualmente o importá un Excel." faIcon={{ icon: faFileContract }} headerActions={headerActions} shouldShowInfo={hasHelp(HELP_KEY)} infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}>
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
                leftContent: item.data?.fileName ? (
                  <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <FontAwesomeIcon icon={faPaperclip} className="h-3 w-3" />
                    <span className="truncate max-w-[140px]">{item.data.fileName}</span>
                  </span>
                ) : undefined,
                actions: [
                  ...(item.data?.fileUrl
                    ? [
                        { icon: faEye, onClick: (e: React.MouseEvent) => { e.stopPropagation(); setViewing(item); }, title: "Visualizar", variant: "default" as const },
                        { icon: faDownload, onClick: (e: React.MouseEvent) => { e.stopPropagation(); handleDownloadFile(item); }, title: "Descargar", variant: "default" as const },
                      ]
                    : []),
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
                    {item.data?.fileUrl && (
                      <>
                        <button onClick={() => setViewing(item)} className="text-gray-600 hover:text-gray-800 dark:text-gray-300 mr-3" title="Visualizar"><FontAwesomeIcon icon={faEye} /></button>
                        <button onClick={() => handleDownloadFile(item)} className="text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 mr-3" title="Descargar"><FontAwesomeIcon icon={faDownload} /></button>
                      </>
                    )}
                    <button onClick={() => openEdit(item)} className="text-blue-600 hover:text-blue-800 dark:text-blue-400 mr-3" title="Editar"><FontAwesomeIcon icon={faEdit} /></button>
                    <button onClick={() => handleDelete(item)} className="text-rose-600 hover:text-rose-800 dark:text-rose-400" title="Eliminar"><FontAwesomeIcon icon={faTrash} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditing(null);
        }}
        title={editing ? "Editar Contrato" : "Nuevo Contrato"}
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              onClick={() => {
                setShowModal(false);
                setEditing(null);
              }}
            >
              Cancelar
            </button>
            <button type="submit" form="contrato-form" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Guardando..." : editing ? "Actualizar" : "Crear"}
            </button>
          </div>
        }
      >
        <form id="contrato-form" onSubmit={handleSubmitForm}>
          <div className="space-y-6">
            {field("Nombre *", "nombre")}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field("Cantidad de Jornadas", "cantidadJornadas", "number")}
              {field("Multiplicador Diario", "multiplicadorDiario", "number")}
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={esTiempoIndeterminado}
                onChange={(e) => setEsTiempoIndeterminado(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              Es tiempo indeterminado
            </label>

            {/* Archivo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Archivo</label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
                  <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
                  Subir archivo
                </button>
                <span className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[260px]">{selectedFile ? selectedFile.name : editing?.data?.fileName ? `Actual: ${editing.data.fileName}` : "Ningún archivo seleccionado"}</span>
                {editing?.data?.fileUrl && (
                  <>
                    <button type="button" onClick={() => setViewing(editing)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                      Visualizar
                    </button>
                    <button type="button" onClick={() => handleDownloadFile(editing)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                      Descargar actual
                    </button>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".doc,.docx,.pdf" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
              <p className="text-xs text-gray-500 mt-1">Tamaño máximo: 25MB.{editing ? " Si no seleccionás un archivo, se mantiene el actual." : ""}</p>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showImport}
        onClose={() => { setShowImport(false); setImportFile(null); }}
        title="Importar Contratos desde Excel"
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              onClick={() => { setShowImport(false); setImportFile(null); }}
            >
              Cancelar
            </button>
            <button onClick={handleImport} disabled={!importFile || importing} className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 border border-transparent rounded-md hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">Descargá la plantilla, completala y subila acá. Los contratos se actualizan/crean por nombre o ID externo.</p>
          <label className="flex items-center gap-3 px-4 py-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30">
            <FontAwesomeIcon icon={faFileExcel} className="text-emerald-600 text-xl" />
            <span className="text-sm text-gray-600 dark:text-gray-300">{importFile ? importFile.name : "Seleccionar archivo .xlsx"}</span>
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
          </label>
        </div>
      </Modal>

      <ContratoViewerModal contrato={viewing} isOpen={!!viewing} onClose={() => setViewing(null)} />
    </PageLayout>
  );
};
