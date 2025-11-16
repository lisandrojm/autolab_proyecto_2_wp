import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { positionsAPI, Position } from "../api/positions";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIdCard, faEdit, faTrash, faPlus, faShieldHalved, faUserTie } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";

const HELP_KEY = "positions" as const;

interface PositionFormData {
  name: string;
  description: string;
}

export const PositionsPage: React.FC = () => {
  const { hasPermission } = useAuthStore();

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState<PositionFormData>({
    name: "",
    description: "",
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewPosition, setViewPosition] = useState<Position | null>(null);

  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  const canManage = hasPermission("users:view");

  useEffect(() => {
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const response = await positionsAPI.list({});
      setPositions(response.positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
      sweetAlert.error("Error", "No se pudieron cargar los cargos");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingPosition(null);
    setFormData({
      name: "",
      description: "",
    });
    setShowModal(true);
  };

  const openEdit = (position: Position) => {
    setEditingPosition(position);
    setFormData({
      name: position.name,
      description: position.description || "",
    });
    setShowModal(true);
  };

  const openView = (position: Position) => {
    setViewPosition(position);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPosition(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewPosition(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPosition) {
        await positionsAPI.update(editingPosition._id, formData);
        sweetAlert.success("Cargo actualizado", "Los cambios se han guardado correctamente");
      } else {
        await positionsAPI.create(formData);
        sweetAlert.success("Cargo creado", "El cargo se ha creado correctamente");
      }
      closeModal();
      fetchPositions();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el cargo";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (position: Position) => {
    const result = await sweetAlert.confirm("¿Eliminar cargo?", `¿Estás seguro de que quieres eliminar el cargo "${position.name}"?`);
    if (result.isConfirmed) {
      try {
        await positionsAPI.remove(position._id);
        sweetAlert.success("Cargo eliminado", "El cargo ha sido eliminado correctamente");
        fetchPositions();
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar el cargo";
        sweetAlert.error("Error", message);
      }
    }
  };

  const filteredPositions = positions.filter((p) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);

    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = p.createdAt ? new Date(p.createdAt).getTime() : 0;
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

  if (loading) return <LoadingSpinner message="Cargando cargos..." />;

  return (
    <PageLayout
      title="Cargos"
      subtitle="Gestiona los cargos de la organización"
      faIcon={{ icon: faUserTie }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        canManage ? (
          <button onClick={openCreate} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
        ) : undefined
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar cargos..."
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
        title: viewPosition ? viewPosition.name : "Cargo",
        subtitle: viewPosition?.description,
        size: "md",
        actions: [
          ...(canManage
            ? [
                {
                  label: "Editar cargo",
                  onClick: () => {
                    if (viewPosition) openEdit(viewPosition);
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
        content: viewPosition ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewPosition.description || "—"}</p>
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingPosition ? "Editar Cargo" : "Nuevo Cargo",
        subtitle: "Define nombre y descripción",
        size: "md",
        actions: [
          {
            label: editingPosition ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#position-form");
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
          <form id="position-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Nombre del cargo" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del cargo" />
              </div>
            </div>
          </form>
        ),
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
        {filteredPositions.map((position) => (
          <Card
            key={position._id}
            onClick={() => openView(position)}
            className="hover:scale-105 hover:shadow-lg transition-all duration-200"
            header={{
              title: position.name,
              subtitle: position.description,
              icon: faUserTie,
            }}
            footer={
              canManage
                ? {
                    leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{position.createdAt ? new Date(position.createdAt).toLocaleDateString() : ""}</span>,
                    actions: [
                      {
                        icon: faEdit,
                        onClick: (e) => {
                          e.stopPropagation();
                          openEdit(position);
                        },
                        title: "Editar",
                        variant: "default",
                      },
                      {
                        icon: faTrash,
                        onClick: (e) => {
                          e.stopPropagation();
                          handleDelete(position);
                        },
                        title: "Eliminar",
                        variant: "default",
                      },
                    ],
                  }
                : undefined
            }
          />
        ))}
        {canManage && (
          <Card
            variant="create"
            onClick={openCreate}
            header={{
              title: "Nuevo Cargo",
              subtitle: "Crear un nuevo cargo para la organización",
              icon: faIdCard,
            }}
          />
        )}
      </div>

      {filteredPositions.length === 0 && (
        <EmptyState
          icon={faShieldHalved}
          title={startDate || endDate ? "No hay cargos en este rango de fechas" : "No hay cargos"}
          description={startDate || endDate ? `No se encontraron cargos ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Crea tu primer cargo para comenzar."}
          action={
            canManage
              ? {
                  label: "Nuevo Cargo",
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
