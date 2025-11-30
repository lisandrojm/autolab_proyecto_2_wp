import React, { useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faDollarSign, faUser, faImage, faSpinner, faTimes, faCamera, faUpload, faFileArrowUp, faChevronLeft, faChevronRight, faBell, faClock, faCheckCircle } from "@fortawesome/free-solid-svg-icons";
import { OrderData, personnelAPI } from "../../../../api/personnel";
import { Modal } from "../../../../components/ui/Modal";
import { getUserName, getUserRole, getUserPosition, getUserAvatar, formatDateShort, getCategoryName, getOrderNumber, getSubcategoriesArray } from "../utils/orderHelpers";
import { sweetAlert } from "../utils/sweetAlert";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { mapOrderStatusToStatusTypeForMobile, mapDocumentStateToStatusType, mapSignatureStateToStatusType, isOrderInFinalState } from "../../../../utils/statusHelpers";

interface OrderDetailModalProps {
  order: OrderData | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate?: (orderId: string, newStatus: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  currentIndex?: number;
  totalOrders?: number;
  onNavigate?: (direction: "prev" | "next") => void;
}

export default function OrderDetailModal({ order, isOpen, onClose, onStatusUpdate, onRefresh, currentIndex = -1, totalOrders = 0, onNavigate }: OrderDetailModalProps) {
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentToUpload, setDocumentToUpload] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [notifyingSignature, setNotifyingSignature] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  if (!order) return null;

  const needsDocument = order.categoryId && !order.documentoUrl;

