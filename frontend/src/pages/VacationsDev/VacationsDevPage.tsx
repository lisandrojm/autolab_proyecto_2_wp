import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faGear,
  faRuler,
  faList,
  faChartBar,
  faPlus,
  faEdit,
  faTrash,
  faCheck,
  faTimes,
  faToggleOn,
  faToggleOff,
  faUsers,
  faUserTie,
  faCalendar,
  faUserGraduate,
  faGlobe,
  faSave,
} from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../../components/ui/PageLayout";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { sweetAlert } from "../../utils/sweetAlert";
import mockDataImport from "../../mocks/vacationsDev/vacationsDev.mock.json";

interface Settings {
  enabled: boolean;
  visibleTo: string;
  requireApproval: boolean;
  extraConfig: Record<string, any>;
}

interface Position {
  id: string;
  name: string;
  description?: string;
}

interface Level {
  id: string;
  name: string;
  positionId: string;
  description?: string;
}

interface Rule {
  id: string;
  positionId: string;
  levelId: string;
  days: number;
  amount?: number | null;
  active: boolean;
}

interface VacationRecord {
  id: string;
  userId: string;
  userName: string;
  reason: string;
  startDate: string;
  endDate: string;
  daysRequested: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

interface Balance {
  userId: string;
  userName: string;
  assignedDays: number;
  used: number;
  remaining: number;
}

type TabType = "config" | "rules" | "catalog" | "management" | "balance";

export const VacationsDevPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>("config");

