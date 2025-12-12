import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPlus, faTimes, faCircleInfo, faSave } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../../utils/sweetAlert";
import { InfoModal } from "../ui/InfoModal";
import { pdfTemplatesAPI, PdfTemplate } from "../../api/pdfTemplates";
import { globalVacationConfigAPI, GlobalVacationConfig } from "../../api/globalVacationConfig";

interface AntiguedadTranche {
  desde: number;
  hasta: number;
  dias: number;
}

export const GlobalVacationConfigTab: React.FC = () => {
  const [config, setConfig] = useState<GlobalVacationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pdfTemplates, setPdfTemplates] = useState<PdfTemplate[]>([]);

  // Modales de información
  const [showAntiguedadInfo, setShowAntiguedadInfo] = useState(false);
  const [showMaxDiasGozadosInfo, setShowMaxDiasGozadosInfo] = useState(false);
  const [showDiasBeneficioInfo, setShowDiasBeneficioInfo] = useState(false);
  const [showArrastreInfo, setShowArrastreInfo] = useState(false);
  const [showMaxDiasArrastreInfo, setShowMaxDiasArrastreInfo] = useState(false);
  const [showVencimientoInfo, setShowVencimientoInfo] = useState(false);
  const [showMinDiasInfo, setShowMinDiasInfo] = useState(false);
  const [showMaxDiasCorridosInfo, setShowMaxDiasCorridosInfo] = useState(false);
  const [showMaxDiasHabilesInfo, setShowMaxDiasHabilesInfo] = useState(false);
  const [showAnticipacionInfo, setShowAnticipacionInfo] = useState(false);
  const [showFraccionadasInfo, setShowFraccionadasInfo] = useState(false);
  const [showPdfTemplateInfo, setShowPdfTemplateInfo] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configData, templatesData] = await Promise.all([globalVacationConfigAPI.getConfig(), pdfTemplatesAPI.getAll()]);
      setConfig(configData);
      setPdfTemplates(templatesData.filter((t) => t.isActive));
    } catch (error) {
      console.error("Error loading data:", error);
      sweetAlert.error("Error", "No se pudo cargar la configuración de vacaciones");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;

    setSubmitting(true);
    try {
      const updatedConfig = await globalVacationConfigAPI.updateConfig(config);
      setConfig(updatedConfig);
      sweetAlert.success("¡Éxito!", "Configuración actualizada correctamente");
    } catch (error: any) {
      console.error("Error updating config:", error);
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo actualizar la configuración");
    } finally {
      setSubmitting(false);
    }
  };

  const updateConfig = (field: keyof GlobalVacationConfig, value: any) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const addAntiguedadTramo = () => {
    if (!config) return;
    const antiguedadTramos = config.antiguedadTramos || [];
    setConfig({
      ...config,
      antiguedadTramos: [...antiguedadTramos, { desde: 0, hasta: 0, dias: 0 }],
    });
  };

  const updateAntiguedadTramo = (index: number, field: keyof AntiguedadTranche, value: number) => {
    if (!config || !config.antiguedadTramos) return;
    const updated = [...config.antiguedadTramos];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, antiguedadTramos: updated });
  };

  const removeAntiguedadTramo = (index: number) => {
    if (!config || !config.antiguedadTramos) return;
    setConfig({
      ...config,
      antiguedadTramos: config.antiguedadTramos.filter((_, i) => i !== index),
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <FontAwesomeIcon icon={faSpinner} className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 dark:text-gray-400">No se pudo cargar la configuración</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ...Form fields... */}
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Días de vacaciones anuales</h3>
            <div className="flex md:flex-row flex-col gap-4 items-end">
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Días anuales base</label>
                <input type="number" value={config.diasAnuales} onChange={(e) => updateConfig("diasAnuales", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" required />
              </div>
              <div className="w-full">
                <div className="flex items-center gap-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Días de beneficio adicional</label>
                  <button type="button" onClick={() => setShowDiasBeneficioInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="number" value={config.diasBeneficio || ""} onChange={(e) => updateConfig("diasBeneficio", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
              </div>
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Días de vacaciones según años de antigüedad</h3>
              <button type="button" onClick={() => setShowAntiguedadInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Define cuántos días de vacaciones corresponden según la antigüedad del empleado en la empresa.</p>
            <div className="space-y-3">
              {(config.antiguedadTramos || []).map((tramo, index) => (
                <div key={index} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Desde (años)</label>
                    <input type="number" value={tramo.desde} onChange={(e) => updateAntiguedadTramo(index, "desde", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Hasta (años)</label>
                    <input type="number" value={tramo.hasta} onChange={(e) => updateAntiguedadTramo(index, "hasta", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Días</label>
                    <input type="number" value={tramo.dias} onChange={(e) => updateAntiguedadTramo(index, "dias", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" />
                  </div>
                  <button type="button" onClick={() => removeAntiguedadTramo(index)} className="px-3 py-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300">
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={addAntiguedadTramo} className="px-3 py-2 text-sm border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors w-full">
                <FontAwesomeIcon icon={faPlus} className="mr-2" />
                Agregar tramo
              </button>
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Límites y restricciones</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo de días gozados por año</label>
                  <button type="button" onClick={() => setShowMaxDiasGozadosInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="number" value={config.maxDiasGozados || ""} onChange={(e) => updateConfig("maxDiasGozados", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Mínimo de días por solicitud</label>
                  <button type="button" onClick={() => setShowMinDiasInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="number" value={config.minDiasPorSolicitud || ""} onChange={(e) => updateConfig("minDiasPorSolicitud", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo de días corridos</label>
                  <button type="button" onClick={() => setShowMaxDiasCorridosInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="number" value={config.maxDiasCorridos || ""} onChange={(e) => updateConfig("maxDiasCorridos", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo de días hábiles</label>
                  <button type="button" onClick={() => setShowMaxDiasHabilesInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="number" value={config.maxDiasHabiles || ""} onChange={(e) => updateConfig("maxDiasHabiles", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Anticipación mínima (días)</label>
                  <button type="button" onClick={() => setShowAnticipacionInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="number" value={config.anticipacionMinimaDias || ""} onChange={(e) => updateConfig("anticipacionMinimaDias", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
              </div>
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Arrastre de días no utilizados</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={config.permiteArrastre} onChange={(e) => updateConfig("permiteArrastre", e.target.checked)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Permitir arrastre de días no utilizados</label>
                  <button type="button" onClick={() => setShowArrastreInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {config.permiteArrastre && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-7">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Máximo de días a arrastrar</label>
                      <button type="button" onClick={() => setShowMaxDiasArrastreInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                        <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                      </button>
                    </div>
                    <input type="number" value={config.maxDiasArrastre || ""} onChange={(e) => updateConfig("maxDiasArrastre", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Vencimiento del arrastre (días)</label>
                      <button type="button" onClick={() => setShowVencimientoInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                        <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                      </button>
                    </div>
                    <input type="number" value={config.vencimientoArrastreDias || ""} onChange={(e) => updateConfig("vencimientoArrastreDias", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Opciones adicionales</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={config.permiteFraccionadas} onChange={(e) => updateConfig("permiteFraccionadas", e.target.checked)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Permitir vacaciones fraccionadas</label>
                  <button type="button" onClick={() => setShowFraccionadasInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input type="checkbox" checked={config.requiereFirma} onChange={(e) => updateConfig("requiereFirma", e.target.checked)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Requiere firma del empleado</label>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Plantilla PDF para documento</label>
                  <button type="button" onClick={() => setShowPdfTemplateInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <select value={config.pdfTemplateId || ""} onChange={(e) => updateConfig("pdfTemplateId", e.target.value || undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white">
                  <option value="">Ninguna</option>
                  {pdfTemplates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              <FontAwesomeIcon icon={faSave} />
              {submitting ? "Guardando..." : "Guardar Configuración"}
            </button>
          </div>
        </form>
      </div>
      // GlobalVacationConfigTab.tsx updates // ...
      <InfoModal isOpen={showAntiguedadInfo} onClose={() => setShowAntiguedadInfo(false)} title="Días por antigüedad">
        Define cuántos días de vacaciones corresponden según los años de antigüedad del empleado en la empresa. Por ejemplo: de 0 a 5 años = 18 días, de 6 a 10 años = 21 días.
      </InfoModal>
      <InfoModal isOpen={showMaxDiasGozadosInfo} onClose={() => setShowMaxDiasGozadosInfo(false)} title="Máximo de días gozados por año">
        Establece el límite máximo de días de vacaciones que un empleado puede tomar en un año calendario, independientemente de su saldo acumulado.
      </InfoModal>
      <InfoModal isOpen={showDiasBeneficioInfo} onClose={() => setShowDiasBeneficioInfo(false)} title="Días de beneficio adicional">
        Días extra de vacaciones otorgados como beneficio especial, sumados a los días anuales estándar.
      </InfoModal>
      <InfoModal isOpen={showArrastreInfo} onClose={() => setShowArrastreInfo(false)} title="Arrastre de días no utilizados">
        Permite que los días de vacaciones no utilizados en un año puedan trasladarse al siguiente año, con límites opcionales.
      </InfoModal>
      <InfoModal isOpen={showMaxDiasArrastreInfo} onClose={() => setShowMaxDiasArrastreInfo(false)} title="Máximo de días a arrastrar">
        Cantidad máxima de días de vacaciones no utilizados que pueden trasladarse al año siguiente.
      </InfoModal>
      <InfoModal isOpen={showVencimientoInfo} onClose={() => setShowVencimientoInfo(false)} title="Vencimiento del arrastre">
        Plazo en días desde el inicio del año para utilizar los días arrastrados del año anterior. Después de este plazo, los días no utilizados se pierden.
      </InfoModal>
      <InfoModal isOpen={showMinDiasInfo} onClose={() => setShowMinDiasInfo(false)} title="Mínimo de días por solicitud">
        Cantidad mínima de días consecutivos que debe solicitarse en cada petición de vacaciones.
      </InfoModal>
      <InfoModal isOpen={showMaxDiasCorridosInfo} onClose={() => setShowMaxDiasCorridosInfo(false)} title="Máximo de días corridos">
        Límite de días consecutivos (incluyendo fines de semana) que pueden tomarse en una sola solicitud.
      </InfoModal>
      <InfoModal isOpen={showMaxDiasHabilesInfo} onClose={() => setShowMaxDiasHabilesInfo(false)} title="Máximo de días hábiles">
        Límite de días laborables consecutivos que pueden tomarse en una sola solicitud, sin contar fines de semana.
      </InfoModal>
      <InfoModal isOpen={showAnticipacionInfo} onClose={() => setShowAnticipacionInfo(false)} title="Anticipación mínima">
        Cantidad mínima de días de anticipación con los que el empleado debe solicitar sus vacaciones antes de la fecha de inicio.
      </InfoModal>
      <InfoModal isOpen={showFraccionadasInfo} onClose={() => setShowFraccionadasInfo(false)} title="Vacaciones fraccionadas">
        Permite dividir el período de vacaciones en múltiples solicitudes a lo largo del año, en lugar de tomarlo todo de una vez.
      </InfoModal>
      <InfoModal isOpen={showPdfTemplateInfo} onClose={() => setShowPdfTemplateInfo(false)} title="Plantilla PDF">
        Selecciona la plantilla de documento que se utilizará para generar el PDF de aprobación de vacaciones. Puedes gestionar las plantillas desde la sección de administración.
      </InfoModal>
    </>
  );
};
