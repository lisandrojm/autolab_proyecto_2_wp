import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faCheckDouble, faEnvelope, faEnvelopeOpen, faLink, faUserPlus, faCircleCheck, faCircleXmark, faBan, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import SectionHeader from "../components/SectionHeader";
import { useNotifications } from "../hooks/useNotifications";
import { NOVEDAD_REGISTRO, NOVEDAD_SOLICITUD, NOVEDAD_SOLICITUD_APROBADA, NOVEDAD_SOLICITUD_CANCELADA, NOVEDAD_SOLICITUD_REABIERTA, NOVEDAD_SOLICITUD_RECHAZADA } from "../../../../api/personnel";
import { ViewType } from "../types";

/*
  LA CAMPANITA, QUE HASTA AHORA NO LLEVABA A NINGUNA PARTE.

  Estaba en la barra de abajo apagada, con un puntito rojo fijo que no contaba nada: avisaba siempre,
  hubiera o no algo. Acá están los avisos de verdad —quién se registró con tu link, qué solicitudes de
  contratación entraron y cómo terminaron las que pediste—, cada uno con su leído / no leído.

  TOCAR LA NOTIFICACIÓN LA ABRE, no la tacha: lleva a la pantalla donde se resuelve y recién ahí queda
  leída. El sobre de la derecha es el control explícito, en los dos sentidos: se puede volver a dejar
  pendiente lo que se abrió sin tiempo de resolver, que es para lo que sirve un no leído.
*/

/** Qué ícono y a qué pantalla lleva cada tipo de aviso. Un tipo que no esté acá se muestra igual. */
const NOVEDADES: Record<string, { icono: IconDefinition; vista?: ViewType }> = {
  [NOVEDAD_REGISTRO]: { icono: faLink, vista: "registro" },
  [NOVEDAD_SOLICITUD]: { icono: faUserPlus, vista: "user_history" },
  [NOVEDAD_SOLICITUD_APROBADA]: { icono: faCircleCheck, vista: "user_history" },
  [NOVEDAD_SOLICITUD_RECHAZADA]: { icono: faCircleXmark, vista: "user_history" },
  [NOVEDAD_SOLICITUD_CANCELADA]: { icono: faBan, vista: "user_history" },
  [NOVEDAD_SOLICITUD_REABIERTA]: { icono: faRotateLeft, vista: "user_history" },
};

const cuando = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const minutos = Math.floor((Date.now() - d.getTime()) / 60000);
  if (minutos < 1) return "Ahora";
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "Ayer";
  if (dias < 7) return `Hace ${dias} días`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
};

interface NotificacionesProps {
  onNavigate: (view: ViewType) => void;
}

export default function Notificaciones({ onNavigate }: NotificacionesProps) {
  const { notifications, unreadCount, loading, error, refetch, markAsRead, markAsUnread, markAllAsRead } = useNotifications();

  // Al entrar se pide de nuevo: el número de la campanita puede venir de hace un rato.
  useEffect(() => {
    void refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrir = async (id: string, leida: boolean, vista?: ViewType) => {
    if (!leida) {
      try {
        await markAsRead(id);
      } catch {
        /* el aviso queda sin leer; igual se navega, que es lo que la persona pidió */
      }
    }
    if (vista) onNavigate(vista);
  };

  return (
    <div className="flex-1 pb-24">
      <SectionHeader
        icon={faBell}
        titulo="Notificaciones"
        onBack={() => onNavigate("home")}
        info={"Los avisos de quién se registró con tu link y de las solicitudes de contratación: las que entran para aprobar y cómo terminan las que pediste.\n\nTocá un aviso para ir a la pantalla donde se resuelve; queda leído. Con el sobre lo marcás leído o lo volvés a dejar pendiente, sin abrirlo."}
      />

      <div className="px-4 pt-4">
        {unreadCount > 0 && (
          <button type="button" onClick={() => void markAllAsRead()} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
            <FontAwesomeIcon icon={faCheckDouble} className="h-3.5 w-3.5" />
            Marcar las {unreadCount} como leídas
          </button>
        )}

        {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

        {loading && notifications.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900/70" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-slate-50 p-10 text-center dark:bg-slate-800/50">
            <FontAwesomeIcon icon={faBell} className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No tenés notificaciones</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Acá avisamos cuando se registra alguien con tu link o entra una solicitud de contratación.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => {
              const novedad = NOVEDADES[n.type] || { icono: faBell };
              return (
                <div key={n._id} className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${n.isRead ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40" : "border-primary/40 bg-primary/5 dark:border-primary/40 dark:bg-primary/10"}`}>
                  <button type="button" onClick={() => void abrir(n._id, n.isRead, novedad.vista)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
                    <FontAwesomeIcon icon={novedad.icono} className={`mt-0.5 h-4 w-4 shrink-0 ${n.isRead ? "text-slate-400" : "text-primary"}`} />
                    <div className="min-w-0">
                      <p className={`truncate text-sm ${n.isRead ? "font-semibold text-slate-700 dark:text-slate-300" : "font-bold text-slate-900 dark:text-slate-100"}`}>{n.title}</p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-slate-500 dark:text-slate-400">{n.message}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">{cuando(n.createdAt)}</p>
                    </div>
                  </button>

                  {/* Leído / no leído, en los dos sentidos y sin abrir el aviso. */}
                  <button
                    type="button"
                    onClick={() => void (n.isRead ? markAsUnread(n._id) : markAsRead(n._id))}
                    aria-label={n.isRead ? "Marcar como no leída" : "Marcar como leída"}
                    title={n.isRead ? "Marcar como no leída" : "Marcar como leída"}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border active:scale-95 ${n.isRead ? "border-slate-200 text-slate-400 dark:border-slate-700" : "border-primary/40 text-primary"}`}
                  >
                    <FontAwesomeIcon icon={n.isRead ? faEnvelopeOpen : faEnvelope} className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
