import React, { useEffect, useState, useMemo } from "react";
import { infoAPI, InfoItem } from "../api/info";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { faBuilding, faTable, faGrip, faPlus, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Modal } from "../components/ui/Modal";
import { sweetAlert } from "../utils/sweetAlert";

import { getHelp, hasHelp } from "../data/help/helpContent";

interface SedeForm {
  nombre: string;
  externalId: string;
  codigoSucursal: string;
}
const FORM_VACIO: SedeForm = { nombre: "", externalId: "", codigoSucursal: "" };

export const SedesPage: React.FC = () => {
  const [sedes, setSedes] = useState<InfoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [openInfo, setOpenInfo] = useState(false);

  // ABM
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<InfoItem | null>(null);
  const [form, setForm] = useState<SedeForm>(FORM_VACIO);
  const [saving, setSaving] = useState(false);

  const HELP_KEY = "sedes";
  const helpEntry = getHelp(HELP_KEY);

  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);

  useEffect(() => {
    const handleResize = () => {
      const isNowXXL = window.innerWidth >= 1200;
      setIsXXL(isNowXXL);
      if (!isNowXXL) setViewMode("cards");
    };

    const saved = localStorage.getItem("sedesViewMode");
    if (saved === "table" || saved === "cards") {
      if (window.innerWidth >= 1200) setViewMode(saved as "table" | "cards");
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isXXL) {
      localStorage.setItem("sedesViewMode", viewMode);
    }
  }, [viewMode, isXXL]);

  const cargar = async () => {
    try {
      setLoading(true);
      const data = await infoAPI.listSedes();
      setSedes(data);
    } catch (error) {
      console.error("Error fetching sedes:", error);
      sweetAlert.error("Error", "No se pudieron cargar las sedes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filteredSedes = useMemo(() => {
    if (!searchTerm) return sedes;
    const lowerSearch = searchTerm.toLowerCase();
    return sedes.filter((s) => s.name.toLowerCase().includes(lowerSearch) || (s.externalId || "").toLowerCase().includes(lowerSearch));
  }, [sedes, searchTerm]);

  const abrirCrear = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setShowModal(true);
  };

  const abrirEditar = (sede: InfoItem) => {
    setEditando(sede);
    setForm({ nombre: sede.name || "", externalId: sede.externalId || "", codigoSucursal: sede.data?.codigoSucursal || "" });
    setShowModal(true);
  };

  const guardar = async () => {
    const nombre = form.nombre.trim();
    if (!nombre) {
      sweetAlert.error("Falta el nombre", "La sede necesita un nombre.");
      return;
    }
    const payload = { nombre, externalId: form.externalId.trim(), codigoSucursal: form.codigoSucursal.trim() };
    try {
      setSaving(true);
      if (editando) {
        await infoAPI.updateSede(editando._id, payload);
        sweetAlert.success("Sede actualizada", "Los cambios se guardaron con éxito.");
      } else {
        await infoAPI.createSede(payload);
        sweetAlert.success("Sede creada", "La sede fue creada.");
      }
      setShowModal(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar la sede.");
    } finally {
      setSaving(false);
    }
  };

  const eliminar = async (sede: InfoItem) => {
    const result = await sweetAlert.confirm("¿Eliminar sede?", `Se va a eliminar "${sede.name}". Si viene de la sincronización de FRAME, puede volver a aparecer en la próxima sync.`);
    if (!result.isConfirmed) return;
    try {
      await infoAPI.deleteSede(sede._id);
      sweetAlert.success("Eliminada", "La sede fue eliminada.");
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo eliminar la sede.");
    }
  };

  const CodigoBadge: React.FC<{ sede: InfoItem }> = ({ sede }) =>
    sede.data?.codigoSucursal ? (
      <span className="text-sm font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800/50">{sede.data.codigoSucursal}</span>
    ) : (
      <span className="text-xs text-amber-600 dark:text-amber-400">Sin cargar</span>
    );

  return (
    <PageLayout
      title="Sedes"
      subtitle="Listado de todas las sedes del sistema"
      itemCount={filteredSedes.length}
      faIcon={{ icon: faBuilding }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o ID externo..." />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={abrirCrear} title="Nueva sede" aria-label="Nueva sede" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <FontAwesomeIcon icon={faPlus} />
            </button>
            {isXXL && (
              <>
                <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                  <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
                  <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      }
    >
      {loading ? (
        <LoadingSpinner message="Cargando sedes..." />
      ) : filteredSedes.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBuilding} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron sedes</h3>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredSedes.map((sede) => (
            <div key={sede._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <FontAwesomeIcon icon={faBuilding} className="h-5 w-5 text-primary-600 dark:text-primary-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{sede.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">ID Externo: {sede.externalId || "—"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">ID Interno: {sede.data?.id ?? "N/A"}</span>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5">Cód. sucursal: <CodigoBadge sede={sede} /></span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => abrirEditar(sede)} title="Editar sede" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                    <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                  </button>
                  <button onClick={() => eliminar(sede)} title="Eliminar sede" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sede</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Externo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Interno</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">Cód. Sucursal (ARCA)</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filteredSedes.map((sede) => (
                  <tr key={sede._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <FontAwesomeIcon icon={faBuilding} className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sede.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">{sede.externalId || "—"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{sede.data?.id ?? "-"}</span>
                    </td>
                    <td className="px-6 py-4">
                      <CodigoBadge sede={sede} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => abrirEditar(sede)} title="Editar sede" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button onClick={() => eliminar(sede)} title="Eliminar sede" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
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
        title={editando ? "Editar Sede" : "Nueva Sede"}
        subtitle={editando ? editando.name : "Cargá una sede manualmente"}
        size="md"
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
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nombre *</label>
            <input className="input-field w-full" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Ej: La corte" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">ID Externo (opcional)</label>
            <input className="input-field w-full" value={form.externalId} onChange={(e) => setForm((p) => ({ ...p, externalId: e.target.value }))} placeholder="Se autogenera si lo dejás en blanco" />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Las sedes que llegan por la sincronización de FRAME traen su propio ID Externo. Para una sede manual podés dejarlo en blanco.</p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Código de sucursal (ARCA) · 5 díg.</label>
            <input maxLength={5} inputMode="numeric" className="input-field w-full" value={form.codigoSucursal} onChange={(e) => setForm((p) => ({ ...p, codigoSucursal: e.target.value.replace(/\D/g, "") }))} placeholder="Ej: 00001" />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Domicilio de desempeño. Se usa en la generación del TXT de Alta masiva de ARCA.</p>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};
