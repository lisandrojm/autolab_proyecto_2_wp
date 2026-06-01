import React, { useState, useEffect } from "react";
import { fuzzyMatch } from "../utils/searchHelpers";
import { categoriaSatAPI, CategoriaSatItem } from "../api/categoriasSat";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListCheck, faChevronUp, faChevronDown, faDownload, faUpload, faFileExcel, faArrowLeft } from "@fortawesome/free-solid-svg-icons";

type SortField = "numeroCategoria" | "nombre" | "sueldoBruto" | "neto" | "codigoAfip" | "presentismo" | "sueldoBasico" | "sueldoAdicional" | "fechaActualizacion";
type SortDir = "asc" | "desc";

const formatCurrency = (value: number | undefined | null): string => {
  if (value === undefined || value === null) return "—";
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });
};

const formatDate = (value: string | Date | undefined | null): string => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-AR");
  } catch {
    return String(value);
  }
};

export const CategoriasSatPage: React.FC = () => {
  const [categorias, setCategorias] = useState<CategoriaSatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("numeroCategoria");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Bulk Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  useEffect(() => {
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      setLoading(true);
      const data = await categoriaSatAPI.list();
      setCategorias(data);
    } catch (error) {
      console.error("Error fetching categorias SAT:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <FontAwesomeIcon icon={faChevronUp} className="h-2.5 w-2.5 opacity-0 group-hover:opacity-30 ml-1" />;
    return <FontAwesomeIcon icon={sortDir === "asc" ? faChevronUp : faChevronDown} className="h-2.5 w-2.5 text-blue-500 ml-1" />;
  };

  const filtered = categorias
    .filter((c) => {
      const q = searchTerm.trim().toLowerCase();
      if (q.length === 0) return true;
      return (
        fuzzyMatch(c.name || "", q) ||
        fuzzyMatch(c.data?.nombre || "", q) ||
        fuzzyMatch(String(c.data?.numeroCategoria ?? ""), q) ||
        fuzzyMatch(String(c.data?.codigoAfip ?? ""), q) ||
        fuzzyMatch(c.data?.sueldoBrutoLetras || "", q) ||
        fuzzyMatch(c.data?.sueldoNetoLetras || "", q)
      );
    })
    .sort((a, b) => {
      const valA = a.data?.[sortField];
      const valB = b.data?.[sortField];
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === "number" && typeof valB === "number") {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
      return sortDir === "asc"
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

  const handleDownloadTemplate = async () => {
    try {
      const blob = await categoriaSatAPI.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "plantilla_categorias_sat.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      sweetAlert.success("Descarga exitosa", "La plantilla de Excel se ha descargado correctamente");
    } catch (error) {
      console.error("Error downloading template:", error);
      sweetAlert.error("Error", "No se pudo descargar la plantilla");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setImportErrors([]);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    try {
      setImporting(true);
      setImportErrors([]);
      const res = await categoriaSatAPI.importExcel(importFile);
      sweetAlert.success(
        "Importación completada",
        `Se han procesado correctamente ${res.count} categorías.`
      );
      setShowImportModal(false);
      setImportFile(null);
      fetchCategorias();
    } catch (error: any) {
      console.error("Import error:", error);
      const resErrors = error.response?.data?.details;
      const resMsg = error.response?.data?.error || "Error al importar el archivo Excel";

      if (Array.isArray(resErrors)) {
        setImportErrors(resErrors);
      } else {
        sweetAlert.error("Error de importación", resMsg);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <PageLayout
      title="Categorías SAT"
      itemCount={filtered.length}
      subtitle="Listado de categorías SAT sincronizadas desde la base de datos"
      faIcon={{ icon: faListCheck }}
      shouldShowInfo={false}
      headerActions={
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95"
            title="Descargar Plantilla"
          >
            <FontAwesomeIcon icon={faDownload} className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="hidden md:block">Descargar Plantilla</span>
          </button>
          <button
            onClick={() => {
              setImportFile(null);
              setImportErrors([]);
              setShowImportModal(true);
            }}
            className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md shadow-green-500/20 active:scale-95"
            title="Carga Masiva (Excel)"
          >
            <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
            <span className="hidden md:block">Carga Masiva</span>
          </button>
        </div>
      }
      searchAndFilters={
        <div className="flex-1 w-full">
          <SearchAndFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Buscar por nombre, categoría, código AFIP..."
          />
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando categorías SAT..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={faListCheck}
          title="No hay categorías SAT"
          description={searchTerm ? "No se encontraron categorías que coincidan con la búsqueda." : "No se encontraron categorías SAT en la base de datos."}
        />
      ) : (
        <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm mx-0.5 lg:mx-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort("numeroCategoria")}>
                    <div className="flex items-center">Nº Cat.<SortIcon field="numeroCategoria" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort("nombre")}>
                    <div className="flex items-center">Nombre<SortIcon field="nombre" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort("sueldoBasico")}>
                    <div className="flex items-center">Sueldo Básico<SortIcon field="sueldoBasico" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort("sueldoAdicional")}>
                    <div className="flex items-center">Adicional<SortIcon field="sueldoAdicional" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort("sueldoBruto")}>
                    <div className="flex items-center">Sueldo Bruto<SortIcon field="sueldoBruto" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none hidden xl:table-cell" onClick={() => handleSort("presentismo")}>
                    <div className="flex items-center">Presentismo<SortIcon field="presentismo" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none" onClick={() => handleSort("neto")}>
                    <div className="flex items-center">Neto<SortIcon field="neto" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none hidden lg:table-cell" onClick={() => handleSort("codigoAfip")}>
                    <div className="flex items-center">Cód. AFIP<SortIcon field="codigoAfip" /></div>
                  </th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer group select-none hidden lg:table-cell" onClick={() => handleSort("fechaActualizacion")}>
                    <div className="flex items-center">Actualización<SortIcon field="fechaActualizacion" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filtered.map((cat) => (
                  <tr key={cat._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center h-7 w-10 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold">
                        {cat.data?.numeroCategoria ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cat.data?.nombre || cat.name || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(cat.data?.sueldoBasico)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(cat.data?.sueldoAdicional)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-emerald-700 dark:text-emerald-400 font-semibold">{formatCurrency(cat.data?.sueldoBruto)}</span>
                      {cat.data?.sueldoBrutoLetras && (
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[150px]" title={cat.data.sueldoBrutoLetras}>
                          {cat.data.sueldoBrutoLetras}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">{formatCurrency(cat.data?.presentismo)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-blue-700 dark:text-blue-400 font-bold">{formatCurrency(cat.data?.neto)}</span>
                      {cat.data?.sueldoNetoLetras && (
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[150px]" title={cat.data.sueldoNetoLetras}>
                          {cat.data.sueldoNetoLetras}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        {cat.data?.codigoAfip ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(cat.data?.fechaActualizacion)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals / Summary Footer */}
          <div className="bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Mostrando <span className="font-bold text-gray-700 dark:text-gray-300">{filtered.length}</span> de <span className="font-bold text-gray-700 dark:text-gray-300">{categorias.length}</span> categorías
            </span>
          </div>
        </div>
      )}
      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faFileExcel} className="text-green-600 dark:text-green-400 h-5 w-5" />
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Carga Masiva de Categorías SAT</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-5 space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                <p className="font-semibold mb-1">Instrucciones de Carga:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Descarga la plantilla de Excel provista.</li>
                  <li>Completa las columnas obligatorias: <strong>Nº Categoría</strong> y <strong>Nombre</strong>.</li>
                  <li>Sube tu archivo completado en esta ventana.</li>
                  <li>Si un Nº Categoría ya existe, la carga masiva actualizará sus datos automáticamente (upsert).</li>
                </ol>
              </div>

              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/20 hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer relative group">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  required
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <FontAwesomeIcon icon={faFileExcel} className="h-10 w-10 text-green-500 dark:text-green-400 mb-3 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {importFile ? importFile.name : "Selecciona o arrastra tu archivo Excel"}
                </span>
                <span className="text-xs text-gray-500 mt-1">Soporta archivos .xlsx y .xls</span>
              </div>

              {importErrors.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 rounded-lg text-xs text-red-600 dark:text-red-400 space-y-1">
                  <p className="font-bold mb-1">Se encontraron los siguientes errores:</p>
                  {importErrors.map((err, idx) => (
                    <p key={idx}>{err}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 rounded-lg h-10 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="flex-1 rounded-lg h-10 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-md shadow-green-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {importing ? "Importando..." : "Subir e Importar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
