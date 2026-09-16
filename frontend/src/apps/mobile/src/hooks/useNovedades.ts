import { useNotifications } from "./useNotifications";

/*
  LAS NOVEDADES DE UNA PANTALLA, FILA POR FILA.

  El banner de arriba marca todo lo nuevo de la pantalla; esto es lo otro que hace falta: saber qué
  FILA es nueva y poder marcar esa sola. Cada aviso guarda de qué habla (`refId`: la persona que se
  registró, la solicitud que entró), y con eso la lista se cruza con las notificaciones sin pedir nada
  más al server —el store ya las tiene todas cargadas—.

  Un aviso viejo, de antes de que se guardara la referencia, no marca ninguna fila: sigue estando en la
  campanita y lo levanta «marcar todos». Es preferible a adivinar a qué fila correspondía.
*/
export const useNovedades = (tipos: string[]) => {
  const { notifications, porTipo, markAllAsRead } = useNotifications();

  const sinLeer = notifications.filter((n) => !n.isRead && tipos.includes(n.type));
  /** Cuánto dice el banner: sale de las cuentas del server, que son la fuente de los números. */
  const cantidad = tipos.reduce((total, tipo) => total + (porTipo[tipo] || 0), 0);

  return {
    cantidad,
    /** ¿Esta fila es nueva? (hay un aviso sin leer que habla de ella). */
    esNuevo: (refId?: string | null) => !!refId && sinLeer.some((n) => String(n.refId || "") === String(refId)),
    /** Marca leído lo de UNA fila. Sin avisos para esa fila no hace nada: no hay a qué pegarle. */
    marcarLeido: async (refId?: string | null) => {
      if (!refId || !sinLeer.some((n) => String(n.refId || "") === String(refId))) return;
      await markAllAsRead(tipos, refId);
    },
    /** Marca leído todo lo nuevo de esta pantalla. */
    marcarTodos: () => markAllAsRead(tipos),
  };
};
