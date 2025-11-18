import React, { useState } from "react";
import { Bell, Smartphone, Link as LinkIcon, Tag, Users, X, Plus } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faApple, faAndroid } from "@fortawesome/free-brands-svg-icons";
import { faLightbulb } from "@fortawesome/free-solid-svg-icons";
import { PushConfig } from "../../types/post";

interface PushConfigFormProps {
  config: Partial<PushConfig>;
  onChange: (config: Partial<PushConfig>) => void;
  existingImages?: string[];
}

export const PushConfigForm: React.FC<PushConfigFormProps> = ({ config, onChange, existingImages = [] }) => {
  const [userIdInput, setUserIdInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  const displayImageUrl = config.imageUrl || existingImages[0];

  const handleAddUserId = () => {
    if (!userIdInput.trim()) return;

    const userIds = userIdInput
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (userIds.length === 0) return;

    onChange({
      ...config,
      segmentation: {
        ...config.segmentation,
        userIds: [...(config.segmentation?.userIds || []), ...userIds],
      },
    });
    setUserIdInput("");
  };

  const handleRemoveUserId = (index: number) => {
    const newUserIds = [...(config.segmentation?.userIds || [])];
    newUserIds.splice(index, 1);
    onChange({
      ...config,
      segmentation: {
        ...config.segmentation,
        userIds: newUserIds,
      },
    });
  };

  const handleAddTag = () => {
    if (!tagInput.trim()) return;

    const tags = tagInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length === 0) return;

    onChange({
      ...config,
      segmentation: {
        ...config.segmentation,
        tags: [...(config.segmentation?.tags || []), ...tags],
      },
    });
    setTagInput("");
  };

  const handleRemoveTag = (index: number) => {
    const newTags = [...(config.segmentation?.tags || [])];
    newTags.splice(index, 1);
    onChange({
      ...config,
      segmentation: {
        ...config.segmentation,
        tags: newTags,
      },
    });
  };

  const titleLength = (config.title || "").length;
  const bodyLength = (config.body || "").length;

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          <Bell className="inline h-4 w-4 mr-2" />
          Título de la Notificación *
        </label>
        <input type="text" value={config.title || ""} onChange={(e) => onChange({ ...config, title: e.target.value })} placeholder="Ej: Nueva actualización disponible" maxLength={65} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
        <div className="flex justify-between mt-1">
          <p className="text-xs text-gray-500">Máximo 65 caracteres</p>
          <p className={`text-xs font-medium ${titleLength > 65 ? "text-red-600" : "text-gray-500"}`}>{titleLength}/65</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Mensaje *</label>
        <textarea value={config.body || ""} onChange={(e) => onChange({ ...config, body: e.target.value })} placeholder="Escribe el mensaje de tu notificación aquí..." rows={4} maxLength={240} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white resize-none" />
        <div className="flex justify-between mt-1">
          <p className="text-xs text-gray-500">Máximo 240 caracteres</p>
          <p className={`text-xs font-medium ${bodyLength > 240 ? "text-red-600" : "text-gray-500"}`}>{bodyLength}/240</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <LinkIcon className="inline h-4 w-4 mr-2" />
            Deep Link / URL
          </label>
          <input
            type="text"
            value={config.deepLink || config.clickAction || ""}
            onChange={(e) =>
              onChange({
                ...config,
                deepLink: e.target.value,
                clickAction: e.target.value,
              })
            }
            placeholder="miapp://pantalla/detalle"
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          />
          <p className="text-xs text-gray-500 mt-1">Destino al tocar la notificación</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Smartphone className="inline h-4 w-4 mr-2" />
            Prioridad
          </label>
          <select
            value={config.priority || "normal"}
            onChange={(e) =>
              onChange({
                ...config,
                priority: e.target.value as "high" | "normal" | "low",
              })
            }
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          >
            <option value="low">Baja</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">URL de la Imagen</label>
          <input type="url" value={config.imageUrl || ""} onChange={(e) => onChange({ ...config, imageUrl: e.target.value })} placeholder={existingImages.length > 0 ? "Usando imagen del post" : "https://ejemplo.com/imagen.jpg"} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
          <p className="text-xs text-gray-500 mt-1">
            {existingImages.length > 0 && !config.imageUrl ? (
              <span className="text-green-600 dark:text-green-400">✓ Usando imagen del multimedia: {existingImages[0]}</span>
            ) : (
              "Imagen grande que se muestra en la notificación"
            )}
          </p>
          {displayImageUrl && (
            <div className="mt-2">
              <img src={displayImageUrl} alt="Preview" className="h-24 w-auto rounded-lg border border-gray-300 dark:border-gray-600" />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Badge (iOS)</label>
          <input type="number" min="0" value={config.badge || 0} onChange={(e) => onChange({ ...config, badge: parseInt(e.target.value) || 0 })} placeholder="0" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
          <p className="text-xs text-gray-500 mt-1">Número que se muestra en el ícono de la app</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          <Users className="inline h-4 w-4 mr-2" />
          Segmentación de Audiencia
        </label>

        <div className="space-y-3">
          <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-gray-400 dark:hover:border-gray-500">
            <input
              type="radio"
              name="segmentation"
              checked={config.segmentation?.allUsers === true}
              onChange={() =>
                onChange({
                  ...config,
                  segmentation: { allUsers: true },
                })
              }
              className="w-5 h-5 text-primary-600 focus:ring-primary-500"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">Todos los usuarios</div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Enviar a todos los usuarios de la aplicación</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-gray-400 dark:hover:border-gray-500">
            <input
              type="radio"
              name="segmentation"
              checked={!config.segmentation?.allUsers && (config.segmentation?.userIds?.length || 0) > 0}
              onChange={() =>
                onChange({
                  ...config,
                  segmentation: { userIds: config.segmentation?.userIds || [] },
                })
              }
              className="w-5 h-5 text-primary-600 focus:ring-primary-500"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">Usuarios específicos</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Enviar solo a usuarios seleccionados por ID</div>
              {!config.segmentation?.allUsers && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={userIdInput}
                      onChange={(e) => setUserIdInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddUserId();
                        }
                      }}
                      placeholder="user123 (separados por coma)"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                    <button type="button" onClick={handleAddUserId} className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {config.segmentation?.userIds && config.segmentation.userIds.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {config.segmentation.userIds.map((userId, index) => (
                        <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded text-sm">
                          {userId}
                          <button type="button" onClick={() => handleRemoveUserId(index)} className="hover:text-primary-900 dark:hover:text-primary-100">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </label>

          <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:border-gray-400 dark:hover:border-gray-500">
            <input
              type="radio"
              name="segmentation"
              checked={!config.segmentation?.allUsers && (config.segmentation?.tags?.length || 0) > 0}
              onChange={() =>
                onChange({
                  ...config,
                  segmentation: { tags: config.segmentation?.tags || [] },
                })
              }
              className="w-5 h-5 text-primary-600 focus:ring-primary-500"
            />
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Segmentar por Tags
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">Enviar a usuarios con tags específicos</div>
              {!config.segmentation?.allUsers && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="vip, premium, new-users"
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                    />
                    <button type="button" onClick={handleAddTag} className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {config.segmentation?.tags && config.segmentation.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {config.segmentation.tags.map((tag, index) => (
                        <span key={index} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-sm">
                          {tag}
                          <button type="button" onClick={() => handleRemoveTag(index)} className="hover:text-purple-900 dark:hover:text-purple-100">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
        <h4 className="font-medium text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Vista Previa
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
              <FontAwesomeIcon icon={faApple} className="h-4 w-4" />
              <span>iOS</span>
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{config.title || "Título de la notificación"}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{config.body || "Mensaje de la notificación"}</div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
              <FontAwesomeIcon icon={faAndroid} className="h-4 w-4" />
              <span>Android</span>
            </div>
            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{config.title || "Título de la notificación"}</div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{config.body || "Mensaje de la notificación"}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faLightbulb} className="text-blue-500 dark:text-blue-300" />
        <p className="text-sm text-blue-800 dark:text-blue-300">Las notificaciones push funcionan mejor con mensajes cortos y directos. Usa la prioridad "Alta" solo para mensajes urgentes.</p>
      </div>
    </div>
  );
};
