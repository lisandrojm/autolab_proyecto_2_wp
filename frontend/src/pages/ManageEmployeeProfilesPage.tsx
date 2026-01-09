import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSearch } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, EmployeeProfile } from "../api/hrManagement";
import { PageLayout } from "../components/ui/PageLayout";

export const ManageEmployeeProfilesPage: React.FC = () => {
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const data = await hrManagementAPI.employeeProfiles.list({ page, limit: 50, search: searchTerm || undefined });
      setProfiles(data.profiles);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error("Error loading employee profiles:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) loadProfiles();
      else setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadProfiles();
  }, [page]);

  return (
    <PageLayout title="Perfiles de Empleados" subtitle="Gestión de perfiles de personal">
      <div>
        <div className="mb-6 relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar por nombre o email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
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
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Nombre</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Email</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Cargo</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Departamento</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {profile.firstName} {profile.lastName}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{profile.email}</td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{profile.position || "-"}</td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{profile.department || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-6">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-4 py-2 rounded border">
                  Anterior
                </button>
                <span>
                  Página {page} de {totalPages}
                </span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-4 py-2 rounded border">
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
