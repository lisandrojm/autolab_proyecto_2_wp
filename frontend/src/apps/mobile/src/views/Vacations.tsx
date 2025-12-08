import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCalendar, faCheckCircle, faClock, faTimesCircle, faShoppingCart, faUmbrellaBeach } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useVacations } from "../hooks/useVacations";
import { sweetAlert } from "../utils/sweetAlert";

interface VacationsProps {
  onNavigate: (view: ViewType) => void;
}

export default function Vacations({ onNavigate }: VacationsProps) {
  const { vacations, availableDays, loading, error, createVacation } = useVacations();
  const [showForm, setShowForm] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await createVacation({
        startDate,
        endDate,
        reason,
      });
      await sweetAlert.success("¡Solicitud creada!", "Tu solicitud de vacaciones ha sido enviada");
      setShowForm(false);
      setStartDate("");
      setEndDate("");
      setReason("");
    } catch (err: any) {
      await sweetAlert.error("Error", err.response?.data?.error || "Error al crear solicitud");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <FontAwesomeIcon icon={faCheckCircle} className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case "pending":
        return <FontAwesomeIcon icon={faClock} className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />;
      case "rejected":
        return <FontAwesomeIcon icon={faTimesCircle} className="w-5 h-5 text-red-600 dark:text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "approved":
        return "Aprobada";
      case "pending":
        return "Pendiente";
      case "rejected":
        return "Rechazada";
      case "cancelled":
        return "Cancelada";
      default:
        return status;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 dark:bg-green-900/50";
      case "pending":
        return "bg-yellow-100 dark:bg-yellow-900/50";
      case "rejected":
        return "bg-red-100 dark:bg-red-900/50";
      case "cancelled":
        return "bg-slate-100 dark:bg-slate-800";
      default:
        return "bg-slate-100 dark:bg-slate-800";
    }
  };

  return (
    <div className="flex-1 pb-24">
      <div className="sticky top-0 z-10 p-4 pb-2 order-t border-b border-slate-800 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faArrowLeft} className="w-6 h-6 text-slate-900 dark:text-slate-100" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              <FontAwesomeIcon icon={faUmbrellaBeach} className="w-6 h-6 text-slate-900 dark:text-slate-100" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Vacaciones</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Días disponibles</p>
              {loading ? <div className="h-9 w-16 bg-slate-200 dark:bg-slate-700 rounded mt-1" /> : <p className="text-3xl font-bold text-primary">{availableDays?.available || 0}</p>}
            </div>
            <FontAwesomeIcon icon={faCalendar} className="w-12 h-12 text-primary opacity-20" />
          </div>
        </div>

        <button onClick={() => setShowForm(!showForm)} disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-lg h-12 px-4 bg-blue-500 text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none mb-6 disabled:opacity-50 disabled:cursor-not-allowed">
          {showForm ? "Cancelar" : "Nueva Solicitud"}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha de inicio</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Fecha de fin</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Motivo</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none" placeholder="Describe el motivo de tu solicitud..." />
              </div>
              <button type="submit" disabled={submitting} className="w-full flex items-center justify-center rounded-lg h-10 px-4 bg-primary text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "Enviando..." : "Enviar Solicitud"}
              </button>
            </div>
          </form>
        )}

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Mis Solicitudes</h3>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        ) : vacations.length > 0 ? (
          <div className="space-y-3">
            {vacations.map((request) => (
              <div key={request._id} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{request.reason}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {new Date(request.startDate).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      -{" "}
                      {new Date(request.endDate).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      ({request.daysRequested} días)
                    </p>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${getStatusBg(request.status)}`}>
                    {getStatusIcon(request.status)}
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{getStatusText(request.status)}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Solicitado el{" "}
                  {new Date(request.createdAt).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No tienes solicitudes de vacaciones</p>
          </div>
        )}
      </div>
    </div>
  );
}
