import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBuilding, faPlus, faEdit, faTrash, faSearch } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { sweetAlert } from "../utils/sweetAlert";
import { fuzzyMatch } from "../utils/searchHelpers";
import { companiesAPI, Company, CompanyInput } from "../api/companies";

const EMPTY_FORM: CompanyInput = {
  razonSocial: "",
  cuit: "",
  domicilioCalle: "",
  domicilioNumero: "",
  domicilioPisoDepto: "",
  localidad: "",
  provincia: "",
  codigoPostal: "",
  firmanteNombre: "",
  firmanteDni: "",
  firmanteCargo: "",
  representanteLegalNombre: "",
  representanteLegalEmail: "",
};

export const EmpresasPage: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [form, setForm] = useState<CompanyInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setCompanies(await companiesAPI.list());
    } catch (error) {
      console.error("Error fetching companies:", error);
      sweetAlert.error("Error", "No se pudieron cargar las empresas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return companies;
    return companies.filter(
      (c) => fuzzyMatch(c.razonSocial || "", search) || fuzzyMatch(c.cuit || "", search) || fuzzyMatch(c.representanteLegalNombre || "", search),
    );
  }, [companies, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setForm({
      razonSocial: c.razonSocial || "",
      cuit: c.cuit || "",
      domicilioCalle: c.domicilioCalle || "",
      domicilioNumero: c.domicilioNumero || "",
      domicilioPisoDepto: c.domicilioPisoDepto || "",
      localidad: c.localidad || "",
      provincia: c.provincia || "",
      codigoPostal: c.codigoPostal || "",
      firmanteNombre: c.firmanteNombre || "",
      firmanteDni: c.firmanteDni || "",
      firmanteCargo: c.firmanteCargo || "",
      representanteLegalNombre: c.representanteLegalNombre || "",
      representanteLegalEmail: c.representanteLegalEmail || "",
    });
    setShowModal(true);
  };

  const setField = (key: keyof CompanyInput, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razonSocial.trim()) {
      sweetAlert.error("Datos incompletos", "La razón social es obligatoria");
      return;
    }
    try {
      setSaving(true);
      if (editing) {
        await companiesAPI.update(editing._id, form);
        sweetAlert.success("Empresa actualizada", "Los cambios se guardaron correctamente");
      } else {
        await companiesAPI.create(form);
        sweetAlert.success("Empresa creada", "La empresa se creó correctamente");
      }
      setShowModal(false);
      fetchCompanies();
    } catch (error: any) {
      console.error("Error saving company:", error);
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo guardar la empresa");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: Company) => {
    const result = await sweetAlert.confirm("¿Eliminar empresa?", `¿Seguro que querés eliminar "${c.razonSocial}"? Esta acción no se puede deshacer.`);
    if (!result.isConfirmed) return;
    try {
      await companiesAPI.remove(c._id);
      sweetAlert.success("Empresa eliminada", "La empresa fue eliminada correctamente");
      fetchCompanies();
    } catch (error: any) {
      console.error("Error deleting company:", error);
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo eliminar la empresa");
    }
  };

  const inputClass = "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm";
  const labelClass = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  const field = (label: string, key: keyof CompanyInput, opts?: { required?: boolean; placeholder?: string; type?: string }) => (
    <div>
      <label className={labelClass}>
        {label} {opts?.required && <span className="text-red-500">*</span>}
      </label>
      <input type={opts?.type || "text"} className={inputClass} value={(form[key] as string) || ""} onChange={(e) => setField(key, e.target.value)} placeholder={opts?.placeholder} required={opts?.required} />
    </div>
  );

  const domicilioResumen = (c: Company) => [c.domicilioCalle, c.domicilioNumero].filter(Boolean).join(" ") + (c.localidad ? `, ${c.localidad}` : "") + (c.codigoPostal ? ` (${c.codigoPostal})` : "");

  return (
    <PageLayout
      title="Empresas"
      subtitle="Empresas / productoras con sus datos para armar los contratos."
      faIcon={{ icon: faBuilding }}
      itemCount={filtered.length}
      headerActions={
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
          Nueva Empresa
        </button>
      }
      searchAndFilters={
        <div className="relative w-full">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <FontAwesomeIcon icon={faSearch} />
          </span>
          <input type="text" className={`${inputClass} pl-10 h-10`} placeholder="Buscar por razón social, CUIT o representante..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando empresas..." />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay empresas" description={search ? "No se encontraron empresas con esa búsqueda." : 'Creá la primera empresa con el botón "Nueva Empresa".'} icon={faBuilding} />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/50 shadow-sm">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-4 py-3">Razón Social</th>
                <th className="px-4 py-3">CUIT</th>
                <th className="px-4 py-3">Domicilio Legal</th>
                <th className="px-4 py-3">Firmante</th>
                <th className="px-4 py-3">Representante Legal</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {filtered.map((c) => (
                <tr key={c._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100">{c.razonSocial}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{c.cuit || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400 max-w-[280px] truncate" title={domicilioResumen(c)}>{domicilioResumen(c) || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {c.firmanteNombre ? (
                      <div className="flex flex-col">
                        <span className="text-gray-800 dark:text-gray-200">{c.firmanteNombre}</span>
                        {c.firmanteCargo && <span className="text-[11px] text-gray-400">{c.firmanteCargo}</span>}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {c.representanteLegalNombre ? (
                      <div className="flex flex-col">
                        <span className="text-gray-800 dark:text-gray-200">{c.representanteLegalNombre}</span>
                        {c.representanteLegalEmail && <span className="text-[11px] text-gray-400">{c.representanteLegalEmail}</span>}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition-colors" title="Editar">
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button onClick={() => handleDelete(c)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Eliminar">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Editar Empresa" : "Nueva Empresa"}
        subtitle="Datos de la empresa para armar los contratos"
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" form="company-form" disabled={saving} className="btn-primary px-6 py-2 disabled:opacity-50">
              {saving ? "Guardando..." : editing ? "Guardar" : "Crear"}
            </button>
          </div>
        }
      >
        <form id="company-form" onSubmit={handleSave} className="space-y-6">
          {/* Datos generales */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Datos generales</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field("Razón Social", "razonSocial", { required: true, placeholder: "Ej: 2030 S.R.L." })}
              {field("CUIT", "cuit", { placeholder: "30-71706837-4" })}
            </div>
          </div>

          {/* Domicilio legal */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Domicilio legal</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field("Calle", "domicilioCalle", { placeholder: "Ruiz Huidobro" })}
              {field("Número", "domicilioNumero", { placeholder: "4365" })}
              {field("Piso / Depto", "domicilioPisoDepto")}
              {field("Localidad", "localidad", { placeholder: "CABA" })}
              {field("Provincia", "provincia")}
              {field("Código Postal", "codigoPostal", { placeholder: "1430" })}
            </div>
          </div>

          {/* Firmante */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Firmante</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {field("Nombre", "firmanteNombre", { placeholder: "Norma Olivo" })}
              {field("DNI", "firmanteDni", { placeholder: "5.453.082" })}
              {field("Cargo", "firmanteCargo", { placeholder: "Socio Gerente" })}
            </div>
          </div>

          {/* Representante legal */}
          <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
            <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Representante legal</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {field("Nombre", "representanteLegalNombre", { placeholder: "Hernán Marcelo Pellegrini" })}
              {field("Email", "representanteLegalEmail", { type: "email", placeholder: "hernan.pellegrini@frame.com.ar" })}
            </div>
          </div>
        </form>
      </Modal>
    </PageLayout>
  );
};
