import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faSpinner, faFilter, faClock, faCheckCircle, faTimesCircle, faBan, faCheck, faTruck, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { Timeline } from "vis-timeline/standalone";
import { DataSet } from "vis-data";
import { vacationsAPI, VacationRequest } from "../api/vacations";
import { PageLayout } from "../components/ui/PageLayout";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import "../styles/vacationsCalendar.css";

interface TimelineItem {
  id: string;
  content: string;
  start: string;
  end: string;
  className: string;
  title: string;
}

const STATUS_COLORS = {
  pending: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  pre_approved: { bg: "#ccfbf1", border: "#14b8a6", text: "#134e4a" },
  approved: { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  delivered: { bg: "#dcfce7", border: "#22c55e", text: "#14532d" },
  rejected: { bg: "#fee2e2", border: "#ef4444", text: "#7f1d1d" },
  cancelled: { bg: "#fed7aa", border: "#f97316", text: "#7c2d12" },
};

const STATUS_LABELS = {
  pending: "Pendiente",
  pre_approved: "Pre-aprobada",
  approved: "Aprobada",
  delivered: "Entregada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

export const ManageVacationsCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineInstanceRef = useRef<Timeline | null>(null);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    loadVacations();
  }, []);

  useEffect(() => {
    if (vacations.length > 0 && timelineRef.current) {
      initializeTimeline();
    }
  }, [vacations, statusFilter]);

  useEffect(() => {
    return () => {
      if (timelineInstanceRef.current) {
        try {
          timelineInstanceRef.current.destroy();
          timelineInstanceRef.current = null;
        } catch (error) {
          console.error("Error destroying timeline:", error);
        }
      }
    };
  }, []);

  const loadVacations = async () => {
    try {
      setLoading(true);
      const data = await vacationsAPI.getAll();
      setVacations(data);
    } catch (error) {
      console.error("Error loading vacations:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    return STATUS_COLORS[status as keyof typeof STATUS_COLORS] || STATUS_COLORS.pending;
  };

  const initializeTimeline = () => {
    if (!timelineRef.current) return;

    if (timelineInstanceRef.current) {
      try {
        timelineInstanceRef.current.destroy();
        timelineInstanceRef.current = null;
      } catch (error) {
        console.error("Error destroying previous timeline:", error);
      }
    }

    const filteredVacations = statusFilter === "all" ? vacations : vacations.filter((v) => v.status === statusFilter);

    const items = filteredVacations.map((vacation): TimelineItem => {
      const color = getStatusColor(vacation.status);
      const statusLabel = STATUS_LABELS[vacation.status as keyof typeof STATUS_LABELS] || vacation.status;

      return {
        id: vacation._id,
        content: `
          <div class="timeline-item-content">
            <div class="timeline-item-name">${vacation.userName || "Usuario"}</div>
            <div class="timeline-item-days">${vacation.daysRequested} día${vacation.daysRequested > 1 ? "s" : ""}</div>
          </div>
        `,
        start: vacation.startDate,
        end: vacation.endDate,
        className: `vacation-item vacation-${vacation.status}`,
        title: `${vacation.userName || "Usuario"}\n${statusLabel}\nPeríodo: ${new Date(vacation.startDate).toLocaleDateString("es-ES")} - ${new Date(vacation.endDate).toLocaleDateString("es-ES")}\nDías: ${vacation.daysRequested}`,
      };
    });

    const dataSet = new DataSet(items);

    const today = new Date();
    const startWindow = new Date(today);
    startWindow.setMonth(today.getMonth() - 1);
    const endWindow = new Date(today);
    endWindow.setMonth(today.getMonth() + 2);

    const options = {
      width: "100%",
      height: "600px",
      margin: {
        item: {
          horizontal: 10,
          vertical: 10,
        },
      },
      start: startWindow,
      end: endWindow,
      zoomMin: 1000 * 60 * 60 * 24 * 7,
      zoomMax: 1000 * 60 * 60 * 24 * 365,
      locale: "es",
      orientation: "top" as const,
      moveable: true,
      zoomable: true,
      stack: true,
      tooltip: {
        followMouse: true,
        overflowMethod: "cap" as const,
      },
    };

    const timeline = new Timeline(timelineRef.current, dataSet, options);
    timelineInstanceRef.current = timeline;

    timeline.on("select", (properties) => {
      if (properties.items && properties.items.length > 0) {
        const vacationId = properties.items[0];
        console.log("Selected vacation:", vacationId);
      }
    });
  };

  const handleTodayClick = () => {
    if (timelineInstanceRef.current) {
      const today = new Date();
      const startWindow = new Date(today);
      startWindow.setMonth(today.getMonth() - 1);
      const endWindow = new Date(today);
      endWindow.setMonth(today.getMonth() + 2);

      timelineInstanceRef.current.setWindow(startWindow, endWindow);
    }
  };

  const handlePreviousMonth = () => {
    if (timelineInstanceRef.current) {
      const window = timelineInstanceRef.current.getWindow();
      const range = window.end.getTime() - window.start.getTime();
      const newStart = new Date(window.start.getTime() - range / 2);
      const newEnd = new Date(window.end.getTime() - range / 2);
      timelineInstanceRef.current.setWindow(newStart, newEnd);
    }
  };

  const handleNextMonth = () => {
    if (timelineInstanceRef.current) {
      const window = timelineInstanceRef.current.getWindow();
      const range = window.end.getTime() - window.start.getTime();
      const newStart = new Date(window.start.getTime() + range / 2);
      const newEnd = new Date(window.end.getTime() + range / 2);
      timelineInstanceRef.current.setWindow(newStart, newEnd);
    }
  };

  /*   const stats = vacations.reduce(
    (acc, vacation) => {
      acc[vacation.status] = (acc[vacation.status] || 0) + 1;
      return acc;
    },
    { pending: 0, pre_approved: 0, approved: 0, rejected: 0, delivered: 0, cancelled: 0 }
  ); */

  return (
    <PageLayout title="Calendario de Vacaciones" subtitle="Vista temporal de todas las solicitudes de vacaciones" faIcon={{ icon: faClock }} onBack={() => navigate("/hr/vacation-requests")}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <button onClick={handlePreviousMonth} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors" title="Período anterior">
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
            <button onClick={handleTodayClick} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-medium">
              Hoy
            </button>
            <button onClick={handleNextMonth} className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors" title="Período siguiente">
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white">
              <option value="all">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="pre_approved">Pre-aprobadas</option>
              <option value="approved">Aprobadas</option>
              <option value="delivered">Entregadas</option>
              <option value="rejected">Rechazadas</option>
              <option value="cancelled">Canceladas</option>
            </select>
            <FontAwesomeIcon icon={faFilter} className="text-gray-400" />
          </div>
        </div>

        {/*         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {[
            { label: "Pendientes", value: stats.pending, icon: faClock, color: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" },
            { label: "Pre-aprobadas", value: stats.pre_approved, icon: faCheck, color: "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400" },
            { label: "Aprobadas", value: stats.approved, icon: faCheckCircle, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
            { label: "Entregadas", value: stats.delivered, icon: faTruck, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
            { label: "Rechazadas", value: stats.rejected, icon: faTimesCircle, color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
            { label: "Canceladas", value: stats.cancelled, icon: faBan, color: "bg-orange-50 dark:bg-orange-600/20 text-orange-600 dark:text-orange-400" },
          ].map((stat, index) => (
            <div key={index} className={`rounded-xl shadow-sm p-3 flex items-center gap-2 ${stat.color}`}>
              <FontAwesomeIcon icon={stat.icon} className="h-4 w-4 opacity-80" />
              <div className="flex flex-col">
                <span className="text-xs font-medium opacity-80">{stat.label}</span>
                <span className="text-lg font-bold">{stat.value}</span>
              </div>
            </div>
          ))}
        </div> */}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-blue-600" />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div ref={timelineRef} className="vacation-timeline"></div>
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Instrucciones</h3>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Arrastra el timeline para moverte en el tiempo</li>
            <li>• Usa la rueda del mouse para hacer zoom</li>
            <li>• Haz clic en un período de vacaciones para ver detalles</li>
            <li>• Filtra por estado usando el selector arriba</li>
          </ul>
        </div>
      </div>
    </PageLayout>
  );
};
