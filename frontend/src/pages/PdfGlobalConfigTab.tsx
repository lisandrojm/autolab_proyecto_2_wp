import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { pdfConfigAPI } from "../api/pdfConfig";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSave, faBuilding, faSignature, faImage, faEye, faSpinner, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../components/ui/Modal";
import Swal from "sweetalert2";
import { pdfPreviewAPI } from "../api/pdfPreview";

import { clientAssetsAPI } from "../api/clientAssets";
import { useAuthStore } from "../stores/authStore";

export function PdfGlobalConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, reset } = useForm<{
    razonSocial: string;
    cuit: string;
    ciudad: string;
    direccion: string;
    logo: FileList;
    signature: FileList;
    signerName: string;
    signerRole: string;
  }>();

  // Preview states
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);

  // Info modal
  const [showVariableInfo, setShowVariableInfo] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await pdfConfigAPI.get();

      reset({
        razonSocial: data.razonSocial || "",
        cuit: data.cuit || "",
        ciudad: data.ciudad || "",
        direccion: data.direccion || "",
        signerName: data.signerName || "",
        signerRole: data.signerRole || "",
      });

      if (data.logoUrl) setLogoPreview(data.logoUrl);
      if (data.signatureUrl) setSignaturePreview(data.signatureUrl);
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudo cargar la configuración", "error");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: any) => {
    try {
      setSaving(true);
      const formData = new FormData();
      formData.append("razonSocial", data.razonSocial);
      formData.append("cuit", data.cuit);
      formData.append("ciudad", data.ciudad);
      formData.append("direccion", data.direccion);
      formData.append("signerName", data.signerName);
      formData.append("signerRole", data.signerRole);

      const clientId = useAuthStore.getState().user?.clientId || useAuthStore.getState().tenantId || "system";

      if (data.logo && data.logo[0]) {
        try {
          const uploadRes = await clientAssetsAPI.upload("brandkit", data.logo[0], clientId);
          formData.append("logoUrl", uploadRes.path);
        } catch (error) {
          console.error("Error uploading logo:", error);
          Swal.fire("Error", "Error al subir el logo", "error");
          return;
        }
      }

      if (data.signature && data.signature[0]) {
        try {
          const uploadRes = await clientAssetsAPI.upload("brandkit", data.signature[0], clientId);
          formData.append("signatureUrl", uploadRes.path);
        } catch (error) {
          console.error("Error uploading signature:", error);
          Swal.fire("Error", "Error al subir la firma", "error");
          return;
        }
      }

      const updated = await pdfConfigAPI.update(formData);

      if (updated.logoUrl) setLogoPreview(updated.logoUrl);
      if (updated.signatureUrl) setSignaturePreview(updated.signatureUrl);

      Swal.fire("Guardado", "Configuración actualizada correctamente", "success");
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudo guardar la configuración", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
        Swal.fire("Error", "Formato no válido. Solo se permiten PNG y JPG.", "error");
        e.target.value = "";
        return;
      }
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!["image/jpeg", "image/png", "image/jpg"].includes(file.type)) {
        Swal.fire("Error", "Formato no válido. Solo se permiten PNG y JPG.", "error");
        e.target.value = "";
        return;
      }
      setSignaturePreview(URL.createObjectURL(file));
    }
  };

  const getImageUrl = (url: string) => {
    if (!url) return "";
    if (url.startsWith("blob:") || url.startsWith("http")) return url;
    return `${import.meta.env.VITE_API_URL}${url}`;
  };

  const handlePreview = async () => {
    try {
      Swal.fire({
        title: "Generando previsualización...",
        text: "Por favor espere",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const blob = await pdfPreviewAPI.previewGlobal();
      Swal.close();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudo generar la previsualización", "error");
    }
  };

  if (loading) return <LoadingSpinner message="Cargando configuración..." />;

  return (
    <div className="mx-auto p-6 bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <FontAwesomeIcon icon={faBuilding} className="text-blue-500" />
          Configuración Global y Membrete
        </h3>
        <button type="button" onClick={() => setShowVariableInfo(true)} className="text-gray-400 hover:text-blue-500 transition-colors" title="Ver variables disponibles">
          <FontAwesomeIcon icon={faInfoCircle} />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Razón Social</label>
            <input {...register("razonSocial")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. Mi Empresa S.A." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CUIT</label>
            <input {...register("cuit")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. 30-12345678-9" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ciudad Sede</label>
            <input {...register("ciudad")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. Buenos Aires" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dirección</label>
            <input {...register("direccion")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. Av. Corrientes 1234" />
          </div>
        </div>

        <hr className="border-gray-200 dark:border-gray-700" />

        {/* Images */}
        <div className="flex flex-col gap-8 w-full lg:w-1/2">
          {/* Logo */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faImage} /> Logo de la Empresa
            </label>
            <div className="h-72 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex flex-col justify-between items-center">
              {logoPreview ? (
                <div className="mb-3 relative group h-full flex items-center justify-center">
                  <img src={getImageUrl(logoPreview)} alt="Logo Preview" className="h-48 mx-auto object-contain" />
                </div>
              ) : (
                <div className="text-gray-400 mb-3 flex-1 flex flex-col justify-center items-center">
                  <FontAwesomeIcon icon={faImage} size="3x" />
                  <p className="text-xs mt-1">Sin logo cargado</p>
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg"
                  {...register("logo")}
                  onChange={handleLogoChange}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300
                 "
                />
                <p className="text-xs text-gray-500 mt-2">Formatos: PNG, JPG. Máx 5MB.</p>
              </div>
            </div>
          </div>

          {/* Signature */}
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
              <FontAwesomeIcon icon={faSignature} /> Firma por Defecto
            </label>
            <div className="h-72 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded p-4 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors flex flex-col justify-between items-center">
              {signaturePreview ? (
                <div className="mb-3 relative group h-full flex items-center justify-center">
                  <img src={getImageUrl(signaturePreview)} alt="Signature Preview" className="h-48 mx-auto object-contain" />
                </div>
              ) : (
                <div className="text-gray-400 mb-3 flex-1 flex flex-col justify-center items-center">
                  <FontAwesomeIcon icon={faSignature} size="3x" />
                  <p className="text-xs mt-1">Sin firma cargada</p>
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/jpg"
                  {...register("signature")}
                  onChange={handleSignatureChange}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100 dark:file:bg-blue-900 dark:file:text-blue-300
                 "
                />
                <p className="text-xs text-gray-500 mt-2">Formatos: PNG, JPG. Máx 5MB.</p>
              </div>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Aclaración de Firma (Nombre)</label>
                <input {...register("signerName")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. Juan Pérez" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cargo / Puesto</label>
                <input {...register("signerRole")} type="text" className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Ej. Gerente General" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4 gap-3">
          <button type="button" onClick={handlePreview} className="px-6 py-2 bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-2 dark:bg-gray-800 dark:text-white dark:border-gray-600 dark:hover:bg-gray-700">
            <FontAwesomeIcon icon={faEye} />
            Previsualizar Membrete y Firma
          </button>
          <button type="submit" disabled={saving} className="btn-primary px-6 py-2 flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
            {saving ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin />
                Guardando...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSave} />
                Guardar
              </>
            )}
          </button>
        </div>
      </form>

      {/* Variable Info Modal */}
      <Modal
        isOpen={showVariableInfo}
        onClose={() => setShowVariableInfo(false)}
        title="Variables del Sistema en PDF"
        size="md"
        footer={
          <button onClick={() => setShowVariableInfo(false)} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Entendido
          </button>
        }
      >
        <div className="space-y-4 text-gray-700 dark:text-gray-300">
          <p>Configura estos datos para que se completen automáticamente en las plantillas PDF.</p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              <strong>Razón Social:</strong> <code>{"{{razonSocial}}"}</code>
            </li>
            <li>
              <strong>CUIT:</strong> <code>{"{{cuit}}"}</code>
            </li>
            <li>
              <strong>Ciudad Sede:</strong> <code>{"{{ciudad}}"}</code>
            </li>
            <li>
              <strong>Dirección:</strong> <code>{"{{direccion}}"}</code>
            </li>
            <li>
              <strong>Fecha Actual:</strong> <code>{"{{fecha}}"}</code> (siempre dinámica)
            </li>
          </ul>
          <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-md text-sm text-blue-800 dark:text-blue-200 mt-4">
            <p className="flex items-start gap-2">
              <FontAwesomeIcon icon={faInfoCircle} className="mt-1" />
              <span>Estas variables se reemplazarán automáticamente al generar cualquier PDF que las incluya.</span>
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
