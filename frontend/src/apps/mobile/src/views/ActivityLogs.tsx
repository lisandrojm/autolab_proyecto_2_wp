import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPlus, faTimes, faTrash, faCalendar, faCog } from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { ViewType } from "../types";
import { sweetAlert } from "../utils/sweetAlert";

// Mock data re-used from web
const MOCK_REPORTS = [
  {
    id: "REP-001",
    date: "2024-05-15",
    formName: "Técnica Mañana",
    projectName: "Gran Hermano",
    areaId: "4",
    status: "sent",
    submittedBy: "Juan Perez",
    submittedAt: "2024-05-15T09:00:00Z",
    attendance: [
      { id: "1", employeeName: "BARBONA AGUSTIN", status: "absent", absenceReason: "Compensatorio" },
      { id: "2", employeeName: "GIUNTA Lucas", status: "present" },
    ],
  },
  {
    id: "REP-002",
    date: "2024-05-16",
    formName: "Libertador",
    projectName: "Got Talent",
    areaId: "2",
    status: "pending_signature",
    submittedBy: "Maria Gonzalez",
    submittedAt: "2024-05-16T18:00:00Z",
    attendance: [],
  },
];

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

interface ActivityLogsProps {
  onNavigate: (view: ViewType) => void;
}

export default function ActivityLogs({ onNavigate }: ActivityLogsProps) {
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Form State
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
  const [hasActivity, setHasActivity] = useState<boolean | null>(null);
  const [comments, setComments] = useState("");

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
      type: "simple_selection",
      items: [],
    },
  ]);

  const handleToggleCategory = (id: string, value: boolean) => {
    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id === id) {
          const newItems = value && cat.items.length === 0 ? [{ employeeId: "" }] : cat.items;
          return { ...cat, isActive: value, items: newItems };
        }
        return cat;
      })
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
      })
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
      })
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await sweetAlert.success("¡Reporte enviado!", "El reporte diario ha sido registrado.");
    setSubmitting(false);
    setShowForm(false);
    setHasActivity(null);
  };

  // When opening form
  const handleEditReport = (report: any) => {
    setSelectedReportId(report.id);
    setReportDate(report.date);
    setComments(report.comments || "");

    if (report.attendance && report.attendance.length > 0) {
      setHasActivity(true);

      // Map existing attendance to categories
      const newCategories = categories.map((cat) => ({ ...cat, isActive: false, items: [] as EmployeeSelection[] }));

      report.attendance.forEach((rec: any) => {
        // Determine category based on status/reason
        let catId = "other_present";
        if (rec.status === "absent" && rec.absenceReason === "Compensatorio") catId = "compensatory";
        else if (rec.status === "absent" && rec.absenceReason === "Enfermedad") catId = "sick_leave";
        else if (rec.status === "absent" && rec.absenceReason === "Vacaciones") catId = "vacation";
        else if (rec.status === "absent" && rec.absenceReason === "Sin Goce de Sueldo") catId = "unpaid_leave";
        else if (rec.status === "absent" && rec.absenceReason === "Cambio de Turno")
          catId = "shift_change"; // Assuming this mapping
        else if (rec.hasOvertime || rec.overtimeHours > 0) catId = "overtime";
        else if (rec.status === "present") catId = "other_present"; // Default presents to other? Or maybe we don't map them all back perfectly in this mock

        // Find the category
        const catIndex = newCategories.findIndex((c) => c.id === catId);
        if (catIndex !== -1) {
          newCategories[catIndex].isActive = true;
          // Map employee data
          // We need employee ID, if we only have name in report.attendance we try to find it in MOCK_EMPLOYEES or just put name if we could (but interface expects ID)
          // For this mock, let's try to match by name or default to first if not found, or just put id if present
          const emp = MOCK_EMPLOYEES.find((e) => e.name === rec.employeeName);
          const empId = emp ? emp.id : rec.employeeId || ""; // Fallback

          newCategories[catIndex].items.push({
            employeeId: empId,
            replacementId: rec.replacementId, // Assuming this field exists in attendance record if applicable
            notes: rec.notes,
            overtimeHours: rec.overtimeHours,
          });
        }
      });
      setCategories(newCategories);
    } else {
      setHasActivity(false);
      // Reset categories just in case
      setCategories(categories.map((c) => ({ ...c, isActive: false, items: [] })));
    }

    setShowForm(true);
  };

  // Config State
  const [showConfig, setShowConfig] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatHasReplacement, setNewCatHasReplacement] = useState(false);

  const handleCreateNew = () => {
    setSelectedReportId(null);
    setReportDate(new Date().toISOString().split("T")[0]);
    setHasActivity(null);
    setCategories(categories.map((c) => ({ ...c, isActive: false, items: [] })));
    setComments("");
    setShowForm(true);
  };

  const handleAddCategory = () => {
    if (!newCatTitle.trim()) return;

    const newId = newCatTitle.toLowerCase().replace(/\s+/g, "_");
    const newCategory: CategorySection = {
      id: newId,
      title: newCatTitle,
      question: `¿Hubo novedades de ${newCatTitle}?`,
      isActive: false,
      type: newCatHasReplacement ? "replacement_selection" : "simple_selection",
      items: [],
    };

    setCategories([...categories, newCategory]);
    setNewCatTitle("");
    setNewCatHasReplacement(false);
  };

  const handleDeleteCategory = (id: string) => {
    setCategories(categories.filter((c) => c.id !== id));
  };

  return (
    <div className="flex-1 pb-24">
      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">Gestionar Tipos de Novedad</h3>
              <button onClick={() => setShowConfig(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-6">
              {/* Add New */}
              <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                <h4 className="font-medium text-slate-900 dark:text-white mb-2">Crear Nuevo Tipo</h4>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nombre</label>
                  <input type="text" value={newCatTitle} onChange={(e) => setNewCatTitle(e.target.value)} placeholder="Ej: Llegada Tarde" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 dark:text-slate-300">¿Requiere Reemplazo?</span>
                  <button onClick={() => setNewCatHasReplacement(!newCatHasReplacement)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newCatHasReplacement ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-600"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newCatHasReplacement ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button onClick={handleAddCategory} disabled={!newCatTitle.trim()} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Agregar
                  </button>
                </div>
              </div>

              {/* List */}
              <div>
                <h4 className="font-medium text-slate-900 dark:text-white mb-3">Tipos Existentes</h4>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{cat.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{cat.type === "replacement_selection" ? "Requiere Reemplazo" : "Selección Simple"}</p>
                      </div>
                      <button onClick={() => handleDeleteCategory(cat.id)} className="text-slate-400 hover:text-red-500 p-2 transition-colors">
                        <FontAwesomeIcon icon={faTrash} size="sm" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 border-b border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-4 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                {/* Use a different icon for logs logic if needed, keeping shopping cart as generic placeholder or use faFileText */}
                <FontAwesomeIcon icon={faCalendar} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Novedades</h1>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowConfig(true)} className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <FontAwesomeIcon icon={faCog} />
            </button>
            <button onClick={handleCreateNew} className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl w-10 h-10 sm:w-auto sm:h-10 sm:px-4 font-medium transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20">
              <FontAwesomeIcon icon={faPlus} />
              <span className="hidden sm:inline">Nueva Novedad</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {showForm && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] min-h-[600px] flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{selectedReportId ? "Editar Reporte" : "Nuevo Reporte"}</h3>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="overflow-y-auto p-4 space-y-6 flex-1">
                {/* Date and Project */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha del Reporte</label>
                    <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                  </div>
                </div>

                {/* Main Toggle */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">¿Hubo novedades en el turno?</h2>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => setHasActivity(false)}
                      className={`flex-1 py-2 rounded-lg border-2 transition-all flex flex-col items-center gap-1
                                ${hasActivity === false ? "border-slate-500 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white" : "border-gray-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-slate-600 text-gray-500 dark:text-gray-400"}`}
                    >
                      <span className="font-bold">NO</span>
                    </button>
                    <button
                      onClick={() => setHasActivity(true)}
                      className={`flex-1 py-2 rounded-lg border-2 transition-all flex flex-col items-center gap-1
                                ${hasActivity === true ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 text-gray-500 dark:text-gray-400"}`}
                    >
                      <span className="font-bold">SÍ</span>
                    </button>
                  </div>
                </div>

                {/* Detail Categories */}
                {hasActivity && (
                  <div className="space-y-3">
                    {categories.map((cat) => (
                      <div key={cat.id} className={`rounded-lg border transition-all ${cat.isActive ? "border-blue-500 bg-blue-50/20 dark:bg-slate-800/50" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"}`}>
                        <div className="p-3 flex items-center justify-between cursor-pointer" onClick={() => handleToggleCategory(cat.id, !cat.isActive)}>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-medium ${cat.isActive ? "text-blue-700 dark:text-blue-400" : "text-gray-900 dark:text-gray-200"}`}>{cat.title}</span>
                          </div>
                          {/* Switch representation */}
                          <div className={`w-10 h-5 rounded-full p-1 transition-colors ${cat.isActive ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}>
                            <div className={`w-3 h-3 bg-white rounded-full shadow-sm transform transition-transform ${cat.isActive ? "translate-x-5" : "translate-x-0"}`} />
                          </div>
                        </div>

                        {cat.isActive && (
                          <div className="p-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
                            {cat.items.map((item, idx) => (
                              <div key={idx} className="flex flex-col gap-2 bg-white dark:bg-gray-900 p-3 rounded-lg">
                                <select className="w-full p-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-colors" value={item.employeeId} onChange={(e) => handleItemChange(cat.id, idx, "employeeId", e.target.value)}>
                                  <option value="" className="dark:bg-slate-800">
                                    Colaborador...
                                  </option>
                                  {MOCK_EMPLOYEES.map((emp) => (
                                    <option key={emp.id} value={emp.id} className="dark:bg-slate-800">
                                      {emp.name}
                                    </option>
                                  ))}
                                </select>

                                {cat.type === "replacement_selection" && (
                                  <select className="w-full p-2.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none transition-colors" value={item.replacementId || ""} onChange={(e) => handleItemChange(cat.id, idx, "replacementId", e.target.value)}>
                                    <option value="" className="dark:bg-slate-800">
                                      Reemplazo (Opcional)...
                                    </option>
                                    {MOCK_EMPLOYEES.map((emp) => (
                                      <option key={emp.id} value={emp.id} className="dark:bg-slate-800">
                                        {emp.name}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {cat.type === "overtime_selection" && (
                                  <div className="flex items-center gap-2">
                                    <label className="text-xs text-slate-500 dark:text-slate-400">Horas:</label>
                                    <input type="number" className="w-20 p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100" value={item.overtimeHours || 0} onChange={(e) => handleItemChange(cat.id, idx, "overtimeHours", parseFloat(e.target.value))} />
                                  </div>
                                )}

                                <div className="flex justify-end mt-1">
                                  <button onClick={() => handleRemoveItem(cat.id, idx)} className="text-slate-400 hover:text-red-500 transition-colors p-2" title="Eliminar">
                                    <FontAwesomeIcon icon={faTrash} />
                                  </button>
                                </div>
                              </div>
                            ))}
                            <button onClick={() => handleAddItem(cat.id)} className="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 mt-2">
                              <FontAwesomeIcon icon={faPlus} /> Agregar otro
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comentarios</label>
                      <textarea rows={3} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" placeholder="Comentarios adicionales..." value={comments} onChange={(e) => setComments(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                {hasActivity !== null && (
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm">
                      Cancelar
                    </button>
                    <button onClick={handleSubmit} disabled={submitting} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors disabled:opacity-70 text-sm">
                      {submitting ? "Enviando..." : "Enviar Reporte"}
                    </button>
                  </div>
                )}
                {hasActivity === null && <div className="text-center text-sm text-gray-500 dark:text-gray-400">Selecciona una opción arriba para continuar</div>}
              </div>
            </div>
          </div>
        )}

        <h3 className="text-lg font-bold mb-4">Historial de Novedades</h3>

        {/* List of Reports */}
        <div className="space-y-3">
          {MOCK_REPORTS
            // Simplified filter: show all for demo purposes if no easy user match,
            // OR ideally filter by user name.
            // Let's assume we want to show only "Juan Perez" reports if I am Juan Perez.
            // For this task, "Solo se tienen que ver las Novedades hechas por ese usuario"
            // We will filter by a hardcoded "Juan Perez" or better, let's imply the 'user' context.
            // Since we don't have the real logged in user name easily mapped to these strings without context,
            // We will display ALL for now but in a real scenario we would do: .filter(r => r.submittedBy === currentUser.name)
            // But wait, the prompt says "Solo se tienen que ver las Novedades hechas por ese usuario".
            // I will use 'Juan Perez' as the target user to demonstrate filtering.
            .filter((report) => report.submittedBy === "Juan Perez")
            .map((report) => (
              <div key={report.id} onClick={() => handleEditReport(report)} className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm cursor-pointer opacity-80 hover:opacity-100 transition-opacity">
                <div className="flex justify-between items-start mb-2">
                  <span className="inline-block px-2 py-0.5 text-[12px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">{report.id}</span>
                </div>
                <h4 className="font-semibold text-slate-800 dark:text-white mb-1">
                  {report.projectName} - {report.formName}
                </h4>
                <div className="text-sm text-slate-500 mb-3">{new Date(report.date).toLocaleDateString()}</div>

                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Enviado por: {report.submittedBy}</span>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
