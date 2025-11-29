import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBox, faCamera, faImage, faTimes, faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { mapOrderStatusToStatusType, mapDocumentStateToStatusType, mapSignatureStateToStatusType } from "../../../../utils/statusHelpers";
import { ViewType } from "../types";
import { useOrders } from "../hooks/useOrders";
import axios from "../../../../api/axiosConfig";
import { OrderCategory } from "../../../../api/orderCategories";
import { DynamicCategoryInput } from "../components/DynamicCategoryInput";
import { sweetAlert } from "../utils/sweetAlert";
import OrderDetailModal from "../components/OrderDetailModal";
import { OrderData } from "../../../../api/personnel";
import { getOrderNumber, getCategoryName, getSubcategoriesArray } from "../utils/orderHelpers";
import { getDocumentBadgeStyle } from "../../../../utils/documentBadgeHelper";

interface OrdersProps {
  onNavigate: (view: ViewType) => void;
}

export default function Orders({ onNavigate }: OrdersProps) {
  const { orders, loading, error, createOrder, deleteOrder, updateOrderStatus } = useOrders();
  const [showForm, setShowForm] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categories, setCategories] = useState<OrderCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderData | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [subcategories, setSubcategories] = useState<string>("");
  const [dynamicValue, setDynamicValue] = useState<any>("");
  const [amount, setAmount] = useState<number>(0);
  const [actionCompleted, setActionCompleted] = useState(false);
  const [futureActionPlazoDias, setFutureActionPlazoDias] = useState<number | undefined>(undefined);
  const [futureActionFechaLimite, setFutureActionFechaLimite] = useState("");
  const [futureActionDocumento, setFutureActionDocumento] = useState("");

  const selectedCategory = categories.find((c) => c._id === selectedCategoryId) || null;

  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true);
        const { data } = await axios.get<OrderCategory[]>("/order-categories", { params: { isActive: true } });
        setCategories(data.sort((a, b) => a.sortOrder - b.sortOrder));
        if (data.length > 0) {
          setSelectedCategoryId(data[0]._id);
        }
      } catch (err) {
        console.error("Error loading categories:", err);
      } finally {
        setLoadingCategories(false);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    setSubcategories("");

    // Initialize dynamicValue based on category type and date mode
    if (selectedCategory?.categoryType === "fecha" && selectedCategory.dateMode === "range") {
      setDynamicValue({ fechaDesde: "", fechaHasta: "" });
    } else if (selectedCategory?.categoryType === "fecha") {
      setDynamicValue("");
    } else if (selectedCategory?.categoryType === "dinero") {
      setAmount(0);
      setDynamicValue("");
    } else {
      setDynamicValue("");
    }

    setActionCompleted(false);

    // Auto-set plazoDias from category if it's defined (read-only for mobile users)
    if (selectedCategory?.futureActionType === "plazoDias" && selectedCategory.plazoDias) {
      setFutureActionPlazoDias(selectedCategory.plazoDias);
    } else {
      setFutureActionPlazoDias(undefined);
    }

    setFutureActionFechaLimite("");
    setFutureActionDocumento("");

    // Clear photo if category doesn't allow photos
    if (selectedCategory && selectedCategory.categoryType !== "objeto" && selectedCategory.categoryType !== "otros") {
      setPhoto(null);
      setPhotoPreview(null);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }

    // Clear document when switching categories
    setDocument(null);
    setDocumentPreview(null);
  }, [selectedCategoryId, selectedCategory]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        sweetAlert.warning("Imagen muy grande", "La imagen debe ser menor a 10MB");
        return;
      }
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePhoto = () => {
    setPhoto(null);
    setPhotoPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const shouldIncludePhoto = selectedCategory?.categoryType === "objeto" || selectedCategory?.categoryType === "otros";

      let validDynamicValue: any = undefined;

      if (selectedCategory?.categoryType === "fecha" && selectedCategory.dateMode === "range") {
        const hasDesde = dynamicValue?.fechaDesde && dynamicValue.fechaDesde.trim() !== "";
        const hasHasta = dynamicValue?.fechaHasta && dynamicValue.fechaHasta.trim() !== "";

        if (!hasDesde || !hasHasta) {
          await sweetAlert.warning("Campos incompletos", "Debes completar ambas fechas (Desde y Hasta)");
          setSubmitting(false);
          return;
        }

        validDynamicValue = {
          fechaDesde: dynamicValue.fechaDesde.trim(),
          fechaHasta: dynamicValue.fechaHasta.trim(),
        };
      } else if (dynamicValue !== undefined && dynamicValue !== null && dynamicValue !== "") {
        validDynamicValue = dynamicValue;
      }

      const isDocumentType = selectedCategory?.futureActionType === "documento";

      const orderData = {
        description,
        category: selectedCategory?.name || "other",
        categoryId: selectedCategoryId,
        subcategories: subcategories ? [subcategories] : undefined,
        dynamicValue: validDynamicValue,
        amount: selectedCategory?.categoryType === "dinero" ? amount : undefined,
        actionCompleted: selectedCategory?.requiresAction ? actionCompleted : undefined,
        futureActionPlazoDias: futureActionPlazoDias || undefined,
        futureActionFechaLimite: futureActionFechaLimite || undefined,
        futureActionDocumento: futureActionDocumento || undefined,
        photo: shouldIncludePhoto ? photo : null,
        document: isDocumentType ? document : null,
      };

      if (selectedCategory?.informacion && selectedCategory.informacion.trim()) {
        setSubmitting(false);
        const result = await sweetAlert.confirmOrder(selectedCategory.informacion);

        if (!result.isConfirmed) {
          return;
        }

        setSubmitting(true);
      }

      await createOrder(orderData);
      await sweetAlert.success("¡Pedido creado!", "Tu pedido ha sido enviado correctamente");

      setShowForm(false);
      setDescription("");
      setSubcategories("");

      if (selectedCategory?.categoryType === "fecha" && selectedCategory.dateMode === "range") {
        setDynamicValue({ fechaDesde: "", fechaHasta: "" });
      } else {
        setDynamicValue("");
      }

      setAmount(0);
      setActionCompleted(false);

      if (selectedCategory?.futureActionType === "plazoDias" && selectedCategory.plazoDias) {
        setFutureActionPlazoDias(selectedCategory.plazoDias);
      } else {
        setFutureActionPlazoDias(undefined);
      }

      setFutureActionFechaLimite("");
      setFutureActionDocumento("");
      setPhoto(null);
      setPhotoPreview(null);
      setDocument(null);
      setDocumentPreview(null);
    } catch (err: any) {
      await sweetAlert.error("Error", err.response?.data?.error || "Error al crear pedido");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOrderClick = (order: OrderData) => {
    setSelectedOrder(order);
    setShowDetailModal(true);
  };

  const currentOrderIndex = selectedOrder ? orders.findIndex((o) => o._id === selectedOrder._id) : -1;

  const handleNavigateOrder = (direction: "prev" | "next") => {
    if (direction === "prev" && currentOrderIndex > 0) {
      setSelectedOrder(orders[currentOrderIndex - 1]);
    } else if (direction === "next" && currentOrderIndex >= 0 && currentOrderIndex < orders.length - 1) {
      setSelectedOrder(orders[currentOrderIndex + 1]);
    }
  };

  return (
    <div className="flex-1 pb-24">
      <div className="sticky top-0 z-10 p-4 pb-2 order-t border-b border-slate-800 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
              <FontAwesomeIcon icon={faArrowLeft} className="w-6 h-6 text-slate-900 dark:text-slate-100" />
            </button>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Pedidos</h1>
          </div>
          <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-red-500 text-white uppercase">Nuevo</span>
        </div>
      </div>

      <div className="px-4 pt-4">
        <button onClick={() => setShowForm(!showForm)} disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-lg h-12 px-4 bg-blue-500 hover:bg-blue-500/90 text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none mb-6 disabled:opacity-50 disabled:cursor-not-allowed">
          <FontAwesomeIcon icon={faBox} className="w-5 h-5" />
          {showForm ? "Cancelar" : "Nuevo Pedido"}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-6">
            <div className="space-y-4">
              {/* Tipo de Pedido */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de pedido</label>
                {loadingCategories ? (
                  <div className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-500 dark:text-slate-400">Cargando categorías...</div>
                ) : categories.length > 0 ? (
                  <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none">
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-red-600 dark:text-red-400 text-sm">No hay categorías disponibles. Contacta al administrador.</div>
                )}

                {/* Opciones */}
                <div className="pt-3">
                  <DynamicCategoryInput category={selectedCategory} subcategories={subcategories} onSubcategoriesChange={setSubcategories} dynamicValue={dynamicValue} onDynamicValueChange={setDynamicValue} amount={amount} onAmountChange={setAmount} actionCompleted={actionCompleted} onActionCompletedChange={setActionCompleted} futureActionPlazoDias={futureActionPlazoDias} onFutureActionPlazoDiasChange={setFutureActionPlazoDias} futureActionFechaLimite={futureActionFechaLimite} onFutureActionFechaLimiteChange={setFutureActionFechaLimite} futureActionDocumento={futureActionDocumento} onFutureActionDocumentoChange={setFutureActionDocumento} document={document} onDocumentChange={setDocument} documentPreview={documentPreview} onDocumentPreviewChange={setDocumentPreview} />
                </div>
              </div>
              {/* Descripción */}
              {categories.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Comentario (Opcional)</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={1} className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none" placeholder="Escribí tu comentario..." />
                </div>
              )}
              {/* Alerta de Requiere Firma */}
              {selectedCategory?.requiresSignature && (
                <div className="flex gap-1 p-3 rounded-lg bg-blue-50 dark:bg-yellow-900/30 border border-blue-200 dark:border-yellow-700 text-blue-800 dark:text-yellow-500">
                  <FontAwesomeIcon icon={faPenToSquare} className="w-4 h-4 text-blue-600 dark:text-yellow-500 flex-shrink-0" />
                  <p className="text-sm font-medium">Requiere FIRMA</p>
                </div>
              )}

              {(selectedCategory?.categoryType === "objeto" || selectedCategory?.categoryType === "otros") && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Foto (opcional)</label>
                  {photoPreview ? (
                    <div className="relative rounded-lg overflow-hidden border-2 border-slate-300 dark:border-slate-600">
                      <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover" />
                      <button type="button" onClick={handleRemovePhoto} className="absolute top-2 right-2 p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg">
                        <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                      <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 py-4 px-3 hover:bg-slate-100 dark:hover:bg-slate-700">
                        <FontAwesomeIcon icon={faCamera} className="w-6 h-6 text-slate-400" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Tomar Foto</span>
                      </button>

                      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                      <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 py-4 px-3 hover:bg-slate-100 dark:hover:bg-slate-700">
                        <FontAwesomeIcon icon={faImage} className="w-6 h-6 text-slate-400" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Subir Imagen</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {categories.length > 0 && (
                <button type="submit" disabled={submitting} className="w-full flex items-center justify-center rounded-lg h-10 px-4 bg-blue-500 hover:bg-blue-500/90  text-white text-sm font-medium leading-normal shadow-sm hover:bg-primary/90 focus:ring-2 focus:ring-primary/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                  {submitting ? "Enviando..." : "Enviar Pedido"}
                </button>
              )}
            </div>
          </form>
        )}

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Historial de Pedidos</h3>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
              </div>
            ))}
          </div>
        ) : orders.length > 0 ? (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order._id} className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.01] active:scale-[0.98] transition-transform" onClick={() => handleOrderClick(order)}>
                <div className="flex flex-col items-start gap-3">
                  {/*                   {order.photoUrl && (
                    <div className="flex-shrink-0">
                      <img
                        src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`}
                        alt="Imagen del pedido"
                        className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingImage(`${import.meta.env.VITE_API_URL}${order.photoUrl}`);
                        }}
                      />
                    </div>
                  )} */}
                  <div className="flex-1 w-full">
                    <div className="flex flex-col items-start justify-between mb-2 w-full space-y-2">
                      {/* Pedido | Status */}
                      <div className="flex justify-between gap-2 items-center w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="inline-block px-2 py-0.5 text-[12px] text-gray-400 dark:text-gray-400 bg-blue-50 dark:bg-gray-600/20 rounded">{getOrderNumber(order)}</span>
                          </div>
                          <StatusBadge type={mapOrderStatusToStatusType(order.status)} size="sm" />
                          {(() => {
                            const futureAction = typeof order.futureActionId === "object" ? order.futureActionId : null;
                            const docStatusType = mapDocumentStateToStatusType(futureAction);

                            if (docStatusType) {
                              return <StatusBadge type={docStatusType} size="sm" />;
                            }

                            return null;
                          })()}
                          <StatusBadge type={mapSignatureStateToStatusType(order)} size="sm" />
                        </div>
                      </div>
                      {/* Tipos */}
                      <div className="flex items-center w-full">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300">{getCategoryName(order)}</span>
                          {getSubcategoriesArray(order).map((subcategory, index) => (
                            <span key={index} className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
                              {subcategory}
                            </span>
                          ))}
                        </div>
                      </div>
                      {/* Description */}
                      {/*        <div className="w-full">
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{order.description}</p>
                      </div> */}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {new Date(order.requestedAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No tienes pedidos registrados</p>
          </div>
        )}
      </div>

      <OrderDetailModal
        order={selectedOrder}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedOrder(null);
        }}
        onStatusUpdate={updateOrderStatus}
        currentIndex={currentOrderIndex}
        totalOrders={orders.length}
        onNavigate={handleNavigateOrder}
      />

      {viewingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-opacity-90 p-4" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewingImage(null)} className="absolute -top-4 -right-4 p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg z-10">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
            </button>
            <img src={viewingImage} alt="Order" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
