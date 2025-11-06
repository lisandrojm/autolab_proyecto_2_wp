import React from "react";
import { Instagram, Facebook, Twitter, Linkedin, Youtube, Send } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTiktok } from "@fortawesome/free-brands-svg-icons";
import { sweetAlert } from "../../utils/sweetAlert";

interface PlatformPreviewProps {
  platform: string;
  content: {
    copy: string;
    hashtags: string[];
    mentions: string[];
  };
  images: string[];
  title: string;
}

const PlatformIcon: React.FC<{ platform: string }> = ({ platform }) => {
  const iconClass = "h-5 w-5";
  switch (platform.toLowerCase()) {
    case "instagram":
      return <Instagram className={iconClass} />;
    case "facebook":
      return <Facebook className={iconClass} />;
    case "twitter":
      return <Twitter className={iconClass} />;
    case "linkedin":
      return <Linkedin className={iconClass} />;
    case "youtube":
      return <Youtube className={iconClass} />;
    case "tiktok":
      return <FontAwesomeIcon icon={faTiktok} className={iconClass} />;
    default:
      return <Instagram className={iconClass} />;
  }
};

export const PlatformPreview: React.FC<PlatformPreviewProps> = ({ platform, content, images, title }) => {
  const formatContent = () => {
    let text = content.copy;
    if (content.hashtags.length > 0) {
      text += "\n\n" + content.hashtags.map((h) => `#${h}`).join(" ");
    }
    if (content.mentions.length > 0) {
      text += "\n" + content.mentions.map((m) => `@${m}`).join(" ");
    }
    return text;
  };

  const getCharacterLimit = () => {
    switch (platform.toLowerCase()) {
      case "twitter":
        return 280;
      case "instagram":
        return 2200;
      case "facebook":
        return 63206;
      case "linkedin":
        return 3000;
      case "tiktok":
        return 2200;
      default:
        return 2200;
    }
  };

  const handlePublish = async () => {
    const result = await sweetAlert.confirm(`¿Publicar en ${platform}?`, "Esta acción publicará el post inmediatamente en esta plataforma");

    if (result.isConfirmed) {
      sweetAlert.success("Post publicado", `El post ha sido publicado en ${platform}`);
    }
  };

  const formattedContent = formatContent();
  const charLimit = getCharacterLimit();
  const isOverLimit = formattedContent.length > charLimit;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Platform Header */}
      <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="text-gray-700 dark:text-gray-300">
          <PlatformIcon platform={platform} />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-sm text-gray-900 dark:text-white capitalize">{platform}</h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">Vista previa</p>
        </div>
        <div className={`text-xs font-medium ${isOverLimit ? "text-red-600" : "text-gray-500 dark:text-gray-400"}`}>
          {formattedContent.length}/{charLimit}
        </div>
        <button onClick={handlePublish} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shadow-sm" title={`Publicar en ${platform}`}>
          <Send className="h-3.5 w-3.5" />
          Publicar
        </button>
      </div>

      {/* Preview Content */}
      <div className="p-4">
        {/* Profile mockup */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-primary-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">U</div>
          <div>
            <p className="font-semibold text-sm text-gray-900 dark:text-white">Usuario</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Hace unos momentos</p>
          </div>
        </div>

        {/* Post Content */}
        {formattedContent && (
          <div className="mb-3">
            <p className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap break-words">
              {formattedContent.slice(0, 200)}
              {formattedContent.length > 200 && <span className="text-gray-500 dark:text-gray-400">... ver más</span>}
            </p>
          </div>
        )}

        {/* Images Preview */}
        {images.length > 0 && (
          <div className={`rounded-lg overflow-hidden ${images.length === 1 ? "" : "grid grid-cols-2 gap-1"}`}>
            {images.slice(0, 4).map((img, idx) => (
              <div key={idx} className="relative bg-gray-100 dark:bg-gray-700" style={{ paddingBottom: images.length === 1 ? "100%" : "100%" }}>
                <img src={img} alt={`Preview ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" />
                {idx === 3 && images.length > 4 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">+{images.length - 4}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Platform-specific engagement mockup */}
        <div className="flex items-center gap-6 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          {platform.toLowerCase() === "instagram" && (
            <>
              <button className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
              <button className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
              <button className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </>
          )}
          {platform.toLowerCase() === "facebook" && (
            <>
              <span className="text-xs text-gray-600 dark:text-gray-400">👍 Me gusta</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">💬 Comentar</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">↗️ Compartir</span>
            </>
          )}
          {platform.toLowerCase() === "twitter" && (
            <>
              <span className="text-xs text-gray-600 dark:text-gray-400">💬 Responder</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">🔄 Retweet</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">❤️ Me gusta</span>
            </>
          )}
          {platform.toLowerCase() === "linkedin" && (
            <>
              <span className="text-xs text-gray-600 dark:text-gray-400">👍 Recomendar</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">💬 Comentar</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">↗️ Compartir</span>
            </>
          )}
        </div>

        {/* Warnings */}
        {isOverLimit && (
          <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-xs text-red-600 dark:text-red-400">⚠️ El contenido excede el límite de caracteres para {platform}</p>
          </div>
        )}
        {images.length === 0 && (
          <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-600 dark:text-blue-400">ℹ️ Este post no tiene imágenes</p>
          </div>
        )}
      </div>
    </div>
  );
};

export const PlatformPreviewGrid: React.FC<{
  platforms: string[];
  content: { copy: string; hashtags: string[]; mentions: string[] };
  images: string[];
  title: string;
}> = ({ platforms, content, images, title }) => {
  if (platforms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 dark:bg-gray-900 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700">
        <div className="text-center">
          <p className="text-gray-500 dark:text-gray-400 mb-2">Selecciona al menos una plataforma</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">para ver la vista previa</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {platforms.map((platform) => (
        <PlatformPreview key={platform} platform={platform} content={content} images={images} title={title} />
      ))}
    </div>
  );
};
