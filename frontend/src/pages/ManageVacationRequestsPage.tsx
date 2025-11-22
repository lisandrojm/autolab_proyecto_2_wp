import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSearch } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, VacationRequest } from "../api/hrManagement";
import { PageLayout } from "../components/ui/PageLayout";

export const ManageVacationRequestsPage: React.FC = () => {
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const loadVacations = async () => {
    try {
      setLoading(true);
      const data = await hrManagementAPI.vacationRequests.list({ page, limit: 50 });
      setVacations(data.vacations);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error("Error loading vacation requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVacations();
  }, [page]);

  const filteredVacations = vacations.filter((vac) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    const userName = getUserName(vac.userId).toLowerCase();
    return userName.includes(search) || vac.reason.toLowerCase().includes(search);
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getUserName = (user: any) => {
    if (!user) return "Usuario desconocido";
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    return user.email || "Usuario desconocido";
  };

  return (
    <PageLayout title="Solicitudes de Vacaciones" subtitle="Gestión de solicitudes de vacaciones">
      <div>
        <div className="mb-6 relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar solicitudes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-blue-600" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Solicitante</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Desde</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Hasta</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Días</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVacations.map((vac) => (
                    <tr key={vac._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{getUserName(vac.userId)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{formatDate(vac.startDate)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{formatDate(vac.endDate)}</td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100 font-medium">{vac.daysRequested}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{vac.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded-lg border">
                  Anterior
                </button>
                <span>
                  Página {page} de {totalPages}
                </span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 rounded-lg border">
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
