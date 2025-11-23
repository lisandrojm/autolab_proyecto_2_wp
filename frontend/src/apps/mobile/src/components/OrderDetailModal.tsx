import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faDollarSign, faUser, faImage, faSpinner, faTimes } from "@fortawesome/free-solid-svg-icons";
import { OrderData } from "../../../../api/personnel";
import { Modal } from "./Modal";
import {
  getUserName,
  getUserRole,
  getUserAvatar,
  formatDateShort,
  getStatusBadge,
  getCategoryName,
  getOrderNumber
} from "../utils/orderHelpers";
import { sweetAlert } from "../utils/sweetAlert";

interface OrderDetailModalProps {
  order: OrderData | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdate?: (orderId: string, newStatus: string) => Promise<void>;
}

export default function OrderDetailModal({
  order,
  isOpen,
  onClose,
  onStatusUpdate
}: OrderDetailModalProps) {
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  if (!order) return null;

  const handleCancelOrder = async () => {
    if (!order || !onStatusUpdate) return;

    const result = await sweetAlert.confirm(
      "¿Cancelar este pedido?",
      `¿Estás seguro de cancelar el pedido "${order.title}"?`,
      "Sí, cancelar",
      "No cancelar"
    );

    if (!result.isConfirmed) return;

    try {
      setUpdatingStatus(true);
      await onStatusUpdate(order._id, "cancelled");
      await sweetAlert.success("Pedido cancelado", "El pedido ha sido cancelado correctamente");
      onClose();
    } catch (error: any) {
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
        <button
          onClick={handleCancelOrder}
          disabled={updatingStatus}
          className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancelar Pedido
        </button>
      );
    }

    return null;
  };

  const badge = getStatusBadge(order.status);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Detalles del Pedido"
        size="md"
        footer={renderFooter()}
      >
        <div className="space-y-6">
          {/* Perfil del usuario */}
          <div className="flex justify-between align-top">
            <div className="flex items-center gap-3">
              <div>
                {getUserAvatar(order.userId) ? (
                  <img
                    alt={`Foto de perfil de ${getUserName(order.userId)}`}
                    className="w-10 h-10 rounded-full object-cover"
                    src={`${import.meta.env.VITE_API_URL}${getUserAvatar(order.userId)}`}
                  />
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
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  {getUserName(order.userId)}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {getUserRole(order.userId)}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium py-1 px-3 rounded-full ${badge.style}`}>
                {badge.label}
              </span>
            </div>
          </div>

          {/* Título y descripción */}
          <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <div className="flex justify-between items-center w-full">
                <p className="font-semibold text-xl text-slate-800 dark:text-slate-100">
                  {order.title}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nº Pedido: {getOrderNumber(order)}
                </p>
              </div>
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {order.description}
            </p>
          </div>

          {/* Detalles del pedido */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Tipo de pedido</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {getCategoryName(order)}
              </p>
            </div>

            {order.amount && (
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Importe</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  ${order.amount.toFixed(2)} USD
                </p>
              </div>
            )}

            {order.dynamicValue?.fechaDesde && (
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Inicio</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  {formatDateShort(order.dynamicValue.fechaDesde)}
                </p>
              </div>
            )}

            {order.dynamicValue?.fechaHasta && (
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Fin</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">
                  {formatDateShort(order.dynamicValue.fechaHasta)}
                </p>
              </div>
            )}

            {order.photoUrl && (
              <div className="md:col-span-2">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                  Imagen adjunta
                </p>
                <img
                  src={`${import.meta.env.VITE_API_URL}${order.photoUrl}`}
                  alt={order.title}
                  className="max-w-xs w-full h-auto rounded-lg border border-slate-200 dark:border-slate-600 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setViewingImage(`${import.meta.env.VITE_API_URL}${order.photoUrl}`)}
                />
              </div>
            )}
          </div>

          {/* Fechas importantes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Solicitud</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {formatDateShort(order.requestedAt)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Aprobación</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {formatDateShort(order.approvedAt)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Entrega</p>
              <p className="font-medium text-slate-800 dark:text-slate-100">
                {formatDateShort(order.deliveredAt)}
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal de imagen en pantalla completa */}
      {viewingImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-90 p-4"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setViewingImage(null)}
              className="absolute -top-4 -right-4 p-2 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg z-10"
            >
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
            </button>
            <img
              src={viewingImage}
              alt="Order"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
