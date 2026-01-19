import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faSpinner, faPlus, faEdit, faTrash, faList, faToggleOn, faToggleOff, faGripVertical, faFileContract, faFilePdf, faEye } from "@fortawesome/free-solid-svg-icons";
import { orderConfigAPI, OrderConfig, CategoryType, DateMode, Subtype, TipoAccionFutura, DeadlineMode } from "../api/orderConfig";
import { pdfsAPI, Pdf } from "../api/pdf";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { sweetAlert } from "../utils/sweetAlert";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { OrderCategoryForm } from "../components/orders/OrderCategoryForm";
import { tipoAccionFuturaLabels } from "../types/orderFutureAction";
import { pdfPreviewAPI } from "../api/pdfPreview";
import Swal from "sweetalert2";

interface SortableRowProps {
  orderConfig: OrderConfig;
  index: number;
  isReorderMode: boolean;
  onEdit: (orderConfig: OrderConfig) => void;
  onDelete: (orderConfig: OrderConfig) => void;
  onToggleActive: (orderConfig: OrderConfig) => void;
  onEnableReorder: () => void;
  pdfTemplates: Pdf[];
  onPreviewPdf: (content: string, code: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ orderConfig, index, isReorderMode, onEdit, onDelete, onToggleActive, onEnableReorder, pdfTemplates, onPreviewPdf }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: orderConfig._id, disabled: !isReorderMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const categoryTypeLabels: Record<CategoryType, string> = {
    fecha: "Fecha",
    dinero: "Dinero",
    objeto: "Objeto",
    otros: "Otros",
  };

  const getExpectedTemplateCode = (): string | null => {
    const { categoryType, dateMode } = orderConfig;
    if (categoryType === "fecha") {
      return dateMode === "range" ? "fechaRango" : "fechaUnica";
    }
    if (categoryType === "dinero") return "dinero";
    if (categoryType === "objeto") return "objeto";
    if (categoryType === "otros") return "otros";
    return null;
  };

  const expectedCode = getExpectedTemplateCode();
  const matchingTemplate = pdfTemplates?.find((t) => t.code === expectedCode && t.isActive);

