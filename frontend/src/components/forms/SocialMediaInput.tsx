import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFacebook, faInstagram, faLinkedin, faTiktok, faXTwitter, faYoutube } from "@fortawesome/free-brands-svg-icons";
import { faPlus, faTrash, faCheck, faTimes, faExternalLink } from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

type SocialPlatform = "facebook" | "instagram" | "twitter" | "linkedin" | "tiktok" | "youtube";

interface SocialMediaInputProps {
  value: Record<SocialPlatform, string>;
  onChange: (value: Record<SocialPlatform, string>) => void;
}

interface PlatformConfig {
  name: string;
  icon: IconDefinition;
  color: string;
  placeholder: string;
  urlPattern: RegExp;
}

const PLATFORMS: Record<SocialPlatform, PlatformConfig> = {
  facebook: {
    name: "Facebook",
    icon: faFacebook,
    color: "text-white",
    placeholder: "https://facebook.com/empresa",
    urlPattern: /^https?:\/\/(www\.)?(facebook|fb)\.com\/.+/i,
  },
  instagram: {
    name: "Instagram",
    icon: faInstagram,
    color: "text-white",
    placeholder: "https://instagram.com/empresa",
    urlPattern: /^https?:\/\/(www\.)?instagram\.com\/.+/i,
  },
  twitter: {
    name: "Twitter/X",
    icon: faXTwitter,
    color: "text-white",
    placeholder: "https://x.com/empresa",
    urlPattern: /^https?:\/\/(www\.)?(twitter|x)\.com\/.+/i,
  },
  linkedin: {
    name: "LinkedIn",
    icon: faLinkedin,
    color: "text-white",
    placeholder: "https://linkedin.com/company/empresa",
    urlPattern: /^https?:\/\/(www\.)?linkedin\.com\/.+/i,
  },
  tiktok: {
    name: "TikTok",
    icon: faTiktok,
    color: "text-white",
    placeholder: "https://tiktok.com/@empresa",
    urlPattern: /^https?:\/\/(www\.)?tiktok\.com\/@.+/i,
  },
  youtube: {
    name: "YouTube",
    icon: faYoutube,
    color: "text-white",
    placeholder: "https://youtube.com/@empresa",
    urlPattern: /^https?:\/\/(www\.)?youtube\.com\/.+/i,
  },
};

export const SocialMediaInput: React.FC<SocialMediaInputProps> = ({ value, onChange }) => {
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatform | null>(null);
  const [tempUrl, setTempUrl] = useState("");
  const [urlError, setUrlError] = useState("");

  const availablePlatforms = (Object.keys(PLATFORMS) as SocialPlatform[]).filter((platform) => !value[platform]);
  const activePlatforms = (Object.keys(PLATFORMS) as SocialPlatform[]).filter((platform) => value[platform]);

  const handleAddPlatform = (platform: SocialPlatform) => {
    setSelectedPlatform(platform);
    setTempUrl("");
    setUrlError("");
  };

  const handleSavePlatform = () => {
    if (!selectedPlatform) return;

    const trimmedUrl = tempUrl.trim();
    if (!trimmedUrl) {
      setUrlError("La URL no puede estar vacía");
      return;
    }

    const config = PLATFORMS[selectedPlatform];
    if (!config.urlPattern.test(trimmedUrl)) {
      setUrlError(`URL inválida para ${config.name}`);
      return;
    }

    onChange({
      ...value,
      [selectedPlatform]: trimmedUrl,
    });

    setSelectedPlatform(null);
    setTempUrl("");
    setUrlError("");
  };

  const handleCancelAdd = () => {
    setSelectedPlatform(null);
    setTempUrl("");
    setUrlError("");
  };

  const handleRemovePlatform = (platform: SocialPlatform) => {
    const newValue = { ...value };
    newValue[platform] = "";
    onChange(newValue);
  };

  const handleEditPlatform = (platform: SocialPlatform) => {
    setSelectedPlatform(platform);
    setTempUrl(value[platform]);
    setUrlError("");
  };

  return (
    <div className="space-y-4">
      {/* Plataformas activas */}
      {activePlatforms.length > 0 && (
        <div className="space-y-2">
          {activePlatforms.map((platform) => {
            const config = PLATFORMS[platform];
            const isEditing = selectedPlatform === platform;

            return (
              <div key={platform} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 transition-all">
                <FontAwesomeIcon icon={config.icon} className={`h-5 w-5 mt-0.5 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-1">
                        <input type="url" value={tempUrl} onChange={(e) => setTempUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSavePlatform()} className="input-field text-sm" placeholder={config.placeholder} autoFocus />
                        {urlError && <p className="text-xs text-red-500 dark:text-red-400">{urlError}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={handleSavePlatform} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Guardar">
                          <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={handleCancelAdd} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Cancelar">
                          <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{config.name}</div>
                        <a href={value[platform]} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-primary-600 dark:text-primary-400 hover:underline flex items-center gap-1 truncate">
                          <span className="truncate">{value[platform]}</span>
                          <FontAwesomeIcon icon={faExternalLink} className="h-3 w-3 flex-shrink-0" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => handleEditPlatform(platform)} className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors text-xs font-medium whitespace-nowrap" title="Editar">
                          Editar
                        </button>
                        <button type="button" onClick={() => handleRemovePlatform(platform)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Eliminar">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Agregar nueva plataforma - Solo si no hay una en edición */}
      {!selectedPlatform && availablePlatforms.length > 0 && (
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded p-4">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Agregar red social</div>
          <div className="flex flex-wrap gap-2">
            {availablePlatforms.map((platform) => {
              const config = PLATFORMS[platform];
              return (
                <button key={platform} type="button" onClick={() => handleAddPlatform(platform)} className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-300 dark:hover:border-primary-700 transition-all text-sm">
                  <FontAwesomeIcon icon={config.icon} className={`h-4 w-4 ${config.color}`} />
                  <span className="text-gray-700 dark:text-gray-300">{config.name}</span>
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3 text-gray-400" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulario de nueva plataforma - Cuando se selecciona agregar */}
      {selectedPlatform && !value[selectedPlatform] && (
        <div className="p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded">
          <div className="flex items-center gap-2 mb-3">
            <FontAwesomeIcon icon={PLATFORMS[selectedPlatform].icon} className="h-5 w-5 text-white" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">{PLATFORMS[selectedPlatform].name}</span>
          </div>
          <div className="flex items-start gap-2">
            <div className="flex-1 space-y-1">
              <input type="url" value={tempUrl} onChange={(e) => setTempUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSavePlatform()} className="input-field text-sm" placeholder={PLATFORMS[selectedPlatform].placeholder} autoFocus />
              {urlError && <p className="text-xs text-red-500 dark:text-red-400">{urlError}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleSavePlatform} className="p-2 h-10 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors" title="Guardar">
                <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
              </button>
              <button type="button" onClick={handleCancelAdd} className="p-2 h-10 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Cancelar">
                <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {activePlatforms.length === 0 && !selectedPlatform && (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
          <p>No hay redes sociales configuradas</p>
          <p className="text-xs mt-1">Haz clic en una plataforma para agregar</p>
        </div>
      )}
    </div>
  );
};
