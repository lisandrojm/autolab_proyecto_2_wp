import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPlus, faGripVertical, faList, faToggleOn, faToggleOff, faEdit, faTrash, faEye } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../../utils/sweetAlert";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { orderConfigAPI, OrderConfig, CategoryType, DateMode, Subtype, TipoAccionFutura, DeadlineMode } from "../../api/orderConfig";
import { pdfsAPI, Pdf } from "../../api/pdf";
import { Modal } from "../ui/Modal";
import { OrderCategoryForm } from "./OrderCategoryForm";
import { tipoAccionFuturaLabels } from "../../types/orderFutureAction";
import { pdfPreviewAPI } from "../../api/pdfPreview";
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
    datos_personales: "Datos personales",
  };

  const getExpectedTemplateCode = (): string | null => {
    const { categoryType, dateMode } = orderConfig;
    if (categoryType === "fecha") {
      return dateMode === "range" ? "fechaRango" : "fechasMultiples";
    }
    if (categoryType === "dinero") return "dinero";
    if (categoryType === "objeto") return "objeto";
    if (categoryType === "otros") return "otros";
    if (categoryType === "datos_personales") return "datosPersonales";
    return null;
  };

  const expectedCode = getExpectedTemplateCode();
  const matchingTemplate = pdfTemplates?.find((t) => t.code === expectedCode && t.isActive);

  const subtipos = orderConfig.config?.subtipos || [];
  const rowCount = subtipos.length > 0 ? subtipos.length : 1;
  const generalResetDate = orderConfig.config?.resetDate;
  const rowClass = `border-b border-gray-100 dark:border-gray-700 ${isReorderMode ? "bg-blue-50 dark:bg-blue-900/20 cursor-grab active:cursor-grabbing" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"}`;

  // Shared cells that span all subtipo rows
  const sharedCells = (isFirst: boolean) =>
    isFirst ? (
      <>
        <td
          className={`py-3 px-4 ${!isReorderMode ? "cursor-pointer" : ""}`}
          rowSpan={rowCount}
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
        <td className="py-3 px-4" rowSpan={rowCount}>
          <span className="text-sm font-medium">{index + 1}</span>
        </td>
        <td className="py-3 px-4" rowSpan={rowCount}>
          <div className="font-medium text-gray-900 dark:text-gray-100">{orderConfig.name}</div>
        </td>
        <td className="py-3 px-4" rowSpan={rowCount}>
          <div className="flex flex-col items-start gap-1">
            <div className="flex items-center gap-1 flex-wrap">
              <span className={`px-2 py-1 rounded text-xs font-medium ${orderConfig.categoryType === "fecha" ? "bg-blue-100 text-blue-800 dark:bg-blue-500/30 dark:text-blue-200" : orderConfig.categoryType === "dinero" ? "bg-green-100 text-green-800 dark:bg-green-500/30 dark:text-green-200" : orderConfig.categoryType === "objeto" ? "bg-purple-100 text-purple-800 dark:bg-purple-500/30 dark:text-purple-200" : "bg-gray-100 text-gray-800 dark:bg-gray-500/30 dark:text-gray-200"}`}>{categoryTypeLabels[orderConfig.categoryType] || orderConfig.categoryType}</span>

              {orderConfig.categoryType === "fecha" && <span className={`px-2 py-1 rounded text-xs font-medium ${orderConfig.dateMode === "range" ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/30 dark:text-indigo-200" : "bg-sky-100 text-sky-800 dark:bg-sky-500/30 dark:text-sky-200"}`}>{orderConfig.dateMode === "range" ? "Rango de Fechas" : "Fechas Múltiples"}</span>}
              {orderConfig.categoryType === "dinero" && <span className={`px-2 py-1 rounded text-xs font-medium ${!orderConfig.limitType ? "bg-gray-100 text-gray-800 dark:bg-gray-500/30 dark:text-gray-200" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/30 dark:text-emerald-200"}`}>{!orderConfig.limitType ? "Sin límite" : orderConfig.limitType === "monto" ? `Máximo por monto: $${orderConfig.montoMaximo ? orderConfig.montoMaximo.toLocaleString("es-ES") : 0}` : `Máximo por porcentaje de sueldo: ${orderConfig.porcentajeMaximo ?? 0}%`}</span>}
              {orderConfig.categoryType === "dinero" && orderConfig.config?.repayment && (
                <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/30 dark:text-amber-200 ml-2">
                  {orderConfig.config.repayment.installments ? `${orderConfig.config.repayment.installments} cuotas` : "Devolución"}
                  {orderConfig.config.repayment.startOnApproval ? ` · inicia al aprobarse` : ""}
                </span>
              )}
            </div>

            {orderConfig.categoryType === "fecha" && orderConfig.dateMode === "range" && orderConfig.maxDays && <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">Max: {orderConfig.maxDays} días</span>}
          </div>
        </td>
      </>
    ) : null;

  // Shared trailing cells (after Opción and Fecha de Reset)
  const sharedTrailingCells = (isFirst: boolean) =>
    isFirst ? (
      <>
        <td className="py-3 px-4" rowSpan={rowCount}>
          {orderConfig.requiresAction ? <div className="flex justify-start items-center gap-1">{orderConfig.futureActionType && <span className={`px-2 py-1 rounded text-xs font-medium ${orderConfig.futureActionType === "documento" ? "bg-teal-100 text-teal-800 dark:bg-teal-500/30 dark:text-teal-200" : "bg-amber-100 text-amber-800 dark:bg-amber-500/30 dark:text-amber-200"}`}>{tipoAccionFuturaLabels[orderConfig.futureActionType]}</span>}</div> : <span className="text-xs bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 p-1">No</span>}
        </td>
        <td className="py-3 px-4" rowSpan={rowCount}>
          <span className={`px-2 py-1 rounded text-xs font-medium ${(orderConfig.requiresSignature ?? true) ? "bg-green-100 text-green-800 dark:bg-green-500/30 dark:text-green-200" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>{(orderConfig.requiresSignature ?? true) ? "Sí" : "No"}</span>
        </td>
        <td className="py-3 px-4" rowSpan={rowCount}>
          {matchingTemplate ? (
            <button onClick={() => onPreviewPdf(matchingTemplate.content, matchingTemplate.code)} disabled={isReorderMode} className={`text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 transition-colors ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`} title={`Previsualizar: ${matchingTemplate.name}`}>
              <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
            </button>
          ) : (
            <span className="text-gray-400 dark:text-gray-600 text-xs">-</span>
          )}
        </td>
        <td className="py-3 px-4" rowSpan={rowCount}>
          <button onClick={() => onToggleActive(orderConfig)} disabled={isReorderMode} className={`px-3 py-1 rounded text-xs font-medium transition-colors flex items-center flex-nowrap ${orderConfig.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400 text-now flex flex-nowrap"} ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`}>
            <FontAwesomeIcon icon={orderConfig.isActive ? faToggleOn : faToggleOff} className="mr-1" />
            {orderConfig.isActive ? "Activa" : "Inactiva"}
          </button>
        </td>
      </>
    ) : null;

  const actionCells = (isFirst: boolean) =>
    isFirst ? (
      <td className="py-3 px-4" rowSpan={rowCount}>
        <div className="flex items-center gap-2">
          <button onClick={() => onEdit(orderConfig)} disabled={isReorderMode} className={`p-1.5 rounded text-gray-600 dark:text-gray-400 transition-colors hover:text-gray-800 dark:hover:text-gray-300 ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`} title="Editar">
            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(orderConfig)} disabled={isReorderMode} className={`p-1.5 rounded text-gray-600 dark:text-gray-400 transition-colors hover:text-gray-800 dark:hover:text-gray-300 ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`} title="Eliminar">
            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
          </button>
        </div>
      </td>
    ) : null;

  // No subtipos: single row
  if (subtipos.length === 0) {
    return (
      <tr ref={setNodeRef} style={style} {...(isReorderMode ? { ...attributes, ...listeners } : {})} className={rowClass}>
        {sharedCells(true)}
        {sharedTrailingCells(true)}
        <td className="py-3 px-4">
          <span className="text-xs text-gray-400 dark:text-gray-600">-</span>
        </td>
        <td className="py-3 px-4">{generalResetDate ? <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-500/30 dark:text-orange-200">{generalResetDate}</span> : <span className="text-xs text-gray-400 dark:text-gray-600">-</span>}</td>
        {actionCells(true)}
      </tr>
    );
  }

  // With subtipos: one row per subtipo
  return (
    <>
      {subtipos.map((subtipo, subIndex) => {
        const isFirst = subIndex === 0;
        const borderClass = isFirst ? rowClass : `border-b border-gray-50 dark:border-gray-800 ${isReorderMode ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"}`;
        return (
          <tr key={`${orderConfig._id}-sub-${subIndex}`} ref={isFirst ? setNodeRef : undefined} style={isFirst ? style : undefined} {...(isFirst && isReorderMode ? { ...attributes, ...listeners } : {})} className={borderClass}>
            {sharedCells(isFirst)}
            {sharedTrailingCells(isFirst)}
            <td className="py-2 px-4">
              <span className="text-sm text-gray-700 dark:text-gray-300">{subtipo.label}</span>
              {subtipo.maxDays && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">(Max: {subtipo.maxDays}d)</span>}
              {subtipo.repayment && (
                <div className="mt-1">
                  <span className="px-2 py-1 rounded text-[11px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-500/30 dark:text-amber-200">
                    {subtipo.repayment.installments ? `${subtipo.repayment.installments} cuotas` : "Devolución"}
                    {subtipo.repayment.startOnApproval ? ` · inicia al aprobarse` : ""}
                  </span>
                </div>
              )}
            </td>
            <td className="py-2 px-4">{subtipo.resetDate ? <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-500/30 dark:text-orange-200">{subtipo.resetDate}</span> : generalResetDate && isFirst ? <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-500/30 dark:text-orange-200">{generalResetDate}</span> : <span className="text-xs text-gray-400 dark:text-gray-600">-</span>}</td>
            {actionCells(isFirst)}
          </tr>
        );
      })}
    </>
  );
};

export const OrderTypesTab: React.FC = () => {
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
    maxDays?: number;
    limitType?: "monto" | "porcentaje";
    montoMaximo?: number;
    porcentajeMaximo?: number;
    requiresAction: boolean;
    actionText: string;
    actionDescription?: string;
    tituloAccion?: string;
    futureActionType: TipoAccionFutura | "";
    deadlineMode?: DeadlineMode;
    subtipos: Subtype[];
    resetDate?: string;
    plazoDias?: number;
    fechaLimite?: string;
    documentoRequerido?: string;
    requiresSignature: boolean;
    requiresUserConfirmation?: boolean;
    pdfId?: string;
    pdfText?: string;
    camposEditables?: string[];
  }>({
    name: "",
    informacion: "",
    isActive: true,
    categoryType: "fecha",
    dateMode: "single",
    maxDays: undefined,
    limitType: undefined,
    montoMaximo: undefined,
    porcentajeMaximo: undefined,
    requiresAction: false,
    actionText: "",
    actionDescription: "",
    tituloAccion: undefined,
    futureActionType: "",
    deadlineMode: "none",
    subtipos: [],
    resetDate: undefined,
    plazoDias: undefined,
    fechaLimite: undefined,
    documentoRequerido: undefined,
    requiresSignature: true,
    requiresUserConfirmation: false,
    pdfId: undefined,
    pdfText: "",
    repayment: undefined,
    camposEditables: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [tempOrderTypes, setTempOrderTypes] = useState<OrderConfig[]>([]);

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
      maxDays: undefined,
      limitType: undefined,
      montoMaximo: undefined,
      porcentajeMaximo: undefined,
      requiresAction: false,
      actionText: "",
      actionDescription: "",
      tituloAccion: undefined,
      futureActionType: "",
      deadlineMode: "none",
      subtipos: [],
      resetDate: undefined,
      plazoDias: undefined,
      fechaLimite: undefined,
      documentoRequerido: undefined,
      requiresSignature: true,
      requiresUserConfirmation: false,
      pdfText: "",
      camposEditables: [],
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
      maxDays: orderType.maxDays,
      limitType: orderType.limitType,
      montoMaximo: orderType.montoMaximo,
      porcentajeMaximo: orderType.porcentajeMaximo,
      requiresAction: orderType.requiresAction || false,
      actionText: orderType.actionText || "",
      actionDescription: orderType.actionDescription || "",
      tituloAccion: orderType.tituloAccion || undefined,
      futureActionType: orderType.futureActionType || "",
      deadlineMode: orderType.deadlineMode || "none",
      subtipos: orderType.config?.subtipos ?? [],
      repayment: orderType.config?.repayment ?? undefined,
      camposEditables: orderType.config?.camposEditables ?? [],
      resetDate: (() => {
        const raw = orderType.config?.resetDate;
        if (!raw) return undefined;
        if (typeof raw === "string") {
          if (raw.includes("/")) return raw;
          const parsed = new Date(raw);
          if (!isNaN(parsed.getTime())) {
            const day = String(parsed.getDate()).padStart(2, "0");
            const month = String(parsed.getMonth() + 1).padStart(2, "0");
            return `${day}/${month}`;
          }
        }
        if (raw instanceof Date && !isNaN(raw.getTime())) {
          const day = String(raw.getDate()).padStart(2, "0");
          const month = String(raw.getMonth() + 1).padStart(2, "0");
          return `${day}/${month}`;
        }
        return undefined;
      })(),
      plazoDias: orderType.plazoDias,
      fechaLimite: orderType.fechaLimite,
      documentoRequerido: orderType.documentoRequerido,
      requiresSignature: orderType.requiresSignature ?? true,
      requiresUserConfirmation: orderType.requiresUserConfirmation ?? false,
      pdfId: orderType.pdfId,
      pdfText: orderType.pdfText || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (formData.requiresAction && formData.requiresUserConfirmation && !formData.actionText.trim()) {
        sweetAlert.error("Error", "Debes especificar el texto de la acción requerida");
        setSubmitting(false);
        return;
      }

      if (formData.requiresAction && !formData.futureActionType) {
        sweetAlert.error("Error", "Debes seleccionar el tipo de acción futura");
        setSubmitting(false);
        return;
      }

      if (formData.categoryType === "dinero" && formData.limitType === "monto" && formData.montoMaximo) {
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
        maxDays: formData.categoryType === "fecha" && formData.dateMode === "range" ? (formData.maxDays ?? null) : undefined,
        limitType: formData.categoryType === "dinero" ? formData.limitType || null : null,
        montoMaximo: formData.categoryType === "dinero" && formData.limitType === "monto" && formData.montoMaximo ? formData.montoMaximo : null,
        porcentajeMaximo: formData.categoryType === "dinero" && formData.limitType === "porcentaje" && formData.porcentajeMaximo ? formData.porcentajeMaximo : null,
        requiresAction: formData.requiresAction,
        actionText: formData.requiresAction && formData.requiresUserConfirmation ? formData.actionText : undefined,
        tituloAccion: formData.requiresAction && formData.futureActionType === "otra" ? formData.tituloAccion : undefined,
        futureActionType: formData.requiresAction && formData.futureActionType ? formData.futureActionType : undefined,
        deadlineMode: formData.requiresAction && formData.futureActionType ? formData.deadlineMode : undefined,
        requiresSignature: formData.requiresSignature,
        pdfId: formData.requiresSignature && formData.pdfId ? formData.pdfId : undefined,
        pdfText: formData.pdfText || "",
        requiresUserConfirmation: formData.requiresAction ? formData.requiresUserConfirmation : false,
        config: undefined,
      };

      // Build config object with support for repayment when categoryType === 'dinero'
      if (validSubtipos.length > 0) {
        // Ensure subtipos include repayment if provided in formData
        payload.config = { subtipos: validSubtipos };
      } else {
        const cfg: any = {};
        if (formData.resetDate) cfg.resetDate = formData.resetDate;
        if (formData.categoryType === "dinero" && formData.repayment) {
          cfg.repayment = { ...(formData.repayment || {}), startOnApproval: formData.repayment.startOnApproval ?? true };
        }
        payload.config = Object.keys(cfg).length ? cfg : undefined;
      }

      // Datos personales: guardar la lista de campos editables habilitados en config.
      if (formData.categoryType === "datos_personales") {
        payload.config = { ...(payload.config || {}), camposEditables: formData.camposEditables || [] };
      }

      // If there are subtipos and category is dinero, copy any repayment fields from formData.subtipos into payload
      if (validSubtipos.length > 0 && formData.categoryType === "dinero") {
        payload.config.subtipos = validSubtipos.map((s: any) => ({
          ...s,
          repayment: s.repayment ? { ...(s.repayment || {}), startOnApproval: s.repayment.startOnApproval ?? true } : undefined,
        }));
      }

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
    <div className="space-y-6">
      <div className="flex justify-end items-center gap-3">
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
            <button onClick={handleStartReorder} disabled={orderTypes.length < 2} className="px-4 py-2 rounded border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
              <FontAwesomeIcon icon={faGripVertical} />
              <span className="hidden lg:block">Ordenar</span>
            </button>
          </>
        )}
      </div>

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
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Acción Futura</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Firma</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Plantilla PDF</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Estado</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Opción</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Fecha de Reset</th>
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
    </div>
  );
};
