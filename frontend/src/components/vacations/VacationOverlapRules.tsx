import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faEdit, faTrash, faBan, faLayerGroup, faSpinner, faToggleOn, faToggleOff, faUserTie, faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import { vacationOverlapsAPI, VacationOverlap } from "../../api/vacationOverlaps";
import { areasAPI, Area } from "../../api/areas";
import { usersAPI, User } from "../../api/users";
import { sweetAlert } from "../../utils/sweetAlert";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { EmptyState } from "../ui/EmptyState";
import { Modal } from "../ui/Modal";

// Schema validación Zod
const overlapSchema = z.object({
  areaId: z.string().min(1, "Debes seleccionar un área"),
  maxSimultaneousUsers: z.number().min(1, "Mínimo 1 usuario"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type OverlapFormData = z.infer<typeof overlapSchema>;

export const VacationOverlapRules: React.FC = () => {
  const [rules, setRules] = useState<VacationOverlap[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<VacationOverlap | null>(null);
  // New state for users in area
  const [areaUsers, setAreaUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<OverlapFormData>({
    resolver: zodResolver(overlapSchema),
    defaultValues: {
      maxSimultaneousUsers: 1,
      isActive: true,
    },
  });

  const selectedAreaId = watch("areaId");

  const fetchData = async () => {
    try {
      setLoading(true);
      const [rulesData, areasData] = await Promise.all([vacationOverlapsAPI.list(), areasAPI.list({ limit: 100 })]);
      setRules(rulesData);
      setAreas(areasData.areas);
    } catch (error) {
      console.error(error);
      sweetAlert.error("Error", "No se pudieron cargar los datos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (modalOpen && selectedAreaId) {
      setLoadingUsers(true);
      usersAPI
        .getByArea(selectedAreaId)
        .then((users) => setAreaUsers(users))
        .catch((err) => console.error("Error fetching users:", err))
        .finally(() => setLoadingUsers(false));
    } else {
      setAreaUsers([]);
    }
  }, [selectedAreaId, modalOpen]);

  const openCreate = () => {
    setEditingRule(null);
    reset({
      areaId: "",
      maxSimultaneousUsers: 1,
      description: "",
      isActive: true,
    });
    setModalOpen(true);
  };

  const openEdit = (rule: VacationOverlap) => {
    setEditingRule(rule);
    const areaId = typeof rule.areaId === "object" ? rule.areaId._id : rule.areaId;
    reset({
      areaId,
      maxSimultaneousUsers: rule.maxSimultaneousUsers,
      description: rule.description || "",
      isActive: rule.isActive,
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: OverlapFormData) => {
    try {
      // Validation: Max users cannot exceed total users in area
      // Only check if we have fetched users (areaUsers > 0)
      if (areaUsers.length > 0 && data.maxSimultaneousUsers > areaUsers.length) {
        setError("maxSimultaneousUsers", {
          type: "manual",
          message: `El máximo no puede ser mayor al total de usuarios (${areaUsers.length})`,
        });
        return;
      }

      if (editingRule) {
        await vacationOverlapsAPI.update(editingRule._id, data);
        sweetAlert.success("Actualizado", "Regla actualizada correctamente");
      } else {
        await vacationOverlapsAPI.create(data);
        sweetAlert.success("Creado", "Regla creada correctamente");
      }
      setModalOpen(false);
      fetchData();
    } catch (error: any) {
      const msg = error.response?.data?.error || "Error al guardar";
      sweetAlert.error("Error", msg);
    }
  };

  const handleToggleActive = async (rule: VacationOverlap) => {
    try {
      await vacationOverlapsAPI.update(rule._id, { isActive: !rule.isActive });
      // Optimistic update or refetch
      const updatedRules = rules.map((r) => (r._id === rule._id ? { ...r, isActive: !r.isActive } : r));
      setRules(updatedRules);
      sweetAlert.success("Estado actualizado", `La regla ahora está ${!rule.isActive ? "activa" : "inactiva"}`);
    } catch (error) {
      console.error(error);
      sweetAlert.error("Error", "No se pudo actualizar el estado");
      // Revert if fetch fails? Or just fetchAll again
      fetchData();
    }
  };

  const handleDelete = async (rule: VacationOverlap) => {
    const confirm = await sweetAlert.confirm("Eliminar regla", "¿Estás seguro de eliminar esta regla de solapamiento? Esto podría afectar las validaciones de vacaciones.");
    if (confirm.isConfirmed) {
      try {
        await vacationOverlapsAPI.remove(rule._id);
        sweetAlert.success("Eliminado", "Regla eliminada");
        fetchData();
      } catch (error) {
        sweetAlert.error("Error", "No se pudo eliminar");
      }
    }
  };

  if (loading) return <LoadingSpinner message="Cargando reglas..." />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Reglas de Solapamiento</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Define cuántas personas por área pueden estar de vacaciones simultáneamente.</p>
        </div>
        <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors">
          <FontAwesomeIcon icon={faPlus} />
          Nueva Regla
        </button>
      </div>

      {rules.length === 0 ? (
        <EmptyState icon={faBan} title="No hay reglas definidas" description="Crea reglas para restringir el solapamiento de vacaciones por área." action={{ label: "Crear Regla", onClick: openCreate }} />
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 font-medium">Área</th>
                <th className="px-6 py-3 font-medium">Máx. Simultáneos</th>
                <th className="px-6 py-3 font-medium">Descripción</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rules.map((rule) => (
                <tr key={rule._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                    <div className="flex items-center gap-2">
                      <FontAwesomeIcon icon={faLayerGroup} className="text-blue-500" />
                      {typeof rule.areaId === "object" ? rule.areaId.name : rule.areaId}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                    <span className="inline-flex items-center justify-center bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-semibold">{rule.maxSimultaneousUsers} usuarios</span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400 max-w-xs truncate">{rule.description || "—"}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => handleToggleActive(rule)} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${rule.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
                      <FontAwesomeIcon icon={rule.isActive ? faToggleOn : faToggleOff} className="mr-2" />
                      {rule.isActive ? "Activa" : "Inactiva"}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => openEdit(rule)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors" title="Editar">
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                    <button onClick={() => handleDelete(rule)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors" title="Eliminar">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal using UI Component */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRule ? "Editar Regla" : "Nueva Regla"}
        size="md"
        footer={
          <>
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
              Cancelar
            </button>
            <button type="submit" form="overlap-form" className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-500">
              {editingRule ? "Guardar Cambios" : "Crear Regla"}
            </button>
          </>
        }
      >
        <form id="overlap-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Área</label>
            <select {...register("areaId")} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white" disabled={areas.length === 0}>
              <option value="">Selecciona un área</option>
              {areas.map((area) => (
                <option key={area._id} value={area._id}>
                  {area.name}
                </option>
              ))}
            </select>
            {areas.length === 0 && <p className="text-xs text-amber-600 mt-1">No hay áreas creadas.</p>}
            {errors.areaId && <p className="text-xs text-red-500 mt-1">{errors.areaId.message}</p>}
          </div>

          {/* User List Section */}
          {selectedAreaId && (
            <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg border border-gray-200 dark:border-gray-600 text-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-gray-700 dark:text-gray-300">Usuarios en el área</h4>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    <FontAwesomeIcon icon={faLayerGroup} />
                    {areas.find((a) => a._id === selectedAreaId)?.name}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 font-semibold">({loadingUsers ? "..." : areaUsers.length})</span>
                </div>
                {loadingUsers && <FontAwesomeIcon icon={faSpinner} spin className="text-blue-500" />}
              </div>

              {!loadingUsers && areaUsers.length === 0 && <div className="text-gray-500 dark:text-gray-400 italic text-xs">No hay usuarios activos asignados a esta área.</div>}

              {!loadingUsers && areaUsers.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {areaUsers.map((user) => (
                    <div key={user._id} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                          {user.firstName?.charAt(0)}
                          {user.lastName?.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white text-sm">
                            {user.firstName} {user.lastName}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          <FontAwesomeIcon icon={faUserTie} />
                          {typeof user.positionId === "object" ? user.positionId?.name : "Sin cargo"}
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          <FontAwesomeIcon icon={faGraduationCap} />
                          {typeof user.levelId === "object" ? user.levelId?.name : "Sin nivel"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Máximo de usuarios simultáneos</label>
            <input type="number" {...register("maxSimultaneousUsers", { valueAsNumber: true })} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white disabled:opacity-50 disabled:bg-gray-100 dark:disabled:bg-gray-800" min={1} max={areaUsers.length > 0 ? areaUsers.length : undefined} disabled={!selectedAreaId || loadingUsers} />
            {errors.maxSimultaneousUsers && <p className="text-xs text-red-500 mt-1">{errors.maxSimultaneousUsers.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción (Opcional)</label>
            <textarea {...register("description")} className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-700 dark:text-white" rows={3} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
            <button type="button" onClick={() => setValue("isActive", !watch("isActive"), { shouldValidate: true })} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${watch("isActive") ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"}`}>
              <FontAwesomeIcon icon={watch("isActive") ? faToggleOn : faToggleOff} className="mr-2" />
              {watch("isActive") ? "Activa" : "Inactiva"}
            </button>
            <input type="hidden" {...register("isActive")} />
          </div>
        </form>
      </Modal>
    </div>
  );
};
