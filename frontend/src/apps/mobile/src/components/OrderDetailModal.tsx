import React, { useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faDollarSign, faUser, faImage, faSpinner, faTimes, faCamera, faUpload, faFileArrowUp, faEye } from "@fortawesome/free-solid-svg-icons";
import { OrderData, personnelAPI } from "../../../../api/personnel";
import { Modal } from "../../../../components/ui/Modal";
import { getUserName, getUserRole, getUserPosition, getUserAvatar, formatDateShort, getStatusBadge, getCategoryName, getOrderNumber, getSubcategoriesArray, getStatusIcon } from "../utils/orderHelpers";
import { sweetAlert } from "../utils/sweetAlert";
import { getDocumentBadgeStyle } from "../../../../utils/documentBadgeHelper";

interface OrderDetailModalProps {
  order: OrderData | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate?: (orderId: string, newStatus: string) => Promise<void>;
}

export default function OrderDetailModal({ order, isOpen, onClose, onStatusUpdate }: OrderDetailModalProps) {
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [documentToUpload, setDocumentToUpload] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
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
      await sweetAlert.success("Documento subido", "El documento se ha subido correctamente");
      setDocumentToUpload(null);
      setDocumentPreview(null);
      onClose();
      if (onStatusUpdate) {
        window.location.reload();
      }
    } catch (error: any) {
      console.error("Error uploading document:", error);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo subir el documento");
    } finally {
      setUploadingDocument(false);
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
      await sweetAlert.success("Pedido cancelado", "El pedido ha sido cancelado correctamente");
      onClose();
    } catch (error: any) {
      console.error("Error canceling order:", error);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo cancelar el pedido");
    } finally {
      setUpdatingStatus(false);
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

  const badge = getStatusBadge(order.status);

  const getMonto = (): number | null => {
    if (order.amount) return order.amount;
    if (typeof order.dynamicValue === 'number') return order.dynamicValue;
    return null;
  };

  const monto = getMonto();

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Detalles del Pedido" size="md" footer={renderFooter()}>
        <div className="space-y-6">
          {/* Nº Pedido y Status Badge */}
          <div className="flex justify-between align-top">
            <div>
              <p className="text-sm px-2 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400 rounded">Nº Pedido: {getOrderNumber(order)}</p>
            </div>
            <div className="flex flex-col gap-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-3 rounded-full ${badge.style}`}>
                <FontAwesomeIcon icon={getStatusIcon(order.status)} className="h-3 w-3" />
                {badge.label}
              </span>
              {(() => {
                const futureAction = typeof order.futureActionId === 'object' ? order.futureActionId : null;
                const badgeStyle = getDocumentBadgeStyle(futureAction);

                if (!badgeStyle) return null;

                const isDocumentUploaded = badgeStyle.label === 'Doc. Subido' && order.documentoUrl;

                return (
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-3 rounded-full ${badgeStyle.bgClass} ${badgeStyle.textClass} ${badgeStyle.borderClass} ${
                        badgeStyle.shouldAnimate ? 'animate-pulse' : ''
                      }`}
                    >
                      <FontAwesomeIcon icon={faFileArrowUp} className="h-3 w-3" />
                      {badgeStyle.label}
                    </span>
                    {isDocumentUploaded && (
                      <button
                        onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.documentoUrl}`)}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors"
                        title="Ver documento"
                      >
                        <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })()}
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
                  <p className="font-medium text-slate-800 dark:text-slate-100">$ {monto.toLocaleString('es-AR')}</p>
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
            const futureAction = typeof order.futureActionId === 'object' ? order.futureActionId : null;

            if (!futureAction || futureAction.tipoAccionFutura !== 'documento' ||
                futureAction.estadoAccion !== 'pendiente_documento') {
              return null;
            }

            const daysRemaining = futureAction.fechaLimite
              ? Math.ceil((new Date(futureAction.fechaLimite).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
              : null;

            return (
              <div className="bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 p-4 rounded-lg">
                <div className="flex items-start gap-3 mb-3">
                  <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-orange-800 dark:text-orange-400 mb-1">
                      Documento Pendiente
                    </h4>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mb-2">
                      Este pedido requiere que subas un documento para completar la solicitud.
                    </p>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mb-2">
                      {futureAction.descripcionAccion}
                    </p>
                    {futureAction.documentoRequerido && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 mb-3">
                        <strong>Requerido:</strong> {futureAction.documentoRequerido}
                      </p>
                    )}
                    {daysRemaining !== null && (
                      <p className={`text-sm font-medium mb-3 ${
                        daysRemaining <= 2
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-orange-600 dark:text-orange-400'
                      }`}>
                        {daysRemaining > 0
                          ? `Vence en ${daysRemaining} día${daysRemaining !== 1 ? 's' : ''}`
                          : daysRemaining === 0
                          ? 'Vence hoy'
                          : `Vencido hace ${Math.abs(daysRemaining)} día${Math.abs(daysRemaining) !== 1 ? 's' : ''}`
                        }
                      </p>
                    )}
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
                    <button
                      onClick={handleUploadDocument}
                      disabled={uploadingDocument}
                      className="w-full flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium leading-normal shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
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
                  <div className="flex gap-3">
                    <input ref={cameraInputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleDocumentChange} className="hidden" />
                    <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white py-2.5 px-4 transition-colors shadow-sm">
                      <FontAwesomeIcon icon={faCamera} className="w-4 h-4" />
                      <span className="text-sm font-medium">Tomar Foto</span>
                    </button>

                    <input ref={galleryInputRef} type="file" accept="image/*,application/pdf" onChange={handleDocumentChange} className="hidden" />
                    <button type="button" onClick={() => galleryInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white py-2.5 px-4 transition-colors shadow-sm">
                      <FontAwesomeIcon icon={faUpload} className="w-4 h-4" />
                      <span className="text-sm font-medium">Subir Archivo</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Show uploaded document */}
          {order.documentoUrl && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-green-800 dark:text-green-300">Documento Presentado</p>
              </div>
              <img
                src={`${import.meta.env.VITE_API_URL}${order.documentoUrl}`}
                alt="Documento subido"
                className="w-full h-auto rounded-lg border border-green-200 dark:border-green-600 cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.documentoUrl}`)}
              />
            </div>
          )}

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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-90 p-4" onClick={() => setViewingImage(null)}>
          <div className="relative max-w-full max-h-full w-full" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewingImage(null)} className="absolute -top-4 -right-4 p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg z-10">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
            </button>
            {viewingImage.toLowerCase().endsWith('.pdf') ? (
              <iframe
                src={viewingImage}
                className="w-full h-[90vh] rounded-lg shadow-2xl bg-white"
                title="Documento"
              />
            ) : (
              <img src={viewingImage} alt="Order" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
