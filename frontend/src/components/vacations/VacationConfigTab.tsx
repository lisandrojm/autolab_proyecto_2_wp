import React, { useState, useEffect } from "react";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCircleInfo, faSave, faEye, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import Swal from "sweetalert2";
import { sweetAlert } from "../../utils/sweetAlert";
import { InfoModal } from "../ui/InfoModal";
import { pdfsAPI, Pdf } from "../../api/pdf";
import { pdfPreviewAPI } from "../../api/pdfPreview";
import { vacationConfigAPI, VacationConfig } from "../../api/vacationConfig";

export const VacationConfigTab: React.FC = () => {
  const [config, setConfig] = useState<VacationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pdfTemplates, setPdfTemplates] = useState<Pdf[]>([]);

  // Modales de información
  const [showAntiguedadInfo, setShowAntiguedadInfo] = useState(false);
  const [showMaxDiasGozadosInfo, setShowMaxDiasGozadosInfo] = useState(false);
  const [showDiasBeneficioInfo, setShowDiasBeneficioInfo] = useState(false);
  const [showArrastreInfo, setShowArrastreInfo] = useState(false);
  const [showMaxDiasArrastreInfo, setShowMaxDiasArrastreInfo] = useState(false);
  const [showVencimientoInfo, setShowVencimientoInfo] = useState(false);

  const [showAnticipacionInfo, setShowAnticipacionInfo] = useState(false);

  const [showPdfTemplateInfo, setShowPdfTemplateInfo] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const handlePreview = async (code: any, content: string) => {
    try {
      Swal.fire({
        title: "Generando previsualización...",
        text: "Por favor espere",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const blob = await pdfPreviewAPI.preview(content, code);
      Swal.close();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudo generar la previsualización", "error");
    }
  };

  useEffect(() => {
    if (!config || !pdfTemplates.length) return;

    const vacationTemplate = pdfTemplates.find((t) => t.code === "vacaciones");
    if (vacationTemplate) {
      if (config.pdfId !== vacationTemplate._id) {
        setConfig((prev) => (prev ? { ...prev, pdfId: vacationTemplate._id } : null));
      }
    }
  }, [config?.pdfId, pdfTemplates]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configData, templatesData] = await Promise.all([vacationConfigAPI.getConfig(), pdfsAPI.getAll()]);
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
      const updatedConfig = await vacationConfigAPI.updateConfig(config);
      setConfig(updatedConfig);
      sweetAlert.success("¡Éxito!", "Configuración actualizada correctamente");
    } catch (error: any) {
      console.error("Error updating config:", error);
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo actualizar la configuración");
    } finally {
      setSubmitting(false);
    }
  };

  const updateConfig = (field: keyof VacationConfig, value: any) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  if (loading) {
    return <LoadingSpinner message="Cargando reglas..." />;
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
      <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ...Form fields... */}
          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Escala Legal (LCT N° 20.744)</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">El cálculo de días base se ajusta estrictamente a la Ley de Contrato de Trabajo de Argentina.</p>

            <div className="overflow-hidden rounded border border-gray-200 dark:border-gray-700 mb-6">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Antigüedad
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Días Corridos
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">Menos de 6 meses</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">1 día cada 20 trabajados</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">6 meses a 5 años</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">14 días</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">5 a 10 años</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">21 días</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">10 a 20 años</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">28 días</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">Más de 20 años</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">35 días</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="max-w-md">
              <div className="flex items-center gap-2 mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Días de Beneficio Extra (Empresa)</label>
                <button type="button" onClick={() => setShowDiasBeneficioInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                </button>
              </div>
              <input type="number" value={config.diasBeneficio || 0} onChange={(e) => updateConfig("diasBeneficio", parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="0" />
              <p className="text-xs text-gray-500 mt-1">Días adicionales que la empresa otorga por encima de la ley.</p>
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
                <input type="number" value={config.maxDiasGozados || ""} onChange={(e) => updateConfig("maxDiasGozados", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Anticipación mínima (días)</label>
                  <button type="button" onClick={() => setShowAnticipacionInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                    <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                  </button>
                </div>
                <input type="number" value={config.anticipacionMinimaDias || ""} onChange={(e) => updateConfig("anticipacionMinimaDias", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
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
                    <input type="number" value={config.maxDiasArrastre || ""} onChange={(e) => updateConfig("maxDiasArrastre", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Vencimiento del arrastre (días)</label>
                      <button type="button" onClick={() => setShowVencimientoInfo(true)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
                        <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                      </button>
                    </div>
                    <input type="number" value={config.vencimientoArrastreDias || ""} onChange={(e) => updateConfig("vencimientoArrastreDias", e.target.value ? parseInt(e.target.value) : undefined)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" min="0" placeholder="Opcional" />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Opciones adicionales</h3>
            <div className="space-y-4">
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
                <div className="mt-2">
                  {(() => {
                    const matchingTemplate = pdfTemplates?.find((t) => t.code === "vacaciones");

                    if (matchingTemplate) {
                      return (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Plantilla asignada automáticamente</p>
                            <p className="text-xs text-blue-600 dark:text-blue-400">{matchingTemplate.name}</p>
                          </div>
                          <button type="button" onClick={() => handlePreview(matchingTemplate.code, matchingTemplate.content)} className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 font-medium flex items-center gap-1" title="Previsualizar plantilla">
                            <FontAwesomeIcon icon={faEye} /> Visualizar
                          </button>
                        </div>
                      );
                    } else {
                      return (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                          <div className="flex items-start gap-2">
                            <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Sin plantilla asignada</p>
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                No existe una plantilla activa para vacaciones (Código esperado: <strong>vacaciones</strong>). El PDF no se generará correctamente.
                              </p>
                              <Link to="/pdfs-vacaciones" target="_blank" className="text-xs text-blue-600 hover:underline mt-1 block font-medium">
                                Crear plantilla en Configuración &rarr;
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Resolución de Conflictos en Multiproyecto</h3>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
              <div className="flex gap-3">
                <FontAwesomeIcon icon={faCircleInfo} className="text-blue-500 mt-1" />
                <div className="space-y-3">
                  <h4 className="font-medium text-blue-900 dark:text-blue-300">¿Cómo se calculan las reglas en usuarios con múltiples proyectos?</h4>
                  <p className="text-sm text-blue-800 dark:text-blue-200">Si un usuario pertenece a varios proyectos con reglas distintas, el sistema seleccionará automáticamente la opción más flexible:</p>
                  <ul className="list-disc list-inside text-sm text-blue-800 dark:text-blue-200 space-y-1 ml-2">
                    <li>
                      <strong>Fraccionamiento:</strong> Se permite si al menos un proyecto lo habilita, tomando siempre el mínimo de días más bajo.
                    </li>
                    <li>
                      <strong>Cómputo de días:</strong> Si un proyecto permite <strong>Días Hábiles</strong>, esta regla prevalecerá sobre los Días Corridos.
                    </li>
                  </ul>

                  {/* Table */}
                  <div className="mt-4 overflow-hidden rounded border border-blue-200 dark:border-blue-700">
                    <table className="min-w-full divide-y divide-blue-200 dark:divide-blue-700 text-sm">
                      <thead className="bg-blue-100 dark:bg-blue-800/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-blue-900 dark:text-blue-200">Escenario</th>
                          <th className="px-4 py-2 text-left font-medium text-blue-900 dark:text-blue-200">Proyecto A</th>
                          <th className="px-4 py-2 text-left font-medium text-blue-900 dark:text-blue-200">Proyecto B</th>
                          <th className="px-4 py-2 text-left font-medium text-blue-900 dark:text-blue-200">Resultado Aplicado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-blue-200 dark:divide-blue-700 bg-white dark:bg-gray-800/50">
                        <tr>
                          <td className="px-4 py-2 font-medium text-blue-900 dark:text-blue-300">Tipo de Días</td>
                          <td className="px-4 py-2 text-blue-800 dark:text-blue-200">Corridos</td>
                          <td className="px-4 py-2 text-blue-800 dark:text-blue-200">Hábiles</td>
                          <td className="px-4 py-2 font-semibold text-blue-900 dark:text-blue-300">Hábiles (Prioridad)</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 font-medium text-blue-900 dark:text-blue-300">Fraccionamiento</td>
                          <td className="px-4 py-2 text-blue-800 dark:text-blue-200">No permite</td>
                          <td className="px-4 py-2 text-blue-800 dark:text-blue-200">Permite (Mín. 5 días)</td>
                          <td className="px-4 py-2 font-semibold text-blue-900 dark:text-blue-300">Permite</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 font-medium text-blue-900 dark:text-blue-300">Mínimo de Días</td>
                          <td className="px-4 py-2 text-blue-800 dark:text-blue-200">Mín. 7 días</td>
                          <td className="px-4 py-2 text-blue-800 dark:text-blue-200">Mín. 3 días</td>
                          <td className="px-4 py-2 font-semibold text-blue-900 dark:text-blue-300">3 días (El menor)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 py-4 border-t border-gray-100 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-800">
            <button type="submit" disabled={submitting} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
              {submitting ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} spin />
                  Guardando...
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} />
                  Guardar Configuración
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      {/*  GlobalVacationConfigTab.tsx updates */}
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

      <InfoModal isOpen={showAnticipacionInfo} onClose={() => setShowAnticipacionInfo(false)} title="Anticipación mínima">
        Cantidad mínima de días de anticipación con los que el empleado debe solicitar sus vacaciones antes de la fecha de inicio.
      </InfoModal>

      <InfoModal isOpen={showPdfTemplateInfo} onClose={() => setShowPdfTemplateInfo(false)} title="Plantilla PDF">
        Selecciona la plantilla de documento que se utilizará para generar el PDF de aprobación de vacaciones. Puedes gestionar las plantillas desde la sección de administración.
      </InfoModal>
    </>
  );
};
