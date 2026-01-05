import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { areasAPI, Area } from "../api/areas";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faShieldHalved, faLayerGroup, faUserTie, faUserGraduate, faUserGear } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

// const HELP_KEY = "areas" as const; // TODO: Add help content if needed

interface AreaFormData {
  name: string;
  description: string;
}

export const ManageAreasPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [formData, setFormData] = useState<AreaFormData>({
    name: "",
    description: "",
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewArea, setViewArea] = useState<Area | null>(null);

  // const [openInfo, setOpenInfo] = useState(false);
  // const helpEntry = getHelp(HELP_KEY);

  const canManage = hasPermission("users:view"); // Assuming same permission as users/positions for now

  useEffect(() => {
    fetchAreas();
  }, []);

  const fetchAreas = async () => {
    try {
      setLoading(true);
      const response = await areasAPI.list({});
      setAreas(response.areas);
    } catch (error) {
      console.error("Error fetching areas:", error);
      sweetAlert.error("Error", "No se pudieron cargar las áreas");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingArea(null);
    setFormData({
      name: "",
      description: "",
    });
    setShowModal(true);
  };

  const openEdit = (area: Area) => {
    setEditingArea(area);
    setFormData({
      name: area.name,
      description: area.description || "",
    });
    setShowModal(true);
  };

  const openView = (area: Area) => {
    setViewArea(area);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingArea(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewArea(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingArea) {
        await areasAPI.update(editingArea._id, formData);
        sweetAlert.success("Área actualizada", "Los cambios se han guardado correctamente");
      } else {
        await areasAPI.create(formData);
        sweetAlert.success("Área creada", "El área se ha creado correctamente");
      }
      closeModal();
      fetchAreas();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el área";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (area: Area) => {
    const result = await sweetAlert.confirm("¿Eliminar área?", `¿Estás seguro de que quieres eliminar el área "${area.name}"?`);
    if (result.isConfirmed) {
      try {
        await areasAPI.remove(area._id);
        sweetAlert.success("Área eliminada", "El área ha sido eliminada correctamente");
        fetchAreas();
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar el área";
        sweetAlert.error("Error", message);
      }
    }
  };

  const filteredAreas = areas.filter((a) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || a.name.toLowerCase().includes(q) || (a.description || "").toLowerCase().includes(q);

    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      if (startDate) {
        const start = new Date(startDate).getTime();
        matchesDate = matchesDate && createdAt >= start;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        matchesDate = matchesDate && createdAt <= end;
      }
    }

    return matchesSearch && matchesDate;
  });

  if (loading) return <LoadingSpinner message="Cargando áreas..." />;

  return (
    <PageLayout
      title="Áreas"
      subtitle="Gestiona las áreas de la organización"
      faIcon={{ icon: faLayerGroup }}
      shouldShowInfo={false}
      headerActions={
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={openCreate} className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
            </button>
          )}
          <button onClick={() => navigate("/users")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGear} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Usuarios</span>
          </button>
          <button onClick={() => navigate("/positions")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserTie} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Cargos</span>
          </button>
          <button onClick={() => navigate("/levels")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Niveles</span>
          </button>
        </div>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar áreas..."
          dateFilter={{
            startDate,
            endDate,
            onStartDateChange: setStartDate,
            onEndDateChange: setEndDate,
          }}
        />
      }
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: viewArea ? viewArea.name : "Área",
        subtitle: viewArea?.description,
        size: "md",
        actions: [
          ...(canManage
            ? [
                {
                  label: "Editar área",
                  onClick: () => {
                    if (viewArea) openEdit(viewArea);
                    closeView();
                  },
                  variant: "secondary",
                } as const,
              ]
            : []),
          {
            label: "Cancelar",
            onClick: closeView,
            variant: "ghost",
          },
        ],
        content: viewArea ? (
          <div className="space-y-6">
            {/* Descripción */}
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewArea.description || "—"}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Detalles</h4>
              <p className="text-xs text-gray-500">Creado el: {viewArea.createdAt ? new Date(viewArea.createdAt).toLocaleDateString() : "-"}</p>
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingArea ? "Editar Área" : "Nueva Área",
        subtitle: "Define nombre y descripción",
        size: "md",
        actions: [
          {
            label: editingArea ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#area-form");
              form?.requestSubmit();
            },
            variant: "primary",
          },
          {
            label: "Cancelar",
            onClick: closeModal,
            variant: "ghost",
          },
        ],
        content: (
          <form id="area-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Nombre del área" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del área" />
              </div>
            </div>
          </form>
        ),
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
        {filteredAreas.map((area) => {
          return (
            <Card
              key={area._id}
              onClick={() => openView(area)}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200"
              header={{
                title: area.name,
                subtitle: area.description,
                icon: faLayerGroup,
              }}
              footer={
                canManage
                  ? {
                      leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{area.createdAt ? new Date(area.createdAt).toLocaleDateString() : ""}</span>,
                      actions: [
                        {
                          icon: faEdit,
                          onClick: (e) => {
                            e.stopPropagation();
                            openEdit(area);
                          },
                          title: "Editar",
                          variant: "default",
                        },
                        {
                          icon: faTrash,
                          onClick: (e) => {
                            e.stopPropagation();
                            handleDelete(area);
                          },
                          title: "Eliminar",
                          variant: "default",
                        },
                      ],
                    }
                  : undefined
              }
            />
          );
        })}
        {canManage && (
          <Card
            variant="create"
            onClick={openCreate}
            header={{
              title: "Nueva Área",
              subtitle: "Crear una nueva área para la organización",
              icon: faLayerGroup,
            }}
          />
        )}
      </div>

      {filteredAreas.length === 0 && (
        <EmptyState
          icon={faShieldHalved}
          title={startDate || endDate ? "No hay áreas en este rango de fechas" : "No hay áreas"}
          description={startDate || endDate ? `No se encontraron áreas ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Crea tu primera área para comenzar."}
          action={
            canManage
              ? {
                  label: "Nueva Área",
                  onClick: openCreate,
                  icon: faPlus,
                }
              : undefined
          }
        />
      )}
    </PageLayout>
  );
};
