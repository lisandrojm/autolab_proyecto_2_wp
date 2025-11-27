import React, { useState } from "react";
import { Smartphone, Bell, Users, Tag } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faApple, faAndroid } from "@fortawesome/free-brands-svg-icons";
import { PushConfig } from "../../types/post";

interface PushNotificationPreviewProps {
  config: Partial<PushConfig>;
  images?: string[];
}

export const PushNotificationPreview: React.FC<PushNotificationPreviewProps> = ({ config, images = [] }) => {
  const [selectedDevice, setSelectedDevice] = useState<"ios" | "android">("ios");

  const imageUrl = config.imageUrl || images[0];

  const getSegmentationText = () => {
    if (config.segmentation?.allUsers) {
      return "Todos los usuarios";
    }
    if (config.segmentation?.userIds && config.segmentation.userIds.length > 0) {
      return `${config.segmentation.userIds.length} usuario${config.segmentation.userIds.length > 1 ? "s" : ""} específico${config.segmentation.userIds.length > 1 ? "s" : ""}`;
    }
    if (config.segmentation?.tags && config.segmentation.tags.length > 0) {
      return `Usuarios con tags: ${config.segmentation.tags.slice(0, 2).join(", ")}${config.segmentation.tags.length > 2 ? "..." : ""}`;
    }
    return "Sin segmentación definida";
  };

  const getPriorityColor = () => {
    switch (config.priority) {
      case "high":
        return "text-red-600 dark:text-red-400";
      case "low":
        return "text-gray-600 dark:text-gray-400";
      default:
        return "text-blue-600 dark:text-blue-400";
    }
  };

  const getPriorityText = () => {
    switch (config.priority) {
      case "high":
        return "Alta";
      case "low":
        return "Baja";
      default:
        return "Normal";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Vista Previa de Push Notification
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Verifica cómo se verá tu notificación en diferentes dispositivos</p>
      </div>

      <div className="w-auto flex justify-center m-0 p-0 items-center">
        <div className="flex gap-3 w-96">
          <button onClick={() => setSelectedDevice("ios")} className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${selectedDevice === "ios" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"}`}>
            <FontAwesomeIcon icon={faApple} className="h-5 w-5" />
            <span className="font-medium">iOS</span>
          </button>
          <button onClick={() => setSelectedDevice("android")} className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${selectedDevice === "android" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"}`}>
            <FontAwesomeIcon icon={faAndroid} className="h-5 w-5" />
            <span className="font-medium">Android</span>
          </button>
        </div>
      </div>

      <div className="bg-gray-100 dark:bg-gray-900 rounded-lg p-6 flex justify-center items-center min-h-[400px]">
        <div className="relative">
          <div className={`w-[340px] rounded-[40px] shadow-2xl overflow-hidden ${selectedDevice === "ios" ? "bg-black border-8 border-gray-800" : "bg-gray-900 border-4 border-gray-700"}`}>
            <div className="bg-gradient-to-b from-gray-800 to-gray-900 p-4 pt-12">
              <div className="text-center text-white text-xs mb-6">12:34</div>

              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
                    <Bell className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">Mi Aplicación</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">ahora</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">{config.title || "Título de la notificación"}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{config.body || "El mensaje de tu notificación aparecerá aquí"}</div>
                    {imageUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden">
                        <img src={imageUrl} alt="Notification" className="w-full h-32 object-cover" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-b from-gray-900 to-black h-48"></div>
          </div>

          {config.badge && config.badge > 0 && selectedDevice === "ios" && <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">{config.badge}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Configuración
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Prioridad:</span>
              <span className={`font-medium ${getPriorityColor()}`}>{getPriorityText()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Título:</span>
              <span className="text-gray-900 dark:text-white">{(config.title || "").length}/65</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 dark:text-gray-400">Mensaje:</span>
              <span className="text-gray-900 dark:text-white">{(config.body || "").length}/240</span>
            </div>
            {config.deepLink && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Deep Link:</span>
                <div className="text-xs text-gray-900 dark:text-white mt-1 truncate">{config.deepLink}</div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Audiencia
          </h4>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <div className="text-gray-600 dark:text-gray-400 text-sm">{getSegmentationText()}</div>
            </div>
            {config.segmentation?.tags && config.segmentation.tags.length > 0 && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap gap-1">
                  {config.segmentation.tags.map((tag, index) => (
                    <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 rounded text-xs">
                      <Tag className="h-3 w-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {config.segmentation?.userIds && config.segmentation.userIds.length > 0 && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {config.segmentation.userIds.length} usuario{config.segmentation.userIds.length > 1 ? "s" : ""} seleccionado{config.segmentation.userIds.length > 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Características por Plataforma</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300">
              <FontAwesomeIcon icon={faApple} className="h-4 w-4" />
              <strong>iOS</strong>
            </div>
            <ul className="space-y-1 text-blue-700 dark:text-blue-300 text-xs">
              <li>• Badge número visible en el ícono</li>
              <li>• Notificaciones agrupadas por app</li>
              <li>• Sonido personalizable</li>
              <li>• Acciones rápidas disponibles</li>
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300">
              <FontAwesomeIcon icon={faAndroid} className="h-4 w-4" />
              <strong>Android</strong>
            </div>
            <ul className="space-y-1 text-blue-700 dark:text-blue-300 text-xs">
              <li>• Imagen expandible en notificación</li>
              <li>• Canales de notificación</li>
              <li>• LED de notificación (si disponible)</li>
              <li>• Notificaciones agrupables</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          ⚠️ <strong>Nota:</strong> La apariencia de las notificaciones puede variar según la versión del sistema operativo y la configuración del usuario.
        </p>
      </div>
    </div>
  );
};
