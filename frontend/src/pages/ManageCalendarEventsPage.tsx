import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSearch } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, CalendarEvent } from "../api/hrManagement";
import { PageLayout } from "../components/ui/PageLayout";

export const ManageCalendarEventsPage: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await hrManagementAPI.calendarEvents.list({ page, limit: 50 });
      setEvents(data.events);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error("Error loading calendar events:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [page]);

  const filteredEvents = events.filter((event) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return event.title.toLowerCase().includes(search) || (event.description && event.description.toLowerCase().includes(search));
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getUserName = (user: any) => {
    if (!user) return "Usuario desconocido";
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    return user.email || "Usuario desconocido";
  };

  return (
    <PageLayout title="Calendario" subtitle="Gestión de eventos del calendario">
      <div>
        <div className="mb-6">
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Buscar eventos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg- w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-am dark:bg-gray-700 dark:text-white" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-blue-600" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded border dark:border-slate-800">
              <table className="w-full dark:bg-slate-800/80">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Título</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Usuario</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Inicio</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Fin</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.map((event) => (
                    <tr key={event._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{event.title}</div>
                        {event.description && <div className="text-sm text-gray-600 dark:text-gray-400">{event.description}</div>}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getUserName(event.userId)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{formatDate(event.start)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{formatDate(event.end)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700">
                  Anterior
                </button>
                <span className="text-gray-700 dark:text-gray-300">
                  Página {page} de {totalPages}
                </span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700">
                  Siguiente
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
};
