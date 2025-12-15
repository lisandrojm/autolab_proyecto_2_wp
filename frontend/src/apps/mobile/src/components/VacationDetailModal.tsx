import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faTimes, faFileArrowUp, faBell, faFilePdf, faDownload, faClock, faCheckCircle, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { VacationRequest, vacationsAPI } from "../../../../api/vacations";
import { ProfileData } from "../../../../api/personnel";
import { Modal } from "../../../../components/ui/Modal";
import { sweetAlert } from "../utils/sweetAlert";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { mapVacationStatusToStatusTypeForMobile, mapVacationSignatureStateToStatusType, isVacationInFinalState } from "../../../../utils/statusHelpers";
import { formatDateShort } from "../utils/orderHelpers";

interface VacationDetailModalProps {
  vacation: VacationRequest | null;
  profile: ProfileData | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}

export default function VacationDetailModal({ vacation, profile, isOpen, onClose, onRefresh }: VacationDetailModalProps) {
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [notifyingSignature, setNotifyingSignature] = useState(false);

  if (!vacation) return null;

  const handleNotifySignature = async () => {
    if (!vacation) return;

    const result = await sweetAlert.confirm("¿Avisar al supervisor?", "¿Ya completaste la firma del documento? Esto enviará una notificación al supervisor para que verifique.", "Sí, avisar", "Todavía no");

    if (!result.isConfirmed) return;

    try {
      setNotifyingSignature(true);
      await vacationsAPI.notifySignature(vacation._id);

      setNotifyingSignature(false);
      await sweetAlert.success("Notificación enviada", "Se ha registrado tu notificación. Esperá que el supervisor verifique la firma del documento.");

      if (onRefresh) {
        await onRefresh();
      }
      onClose();
    } catch (error: any) {
      console.error("Error notifying signature:", error);
      const errorMessage = error?.response?.data?.error || error?.message || "No se pudo enviar la notificación";
      setNotifyingSignature(false);
      await sweetAlert.error("Error", errorMessage);
    }
  };

  const handleCancelVacation = async () => {
    if (!vacation) return;

    const result = await sweetAlert.confirm("¿Cancelar solicitud?", `¿Estás seguro de cancelar esta solicitud de vacaciones?`, "Sí, cancelar", "No cancelar");

    if (!result.isConfirmed) return;

    try {
      setCancelling(true);
      await vacationsAPI.cancel(vacation._id);
      setCancelling(false);
      await sweetAlert.success("Solicitud cancelada", "La solicitud ha sido cancelada correctamente");
      if (onRefresh) {
        await onRefresh();
      }
      onClose();
    } catch (error: any) {
      console.error("Error canceling vacation:", error);
      setCancelling(false);
      await sweetAlert.error("Error", error?.response?.data?.error || "No se pudo cancelar la solicitud");
    }
  };

  const renderFooter = () => {
    if (cancelling) {
      return (
        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
          <FontAwesomeIcon icon={faSpinner} className="w-4 h-4" spin />
          <span className="text-sm">Cancelando...</span>
        </div>
      );
    }

    if (vacation.status === "pending") {
      return (
        <button onClick={handleCancelVacation} disabled={cancelling} className="px-6 py-2.5 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-semibold text-sm hover:bg-red-500/20 dark:hover:bg-red-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          Cancelar Solicitud
        </button>
      );
    }

    return null;
  };

  const isFinalState = isVacationInFinalState(vacation.status);

  // Helpers for user info
  const getUserName = () => {
    if (profile) return `${profile.firstName} ${profile.lastName}`;
    return "Usuario";
  };

  const getUserPosition = () => {
    if (profile?.position) return profile.position;
    return "Colaborador"; // Default
  };

  const getUserAvatarUrl = () => {
    if (profile?.profilePhotoUrl) return `${import.meta.env.VITE_API_URL}${profile.profilePhotoUrl}`;
    return null;
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Detalles de Solicitud"
        size="md"
        footer={renderFooter()}
        customHeader={
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 sticky top-0 py-3 z-50">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalles de Solicitud</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar modal" title="Cerrar">
              <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Header Info (ID & Badges) */}
          <div className="flex flex-wrap justify-between gap-3">
            <span>
              <p className="text-sm px-2 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400 rounded">ID: {vacation.vacationNumber || vacation._id.slice(-6)}</p>
            </span>
            <div className="flex flex-wrap gap-2">
              <StatusBadge type={mapVacationStatusToStatusTypeForMobile(vacation.status)} size="sm" />
              <StatusBadge type={mapVacationSignatureStateToStatusType(vacation)} size="sm" overrideStyle={isFinalState} />
            </div>
          </div>

          {/* Avatar and User Info */}
          <div className="flex items-center gap-3">
            <div>
              {getUserAvatarUrl() ? (
                <img alt={`Foto de perfil de ${getUserName()}`} className="w-10 h-10 rounded-full object-cover" src={getUserAvatarUrl()!} />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center text-white font-semibold">
                  {getUserName()
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </div>
              )}
            </div>
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{getUserName()}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{getUserPosition()}</p>
            </div>
          </div>

          {/* Type and Dates Details */}
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Tipo de solicitud</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/50 dark:text-gray-300">Vacaciones</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-sm font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">{vacation.daysRequested} días</span>
              </div>
            </div>
            <div className="flex gap-10">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Inicio</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(vacation.startDate)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Fecha de Fin</p>
                <p className="font-medium text-slate-800 dark:text-slate-100">{formatDateShort(vacation.endDate)}</p>
              </div>
            </div>
          </div>

          {/* Motivo / Description */}
          {vacation.reason && (
            <div className="bg-slate-100 dark:bg-slate-700/50 p-3 py-3 rounded-lg">
              <div className="flex justify-between items-start">
                <div className="flex justify-between items-center w-full">
                  <p className="font-semibold text-sm text-slate-800 dark:text-slate-500">Información</p>
                </div>
              </div>
              <p className="text-md text-slate-600 dark:text-slate-300 leading-relaxed">{vacation.reason}</p>
            </div>
          )}

          {/* PDF Pre-aprobacion */}
          {vacation.pdfPreAprobacionUrl && (!vacation.requiresSignature || vacation.signatureStatus !== "sent") && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-500/50 p-4 rounded-lg">
              <div className="flex items-start gap-3 mb-3">
                <FontAwesomeIcon icon={faFilePdf} className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold text-blue-800 dark:text-blue-400 mb-1">Solicitud PDF</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">Documento de solicitud de vacaciones.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setViewingFile(`${import.meta.env.VITE_API_URL}${vacation.pdfPreAprobacionUrl}`)} className="flex-1 flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium leading-normal shadow-sm transition-colors">
                  <FontAwesomeIcon icon={faFileArrowUp} className="w-4 h-4" />
                  <span>Ver Documento</span>
                </button>
                <a href={`${import.meta.env.VITE_API_URL}${vacation.pdfPreAprobacionUrl}`} download target="_blank" rel="noopener noreferrer" className="flex items-center justify-center rounded-lg h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm">
                  <FontAwesomeIcon icon={faDownload} className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}

          {/* Signature Notification Section */}
          {(() => {
            if (!vacation.requiresSignature || vacation.signatureStatus !== "sent") {
              return null;
            }
            if (isFinalState) return null;

            if (isFinalState) return null;

            // State: Waiting Verification (User notified)
            if (vacation.signatureNotifiedAt) {
              return (
                <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg">
                  <div className="flex items-start gap-3 mb-3">
                    <FontAwesomeIcon icon={faClock} className="h-5 w-5 text-amber-500 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-semibold text-amber-500 mb-1">Esperando Verificación</h4>
                      <p className="text-sm text-amber-500/80 mb-2">Ya notificaste al supervisor que completaste la firma. Estamos esperando que verifique el documento.</p>

                      <p className="text-xs text-amber-500/60 font-medium">
                        Notificado el: {formatDateShort(vacation.signatureNotifiedAt)}
                        {/* If we had time, we could format time too, e.g. ", 02:10 a. m." */}
                      </p>
                    </div>
                  </div>
                  <button disabled className="w-full flex items-center justify-center gap-2 rounded-lg h-10 px-4 bg-amber-900/40 text-amber-500 text-sm font-medium leading-normal shadow-sm transition-colors cursor-not-allowed border border-amber-500/20">
                    <FontAwesomeIcon icon={faCheckCircle} className="w-4 h-4" />
                    <span>Ya Notificado</span>
                  </button>
                </div>
              );
            }

            // State: Document Sent (Needs signature)
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
        </div>
      </Modal>

      {/* File Viewer */}
      {viewingFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 w-full" onClick={() => setViewingFile(null)}>
          <div className="relative w-full flex justify-center max-h-[90vh] h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setViewingFile(null)} className="absolute -top-4 -right-4 p-2 rounded-full bg-slate-800 text-white shadow-lg z-10 w-8 h-8 flex items-center justify-center">
              <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
            </button>
            <iframe src={viewingFile} className="w-full h-full rounded-lg shadow-2xl bg-white" title="Documento" />
          </div>
        </div>
      )}
    </>
  );
}
