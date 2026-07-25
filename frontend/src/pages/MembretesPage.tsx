import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBuilding, faImage, faSignature, faSpinner, faPlus, faFilePdf, faPenToSquare, faIdCard } from "@fortawesome/free-solid-svg-icons";
import Swal from "sweetalert2";
import { companiesAPI, Company } from "../api/companies";
import { clientAssetsAPI } from "../api/clientAssets";
import { useAuthStore } from "../stores/authStore";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";

/**
 * ABM "Empresa/s | Membrete/s": se crea un membrete (logo + firma + aclaración/cargo) y se le asigna
 * una empresa del ABM de Empresas. Estos datos se usan al generar los documentos (contratos, releases,
 * pedidos/vacaciones) cuando la plantilla lleva membrete y firma.
 * Modelo 1:1 con Company: un "membrete" es una empresa con logo/firma cargados.
 */

const getImageUrl = (url?: string) => {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("http")) return url;
  return `${import.meta.env.VITE_API_URL}${url}`;
};

const domicilioResumen = (c: Company): string =>
  [[c.domicilioCalle, c.domicilioNumero].filter(Boolean).join(" "), c.domicilioPisoDepto, c.localidad, c.provincia]
    .filter(Boolean)
    .join(", ");

const hasMembrete = (c: Company) => Boolean(c.logoUrl || c.signatureUrl);