  const [settings, setSettings] = useState<Settings>(mockDataImport.settings);
  const [positions, setPositions] = useState<Position[]>(mockDataImport.catalog.positions);
  const [levels, setLevels] = useState<Level[]>(mockDataImport.catalog.levels);
  const [rules, setRules] = useState<Rule[]>(mockDataImport.rules);
  const [records, setRecords] = useState<VacationRecord[]>(mockDataImport.records);
  const [balances, setBalances] = useState<Balance[]>(mockDataImport.balances);

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogType, setCatalogType] = useState<"position" | "level">("position");
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});

  const mapStatusToStatusType = (status: string) => {
    switch (status) {
      case "pending":
        return "vacaciones_pendiente";
      case "approved":
        return "vacaciones_aprobada";
      case "rejected":
        return "vacaciones_rechazada";
      case "cancelled":
        return "vacaciones_cancelada";
      default:
        return null;
    }
  };

  const addRule = () => {
    if (!formData.positionId || !formData.levelId || !formData.days) {
      sweetAlert.error("Error", "Completa todos los campos requeridos");
      return;
    }

    const duplicate = rules.find(
      (r) => r.positionId === formData.positionId && r.levelId === formData.levelId && (!editingItem || r.id !== editingItem.id)
    );

    if (duplicate) {
      sweetAlert.error("Error", "Ya existe una regla para este cargo y nivel");
      return;
    }

    if (editingItem) {
      setRules(rules.map((r) => (r.id === editingItem.id ? { ...r, ...formData } : r)));
      sweetAlert.success("Regla actualizada", "Los cambios se han guardado correctamente");
    } else {
      const newRule: Rule = {
        id: `rule-${Date.now()}`,
        positionId: formData.positionId,
        levelId: formData.levelId,
        days: parseInt(formData.days),
        amount: formData.amount || null,
        active: true,
      };
      setRules([...rules, newRule]);
      sweetAlert.success("Regla creada", "La regla se ha agregado correctamente");
    }

    setShowRuleModal(false);
    setEditingItem(null);
    setFormData({});
  };

  const deleteRule = async (id: string) => {
    const result = await sweetAlert.confirm("¿Eliminar regla?", "¿Estás seguro de que quieres eliminar esta regla?");
    if (result.isConfirmed) {
      setRules(rules.filter((r) => r.id !== id));
      sweetAlert.success("Eliminado", "La regla ha sido eliminada");
    }
  };

  const openRuleModal = (rule?: Rule) => {
    if (rule) {
      setEditingItem(rule);
      setFormData({
        positionId: rule.positionId,
        levelId: rule.levelId,
        days: rule.days,
        amount: rule.amount,
      });
    } else {
      setEditingItem(null);
      setFormData({});
    }
    setShowRuleModal(true);
  };

  const addCatalogItem = () => {
    if (catalogType === "position") {
      if (!formData.name) {
        sweetAlert.error("Error", "El nombre es requerido");
        return;
      }

      if (editingItem) {
        setPositions(positions.map((p) => (p.id === editingItem.id ? { ...p, ...formData } : p)));
        sweetAlert.success("Cargo actualizado", "Los cambios se han guardado");
      } else {
        const newPosition: Position = {
          id: `pos-${Date.now()}`,
          name: formData.name,
          description: formData.description || "",
        };
        setPositions([...positions, newPosition]);
        sweetAlert.success("Cargo creado", "El cargo se ha agregado correctamente");
      }
    } else {
      if (!formData.name || !formData.positionId) {
        sweetAlert.error("Error", "Nombre y cargo son requeridos");
        return;
      }

      if (editingItem) {
        setLevels(levels.map((l) => (l.id === editingItem.id ? { ...l, name: formData.name, description: formData.description } : l)));
        sweetAlert.success("Nivel actualizado", "Los cambios se han guardado");
      } else {
        const newLevel: Level = {
          id: `lvl-${Date.now()}`,
          name: formData.name,
          positionId: formData.positionId,
          description: formData.description || "",
        };
        setLevels([...levels, newLevel]);
        sweetAlert.success("Nivel creado", "El nivel se ha agregado correctamente");
      }
    }

    setShowCatalogModal(false);
    setEditingItem(null);
    setFormData({});
  };

  const deleteCatalogItem = async (type: "position" | "level", id: string) => {
    const itemName = type === "position" ? "cargo" : "nivel";
    const result = await sweetAlert.confirm(`¿Eliminar ${itemName}?`, `¿Estás seguro de que quieres eliminar este ${itemName}?`);

    if (result.isConfirmed) {
      if (type === "position") {
        setPositions(positions.filter((p) => p.id !== id));
      } else {
        setLevels(levels.filter((l) => l.id !== id));
      }
      sweetAlert.success("Eliminado", `El ${itemName} ha sido eliminado`);
    }
  };

  const openCatalogModal = (type: "position" | "level", item?: Position | Level) => {
    setCatalogType(type);
    if (item) {
      setEditingItem(item);
      setFormData({
        name: item.name,
        description: item.description || "",
        positionId: "positionId" in item ? item.positionId : "",
      });
    } else {
      setEditingItem(null);
      setFormData({});
    }
    setShowCatalogModal(true);
  };

  const approveRecord = (id: string) => {
    setRecords(
      records.map((r) => (r.id === id ? { ...r, status: "approved" as const, approvedAt: new Date().toISOString(), approvedBy: "Admin Dev" } : r))
    );
    sweetAlert.success("Aprobado", "La solicitud ha sido aprobada");
  };

  const rejectRecord = (id: string) => {
    setRecords(
      records.map((r) => (r.id === id ? { ...r, status: "rejected" as const, approvedAt: new Date().toISOString(), approvedBy: "Admin Dev" } : r))
    );
    sweetAlert.success("Rechazado", "La solicitud ha sido rechazada");
  };

  const TabButton = ({ tab, icon, label }: { tab: TabType; icon: any; label: string }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap ${
        activeTab === tab
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`}
    >
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <PageLayout title="Vacaciones - Módulo Dev" subtitle="Módulo de desarrollo con datos simulados (sin backend)" faIcon={{ icon: faCalendar }}>
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        <TabButton tab="config" icon={faGear} label="Configuración" />
        <TabButton tab="rules" icon={faRuler} label="Reglas" />
        <TabButton tab="catalog" icon={faList} label="Catálogo" />
        <TabButton tab="management" icon={faUsers} label="Gestión" />
        <TabButton tab="balance" icon={faChartBar} label="Balance" />
      </div>

      {activeTab === "config" && (
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4 dark:text-white">Estado del Módulo</h3>

            <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <div>
                <span className="text-sm font-medium dark:text-gray-200">Módulo Activo</span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {settings.enabled ? "El módulo está habilitado para usuarios" : "El módulo está deshabilitado"}
                </p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, enabled: !settings.enabled })}
                className={`p-2 rounded transition-colors ${
                  settings.enabled ? "text-green-600 hover:text-green-700" : "text-gray-400 hover:text-gray-500"
                }`}
              >
                <FontAwesomeIcon icon={settings.enabled ? faToggleOn : faToggleOff} className="h-8 w-8" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 dark:text-gray-200">Visible para</label>
              <select
                value={settings.visibleTo}
                onChange={(e) => setSettings({ ...settings, visibleTo: e.target.value })}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="collaborators">Solo Colaboradores</option>
                <option value="coordinators">Solo Coordinadores</option>
                <option value="both">Ambos</option>
              </select>
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.requireApproval}
                  onChange={(e) => setSettings({ ...settings, requireApproval: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium dark:text-gray-200">Requiere aprobación</span>
              </label>
            </div>

            <button
              onClick={() => sweetAlert.success("Guardado", "Configuración actualizada correctamente")}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors font-medium"
            >
              <FontAwesomeIcon icon={faSave} />
              Guardar Configuración
            </button>
          </Card>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold dark:text-white">Reglas Configuradas</h3>
            <button
              onClick={() => openRuleModal()}
              className="flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <FontAwesomeIcon icon={faPlus} />
              Nueva Regla
            </button>
          </div>

          <div className="overflow-x-auto rounded border dark:border-gray-700">
            <table className="w-full bg-white dark:bg-gray-800">
              <thead>
                <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-sm">Cargo</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-sm">Nivel</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-sm">Días</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-sm">Estado</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 text-sm">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                      {positions.find((p) => p.id === rule.positionId)?.name || "—"}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                      {levels.find((l) => l.id === rule.levelId)?.name || "—"}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{rule.days}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          rule.active
                            ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {rule.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openRuleModal(rule)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                          title="Editar"
                        >
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                          title="Eliminar"
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {rules.length === 0 && (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p className="text-sm">No hay reglas configuradas</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "catalog" && (
        <div className="space-y-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setCatalogType("position")}
              className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                catalogType === "position"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Cargos
            </button>
            <button
              onClick={() => setCatalogType("level")}
              className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                catalogType === "level"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Niveles
            </button>
          </div>

          {catalogType === "position" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {positions.map((pos) => (
                <Card
                  key={pos.id}
                  header={{ title: pos.name, subtitle: pos.description, icon: faUserTie }}
                  footer={{
                    actions: [
                      {
                        icon: faEdit,
                        onClick: (e) => {
                          e?.stopPropagation();
                          openCatalogModal("position", pos);
                        },
                        title: "Editar",
                        variant: "default",
                      },
                      {
                        icon: faTrash,
                        onClick: (e) => {
                          e?.stopPropagation();
                          deleteCatalogItem("position", pos.id);
                        },
                        title: "Eliminar",
                        variant: "default",
                      },
                    ],
                  }}
                />
              ))}
              <Card
                variant="create"
                onClick={() => openCatalogModal("position")}
                header={{ title: "Nuevo Cargo", subtitle: "Crear un nuevo cargo", icon: faPlus }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {levels.map((lvl) => (
                <Card
                  key={lvl.id}
                  header={{ title: lvl.name, subtitle: lvl.description, icon: faUserGraduate }}
                  footer={{
                    actions: [
                      {
                        icon: faEdit,
                        onClick: (e) => {
                          e?.stopPropagation();
                          openCatalogModal("level", lvl);
                        },
                        title: "Editar",
                        variant: "default",
                      },
                      {
                        icon: faTrash,
                        onClick: (e) => {
                          e?.stopPropagation();
                          deleteCatalogItem("level", lvl.id);
                        },
                        title: "Eliminar",
                        variant: "default",
                      },
                    ],
                  }}
                >
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    <FontAwesomeIcon icon={faUserTie} className="mr-1" />
                    Cargo: {positions.find((p) => p.id === lvl.positionId)?.name || "—"}
                  </div>
                </Card>
              ))}
              <Card
                variant="create"
                onClick={() => openCatalogModal("level")}
                header={{ title: "Nuevo Nivel", subtitle: "Crear un nuevo nivel", icon: faPlus }}
              />
            </div>
          )}
        </div>
      )}

      {activeTab === "management" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold dark:text-white">Solicitudes de Vacaciones</h3>

          {records.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay solicitudes registradas</p>
            </div>
          ) : (
            <div className="space-y-3">
              {records.map((record) => (
                <div key={record.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border dark:border-gray-700">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white mb-1">{record.userName}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{record.reason}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(record.startDate).toLocaleDateString("es-ES", { day: "numeric", month: "short" })} -{" "}
                        {new Date(record.endDate).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                        <span className="ml-2 font-medium">({record.daysRequested} días)</span>
                      </p>
                    </div>
                    <StatusBadge type={mapStatusToStatusType(record.status)} size="sm" />
                  </div>

                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                    Solicitado el{" "}
                    {new Date(record.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
                  </p>

                  {record.status === "pending" && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => approveRecord(record.id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white rounded-lg px-4 py-2 hover:bg-green-700 transition-colors text-sm font-medium"
                      >
                        <FontAwesomeIcon icon={faCheck} />
                        Aprobar
                      </button>
                      <button
                        onClick={() => rejectRecord(record.id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white rounded-lg px-4 py-2 hover:bg-red-700 transition-colors text-sm font-medium"
                      >
                        <FontAwesomeIcon icon={faTimes} />
                        Rechazar
                      </button>
                    </div>
                  )}

                  {record.approvedBy && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      {record.status === "approved" ? "Aprobado" : "Rechazado"} por {record.approvedBy} el{" "}
                      {record.approvedAt &&
                        new Date(record.approvedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "balance" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold dark:text-white">Balance de Usuarios</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {balances.map((balance) => (
              <div key={balance.userId} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-semibold text-gray-900 dark:text-white">{balance.userName}</h4>
                  <FontAwesomeIcon icon={faCalendar} className="text-blue-600 dark:text-blue-400 h-6 w-6" />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Días asignados:</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{balance.assignedDays}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Días usados:</span>
                    <span className="text-lg font-bold text-red-600 dark:text-red-400">{balance.used}</span>
                  </div>
                  <div className="h-px bg-gray-200 dark:bg-gray-700"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Días disponibles:</span>
                    <span className="text-xl font-bold text-green-600 dark:text-green-400">{balance.remaining}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t dark:border-gray-700">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${(balance.used / balance.assignedDays) * 100}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                    {((balance.used / balance.assignedDays) * 100).toFixed(0)}% utilizado
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showRuleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4 dark:text-white">{editingItem ? "Editar Regla" : "Nueva Regla"}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-200">Cargo *</label>
                <select
                  value={formData.positionId || ""}
                  onChange={(e) => setFormData({ ...formData, positionId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Seleccionar cargo...</option>
                  {positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-200">Nivel *</label>
                <select
                  value={formData.levelId || ""}
                  onChange={(e) => setFormData({ ...formData, levelId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  disabled={!formData.positionId}
                >
                  <option value="">Seleccionar nivel...</option>
                  {levels
                    .filter((l) => l.positionId === formData.positionId)
                    .map((lvl) => (
                      <option key={lvl.id} value={lvl.id}>
                        {lvl.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-200">Días de vacaciones *</label>
                <input
                  type="number"
                  value={formData.days || ""}
                  onChange={(e) => setFormData({ ...formData, days: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="14"
                  min="1"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={addRule}
                className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors font-medium"
              >
                {editingItem ? "Actualizar" : "Crear"}
              </button>
              <button
                onClick={() => {
                  setShowRuleModal(false);
                  setEditingItem(null);
                  setFormData({});
                }}
                className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-4 py-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showCatalogModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4 dark:text-white">
              {editingItem ? "Editar" : "Nuevo"} {catalogType === "position" ? "Cargo" : "Nivel"}
            </h3>

            <div className="space-y-4">
              {catalogType === "level" && !editingItem && (
                <div>
                  <label className="block text-sm font-medium mb-2 dark:text-gray-200">Cargo *</label>
                  <select
                    value={formData.positionId || ""}
                    onChange={(e) => setFormData({ ...formData, positionId: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Seleccionar cargo...</option>
                    {positions.map((pos) => (
                      <option key={pos.id} value={pos.id}>
                        {pos.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-200">Nombre *</label>
                <input
                  type="text"
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder={catalogType === "position" ? "Nombre del cargo" : "Nombre del nivel"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-200">Descripción</label>
                <textarea
                  value={formData.description || ""}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                  placeholder="Descripción opcional..."
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={addCatalogItem}
                className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 hover:bg-blue-700 transition-colors font-medium"
              >
                {editingItem ? "Actualizar" : "Crear"}
              </button>
              <button
                onClick={() => {
                  setShowCatalogModal(false);
                  setEditingItem(null);
                  setFormData({});
                }}
                className="flex-1 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-4 py-2 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
