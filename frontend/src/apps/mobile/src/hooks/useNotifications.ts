import { useState, useEffect } from 'react';
import { personnelAPI, Notification } from '../../../../api/personnel';

export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const [notificationsData, countData] = await Promise.all([
        personnelAPI.getNotifications(),
        personnelAPI.getNotificationCount(),
      ]);
      setNotifications(notificationsData);
      setUnreadCount(countData.count);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar notificaciones');
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      setError(null);
      await personnelAPI.markNotificationRead(id);
      setNotifications(
        notifications.map(notif =>
          notif._id === id ? { ...notif, isRead: true, readAt: new Date().toISOString() } : notif
        )
      );
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al marcar notificación');
      throw err;
    }
  };

  const markAllAsRead = async () => {
    try {
      setError(null);
      await personnelAPI.markAllNotificationsRead();
      setNotifications(
        notifications.map(notif => ({ ...notif, isRead: true, readAt: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al marcar todas las notificaciones');
      throw err;
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      setError(null);
      await personnelAPI.deleteNotification(id);
      const deletedNotif = notifications.find(n => n._id === id);
      setNotifications(notifications.filter(notif => notif._id !== id));
      if (deletedNotif && !deletedNotif.isRead) {
        setUnreadCount(Math.max(0, unreadCount - 1));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al eliminar notificación');
      throw err;
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  };
};
