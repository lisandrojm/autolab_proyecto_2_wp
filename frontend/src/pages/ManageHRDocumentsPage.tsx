import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSearch } from "@fortawesome/free-solid-svg-icons";
import { hrManagementAPI, HRDocument } from "../api/hrManagement";
import { PageLayout } from "../components/ui/PageLayout";

export const ManageHRDocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<HRDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const data = await hrManagementAPI.hrDocuments.list({ page, limit: 50 });
      setDocuments(data.documents);
      setTotalPages(data.pagination.pages);
    } catch (error) {
      console.error("Error loading HR documents:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [page]);

  const filteredDocuments = documents.filter((doc) => {
    if (!searchTerm) return true;
    return doc.title.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getUserName = (user: any) => {
    if (!user) return "Usuario desconocido";
    if (user.firstName && user.lastName) return `${user.firstName} ${user.lastName}`;
    return user.email || "Usuario desconocido";
  };

  return (
    <PageLayout title="Documentos RRHH" subtitle="Gestión de documentos del personal">
      <div>
        <div className="mb-6 relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Buscar documentos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
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
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Empleado</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((doc) => (
                    <tr key={doc._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">{doc.title}</td>
                      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{getUserName(doc.userId)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{doc.type}</td>
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
