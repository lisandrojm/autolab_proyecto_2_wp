import React, { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { personnelAPI, Notification } from '../api/personnel';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faCheck, faCheckDouble, faTrash } from '@fortawesome/free-solid-svg-icons';

export const NotificationsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filterUnread, setFilterUnread] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await personnelAPI.getNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      sweetAlert.error('Error', 'No se pudieron cargar las notificaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await personnelAPI.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo marcar como leída');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await personnelAPI.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      sweetAlert.success('Notificaciones', 'Todas las notificaciones fueron marcadas como leídas');
    } catch (error) {
      sweetAlert.error('Error', 'No se pudieron marcar todas como leídas');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await personnelAPI.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n._id !== id));
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo eliminar la notificación');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando notificaciones..." />;
  }

  const filteredNotifications = filterUnread
    ? notifications.filter((n) => !n.read)
    : notifications;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-blue-600 dark:text-blue-400';
      case 'warning':
        return 'text-blue-600 dark:text-blue-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <PageLayout
      title="Notificaciones"
      subtitle={`${unreadCount} sin leer`}
      faIcon={{ icon: faBell }}
      headerActions={
        unreadCount > 0 ? (
          <button onClick={handleMarkAllRead} className="btn-ghost text-sm">
            <FontAwesomeIcon icon={faCheckDouble} className="mr-2" />
            Marcar todas leídas
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filterUnread}
              onChange={(e) => setFilterUnread(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Solo no leídas</span>
          </label>
        </div>

        <div className="space-y-3">
          {filteredNotifications.map((notification) => (
            <div
              key={notification._id}
              className={`p-4 rounded-lg border transition-all ${
                notification.read
                  ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                  : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <FontAwesomeIcon
                    icon={faBell}
                    className={`h-5 w-5 mt-0.5 ${getTypeColor(notification.type)}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{notification.title}</h4>
                      {!notification.read && (
                        <span className="inline-flex h-2 w-2 rounded-full bg-blue-600"></span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{notification.message}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                      {new Date(notification.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!notification.read && (
                    <button
                      onClick={() => handleMarkRead(notification._id)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      title="Marcar como leída"
                    >
                      <FontAwesomeIcon icon={faCheck} className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(notification._id)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Eliminar"
                  >
                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredNotifications.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faBell} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              {filterUnread ? 'No hay notificaciones sin leer' : 'No hay notificaciones'}
            </p>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
