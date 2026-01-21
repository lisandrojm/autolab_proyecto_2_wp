import React, { useEffect, useState, useMemo } from "react";
import { roleFrameAPI, RoleFrameItem } from "../api/roleFrames";
import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { faUserShield, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Modal } from "../components/ui/Modal";

export const RolesFramePage: React.FC = () => {
  const [roles, setRoles] = useState<RoleFrameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRole, setSelectedRole] = useState<RoleFrameItem | null>(null);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setLoading(true);
        const data = await roleFrameAPI.list();
        setRoles(data);
      } catch (error) {
        console.error("Error fetching role frames:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchRoles();
  }, []);

  const filteredRoles = useMemo(() => {
    if (!searchTerm) return roles;
    const lowerSearch = searchTerm.toLowerCase();
    return roles.filter((r) => r.name.toLowerCase().includes(lowerSearch) || r.externalId.toLowerCase().includes(lowerSearch));
  }, [roles, searchTerm]);

  return (
    <PageLayout title="Roles Frame" subtitle="Todos los roles externos del sistema" itemCount={filteredRoles.length} faIcon={{ icon: faUserShield }} searchAndFilters={<SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o ID externo..." />}>
      {loading ? (
        <LoadingSpinner message="Cargando roles..." />
      ) : filteredRoles.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faUserShield} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron roles</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredRoles.map((role) => (
            <Card
              key={role._id}
              onClick={() => setSelectedRole(role)}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
              header={{
                title: role.name,
                subtitle: `ID Externo: ${role.externalId}`,
                icon: faUserShield,
              }}
              footer={{
                leftContent: (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                    <FontAwesomeIcon icon={faLayerGroup} />
                    <span>{role.data?.categoriasSat?.length || 0} Categorías SAT</span>
                  </div>
                ),
              }}
            />
          ))}
        </div>
      )}

      {selectedRole && (
        <Modal isOpen={!!selectedRole} onClose={() => setSelectedRole(null)} title={selectedRole.name} subtitle="Información detallada del Rol Frame" size="lg">
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Nombre</label>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedRole.name}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID Externo</label>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedRole.externalId}</p>
              </div>
            </div>

            {selectedRole.data?.categoriasSat?.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faLayerGroup} className="text-primary-500" />
                  Categorías SAT
                </h4>
                <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Nombre</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Bruto</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Neto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {selectedRole.data.categoriasSat.map((cat: any) => (
                        <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 font-medium">{cat.nombre}</td>
                          <td className="px-4 py-2 text-xs text-right text-gray-700 dark:text-gray-300 font-mono">${cat.sueldoBruto?.toLocaleString()}</td>
                          <td className="px-4 py-2 text-xs text-right text-gray-700 dark:text-gray-300 font-mono">${cat.neto?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </PageLayout>
  );
};
