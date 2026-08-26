import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot, faPlus, faEdit, faTrash, faTriangleExclamation, faDownload, faFileImport, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { sweetAlert } from "../utils/sweetAlert";
import { fuzzyMatch } from "../utils/searchHelpers";
import { arcaSucursalesAPI, ArcaSucursal, ArcaSucursalInput } from "../api/arcaSucursales";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { ActividadesDelDomicilio } from "../components/arca/ActividadesDelDomicilio";

const HELP_KEY = "arcaSucursales" as const;


const FORM_VACIO: ArcaSucursalInput = { codigo: "", domicilio: "", localidad: "", codigoPostal: "", actividades: [], isActive: true };

/**
 * ABM de Sucursales del padrón de ARCA. Acá se carga TODO el dato de la sucursal; las empresas
 * después solo eligen cuáles les corresponden (Configuración → Empresas).
 */
export const ArcaSucursalesPage: React.FC = () => {
  const [items, setItems] = useState<ArcaSucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<ArcaSucursal | null>(null);
  const [form, setForm] = useState<ArcaSucursalInput>(FORM_VACIO);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const helpEntry = getHelp(HELP_KEY);


  const cargar = async () => {
    try {
      setLoading(true);
      setItems(await arcaSucursalesAPI.list());
    } catch (e) {
      console.error("Error cargando sucursales:", e);
      sweetAlert.error("Error", "No se pudieron cargar las sucursales.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    if (!search.trim()) return items;
    return items.filter((s) => fuzzyMatch(s.domicilio || "", search) || (s.codigo || "").includes(search.replace(/\D/g, "")) || s.actividades.some((a) => a.codigo.includes(search.replace(/\D/g, "")) || fuzzyMatch(a.descripcion || "", search)));
  }, [items, search]);

  const abrirCrear = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setShowModal(true);
  };

  const abrirEditar = (s: ArcaSucursal) => {
    setEditando(s);
    setForm({
      codigo: s.codigo || "",
      domicilio: s.domicilio || "",
      localidad: s.localidad || "",
      codigoPostal: s.codigoPostal || "",
      actividades: (s.actividades || []).map((a) => ({ codigo: a.codigo, descripcion: a.descripcion || "" })),
      isActive: s.isActive !== false,
    });
    setShowModal(true);
  };

  const guardar = async () => {
    if (!form.codigo.trim()) return sweetAlert.error("Datos incompletos", "El código de sucursal es obligatorio.");
    if (!form.domicilio.trim()) return sweetAlert.error("Datos incompletos", "El domicilio es obligatorio.");
    // Las filas de actividad vacías son ruido del formulario: el backend las rechaza.
    const payload: Partial<ArcaSucursalInput> = { ...form, actividades: form.actividades.filter((a) => a.codigo.trim() !== "") };
    try {
      setSaving(true);
      if (editando) await arcaSucursalesAPI.update(editando._id, payload);
      else await arcaSucursalesAPI.create(payload);
      sweetAlert.success(editando ? "Sucursal actualizada" : "Sucursal creada", "Los cambios se guardaron correctamente.");
      setShowModal(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar la sucursal.");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (s: ArcaSucursal) => {
    const res = await sweetAlert.confirm(`¿Eliminar la sucursal ${s.codigo}?`, s.domicilio, "Sí, eliminar");
    if (!res.isConfirmed) return;
    try {
      await arcaSucursalesAPI.remove(s._id);
      sweetAlert.success("Eliminada", "La sucursal fue eliminada.");
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo eliminar la sucursal.");
    }
  };

  const importar = async () => {
    if (!importFile) return;
    try {
      setImporting(true);
      const r = await arcaSucursalesAPI.import(importFile);
      const partes = [`${r.creadas} nueva(s)`, `${r.actualizadas} actualizada(s)`, `${r.iguales} sin cambios`];
      const avisos: string[] = [];
      // El diccionario de actividades se alimenta del padrón: se avisa porque es un efecto del import
      // que no se ve en esta pantalla, y es lo que después autocompleta los códigos.
      if (r.actividadesNuevas) avisos.push(`Se agregaron ${r.actividadesNuevas} actividad(es) al diccionario de Actividades.`);
      if (r.sobrantes.length > 0) avisos.push(`${r.sobrantes.length} sucursal(es) de WeProdu no vienen en el archivo y NO se borraron (${r.sobrantes.join(", ")}): revisá si les dieron de baja en ARCA.`);
      if (r.sinDomicilio.length > 0) avisos.push(`Se saltearon ${r.sinDomicilio.length} sin domicilio (${r.sinDomicilio.join(", ")}).`);
      if (r.errores.length > 0) avisos.push(`${r.errores.length} fila(s) con problemas: ${r.errores.slice(0, 5).join("; ")}`);
      if (avisos.length > 0) sweetAlert.info("Importación terminada", `${partes.join(" · ")}.\n\n${avisos.join("\n")}`);
      else sweetAlert.success("Importación terminada", `${partes.join(" · ")}.`);
      setShowImport(false);
      setImportFile(null);
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo importar el archivo.");
    } finally {
      setImporting(false);
    }
  };


  return (
    <PageLayout
      title="Domicilios de Explotación"
      subtitle="Domicilios de desempeño del padrón de ARCA, con su código y sus actividades."
      itemCount={loading ? undefined : filtrados.length}
      faIcon={{ icon: faLocationDot }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}
      headerActions={
        <div className="flex items-center gap-2">
          <button onClick={() => arcaSucursalesAPI.downloadTemplate().catch(() => sweetAlert.error("Error", "No se pudo descargar la plantilla."))} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" /> Plantilla
          </button>
          <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
            <FontAwesomeIcon icon={faFileImport} className="h-3.5 w-3.5" /> Importar de ARCA
          </button>
          <button onClick={abrirCrear} title="Nueva sucursal" aria-label="Nueva sucursal" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <FontAwesomeIcon icon={faPlus} />
          </button>
        </div>
      }
      searchAndFilters={<SearchAndFilters searchTerm={search} onSearchChange={setSearch} searchPlaceholder="Buscar por código, domicilio o actividad..." />}
    >
      {loading ? (
        <LoadingSpinner />
      ) : filtrados.length === 0 ? (
        <EmptyState icon={faLocationDot} title={items.length === 0 ? "Todavía no hay sucursales" : "Sin resultados"} description={items.length === 0 ? 'Cargá las sucursales del padrón de ARCA con el botón "+". Después se asignan a cada empresa desde Configuración → Empresas.' : "Probá con otra búsqueda."} />
      ) : (
        <div className="mt-6 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Código</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Domicilio</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actividades</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filtrados.map((s) => (
                  <tr key={s._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800/50">{s.codigo}</span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{s.domicilio}</p>
                      {(s.localidad || s.codigoPostal) && <p className="text-xs text-gray-500 dark:text-gray-400">{[s.codigoPostal && `CP ${s.codigoPostal}`, s.localidad].filter(Boolean).join(" · ")}</p>}
                    </td>
                    <td className="px-6 py-4">
                      {s.actividades.length === 0 ? (
                        <span className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" /> Sin actividades
                        </span>
                      ) : (
                        <span className="inline-flex flex-wrap gap-1.5">
                          {s.actividades.map((a) => (
                            <span key={a.codigo} title={a.descripcion} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600">
                              <span className="font-mono font-semibold">{a.codigo}</span>
                              {a.descripcion && <span className="truncate max-w-[18rem]">{a.descripcion}</span>}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(s)} title="Editar sucursal" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button onClick={() => eliminar(s)} title="Eliminar sucursal" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editando ? "Editar Sucursal" : "Nueva Sucursal"}
        subtitle="Datos del domicilio de desempeño tal como figura en el padrón de ARCA"
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>
              Cancelar
            </button>
            <button onClick={guardar} className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : editando ? "Actualizar" : "Crear"}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Código * · 5 díg.</label>
              <input maxLength={5} inputMode="numeric" className="input-field w-full font-mono" value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value.replace(/\D/g, "") }))} placeholder="00001" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Domicilio *</label>
              <input className="input-field w-full" value={form.domicilio} onChange={(e) => setForm((p) => ({ ...p, domicilio: e.target.value }))} placeholder="ZAPIOLA 392" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Código Postal</label>
              <input className="input-field w-full" value={form.codigoPostal || ""} onChange={(e) => setForm((p) => ({ ...p, codigoPostal: e.target.value }))} placeholder="1426" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Localidad</label>
              <input className="input-field w-full" value={form.localidad || ""} onChange={(e) => setForm((p) => ({ ...p, localidad: e.target.value }))} placeholder="CIUDAD AUTONOMA BUENOS AIRES" />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            {/* Las actividades se ELIGEN del catálogo, no se tipean: es lo que garantiza que la misma
                actividad no termine escrita de dos formas distintas en dos domicilios. */}
            <ActividadesDelDomicilio actividades={form.actividades} onChange={(actividades) => setForm((p) => ({ ...p, actividades }))} />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Importar sucursales de ARCA"
        subtitle="Archivo de “Exportar lista a archivo” (Domicilios de Explotación) o la plantilla"
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setShowImport(false)} className="btn-secondary" disabled={importing}>
              Cancelar
            </button>
            <button onClick={importar} className="btn-primary" disabled={!importFile || importing}>
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <label className="flex items-center gap-3 px-4 py-6 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/30">
            <FontAwesomeIcon icon={importing ? faSpinner : faFileImport} spin={importing} className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-300">{importFile ? importFile.name : "Elegí un archivo .xlsx, .xls o .csv"}</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => setImportFile(e.target.files?.[0] || null)} />
          </label>

          <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 px-3 py-2.5">
            <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
              Es una <strong>sincronización</strong>: las actividades de cada sucursal se reemplazan por las del archivo, así que una actividad dada de baja en ARCA desaparece acá. Las sucursales que estén en WeProdu y no en el archivo <strong>no se borran</strong> (puede haber contratos usándolas): se te avisa cuáles son para que las revises.
            </p>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};
