import { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBox, faCamera, faImage, faTimes, faPenToSquare, faCheckCircle, faCircleInfo, faShoppingCart, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
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

      const result = await sweetAlert.error(
        "Error al crear pedido",
        isRetryable
          ? "Hubo un problema generando el número de pedido. ¿Deseas intentar nuevamente?"
          : errorMessage,
        isRetryable ? "Reintentar" : undefined
      );

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
      <div className="sticky top-0 z-10 p-4 pb-2 order-t border-b border-slate-800 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800">
              <FontAwesomeIcon icon={faArrowLeft} className="w-6 h-6 text-slate-900 dark:text-slate-100" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <FontAwesomeIcon icon={faShoppingCart} className="w-6 h-6 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Pedidos</h1>
              </div>
            </div>
          </div>
          <span className="px-2 py-1 rounded-full text-[9px] font-bold bg-red-500 text-white uppercase">Nuevo</span>
        </div>
      </div>

      <div className="px-4 pt-4">
        <button onClick={() => setShowForm(!showForm)} disabled={loading} className="w-full flex items-center justify-center gap-2 rounded-lg h-12 px-4 bg-blue-500 hover:bg-blue-500/90 text-white text-sm font-medium mb-6 disabled:opacity-50 disabled:cursor-not-allowed">
          {showForm ? "Cancelar" : "Nuevo Pedido"}
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Tipo de pedido</label>

                {loadingCategories ? (
                  <div className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-500 dark:text-slate-400">Cargando categorías...</div>
                ) : categories.length > 0 ? (
                  <select value={selectedCategoryId} onChange={(e) => setSelectedCategoryId(e.target.value)} required className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2">
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="w-full rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-2 text-red-600 dark:text-red-400 text-sm">No hay categorías disponibles. Contacta al administrador.</div>
                )}

                <div className="pt-3">
                  <DynamicCategoryInput category={selectedCategory} subcategories={subcategories} onSubcategoriesChange={setSubcategories} dynamicValue={dynamicValue} onDynamicValueChange={setDynamicValue} amount={amount} onAmountChange={setAmount} actionCompleted={actionCompleted} onActionCompletedChange={setActionCompleted} futureActionPlazoDias={futureActionPlazoDias} onFutureActionPlazoDiasChange={setFutureActionPlazoDias} futureActionFechaLimite={futureActionFechaLimite} onFutureActionFechaLimiteChange={setFutureActionFechaLimite} futureActionDocumento={futureActionDocumento} onFutureActionDocumentoChange={setFutureActionDocumento} document={document} onDocumentChange={setDocument} documentPreview={documentPreview} onDocumentPreviewChange={setDocumentPreview} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Comentario (Opcional)</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border bg-white dark:border-slate-700 dark:bg-slate-800 px-4 py-2 resize-none" placeholder="Escribí tu comentario..." />
              </div>

              {/* Bloque REQUIERE FIRMA con Info Modal */}
              {selectedCategory?.requiresSignature && (
                <button className="w-full" type="button" onClick={() => setShowSignatureInfo(true)}>
                  <div className="rounded-lg bg-blue-50 dark:bg-yellow-900/30 border border-blue-200 dark:border-yellow-700 text-blue-800 dark:text-yellow-500 p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Requiere FIRMA</span>
                      <FontAwesomeIcon icon={faCircleInfo} className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                  </div>
                </button>
              )}

              {(selectedCategory?.categoryType === "objeto" || selectedCategory?.categoryType === "otros") && (
                <div>
                  <label className="block text-sm font-medium mb-2">Foto (opcional)</label>
                  {photoPreview ? (
                    <div className="relative rounded-lg overflow-hidden border-2 border-slate-300 dark:border-slate-600">
                      <img src={photoPreview} alt="Preview" className="w-full h-48 object-cover" />
                      <button type="button" onClick={handleRemovePhoto} className="absolute top-2 right-2 p-2 rounded-full bg-red-500 text-white">
                        <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                      <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-4 px-3">
                        <FontAwesomeIcon icon={faCamera} className="w-6 h-6 text-slate-400" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Tomar Foto</span>
                      </button>

                      <input ref={galleryInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                      <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex-1 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-4 px-3">
                        <FontAwesomeIcon icon={faImage} className="w-6 h-6 text-slate-400" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Subir Imagen</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              <button type="submit" disabled={submitting} className="w-full flex items-center justify-center rounded-lg h-10 bg-blue-500 text-white disabled:opacity-50 gap-1">
                {submitting ? "Enviando..." : "Enviar Pedido"}
              </button>
            </div>
          </form>
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
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-50 dark:bg-gray-600/50">{getCategoryName(order)}</span>

                          {getSubcategoriesArray(order).map((s, i) => (
                            <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-sm bg-gray-50 dark:bg-gray-600/20">
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
      {showSignatureInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowSignatureInfo(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-xl shadow-lg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faCheckCircle} className="w-4 h-4 text-blue-600 dark:text-yellow-500" />
                <h2 className="text-sm font-semibold">Firma del pedido</h2>
              </div>

              <button type="button" onClick={() => setShowSignatureInfo(false)} className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </button>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">Si el pedido es aprobado, recibirás un email con un enlace para firmar digitalmente la aprobación. Podrás revisarlo desde cualquier dispositivo y ver el estado de la firma.</p>

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setShowSignatureInfo(false)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500 text-white hover:bg-blue-500/90">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

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
            <button onClick={() => setViewingImage(null)} className="absolute -top-4 -right-4 p-2 rounded-full bg-red-500 text-white shadow-lg">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
            </button>
            <img src={viewingImage} alt="Order" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
          </div>
        </div>
      )}
    </div>
  );
}
