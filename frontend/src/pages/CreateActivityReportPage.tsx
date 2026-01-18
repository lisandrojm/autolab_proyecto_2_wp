import React, { useState } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faCheck, faSave, faUser, faChevronDown, faChevronUp, faPlus, faTrash, faClock } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";
import { sweetAlert } from "../utils/sweetAlert";

// Mock data for employees (would normally come from API based on Area)
const MOCK_EMPLOYEES = [
  { id: "E001", name: "BARBONA AGUSTIN" },
  { id: "E002", name: "GIUNTA Lucas" },
  { id: "E003", name: "JORDAN Alejandro" },
  { id: "E004", name: "BOREA Hector" },
  { id: "E005", name: "EANDI AXEL" },
  { id: "E006", name: "HENRIQUEZ ALISTE Andres" },
  { id: "E007", name: "HERNANDEZ DUNN Facundo Ariel" },
];

interface EmployeeSelection {
  employeeId: string;
  replacementId?: string; // For sick leave
  notes?: string;
  overtimeHours?: number; // For overtime
}

interface CategorySection {
  id: string;
  title: string;
  question: string;
  isActive: boolean;
  type: "simple_selection" | "replacement_selection" | "overtime_selection";
  items: EmployeeSelection[];
}

export const CreateActivityReportPage: React.FC = () => {
  const navigate = useNavigate();
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [hasActivity, setHasActivity] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initial Configuration of Categories based on user requirement
  const [categories, setCategories] = useState<CategorySection[]>([
    {
      id: "shift_change",
      title: "Cambios de Turno",
      question: "¿Hubo ausentes por cambio de turno?",
      isActive: false,
      type: "simple_selection",
      items: [],
    },
    {
      id: "compensatory",
      title: "Compensatorios",
      question: "¿Hubo ausentes por compensatorios?",
      isActive: false,
      type: "simple_selection",
      items: [],
    },
    {
      id: "sick_leave",
      title: "Enfermedad",
      question: "¿Hubo ausentes por enfermedad?",
      isActive: false,
      type: "replacement_selection",
      items: [],
    },
    {
      id: "vacation",
      title: "Vacaciones",
      question: "¿Hubo ausentes por vacaciones?",
      isActive: false,
      type: "simple_selection",
      items: [],
    },
    {
      id: "unpaid_leave",
      title: "Sin Goce de Sueldo",
      question: "¿Hubo ausentes sin goce de sueldo?",
      isActive: false,
      type: "simple_selection",
      items: [],
    },
    {
      id: "overtime",
      title: "Horas Extras y Feriados",
      question: "¿El equipo realizó horas extras o trabajó un feriado?",
      isActive: false,
      type: "overtime_selection",
      items: [],
    },
    {
      id: "other_present",
      title: "Otros Presentes",
      question: "¿Hubo algún colaborador no mencionado anteriormente?",
      isActive: false,
      type: "simple_selection", // Or maybe just a text area/list? kept simple for now
      items: [],
    },
  ]);
  const [comments, setComments] = useState("");

  const handleToggleCategory = (id: string, value: boolean) => {
    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id === id) {
          // If turning on and no items, add one blank row for convenience
          const newItems = value && cat.items.length === 0 ? [{ employeeId: "" }] : cat.items;
          return { ...cat, isActive: value, items: newItems };
        }
        return cat;
      }),
    );
  };

  const handleAddItem = (categoryId: string) => {
    setCategories((prev) => prev.map((cat) => (cat.id === categoryId ? { ...cat, items: [...cat.items, { employeeId: "" }] } : cat)));
  };

  const handleRemoveItem = (categoryId: string, index: number) => {
    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          const newItems = [...cat.items];
          newItems.splice(index, 1);
          return { ...cat, items: newItems };
        }
        return cat;
      }),
    );
  };

  const handleItemChange = (categoryId: string, index: number, field: keyof EmployeeSelection, value: any) => {
    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          const newItems = [...cat.items];
          newItems[index] = { ...newItems[index], [field]: value };
          return { ...cat, items: newItems };
        }
        return cat;
      }),
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Logic to validate data would go here
    // e.g., check if active categories have selected employees

    sweetAlert.success("Reporte enviado correctamente", "El reporte diario ha sido registrado.");
    setSubmitting(false);
    navigate("/activity-logs");
  };

  return (
    <PageLayout title="Nuevo Reporte de Novedades" subtitle="Complete el formulario diario de asistencia y novedades." faIcon={{ icon: faCheck }} onBack={() => navigate("/activity-logs")}>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        {/* Header Config Card */}
        <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha del Reporte</label>
              <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
              <p className="mt-1 text-xs text-gray-500">La fecha corresponde al día de actividad, no necesariamente a la fecha de hoy.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Area / Proyecto</label>
              <div className="px-4 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 font-medium">
                Técnica - Turno Noche
                {/* Dynamic based on logged in user */}
              </div>
            </div>
          </div>
        </div>

        {/* Main Activity Toggle */}
        <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">¿Hubo alguna novedad o ausencia en el turno?</h2>

          <div className="flex justify-center gap-6">
            <button
              onClick={() => setHasActivity(false)}
              className={`px-8 py-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 w-40
                     ${hasActivity === false ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 ring-2 ring-green-200 dark:ring-green-900" : "border-gray-200 dark:border-gray-700 hover:border-green-300 hover:bg-green-50/50 text-gray-600 dark:text-gray-400"}`}
            >
              <span className="text-2xl font-bold">NO</span>
              <span className="text-sm">Todo normal</span>
            </button>

            <button
              onClick={() => setHasActivity(true)}
              className={`px-8 py-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 w-40
                     ${hasActivity === true ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 ring-2 ring-blue-200 dark:ring-blue-900" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-blue-50/50 text-gray-600 dark:text-gray-400"}`}
            >
              <span className="text-2xl font-bold">SÍ</span>
              <span className="text-sm">Reportar Nov.</span>
            </button>
          </div>
        </div>

        {/* Dynamic Details Sections */}
        {hasActivity && (
          <div className="space-y-4 animate-fade-in-up">
            {categories.map((cat) => (
              <div key={cat.id} className={`bg-white dark:bg-gray-800 rounded shadow-sm border transition-all duration-300 ${cat.isActive ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-200 dark:border-gray-700"}`}>
                <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => handleToggleCategory(cat.id, !cat.isActive)}>
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded flex items-center justify-center transition-colors ${cat.isActive ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400 dark:bg-gray-700"}`}>
                      <FontAwesomeIcon icon={cat.isActive ? faCheck : faUser} />
                    </div>
                    <div>
                      <h3 className={`font-medium ${cat.isActive ? "text-blue-700 dark:text-blue-400" : "text-gray-900 dark:text-gray-200"}`}>{cat.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{cat.question}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Toggle Switch */}
                    <div className={`w-12 h-6 rounded p-1 transition-colors ${cat.isActive ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}>
                      <div className={`w-4 h-4 bg-white rounded shadow-sm transform transition-transform ${cat.isActive ? "translate-x-6" : "translate-x-0"}`} />
                    </div>
                  </div>
                </div>

                {cat.isActive && (
                  <div className="border-t border-gray-100 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/30">
                    <div className="space-y-3">
                      {cat.items.map((item, idx) => (
                        <div key={idx} className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-white dark:bg-gray-800 p-3 rounded-md border border-gray-200 dark:border-gray-700">
                          <div className="flex-1 w-full">
                            <label className="text-xs text-gray-500 mb-1 block">Colaborador</label>
                            <select className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent dark:text-white" value={item.employeeId} onChange={(e) => handleItemChange(cat.id, idx, "employeeId", e.target.value)}>
                              <option value="">Seleccionar colaborador...</option>
                              {MOCK_EMPLOYEES.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                  {emp.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          {cat.type === "replacement_selection" && (
                            <div className="flex-1 w-full">
                              <label className="text-xs text-gray-500 mb-1 block">Reemplazo (Opcional)</label>
                              <select className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent dark:text-white" value={item.replacementId || ""} onChange={(e) => handleItemChange(cat.id, idx, "replacementId", e.target.value)}>
                                <option value="">Sin reemplazo / Seleccionar...</option>
                                {MOCK_EMPLOYEES.map((emp) => (
                                  <option key={emp.id} value={emp.id}>
                                    {emp.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {cat.type === "overtime_selection" && (
                            <div className="flex-1 md:w-32">
                              <label className="text-xs text-gray-500 mb-1 block">Horas Extras</label>
                              <input type="number" min="0" step="0.5" className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-transparent dark:text-white" value={item.overtimeHours || 0} onChange={(e) => handleItemChange(cat.id, idx, "overtimeHours", parseFloat(e.target.value))} />
                            </div>
                          )}

                          <button onClick={() => handleRemoveItem(cat.id, idx)} className="text-red-500 hover:bg-red-50 p-2 rounded mt-4 md:mt-0" title="Eliminar fila">
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      ))}

                      <button onClick={() => handleAddItem(cat.id)} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                        <FontAwesomeIcon icon={faPlus} />
                        Agregar otro colaborador
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Additional Comments */}
            <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="font-medium text-gray-900 dark:text-white mb-2">Comentarios Adicionales</h3>
              <textarea rows={4} className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none" placeholder="Ingrese cualquier otra información relevante del turno..." value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>
          </div>
        )}

        {/* Submit Actions */}
        {hasActivity !== null && (
          <div className="flex justify-end pt-6">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`px-8 py-3 rounded text-white font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-3
                    ${submitting ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 transform hover:-translate-y-0.5"}
                 `}
            >
              {submitting ? (
                "Enviando..."
              ) : (
                <>
                  <FontAwesomeIcon icon={faSave} />
                  {hasActivity ? "Enviar Reporte Completo" : "Confirmar Sin Novedades"}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
