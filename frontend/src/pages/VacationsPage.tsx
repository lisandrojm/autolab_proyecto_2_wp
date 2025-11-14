import React, { useEffect, useState } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { personnelAPI, VacationRequest } from "../api/personnel";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faPlus, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";

export const VacationsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingVacation, setEditingVacation] = useState<VacationRequest | null>(null);
  const [formData, setFormData] = useState({
    startDate: "",
    endDate: "",
    reason: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [vacData, balanceData, statsData] = await Promise.allSettled([personnelAPI.getVacations(), personnelAPI.getVacationAvailable(), personnelAPI.getVacationStats()]);

      if (vacData.status === "fulfilled") setVacations(vacData.value);
      if (balanceData.status === "fulfilled") setBalance(balanceData.value);
      if (statsData.status === "fulfilled") setStats(statsData.value);
    } catch (error) {
      console.error("Error fetching vacation data:", error);
      sweetAlert.error("Error", "No se pudieron cargar las vacaciones");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingVacation) {
        await personnelAPI.updateVacation(editingVacation._id, formData);
        sweetAlert.success("Solicitud actualizada", "La solicitud se actualizó correctamente");
      } else {
        await personnelAPI.createVacation(formData);
        sweetAlert.success("Solicitud creada", "La solicitud se creó correctamente");
      }
      setShowModal(false);
      setEditingVacation(null);
      setFormData({ startDate: "", endDate: "", reason: "" });
      fetchData();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo procesar la solicitud");
    }
  };

  const handleDelete = async (vacation: VacationRequest) => {
    if (vacation.status !== "pending") {
      sweetAlert.error("Error", "Solo se pueden eliminar solicitudes pendientes");
      return;
    }
    const result = await sweetAlert.confirm("¿Eliminar solicitud?", "¿Estás seguro de eliminar esta solicitud?");
    if (!result.isConfirmed) return;

    try {
      await personnelAPI.deleteVacation(vacation._id);
      sweetAlert.success("Solicitud eliminada", "La solicitud se eliminó correctamente");
      fetchData();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error || "No se pudo eliminar la solicitud";
      sweetAlert.error("Error", errorMsg);
    }
  };

  const openEdit = (vacation: VacationRequest) => {
    if (vacation.status !== "pending") {
      sweetAlert.error("Error", "Solo se pueden editar solicitudes pendientes");
      return;
    }
    setEditingVacation(vacation);
    setFormData({
      startDate: vacation.startDate.split("T")[0],
      endDate: vacation.endDate.split("T")[0],
      reason: vacation.reason || "",
    });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingVacation(null);
    setFormData({ startDate: "", endDate: "", reason: "" });
    setShowModal(true);
  };

  if (loading) {
    return <LoadingSpinner message="Cargando vacaciones..." />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return { variant: "success" as const, text: "Aprobada" };
      case "rejected":
        return { variant: "blue" as const, text: "Rechazada" };
      default:
        return { variant: "warning" as const, text: "Pendiente" };
    }
  };

  return (
    <PageLayout
      title="Vacaciones"
      subtitle="Gestión de solicitudes de vacaciones"
      faIcon={{ icon: faCalendar }}
      headerActions={
        <button onClick={openCreate} className="btn-primary">
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Nueva Solicitud
        </button>
      }
      modal={{
        isOpen: showModal,
        onClose: () => {
          setShowModal(false);
          setEditingVacation(null);
        },
        title: editingVacation ? "Editar Solicitud" : "Nueva Solicitud de Vacaciones",
        subtitle: "Completa los datos de tu solicitud",
        size: "md",
        actions: [
          {
            label: editingVacation ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#vacation-form");
              form?.requestSubmit();
            },
            variant: "primary",
          },
          { label: "Cancelar", onClick: () => setShowModal(false), variant: "ghost" },
        ],
        content: (
          <form id="vacation-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha de Inicio *</label>
              <input type="date" required value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha de Fin *</label>
              <input type="date" required value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} className="input-field" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Motivo</label>
              <textarea value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} rows={3} className="input-field" placeholder="Motivo de la solicitud..." />
            </div>
          </form>
        ),
      }}
    >
      <div className="space-y-6">
        {(balance || stats) && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Disponibles</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{balance?.available || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Usados</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{balance?.used || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Pendientes</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.pending || 0}</p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">Aprobadas</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{stats?.approved || 0}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vacations.map((vacation) => {
            const badge = getStatusBadge(vacation.status);
            return (
              <Card
                key={vacation._id}
                header={{
                  title: `${vacation.daysRequested} días`,
                  subtitle: `${new Date(vacation.startDate).toLocaleDateString()} - ${new Date(vacation.endDate).toLocaleDateString()}`,
                  icon: faCalendar,
                  badges: [{ text: badge.text, variant: badge.variant }],
                }}
                footer={{
                  leftContent: <span className="text-xs text-gray-500">{new Date(vacation.createdAt).toLocaleDateString()}</span>,
                  actions:
                    vacation.status === "pending"
                      ? [
                          {
                            icon: faEdit,
                            onClick: () => openEdit(vacation),
                            title: "Editar",
                            variant: "default",
                          },
                          {
                            icon: faTrash,
                            onClick: () => handleDelete(vacation),
                            title: "Eliminar",
                            variant: "blue",
                          },
                        ]
                      : [],
                }}
              >
                {vacation.reason && <p className="text-sm text-gray-600 dark:text-gray-400">{vacation.reason}</p>}
              </Card>
            );
          })}
        </div>

        {vacations.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faCalendar} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">No hay solicitudes de vacaciones</p>
            <button onClick={openCreate} className="btn-primary">
              Crear Primera Solicitud
            </button>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
