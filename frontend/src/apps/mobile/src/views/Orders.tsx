import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBox, faCamera, faImage, faTimes, faPenToSquare, faCheckCircle, faCircleInfo, faShoppingCart, faPaperPlane, faPlus, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { mapOrderStatusToStatusTypeForMobile, mapDocumentStateToStatusType, mapSignatureStateToStatusType, isOrderInFinalState } from "../../../../utils/statusHelpers";
import { ViewType } from "../types";
import { useOrders } from "../hooks/useOrders";
import axios from "../../../../api/axiosConfig";
import { OrderCategory } from "../../../../api/orderCategories";
import { DynamicCategoryInput } from "../components/DynamicCategoryInput";
import { sweetAlert } from "../utils/sweetAlert";
import OrderDetailModal from "../components/OrderDetailModal";
import { OrderData } from "../../../../api/personnel";
import { getOrderNumber, getCategoryName, getSubcategoriesArray } from "../utils/orderHelpers";
import { InfoModal } from "../../../../components/ui/InfoModal";

interface OrdersProps {
  onNavigate: (view: ViewType) => void;
}

export default function Orders({ onNavigate }: OrdersProps) {
  const { orders, loading, createOrder, updateOrderStatus, refetch } = useOrders();
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

  // 👉 Nuevo estado para el Info Modal
  const [showSignatureInfo, setShowSignatureInfo] = useState(false);

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

    if (selectedCategory?.futureActionType === "plazoDias" && selectedCategory.plazoDias) {
      setFutureActionPlazoDias(selectedCategory.plazoDias);
    } else {
      setFutureActionPlazoDias(undefined);
    }

    setFutureActionFechaLimite("");
    setFutureActionDocumento("");

    if (selectedCategory && selectedCategory.categoryType !== "objeto" && selectedCategory.categoryType !== "otros") {
      setPhoto(null);
      setPhotoPreview(null);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }

    setDocument(null);
    setDocumentPreview(null);
  }, [selectedCategoryId, selectedCategory]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      sweetAlert.warning("Imagen muy grande", "La imagen debe ser menor a 10MB");
      return;
    }
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
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
        if (!dynamicValue?.fechaDesde || !dynamicValue?.fechaHasta) {
          await sweetAlert.warning("Campos incompletos", "Debes completar ambas fechas");
          setSubmitting(false);
          return;
        }
        validDynamicValue = {
          fechaDesde: dynamicValue.fechaDesde.trim(),
          fechaHasta: dynamicValue.fechaHasta.trim(),
        };
      } else if (dynamicValue !== "" && dynamicValue !== null && dynamicValue !== undefined) {
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
        actionCompleted: selectedCategory?.requiresAction ? (selectedCategory?.requiresUserConfirmation ? actionCompleted : true) : undefined,
        futureActionPlazoDias: futureActionPlazoDias || undefined,
        futureActionFechaLimite: futureActionFechaLimite || undefined,
        futureActionDocumento: futureActionDocumento || undefined,
        photo: shouldIncludePhoto ? photo : null,
        document: isDocumentType ? document : null,
      };

      if (selectedCategory?.informacion?.trim()) {
        setSubmitting(false);
        const result = await sweetAlert.confirmOrder(selectedCategory.informacion);
        if (!result.isConfirmed) return;
        setSubmitting(true);
      }

      await createOrder(orderData);

      await sweetAlert.success("¡Pedido creado!", "Tu pedido ha sido enviado correctamente");

      setShowForm(false);
      setDescription("");
      setSubcategories("");
      setDynamicValue("");
      setAmount(0);
      setActionCompleted(false);
      setFutureActionFechaLimite("");
      setFutureActionDocumento("");
      setPhoto(null);
      setPhotoPreview(null);
      setDocument(null);
      setDocumentPreview(null);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || "Error al crear pedido";
      const isRetryable = errorMessage.includes("número de pedido único") || errorMessage.includes("duplicate key");

      const result = await sweetAlert.error("Error al crear pedido", isRetryable ? "Hubo un problema generando el número de pedido. ¿Deseas intentar nuevamente?" : errorMessage, isRetryable ? "Reintentar" : undefined);

      if (isRetryable && result.isConfirmed) {
        return handleSubmit(e);
      }
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
    } else if (direction === "next" && currentOrderIndex < orders.length - 1) {
      setSelectedOrder(orders[currentOrderIndex + 1]);
    }
  };

  return (
    <div className="flex-1 pb-24">
      <div className="sticky top-0 border-b border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-4 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <FontAwesomeIcon icon={faShoppingCart} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Pedidos</h1>
              </div>
            </div>
          </div>
          <button onClick={() => setShowForm(true)} disabled={loading} className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl w-10 h-10 sm:w-auto sm:h-10 sm:px-4 font-medium transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20">
            <FontAwesomeIcon icon={faPlus} />
            <span className="hidden sm:inline">Nuevo Pedido</span>
          </button>
        </div>
      </div>

      <div className="px-4 pt-4">
        {showForm && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">Nuevo Pedido</h3>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="overflow-y-auto p-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de pedido</label>

                    {loadingCategories ? (
                      <div className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-500 dark:text-slate-400">Cargando categorías...</div>
                    ) : categories.length > 0 ? (
                      <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)} required className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2">
                        {categories.map((cat) => (
                          <option key={cat._id} value={cat._id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="w-full rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-red-600 dark:text-red-400 text-sm">No hay categorías disponibles. Contacta al administrador.</div>
                    )}

                    <div className="pt-3">
                      <DynamicCategoryInput category={selectedCategory} subcategories={subcategories} onSubcategoriesChange={setSubcategories} dynamicValue={dynamicValue} onDynamicValueChange={setDynamicValue} amount={amount} onAmountChange={setAmount} actionCompleted={actionCompleted} onActionCompletedChange={setActionCompleted} futureActionPlazoDias={futureActionPlazoDias} onFutureActionPlazoDiasChange={setFutureActionPlazoDias} futureActionFechaLimite={futureActionFechaLimite} onFutureActionFechaLimiteChange={setFutureActionFechaLimite} futureActionDocumento={futureActionDocumento} onFutureActionDocumentoChange={setFutureActionDocumento} document={document} onDocumentChange={setDocument} documentPreview={documentPreview} onDocumentPreviewChange={setDocumentPreview} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Comentario (Opcional)</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded border bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 resize-none" placeholder="Escribí tu comentario..." />
                  </div>

                  {/* Bloque REQUIERE FIRMA con Info Modal */}
                  {selectedCategory?.requiresSignature && (
                    <div onClick={() => setShowSignatureInfo(true)} className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded text-amber-500 cursor-pointer hover:bg-amber-500/20 transition-colors">
                      <span className="font-bold text-sm">Requiere FIRMA</span>
                      <FontAwesomeIcon icon={faInfoCircle} className="w-4 h-4" />
                    </div>
                  )}

                  {(selectedCategory?.categoryType === "objeto" || selectedCategory?.categoryType === "otros") && (
                    <div>
                      <label className="block text-sm font-medium mb-2">Foto (opcional)</label>
                      {photoPreview ? (
                        <div className="relative rounded overflow-hidden border-2 border-slate-300 dark:border-slate-600">
                          <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover" />
                          <button type="button" onClick={handleRemovePhoto} className="absolute top-2 right-2 p-2 rounded bg-red-500 text-white">
                            <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                          <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed py-4 px-3">
                            <FontAwesomeIcon icon={faCamera} className="w-6 h-6 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Tomar Foto</span>
                          </button>

                          <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                          <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed py-4 px-3">
                            <FontAwesomeIcon icon={faImage} className="w-6 h-6 text-slate-400" />
                            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Subir Imagen</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={submitting} className="flex-1 rounded h-10 bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50">
                      {submitting ? "Enviando..." : "Enviar Pedido"}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        <h3 className="text-lg font-bold mb-4">Historial de Pedidos</h3>

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
              <div key={order._id} className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm cursor-pointer" onClick={() => handleOrderClick(order)}>
                <div className="flex flex-col items-start gap-3">
                  <div className="flex-1 w-full">
                    <div className="flex flex-col items-start justify-between mb-2 w-full space-y-2">
                      <div className="flex justify-between gap-2 items-center w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-block px-2 py-0.5 text-[12px] text-gray-400 dark:text-gray-400 bg-blue-50 dark:bg-gray-600/20 rounded">{getOrderNumber(order.orderNumber)}</span>

                          <StatusBadge type={mapOrderStatusToStatusTypeForMobile(order.status)} size="sm" />

                          {(() => {
                            const futureAction = typeof order.futureActionId === "object" ? order.futureActionId : null;
                            const docStatusType = mapDocumentStateToStatusType(futureAction);
                            const isInFinalState = isOrderInFinalState(order.status);
                            if (docStatusType) return <StatusBadge type={docStatusType} size="sm" overrideStyle={isInFinalState} />;
                            return null;
                          })()}

                          <StatusBadge type={mapSignatureStateToStatusType(order)} size="sm" overrideStyle={isOrderInFinalState(order.status)} />
                        </div>
                      </div>

                      <div className="flex items-center w-full">
                        <div className="flex flex-wrap gap-1.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-sm font-medium bg-gray-50 dark:bg-gray-600/50">{getCategoryName(order)}</span>

                          {getSubcategoriesArray(order).map((s, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-sm bg-gray-50 dark:bg-gray-600/20">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-400">{new Date(order.requestedAt).toLocaleDateString("es-ES")}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl border bg-slate-50 p-8 dark:bg-slate-800/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">No tienes pedidos registrados</p>
          </div>
        )}
      </div>

      {/* 👉 Info Modal NUEVO */}
      {/* 👉 Info Modal NUEVO */}
      <InfoModal
        isOpen={showSignatureInfo}
        onClose={() => setShowSignatureInfo(false)}
        title="Firma del pedido"
        size="sm"
        actions={[
          {
            label: "Entendido",
            onClick: () => setShowSignatureInfo(false),
            variant: "primary",
          },
        ]}
      >
        <div className="text-slate-700 dark:text-slate-300">
          <p>Si el pedido es aprobado, recibirás un email con un enlace para firmar digitalmente la aprobación. Podrás revisarlo desde cualquier dispositivo y ver el estado de la firma.</p>
        </div>
      </InfoModal>

      <OrderDetailModal
        order={selectedOrder}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedOrder(null);
        }}
        onStatusUpdate={updateOrderStatus}
        onRefresh={refetch}
        currentIndex={currentOrderIndex}
        totalOrders={orders.length}
        onNavigate={handleNavigateOrder}
      />

      {viewingImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-opacity-90 p-4" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewingImage(null)} className="absolute -top-4 -right-4 p-2 rounded bg-red-500 text-white shadow-lg">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
            </button>
            <img src={viewingImage} alt="Order" className="max-w-full max-h-[90vh] object-contain rounded shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
