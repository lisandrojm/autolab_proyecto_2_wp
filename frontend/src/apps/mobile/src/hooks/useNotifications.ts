import { create } from "zustand";
import { personnelAPI, Notification } from "../../../../api/personnel";

/*
  LAS NOTIFICACIONES DE LA APP: la lista, el número por tarjeta, y leído / no leído.

  ES UN STORE Y NO UN HOOK POR PANTALLA porque los mismos números se miran en tres lugares a la vez: el
  contador de la campanita, el número de las tarjetas Registro y Contratación del inicio, y la lista.
  Con un estado por pantalla, marcar una como leída bajaba el número de la lista y dejaba el de la
  tarjeta como estaba, hasta que a alguien se le ocurriera recargar.

  `porTipo` es lo que hace el número de cada tarjeta. Lo agrupa el server en una sola consulta: contar
  en el teléfono obligaría a traer todas las notificaciones sólo para dibujar dos números.

  Cada cambio se aplica primero en la lista y después se recuenta contra el server, que es la fuente de
  la verdad: así el número no queda a merced de lo que el teléfono creía tener cargado.
*/

interface EstadoNotificaciones {
  notifications: Notification[];
  unreadCount: number;
  /** No leídas por tipo de novedad. Ver `NOVEDAD_*` en `api/personnel.ts`. */
  porTipo: Record<string, number>;
  loading: boolean;
  error: string | null;
  cargado: boolean;
  refetch: () => Promise<void>;
  /** Carga la primera vez. La llama la app al arrancar; volver a llamarla no repite el pedido. */
  ensureLoaded: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAsUnread: (id: string) => Promise<void>;
  markAllAsRead: (type?: string | string[], refIds?: string | string[]) => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

/** Un solo pedido en vuelo: el inicio y la barra piden la carga a la vez al abrir la app. */
let enVuelo: Promise<void> | null = null;

export const useNotifications = create<EstadoNotificaciones>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  porTipo: {},
  loading: true,
  error: null,
  cargado: false,

  refetch: async () => {
    if (enVuelo) return enVuelo;
    enVuelo = (async () => {
      try {
        set({ loading: true, error: null });
        const [notifications, counts] = await Promise.all([personnelAPI.getNotifications(), personnelAPI.getNotificationCounts()]);
        set({ notifications, unreadCount: counts.total, porTipo: counts.porTipo, cargado: true });
      } catch (err: any) {
        set({ error: err?.response?.data?.error || "Error al cargar notificaciones" });
        console.error("Error fetching notifications:", err);
      } finally {
        set({ loading: false });
        enVuelo = null;
      }
    })();
    return enVuelo;
  },

  ensureLoaded: () => {
    if (get().cargado || enVuelo) return;
    void get().refetch();
  },

  markAsRead: async (id) => {
    set({ error: null });
    try {
      await personnelAPI.markNotificationRead(id);
      set({ notifications: get().notifications.map((n) => (n._id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)) });
      await recontar(set);
    } catch (err: any) {
      set({ error: err?.response?.data?.error || "Error al marcar notificación" });
      throw err;
    }
  },

  /** Vuelve a dejarla pendiente: se abrió sin poder resolverla y tiene que seguir cantando. */
  markAsUnread: async (id) => {
    set({ error: null });
    try {
      await personnelAPI.markNotificationUnread(id);
      set({ notifications: get().notifications.map((n) => (n._id === id ? { ...n, isRead: false, readAt: undefined } : n)) });
      await recontar(set);
    } catch (err: any) {
      set({ error: err?.response?.data?.error || "Error al marcar notificación" });
      throw err;
    }
  },

  /**
   * Sin nada, todas. Con tipos, sólo esas familias («leí los registros nuevos»). Con `refIds`, sólo lo
   * que habla de esas filas («leí este registro»). Los dos filtros se combinan.
   */
  markAllAsRead: async (type, refIds) => {
    set({ error: null });
    try {
      const tipos = Array.isArray(type) ? type : type ? [type] : [];
      const refs = (Array.isArray(refIds) ? refIds : refIds ? [refIds] : []).map(String);
      await personnelAPI.markAllNotificationsRead(tipos, refs);
      const alcanza = (n: { type: string; refId?: string | null }) => (tipos.length === 0 || tipos.includes(n.type)) && (refs.length === 0 || refs.includes(String(n.refId || "")));
      set({ notifications: get().notifications.map((n) => (alcanza(n) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)) });
      await recontar(set);
    } catch (err: any) {
      set({ error: err?.response?.data?.error || "Error al marcar todas las notificaciones" });
      throw err;
    }
  },

  deleteNotification: async (id) => {
    set({ error: null });
    try {
      await personnelAPI.deleteNotification(id);
      set({ notifications: get().notifications.filter((n) => n._id !== id) });
      await recontar(set);
    } catch (err: any) {
      set({ error: err?.response?.data?.error || "Error al eliminar notificación" });
      throw err;
    }
  },
}));

/** Los números salen del server después de cada cambio. Si falla, se dejan como están: es un contador. */
async function recontar(set: (parcial: Partial<EstadoNotificaciones>) => void) {
  try {
    const counts = await personnelAPI.getNotificationCounts();
    set({ unreadCount: counts.total, porTipo: counts.porTipo });
  } catch {
    /* noop */
  }
}