  const handleDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        sweetAlert.warning("Archivo muy grande", "El archivo debe ser menor a 10MB");
        return;
      }
      setDocumentToUpload(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setDocumentPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveDocument = () => {
    setDocumentToUpload(null);
    setDocumentPreview(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleUploadDocument = async () => {
    if (!documentToUpload || !order) return;

    try {
      setUploadingDocument(true);
      await personnelAPI.uploadOrderDocument(order._id, documentToUpload);
      setUploadingDocument(false);
      await sweetAlert.success("Documento subido", "El documento se ha subido correctamente");
      setDocumentToUpload(null);
      setDocumentPreview(null);
      if (onRefresh) {
        await onRefresh();
      }
      onClose();
    } catch (error: any) {
      console.error("Error uploading document:", error);
      setUploadingDocument(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo subir el documento");
    }
  };

  const handleNotifySignature = async () => {
    if (!order) return;

    const result = await sweetAlert.confirm("¿Avisar al supervisor?", "¿Ya completaste la firma del documento? Esto enviará una notificación al supervisor para que verifique.", "Sí, avisar", "Todavía no");

    if (!result.isConfirmed) return;

    try {
      setNotifyingSignature(true);
      const response = await personnelAPI.notifySignatureCompleted(order._id);
      const notifiedCount = response?.data?.notifiedCount || 0;
      const message = notifiedCount > 0
        ? `Se ha notificado a ${notifiedCount} supervisor(es). Esperá que verifiquen la firma del documento.`
        : "Se ha registrado tu notificación. Esperá que el supervisor verifique la firma del documento.";

      setNotifyingSignature(false);
      await sweetAlert.success("Notificación enviada", message);

      if (onRefresh) {
        await onRefresh();
      }
      onClose();
    } catch (error: any) {
      console.error("Error notifying signature:", error);
      console.error("Error response:", error?.response);
      console.error("Error data:", error?.response?.data);

      const errorMessage = error?.response?.data?.error || error?.message || "No se pudo enviar la notificación";
      setNotifyingSignature(false);

      if (errorMessage.includes("Ya notificaste") || errorMessage.includes("ya notificaste")) {
        await sweetAlert.info("Ya notificado", "Ya notificaste anteriormente que completaste la firma. El supervisor está revisando.");
        if (onRefresh) {
          await onRefresh();
        }
        onClose();
      } else {
        await sweetAlert.error("Error", errorMessage);
      }
    }
  };

  const handleCancelOrder = async () => {
    if (!order || !onStatusUpdate) return;

    const categoryName = getCategoryName(order);
    const subcategoryText = getSubcategoriesArray(order).length > 0 ? ` - ${getSubcategoriesArray(order).join(", ")}` : "";
    const orderDisplayName = `${categoryName}${subcategoryText}`;

    const result = await sweetAlert.confirm("¿Cancelar este pedido?", `¿Estás seguro de cancelar el pedido "${orderDisplayName}"?`, "Sí, cancelar", "No cancelar");

    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await onStatusUpdate(order._id, "cancelled");
      setUpdatingStatus(false);
      await sweetAlert.success("Pedido cancelado", "El pedido ha sido cancelado correctamente");
      if (onRefresh) {
        await onRefresh();
      }
      onClose();
    } catch (error: any) {
      console.error("Error canceling order:", error);
      setUpdatingStatus(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo cancelar el pedido");
    }
  };

  const renderFooter = () => {
    if (updatingStatus) {
      return (
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <FontAwesomeIcon icon={faSpinner} className="w-4 h-4" spin />
          <span className="text-sm">Actualizando...</span>
        </div>
      );
    }

    if (order.status === "pending") {
      return (
        <button onClick={handleCancelOrder} disabled={updatingStatus} className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          Cancelar Pedido
        </button>
      );
    }

    return null;
  };

  const getMonto = (): number | null => {
    if (order.amount) return order.amount;
    if (typeof order.dynamicValue === "number") return order.dynamicValue;
    return null;
  };

  const monto = getMonto();

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < totalOrders - 1;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Detalles del Pedido"
        size="md"
        footer={renderFooter()}
        customHeader={
          onNavigate ? (
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 sticky top-0 py-3 z-50">
              <div className="flex items-center gap-3">
                {/*                 <button onClick={() => onNavigate("prev")} disabled={!hasPrevious} className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="Pedido anterior">
                  <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                </button> */}
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalles del Pedido</h2>
                {/*                 <button onClick={() => onNavigate("next")} disabled={!hasNext} className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" title="Siguiente pedido">
                  <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4 text-gray-700 dark:text-gray-300" />
                </button> */}
                {currentIndex >= 0 && totalOrders > 0 && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                    {currentIndex + 1} de {totalOrders}
                  </span>
                )}
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar modal" title="Cerrar">
                <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-6">
          {/* Nº Pedido y Status Badge */}
          <div className="flex flex-wrap justify-between gap-3">
            {/* Pedido */}
            <span>
              <p className="text-sm px-2 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400 rounded">Nº Pedido: {getOrderNumber(order)}</p>
            </span>
            {/* Estado */}
            <div className="flex flex-wrap gap-2">
              <StatusBadge type={mapOrderStatusToStatusTypeForMobile(order.status)} size="sm" />
              {/* Documento */}
              {(() => {
                const futureAction = typeof order.futureActionId === "object" ? order.futureActionId : null;
                const docStatusType = mapDocumentStateToStatusType(futureAction);
                const isInFinalState = isOrderInFinalState(order.status);

                if (!docStatusType) return null;

                const isDocumentUploaded = docStatusType === "doc_subido" && order.documentoUrl;

                if (isDocumentUploaded) {
                  return (
                    <button onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.documentoUrl}`)} className="hover:opacity-80 transition-opacity" title="Ver documento">
                      <StatusBadge type={docStatusType} size="sm" overrideStyle={isInFinalState} />
                    </button>
                  );
                }

                return <StatusBadge type={docStatusType} size="sm" overrideStyle={isInFinalState} />;
              })()}
              {/* Firma */}
              <StatusBadge type={mapSignatureStateToStatusType(order)} size="sm" overrideStyle={isOrderInFinalState(order.status)} />
            </div>
          </div>

          {/* Avatar y Usuario */}
          <div className="flex items-center gap-3">
            <div>
              {getUserAvatar(order.userId) ? (
                <img alt={`Foto de perfil de ${getUserName(order.userId)}`} className="w-10 h-10 rounded-full object-cover" src={`${import.meta.env.VITE_API_URL}${getUserAvatar(order.userId)}`} />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center text-white font-semibold">
                  {getUserName(order.userId)
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{getUserName(order.userId)}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{getUserPosition(order.userId)}</p>
            </div>
          </div>

          {/* Grid con Tipo de Pedido y Detalles */}
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Tipo de pedido</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300">{getCategoryName(order)}</span>
                {getSubcategoriesArray(order).map((subcategory, index) => (
                  <span key={index} className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
                    {subcategory}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-10">
              {monto !== null && (
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Importe</p>
                  <p className="font-medium text-slate-800 dark:text-slate-100">$ {monto.toLocaleString("es-AR")}</p>
                </div>
              )}
              {order.dynamicValue?.fechaDesde && (
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Inicio</p>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(order.dynamicValue.fechaDesde)}</p>
                </div>
              )}
              {order.dynamicValue?.fechaHasta && (
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Fin</p>
                  <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(order.dynamicValue.fechaHasta)}</p>
                </div>
              )}
              {order.photoUrl && (
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Imagen adjunta</p>
                  <img src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`} alt="Imagen del pedido" className="max-w-xs w-full h-auto rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.photoUrl}`)} />
                </div>
              )}
            </div>
          </div>

          {/* Descripción */}
          <div className="bg-slate-100 dark:bg-slate-700/50 p-3 py-3 rounded-lg">
            <div className="flex justify-between items-start">
              <div className="flex justify-between items-center w-full">
                <p className="font-semibold text-sm text-slate-800 dark:text-slate-500">Información</p>
              </div>
            </div>
            <p className="text-md text-slate-600 dark:text-slate-300 leading-relaxed">{order.description}</p>
          </div>

          {/* Document Upload Section with Future Action */}
          {(() => {
            const futureAction = typeof order.futureActionId === "object" ? order.futureActionId : null;

            if (!futureAction || futureAction.tipoAccionFutura !== "documento" || futureAction.estadoAccion !== "pendiente_documento") {
              return null;
            }

            const daysRemaining = futureAction.fechaLimite ? Math.ceil((new Date(futureAction.fechaLimite).getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;

            return (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-500/50 p-4 rounded-lg">
                <div className="flex items-start gap-3 mb-3">
                  <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-yellow-800 dark:text-yellow-400 mb-1">Documento Pendiente</h4>
                    {futureAction.documentoRequerido && (
                      <p className="text-sm text-yellow-600 dark:text-yellow-400 mb-3">
                        <strong>"{futureAction.documentoRequerido}"</strong>
                      </p>
                    )}
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">Este pedido requiere que subas un documento para completar la solicitud.</p>
                    {/*                     <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">{futureAction.descripcionAccion}</p> */}
                    {daysRemaining !== null && <p className={`text- font-medium mb-3 ${daysRemaining <= 2 ? "text-red-600 dark:text-red-400" : "text-yellow-600 dark:text-yellow-400"}`}>{daysRemaining > 0 ? `Vence en ${daysRemaining} día${daysRemaining !== 1 ? "s" : ""}` : daysRemaining === 0 ? "Vence hoy" : `Vencido hace ${Math.abs(daysRemaining)} día${Math.abs(daysRemaining) !== 1 ? "s" : ""}`}</p>}
                  </div>
                </div>

                {documentPreview ? (
                  <div className="space-y-3">
                    <div className="relative rounded-lg overflow-hidden border-2 border-slate-300 dark:border-slate-600">
                      <img src={documentPreview} alt="Preview" className="w-full h-48 object-cover" />
                      <button type="button" onClick={handleRemoveDocument} className="absolute top-2 right-2 p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg">
                        <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                      </button>
                    </div>
                    <button onClick={handleUploadDocument} disabled={uploadingDocument} className="w-full flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium leading-normal shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {uploadingDocument ? (
                        <>
                          <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                          <span>Subiendo...</span>
                        </>
                      ) : (
                        <>
                          <FontAwesomeIcon icon={faUpload} className="w-4 h-4" />
                          <span>Enviar Documento</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col lg:flex-row gap-3">
                    <input ref={cameraInputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleDocumentChange} className="hidden" />
                    <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-yellow-600 bg-slate-800 hover:bg-slate-900/40 text-white py-2.5 px-4 transition-colors shadow-sm">
                      <FontAwesomeIcon icon={faCamera} className="w-4 h-4" />
                      <span className="text-sm font-medium">Tomar Foto</span>
                    </button>

                    <input ref={galleryInputRef} type="file" accept="image/*,application/pdf" onChange={handleDocumentChange} className="hidden" />
                    <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-yellow-600 bg-slate-800 hover:bg-slate-900/40 text-white py-2.5 px-4 transition-colors shadow-sm">
                      <FontAwesomeIcon icon={faUpload} className="w-4 h-4" />
                      <span className="text-sm font-medium">Subir Archivo</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Signature Notification Section */}
          {(() => {
            if (!order.requiresSignature || order.signatureStatus !== "sent") {
              return null;
            }

            const alreadyNotified = !!order.signatureNotifiedAt;

            if (alreadyNotified) {
              return (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-500/50 p-4 rounded-lg">
                  <div className="flex items-start gap-3">
                    <FontAwesomeIcon icon={faClock} className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-amber-800 dark:text-amber-400 mb-1">Esperando Verificación</h4>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">Ya notificaste al supervisor que completaste la firma. Estamos esperando que verifique el documento.</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Notificado el: {new Date(order.signatureNotifiedAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <button disabled className="w-full flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-amber-600/50 text-white text-sm font-medium leading-normal cursor-not-allowed opacity-60">
                      <FontAwesomeIcon icon={faCheckCircle} className="w-4 h-4" />
                      <span>Ya Notificado</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-500/50 p-4 rounded-lg">
                <div className="flex items-start gap-3 mb-3">
                  <FontAwesomeIcon icon={faBell} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-400 mb-1">Documento Enviado para Firma</h4>
                    <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">Se te ha enviado un email con el documento para firmar.</p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">Una vez que hayas completado la firma, avisá al supervisor presionando el botón de abajo.</p>
                  </div>
                </div>
                <button onClick={handleNotifySignature} disabled={notifyingSignature} className="w-full flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium leading-normal shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {notifyingSignature ? (
                    <>
                      <FontAwesomeIcon icon={faSpinner} spin className="w-4 h-4" />
                      <span>Enviando notificación...</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faBell} className="w-4 h-4" />
                      <span>Avisar que Firmé</span>
                    </>
                  )}
                </button>
              </div>
            );
          })()}

          {/* Show uploaded document */}
          {/*           {order.documentoUrl && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-green-800 dark:text-green-300">Documento Presentado</p>
              </div>
              <img src={`${import.meta.env.VITE_API_URL}${order.documentoUrl}`} alt="Documento subido" className="w-full h-auto rounded-lg border border-green-200 dark:border-green-600 cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.documentoUrl}`)} />
            </div>
          )} */}

          {/* Fechas importantes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Solicitud</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(order.requestedAt)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Aprobación</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(order.approvedAt)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Entrega</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(order.deliveredAt)}</p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal de imagen en pantalla completa */}
      {viewingImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 w-full" onClick={() => setViewingImage(null)}>
          <div className="relative w-full flex justify-center max-h-[70svh]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewingImage(null)} className="absolute -top-4 -right-0 p-2 rounded-full text-gray-400">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
            </button>
            {viewingImage.toLowerCase().endsWith(".pdf") ? <iframe src={viewingImage} className="w-full h-[90vh] rounded-lg shadow-2xl bg-white" title="Documento" /> : <img src={viewingImage} alt="Order" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />}
          </div>
        </div>
      )}
    </>
  );
}