export function MembretesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Editor (modal)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null); // null → creando
  const [empresaId, setEmpresaId] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [firmanteNombre, setFirmanteNombre] = useState("");
  const [firmanteCargo, setFirmanteCargo] = useState("");

  const membretes = useMemo(() => companies.filter(hasMembrete), [companies]);
  const empresasSinMembrete = useMemo(() => companies.filter((c) => !hasMembrete(c)), [companies]);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      setCompanies(await companiesAPI.list());
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudieron cargar las empresas", "error");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingCompany(null);
    setEmpresaId("");
    setLogoFile(null);
    setSignatureFile(null);
    setLogoPreview(null);
    setSignaturePreview(null);
    setFirmanteNombre("");
    setFirmanteCargo("");
    setModalOpen(true);
  };

  const openEdit = (c: Company) => {
    setEditingCompany(c);
    setEmpresaId(c._id);
    setLogoFile(null);
    setSignatureFile(null);
    setLogoPreview(c.logoUrl || null);
    setSignaturePreview(c.signatureUrl || null);
    setFirmanteNombre(c.firmanteNombre || "");
    setFirmanteCargo(c.firmanteCargo || "");
    setModalOpen(true);
  };

  // Al elegir empresa (modo creación), pre-cargar su firmante si ya lo tiene del ABM de Empresas.
  const onSelectEmpresa = (id: string) => {
    setEmpresaId(id);
    const c = companies.find((x) => x._id === id);
    setFirmanteNombre(c?.firmanteNombre || "");
    setFirmanteCargo(c?.firmanteCargo || "");
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>, kind: "logo" | "signature") => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
      Swal.fire("Error", "Formato no válido. Solo se permiten PNG y JPG.", "error");
      e.target.value = "";
      return;
    }
    if (kind === "logo") {
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    } else {
      setSignatureFile(file);
      setSignaturePreview(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    const targetId = editingCompany?._id || empresaId;
    if (!targetId) {
      Swal.fire("Falta la empresa", "Elegí una empresa para el membrete.", "warning");
      return;
    }
    try {
      setSaving(true);
      const clientId = useAuthStore.getState().user?.clientId || useAuthStore.getState().tenantId || "system";
      const payload: Partial<Company> = { firmanteNombre, firmanteCargo };

      if (logoFile) {
        const up = await clientAssetsAPI.upload("brandkit", logoFile, clientId);
        payload.logoUrl = up.path;
      }
      if (signatureFile) {
        const up = await clientAssetsAPI.upload("brandkit", signatureFile, clientId);
        payload.signatureUrl = up.path;
      }

      const updated = await companiesAPI.update(targetId, payload);
      setCompanies((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      // Si el backend no persistió el logo/firma (schema viejo sin reiniciar), avisamos.
      if ((logoFile && !updated.logoUrl) || (signatureFile && !updated.signatureUrl)) {
        Swal.fire("Atención", "Se guardó, pero el logo/firma no quedó persistido. Reiniciá el backend (tomó campos nuevos del modelo) y volvé a intentar.", "warning");
      } else {
        Swal.fire("Guardado", "Membrete guardado correctamente", "success");
      }
      setModalOpen(false);
    } catch (error: any) {
      console.error(error);
      const msg = error?.response?.data?.error || error?.message || "No se pudo guardar el membrete";
      Swal.fire("Error", msg, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner message="Cargando empresas..." />;

  const empresaSeleccionada = companies.find((c) => c._id === empresaId) || editingCompany || null;

  return (
    <PageLayout
      title="Empresa/s | Membrete/s"
      faIcon={{ icon: faFilePdf }}
      subtitle="Creá un membrete (logo + firma) y asignale una empresa del ABM. Se usa en los documentos que llevan membrete."
      itemCount={membretes.length}
      headerActions={
        <button type="button" onClick={openCreate} className="btn-primary px-4 py-2 flex items-center gap-2">
          <FontAwesomeIcon icon={faPlus} />
          Nuevo Membrete
        </button>
      }
    >
      {companies.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-500">
          No hay empresas creadas. Creá empresas en el ABM de <strong>Empresas</strong> para poder configurar su membrete.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {membretes.map((c) => (
            <div key={c._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="w-14 h-14 rounded-lg bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                  {c.logoUrl ? <img src={getImageUrl(c.logoUrl)} alt="" className="w-full h-full object-contain" /> : <FontAwesomeIcon icon={faBuilding} className="text-gray-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{c.razonSocial}</p>
                  <p className="text-xs text-gray-400 truncate">{c.cuit || "Sin CUIT"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gray-100 dark:border-gray-700 pt-3">
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1">
                    <FontAwesomeIcon icon={faImage} className={c.logoUrl ? "text-emerald-500" : "text-gray-300 dark:text-gray-600"} /> Logo
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FontAwesomeIcon icon={faSignature} className={c.signatureUrl ? "text-emerald-500" : "text-gray-300 dark:text-gray-600"} /> Firma
                  </span>
                </div>
                <button type="button" onClick={() => openEdit(c)} className="p-2 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors" title="Editar membrete">
                  <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {/* Card "Nuevo Membrete" */}
          <button
            type="button"
            onClick={openCreate}
            className="min-h-[7rem] rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
          >
            <FontAwesomeIcon icon={faPlus} className="h-6 w-6" />
            <span className="text-sm font-semibold">Nuevo Membrete</span>
          </button>
        </div>
      )}

      {/* Modal Crear / Editar */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCompany ? "Editar Membrete" : "Nuevo Membrete"}
        subtitle={editingCompany ? editingCompany.razonSocial : "Elegí la empresa y cargá su logo y firma"}
        size="lg"
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn-primary px-6 py-2 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={saving ? faSpinner : faPlus} spin={saving} />
              {saving ? "Guardando..." : "Guardar Membrete"}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Empresa */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Empresa *</label>
            {editingCompany ? (
              <div className="px-3 py-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 text-sm font-semibold text-gray-800 dark:text-gray-200">{editingCompany.razonSocial}</div>
            ) : (
              <select value={empresaId} onChange={(e) => onSelectEmpresa(e.target.value)} className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="">Seleccioná una empresa...</option>
                {empresasSinMembrete.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.razonSocial}
                    {c.cuit ? ` — ${c.cuit}` : ""}
                  </option>
                ))}
              </select>
            )}
            {!editingCompany && empresasSinMembrete.length === 0 && <p className="text-xs text-amber-600 mt-1">Todas las empresas ya tienen membrete. Editá uno existente desde la lista.</p>}
          </div>

          {/* Datos de la empresa (solo lectura) */}
          {empresaSeleccionada && (
            <div className="rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <FontAwesomeIcon icon={faIdCard} className="text-gray-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Datos (se editan en Empresas)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-gray-400">CUIT: </span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{empresaSeleccionada.cuit || "—"}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-gray-400">Domicilio: </span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{domicilioResumen(empresaSeleccionada) || "—"}</span>
                </div>
              </div>
            </div>
          )}

          {/* Logo + Firma */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faImage} /> Logo de la Empresa
              </label>
              <div className="h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col justify-between items-center">
                {logoPreview ? (
                  <div className="flex-1 flex items-center justify-center w-full">
                    <img src={getImageUrl(logoPreview)} alt="Logo" className="max-h-28 mx-auto object-contain" />
                  </div>
                ) : (
                  <div className="text-gray-400 flex-1 flex flex-col justify-center items-center">
                    <FontAwesomeIcon icon={faImage} size="2x" />
                    <p className="text-xs mt-1">Sin logo cargado</p>
                  </div>
                )}
                <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={(e) => onFileChange(e, "logo")} className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FontAwesomeIcon icon={faSignature} /> Firma
              </label>
              <div className="h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col justify-between items-center">
                {signaturePreview ? (
                  <div className="flex-1 flex items-center justify-center w-full">
                    <img src={getImageUrl(signaturePreview)} alt="Firma" className="max-h-28 mx-auto object-contain" />
                  </div>
                ) : (
                  <div className="text-gray-400 flex-1 flex flex-col justify-center items-center">
                    <FontAwesomeIcon icon={faSignature} size="2x" />
                    <p className="text-xs mt-1">Sin firma cargada</p>
                  </div>
                )}
                <input type="file" accept="image/png, image/jpeg, image/jpg" onChange={(e) => onFileChange(e, "signature")} className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300" />
              </div>
            </div>
          </div>

          {/* Aclaración + Cargo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aclaración de Firma (Nombre)</label>
              <input value={firmanteNombre} onChange={(e) => setFirmanteNombre(e.target.value)} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. Juan Pérez" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cargo / Puesto</label>
              <input value={firmanteCargo} onChange={(e) => setFirmanteCargo(e.target.value)} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. Socio Gerente" />
            </div>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}

export default MembretesPage;