  return (
    <tr ref={setNodeRef} style={style} {...(isReorderMode ? { ...attributes, ...listeners } : {})} className={`border-b border-gray-100 dark:border-gray-700 ${isReorderMode ? "bg-blue-50 dark:bg-blue-900/20 cursor-grab active:cursor-grabbing" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}>
      <td
        className={`py-3 px-4 ${!isReorderMode ? "cursor-pointer" : ""}`}
        onClick={(e) => {
          if (!isReorderMode) {
            e.preventDefault();
            e.stopPropagation();
            onEnableReorder();
          }
        }}
        title={!isReorderMode ? "Clic para activar modo ordenar" : ""}
      >
        <div className={`flex items-center justify-center ${isReorderMode ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-600 hover:text-blue-500"}`}>
          <FontAwesomeIcon icon={faGripVertical} className="h-5 w-5" />
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="text-sm font-medium">{index + 1}</span>
      </td>
      <td className="py-3 px-4">
        <div className="font-medium text-gray-900 dark:text-gray-100">{orderConfig.name}</div>
        {orderConfig.categoryType === "dinero" && orderConfig.montoMaximo && <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Max: ${orderConfig.montoMaximo.toLocaleString("es-ES")}</div>}
      </td>
      <td className="py-3 px-4">
        <span className={`px-2 py-1 rounded text-xs font-medium ${orderConfig.categoryType === "fecha" ? "bg-blue-100 text-blue-800 dark:bg-blue-500/30 dark:text-blue-200" : orderConfig.categoryType === "dinero" ? "bg-green-100 text-green-800 dark:bg-green-500/30 dark:text-green-200" : orderConfig.categoryType === "objeto" ? "bg-purple-100 text-purple-800 dark:bg-purple-500/30 dark:text-purple-200" : "bg-gray-100 text-gray-800 dark:bg-gray-500/30 dark:text-gray-200"}`}>{categoryTypeLabels[orderConfig.categoryType] || orderConfig.categoryType}</span>
      </td>
      <td className="py-3 px-4">
        <span className={`px-2 py-1 rounded text-xs font-medium ${orderConfig.config?.subtipos?.length ? "bg-gray-100 text-gray-800 dark:bg-gray-500/30 dark:text-gray-200" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>{orderConfig.config?.subtipos?.length ? "Sí" : "No"}</span>
      </td>
      <td className="py-3 px-4">{orderConfig.requiresAction ? <div className="flex justify-start items-center gap-1">{orderConfig.futureActionType && <span className={`px-2 py-1 rounded text-xs font-medium ${orderConfig.futureActionType === "documento" ? "bg-teal-100 text-teal-800 dark:bg-teal-500/30 dark:text-teal-200" : "bg-amber-100 text-amber-800 dark:bg-amber-500/30 dark:text-amber-200"}`}>{tipoAccionFuturaLabels[orderConfig.futureActionType]}</span>}</div> : <span className="text-xs bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 p-1">No</span>}</td>
      <td className="py-3 px-4">
        <span className={`px-2 py-1 rounded text-xs font-medium ${(orderConfig.requiresSignature ?? true) ? "bg-green-100 text-green-800 dark:bg-green-500/30 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>{(orderConfig.requiresSignature ?? true) ? "Sí" : "No"}</span>
      </td>
      <td className="py-3 px-4">
        {matchingTemplate ? (
          <button onClick={() => onPreviewPdf(matchingTemplate.content, matchingTemplate.code)} disabled={isReorderMode} className={`text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`} title={`Previsualizar: ${matchingTemplate.name}`}>
            <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
          </button>
        ) : (
          <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
        )}
      </td>
      <td className="py-3 px-4">
        <button onClick={() => onToggleActive(orderConfig)} disabled={isReorderMode} className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center flex-nowrap ${orderConfig.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 text-now flex flex-nowrap"} ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`}>
          <FontAwesomeIcon icon={orderConfig.isActive ? faToggleOn : faToggleOff} className="mr-1" />
          {orderConfig.isActive ? "Activa" : "Inactiva"}
        </button>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(orderConfig)} disabled={isReorderMode} className={`p-1.5 rounded text-gray-600 dark:text-gray-400 transition-colors hover:text-gray-800 dark:hover:text-gray-300 ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`} title="Editar">
            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(orderConfig)} disabled={isReorderMode} className={`p-1.5 rounded text-gray-600 dark:text-gray-400 transition-colors hover:text-gray-800 dark:hover:text-gray-300 ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`} title="Eliminar">
            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
};

const HELP_KEY = "orderTypes"; // Consider changing help key if needed, or keep for compatibility if help content is shared

export const OrderTypesPage: React.FC = () => {
  const navigate = useNavigate();
  const [orderTypes, setOrderTypes] = useState<OrderConfig[]>([]);
  const [pdfTemplates, setPdfTemplates] = useState<Pdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingOrderType, setEditingOrderType] = useState<OrderConfig | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    informacion: string;
    isActive: boolean;
    categoryType: CategoryType;
    dateMode: DateMode;
    montoMaximo?: number;
    requiresAction: boolean;
    actionText: string;
    actionDescription?: string;
    tituloAccion?: string;
    futureActionType: TipoAccionFutura | "";
    deadlineMode?: DeadlineMode;
    subtipos: Subtype[];
    plazoDias?: number;
    fechaLimite?: string;
    documentoRequerido?: string;
    requiresSignature: boolean;
    requiresUserConfirmation?: boolean;
    pdfId?: string;
  }>({
    name: "",
    informacion: "",
    isActive: true,
    categoryType: "fecha",
    dateMode: "single",
    montoMaximo: undefined,
    requiresAction: false,
    actionText: "",
    actionDescription: "",
    tituloAccion: undefined,
    futureActionType: "",
    deadlineMode: "none",
    subtipos: [],
    plazoDias: undefined,
    fechaLimite: undefined,
    documentoRequerido: undefined,
    requiresSignature: true,
    requiresUserConfirmation: false,
    pdfId: undefined,
  });
  const [submitting, setSubmitting] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [tempOrderTypes, setTempOrderTypes] = useState<OrderConfig[]>([]);

  const [showMainInfo, setShowMainInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY) || getHelp("orderCategories"); // Fallback if user hasn't updated help content

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const loadOrderTypes = async () => {
    try {
      setLoading(true);
      const data = await orderConfigAPI.getAll();
      setOrderTypes(data);
    } catch (error) {
      console.error("Error loading order types:", error);
      sweetAlert.error("Error", "No se pudieron cargar los tipos de pedidos");
    } finally {
      setLoading(false);
    }
  };

  const loadPdfTemplates = async () => {
    try {
      const data = await pdfsAPI.getAll();
      setPdfTemplates(data.filter((t: Pdf) => t.isActive));
    } catch (error) {
      console.error("Error loading PDF templates:", error);
    }
  };

  const handlePreviewPdf = async (content: string, code: string) => {
    try {
      Swal.fire({
        title: "Generando previsualización...",
        text: "Por favor espere",
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const blob = await pdfPreviewAPI.preview(content, code);
      Swal.close();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "No se pudo generar la previsualización", "error");
    }
  };

  useEffect(() => {
    loadOrderTypes();
    loadPdfTemplates();
  }, []);

  const openCreateModal = () => {
    setEditingOrderType(null);
    setFormData({
      name: "",
      informacion: "",
      isActive: true,
      categoryType: "fecha",
      dateMode: "single",
      montoMaximo: undefined,
      requiresAction: false,
      actionText: "",
      actionDescription: "",
      tituloAccion: undefined,
      futureActionType: "",
      deadlineMode: "none",
      subtipos: [],
      plazoDias: undefined,
      fechaLimite: undefined,
      documentoRequerido: undefined,
      requiresSignature: true,
      requiresUserConfirmation: false,
    });
    setShowModal(true);
  };

  const openEditModal = (orderType: OrderConfig) => {
    setEditingOrderType(orderType);
    setFormData({
      name: orderType.name,
      informacion: orderType.informacion || "",
      isActive: orderType.isActive,
      categoryType: orderType.categoryType || "fecha",
      dateMode: orderType.dateMode || "single",
      montoMaximo: orderType.montoMaximo,
      requiresAction: orderType.requiresAction || false,
      actionText: orderType.actionText || "",
      actionDescription: orderType.actionDescription || "",
      tituloAccion: orderType.tituloAccion || undefined,
      futureActionType: orderType.futureActionType || "",
      deadlineMode: orderType.deadlineMode || "none",
      subtipos: orderType.config?.subtipos ?? [],
      plazoDias: orderType.plazoDias,
      fechaLimite: orderType.fechaLimite,
      documentoRequerido: orderType.documentoRequerido,
      requiresSignature: orderType.requiresSignature ?? true,
      requiresUserConfirmation: orderType.requiresUserConfirmation ?? false,
      pdfId: orderType.pdfId,
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (formData.requiresUserConfirmation && !formData.actionText.trim()) {
        sweetAlert.error("Error", "Debes especificar el texto de la acción requerida");
        setSubmitting(false);
        return;
      }

      if (formData.requiresAction && !formData.futureActionType) {
        sweetAlert.error("Error", "Debes seleccionar el tipo de acción futura");
        setSubmitting(false);
        return;
      }

      if (formData.categoryType === "dinero" && formData.montoMaximo) {
        if (formData.montoMaximo % 50000 !== 0) {
          sweetAlert.error("Error", "El monto máximo debe ser un múltiplo de 50.000");
          setSubmitting(false);
          return;
        }
      }

      if (formData.requiresAction && formData.futureActionType) {
        if (formData.deadlineMode === "plazoDias") {
          if (!formData.plazoDias || formData.plazoDias < 1 || formData.plazoDias > 365) {
            sweetAlert.error("Error", "El plazo en días debe estar entre 1 y 365");
            setSubmitting(false);
            return;
          }
        }

        if (formData.deadlineMode === "fechaEspecifica") {
          if (!formData.fechaLimite) {
            sweetAlert.error("Error", "Debes especificar una fecha límite");
            setSubmitting(false);
            return;
          }
          const selectedDate = new Date(formData.fechaLimite);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (selectedDate < today) {
            sweetAlert.error("Error", "La fecha límite no puede ser una fecha pasada");
            setSubmitting(false);
            return;
          }
        }

        if (formData.futureActionType === "documento") {
          if (!formData.documentoRequerido || !formData.documentoRequerido.trim()) {
            sweetAlert.error("Error", "Debes especificar el documento requerido");
            setSubmitting(false);
            return;
          }
        }

        if (formData.futureActionType === "otra") {
          if (!formData.tituloAccion || !formData.tituloAccion.trim()) {
            sweetAlert.error("Error", "Debes especificar el título de la acción");
            setSubmitting(false);
            return;
          }
        }
      }

      const validSubtipos = formData.subtipos.filter((subtipo) => subtipo.label.trim() !== "");

      const payload: any = {
        name: formData.name,
        informacion: formData.informacion,
        isActive: formData.isActive,
        categoryType: formData.categoryType,
        dateMode: formData.categoryType === "fecha" ? formData.dateMode : undefined,
        montoMaximo: formData.categoryType === "dinero" && formData.montoMaximo ? formData.montoMaximo : undefined,
        requiresAction: formData.requiresAction,
        actionText: formData.requiresAction && formData.requiresUserConfirmation ? formData.actionText : undefined,
        tituloAccion: formData.requiresAction && formData.futureActionType === "otra" ? formData.tituloAccion : undefined,
        futureActionType: formData.requiresAction && formData.futureActionType ? formData.futureActionType : undefined,
        deadlineMode: formData.requiresAction && formData.futureActionType ? formData.deadlineMode : undefined,
        requiresSignature: formData.requiresSignature,
        pdfId: formData.requiresSignature && formData.pdfId ? formData.pdfId : undefined,
        requiresUserConfirmation: formData.requiresAction ? formData.requiresUserConfirmation : false,
        config: validSubtipos.length > 0 ? { subtipos: validSubtipos } : undefined,
      };

      if (!formData.requiresSignature) {
        payload.pdfId = undefined;
      }

      if (!formData.requiresAction) {
        payload.futureActionType = undefined;
        payload.tituloAccion = undefined;
        payload.deadlineMode = undefined;
        payload.plazoDias = undefined;
        payload.fechaLimite = undefined;
        payload.documentoRequerido = undefined;
        payload.requiresUserConfirmation = false;
        payload.actionText = undefined;
      } else {
        if (formData.deadlineMode === "plazoDias") {
          payload.plazoDias = formData.plazoDias || undefined;
          payload.fechaLimite = undefined;
        }

        if (formData.deadlineMode === "fechaEspecifica") {
          const raw = formData.fechaLimite;
          payload.fechaLimite = raw ? new Date(raw).toISOString().split("T")[0] : undefined;
          payload.plazoDias = undefined;
        }

        if (formData.deadlineMode === "none") {
          payload.plazoDias = undefined;
          payload.fechaLimite = undefined;
        }

        if (formData.futureActionType === "documento") {
          payload.documentoRequerido = formData.documentoRequerido;
          payload.tituloAccion = undefined;
        } else if (formData.futureActionType === "otra") {
          payload.tituloAccion = formData.tituloAccion;
          payload.documentoRequerido = undefined;
        } else {
          payload.documentoRequerido = undefined;
          payload.tituloAccion = undefined;
        }
      }

      if (editingOrderType) {
        await orderConfigAPI.update(editingOrderType._id, payload);
        sweetAlert.success("Tipo de pedido actualizado", "El tipo de pedido se actualizó correctamente");
      } else {
        await orderConfigAPI.create(payload);
        sweetAlert.success("Tipo de pedido creado", "El tipo de pedido se creó correctamente");
      }
      setShowModal(false);
      loadOrderTypes();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo guardar el tipo de pedido");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (orderType: OrderConfig) => {
    const result = await sweetAlert.confirm("¿Eliminar tipo de pedido?", `¿Estás seguro de eliminar el tipo de pedido "${orderType.name}"?`);
    if (!result.isConfirmed) return;

    try {
      await orderConfigAPI.delete(orderType._id);
      sweetAlert.success("Eliminado", "El tipo de pedido se eliminó correctamente");
      loadOrderTypes();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo eliminar el tipo de pedido");
    }
  };

  const handleToggleActive = async (orderType: OrderConfig) => {
    try {
      await orderConfigAPI.update(orderType._id, { isActive: !orderType.isActive });
      loadOrderTypes();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo actualizar el estado");
    }
  };

  const handleStartReorder = () => {
    setIsReorderMode(true);
    setTempOrderTypes([...orderTypes]);
  };

  const handleCancelReorder = () => {
    setIsReorderMode(false);
    setTempOrderTypes([]);
  };

  const handleSaveReorder = async () => {
    const reorderData = tempOrderTypes.map((cat, index) => ({
      id: cat._id,
      sortOrder: index + 1,
    }));

    try {
      await orderConfigAPI.reorder(reorderData);
      sweetAlert.success("Orden guardado", "El orden se actualizó correctamente");
      setIsReorderMode(false);
      setTempOrderTypes([]);
      loadOrderTypes();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo guardar el orden");
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setTempOrderTypes((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id);
        const newIndex = items.findIndex((item) => item._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  return (
    <PageLayout
      title="Pedidos | Configuración"
      itemCount={orderTypes.length}
      subtitle="Administra los tipos de pedidos que se muestran en el formulario de pedidos"
      faIcon={{ icon: faGear }}
      onBack={() => navigate("/orders")}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{
        isOpen: showMainInfo,
        onOpen: () => setShowMainInfo(true),
        onClose: () => setShowMainInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      headerActions={
        <div className="flex items-center gap-3">
          {isReorderMode ? (
            <>
              <button onClick={handleCancelReorder} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2">
                <span>Cancelar</span>
              </button>
              <button onClick={handleSaveReorder} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2">
                <span>Guardar Orden</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={openCreateModal} className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
                <FontAwesomeIcon icon={faPlus} />
              </button>
              <button onClick={() => navigate("/pdfs")} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
                <FontAwesomeIcon icon={faFilePdf} />
                <span className="hidden lg:block">Plantillas PDF</span>
              </button>
              <button onClick={handleStartReorder} disabled={orderTypes.length < 2} className="px-4 py-2 rounded border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                <FontAwesomeIcon icon={faGripVertical} />
                <span className="hidden lg:block">Ordenar</span>
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <FontAwesomeIcon icon={faSpinner} spin className="text-4xl text-blue-600" />
            </div>
          ) : (
            <>
              {isReorderMode && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                  <p className="text-blue-900 dark:text-blue-100 text-sm">
                    <FontAwesomeIcon icon={faGripVertical} className="mr-2" />
                    <strong>Modo de reordenamiento activo:</strong> Arrastra las filas para cambiar el orden. Haz clic en "Guardar Orden" para confirmar los cambios o "Cancelar" para descartarlos.
                  </p>
                </div>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="overflow-x-auto rounded border dark:border-slate-800">
                  <table className="w-full dark:bg-slate-800/80">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-24">Ordenar</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 w-16">Orden</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Nombre</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Tipo de Dato</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Opciones</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Acción Futura</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Firma</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Plantilla PDF</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300"></th>
                      </tr>
                    </thead>
                    <SortableContext items={(isReorderMode ? tempOrderTypes : orderTypes).map((c) => c._id)} strategy={verticalListSortingStrategy}>
                      <tbody>
                        {(isReorderMode ? tempOrderTypes : orderTypes).map((orderConfig, index) => (
                          <SortableRow key={orderConfig._id} orderConfig={orderConfig} index={index} isReorderMode={isReorderMode} onEdit={openEditModal} onDelete={handleDelete} onToggleActive={handleToggleActive} onEnableReorder={handleStartReorder} pdfTemplates={pdfTemplates} onPreviewPdf={handlePreviewPdf} />
                        ))}
                      </tbody>
                    </SortableContext>
                  </table>
                </div>
              </DndContext>

              {orderTypes.length === 0 && (
                <div className="text-center py-12">
                  <FontAwesomeIcon icon={faList} className="h-16 w-16 text-gray-400 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 mb-4">No hay tipos de pedido registrados</p>
                  <button onClick={openCreateModal} className="btn-primary">
                    Crear Primer Tipo de Pedido
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingOrderType ? "Editar Tipo de Pedido" : "Nuevo Tipo de Pedido"}
        size="lg"
        footer={
          <div className="flex gap-3 w-full">
            <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancelar
            </button>
            <button type="submit" form="order-category-form" disabled={submitting} className="flex-1 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? "Guardando..." : editingOrderType ? "Actualizar" : "Crear"}
            </button>
          </div>
        }
      >
        <div className="p-6">
          <OrderCategoryForm formData={formData} setFormData={setFormData} onSubmit={handleSubmit} submitting={submitting} pdfTemplates={pdfTemplates} />
        </div>
      </Modal>
    </PageLayout>
  );
};
