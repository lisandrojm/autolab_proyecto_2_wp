import { useState, useEffect } from "react";
import { Clock, CheckCircle, XCircle, AlertTriangle, Filter, Calendar } from "lucide-react";
import { getFutureActions, getFutureActionStats, updateFutureAction } from "../api/futureActions";
import type { FutureAction, FutureActionStats, EstadoAccion, TipoAccionFutura } from "../types/futureAction";
import { estadoAccionLabels, tipoAccionFuturaLabels, responsableAccionLabels } from "../types/futureAction";

export default function FutureActionsPage() {
  const [futureActions, setFutureActions] = useState<FutureAction[]>([]);
  const [stats, setStats] = useState<FutureActionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState<EstadoAccion | "all">("all");
  const [filterTipo, setFilterTipo] = useState<TipoAccionFutura | "all">("all");

  const loadData = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filterEstado !== "all") params.estadoAccion = filterEstado;
      if (filterTipo !== "all") params.tipoAccionFutura = filterTipo;

      const [actionsResponse, statsData] = await Promise.all([getFutureActions(params), getFutureActionStats()]);

      setFutureActions(actionsResponse.data);
      setStats(statsData);
    } catch (error) {
      console.error("Error loading future actions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterEstado, filterTipo]);

  const handleMarkCompleted = async (id: string) => {
    try {
      await updateFutureAction(id, {
        estadoAccion: "cumplida",
        fechaCumplimiento: new Date().toISOString(),
      });
      loadData();
    } catch (error) {
      console.error("Error marking action as completed:", error);
    }
  };

  const getStatusIcon = (estado: EstadoAccion) => {
    switch (estado) {
      case "cumplida":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "pendiente":
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case "vencida":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "en_revision":
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
    }
  };

  const getStatusColor = (estado: EstadoAccion) => {
    switch (estado) {
      case "cumplida":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "pendiente":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
      case "vencida":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case "en_revision":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400";
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Sin fecha";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const calculateDaysRemaining = (fechaLimite?: string) => {
    if (!fechaLimite) return null;
    const today = new Date();
    const deadline = new Date(fechaLimite);
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">Acciones Futuras</h1>
        <p className="text-slate-600 dark:text-slate-400">Gestiona las acciones pendientes asociadas a pedidos</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">Pendientes</p>
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{stats.pendiente}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">Cumplidas</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.cumplida}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
          </div>

          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-600 dark:text-red-400">Vencidas</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{stats.vencida}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>

          <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-600 dark:text-orange-400">En Revisión</p>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{stats.en_revision}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600 dark:text-purple-400">Vencidas (Hoy)</p>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.overdue}</p>
              </div>
              <Calendar className="w-8 h-8 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Filter className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <span className="font-medium text-slate-900 dark:text-slate-100">Filtros</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Estado</label>
            <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value as EstadoAccion | "all")} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100">
              <option value="all">Todos</option>
              {Object.entries(estadoAccionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de Acción</label>
            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value as TipoAccionFutura | "all")} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100">
              <option value="all">Todos</option>
              {Object.entries(tipoAccionFuturaLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando acciones...</p>
        </div>
      ) : futureActions.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          <AlertTriangle className="w-16 h-16 text-slate-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">No hay acciones futuras</p>
          <p className="text-slate-600 dark:text-slate-400">No se encontraron acciones con los filtros seleccionados</p>
        </div>
      ) : (
        <div className="space-y-4">
          {futureActions.map((action) => {
            const daysRemaining = calculateDaysRemaining(action.fechaLimite);
            return (
              <div key={action._id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    {getStatusIcon(action.estadoAccion)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(action.estadoAccion)}`}>{estadoAccionLabels[action.estadoAccion]}</span>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">{tipoAccionFuturaLabels[action.tipoAccionFutura]}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">{action.descripcionAccion}</h3>
                      <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                        <p>
                          <span className="font-medium">Responsable:</span> {responsableAccionLabels[action.responsableAccion]}
                        </p>
                        {action.fechaLimite && (
                          <p>
                            <span className="font-medium">Fecha límite:</span> {formatDate(action.fechaLimite)}
                            {daysRemaining !== null && <span className={`ml-2 ${daysRemaining < 0 ? "text-red-600 dark:text-red-400" : daysRemaining <= 3 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>({daysRemaining < 0 ? "Vencido" : `${daysRemaining} días restantes`})</span>}
                          </p>
                        )}
                        {action.documentoRequerido && (
                          <p>
                            <span className="font-medium">Documento requerido:</span> {action.documentoRequerido}
                          </p>
                        )}
                        {action.plazoDias && (
                          <p>
                            <span className="font-medium">Plazo:</span> {action.plazoDias} días
                          </p>
                        )}
                        <p>
                          <span className="font-medium">Creada:</span> {formatDate(action.fechaCreacionAccion)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {action.estadoAccion === "pendiente" && (
                    <button onClick={() => handleMarkCompleted(action._id)} className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
                      Marcar como Cumplida
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
