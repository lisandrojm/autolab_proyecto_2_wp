import React from "react";
import { Mail, Bell, Share2, Instagram, Facebook, Linkedin, Music, Youtube, Twitter, FileText, Video, Circle, Film, Smartphone, BookOpen, List } from "lucide-react";
import { Channel, PostType, ContentFormat, Platform, CHANNEL_CATEGORIES, CONTENT_FORMATS, getChannelMetadata, getChannelDisplayName, buildChannelFromFormatAndPlatform, getCompatiblePlatforms, getPlatformMaxCharacters } from "../../types/post";

interface ChannelSelectorProps {
  selectedChannel: Channel | null;
  selectedChannels?: Channel[];
  onChannelSelect: (channel: Channel) => void;
  onMultiChannelSelect?: (channels: Channel[]) => void;
  postType?: PostType;
  selectedFormat?: ContentFormat | null;
  onFormatSelect?: (format: ContentFormat | null) => void;
  selectedPlatforms?: Platform[];
  onPlatformsSelect?: (platforms: Platform[]) => void;
}

const getCategoryIcon = (categoryKey: string) => {
  switch (categoryKey) {
    case "social":
      return <Share2 className="w-5 h-5" />;
    case "email":
      return <Mail className="w-5 h-5" />;
    case "push":
      return <Bell className="w-5 h-5" />;
    default:
      return <Share2 className="w-5 h-5" />;
  }
};

const getFormatIcon = (format: ContentFormat) => {
  switch (format) {
    case "post":
      return <FileText className="w-5 h-5" />;
    case "reel":
      return <Video className="w-5 h-5" />;
    case "story":
      return <Circle className="w-5 h-5" />;
    case "video":
      return <Film className="w-5 h-5" />;
    case "short":
      return <Smartphone className="w-5 h-5" />;
    case "article":
      return <BookOpen className="w-5 h-5" />;
    case "thread":
      return <List className="w-5 h-5" />;
    default:
      return <FileText className="w-5 h-5" />;
  }
};

const getPlatformIcon = (platform: Platform) => {
  switch (platform) {
    case "instagram":
      return <Instagram className="w-5 h-5" />;
    case "facebook":
      return <Facebook className="w-5 h-5" />;
    case "linkedin":
      return <Linkedin className="w-5 h-5" />;
    case "tiktok":
      return <Music className="w-5 h-5" />;
    case "youtube":
      return <Youtube className="w-5 h-5" />;
    case "twitter":
      return <Twitter className="w-5 h-5" />;
    default:
      return <Share2 className="w-5 h-5" />;
  }
};

const getPlatformName = (platform: Platform): string => {
  const names: Record<Platform, string> = {
    instagram: "Instagram",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    tiktok: "TikTok",
    youtube: "YouTube",
    twitter: "Twitter/X",
  };
  return names[platform] || platform;
};

export const ChannelSelector: React.FC<ChannelSelectorProps> = ({ selectedChannel, selectedChannels = [], onChannelSelect, onMultiChannelSelect, postType, selectedFormat, onFormatSelect, selectedPlatforms = [], onPlatformsSelect }) => {
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(() => {
    if (postType === "social") return "social";
    if (postType === "email") return "email";
    if (postType === "push") return "push";
    if (selectedFormat || (selectedPlatforms && selectedPlatforms.length > 0)) return "social";
    return null;
  });
  const [internalFormat, setInternalFormat] = React.useState<ContentFormat | null>(selectedFormat || null);
  const [internalPlatforms, setInternalPlatforms] = React.useState<Platform[]>(selectedPlatforms);

  React.useEffect(() => {
    const hasFormat = selectedFormat !== undefined && selectedFormat !== null;
    const hasPlatforms = selectedPlatforms && selectedPlatforms.length > 0;

    if (hasFormat) {
      setInternalFormat(selectedFormat);
    }

    if (hasPlatforms) {
      setInternalPlatforms(selectedPlatforms);
    }

    if (postType === "social" || hasFormat || hasPlatforms) {
      setSelectedCategory("social");
    } else if (postType === "email") {
      setSelectedCategory("email");
    } else if (postType === "push") {
      setSelectedCategory("push");
    }
  }, [selectedFormat, selectedPlatforms, postType]);

  const handleCategorySelect = (categoryKey: string) => {
    setSelectedCategory(categoryKey);

    if (categoryKey === "email") {
      setInternalFormat(null);
      setInternalPlatforms([]);
      onChannelSelect("email");
      if (onFormatSelect) {
        onFormatSelect(null);
      }
      if (onPlatformsSelect) {
        onPlatformsSelect([]);
      }
    } else if (categoryKey === "push") {
      setInternalFormat(null);
      setInternalPlatforms([]);
      onChannelSelect("push_notification");
      if (onFormatSelect) {
        onFormatSelect(null);
      }
      if (onPlatformsSelect) {
        onPlatformsSelect([]);
      }
    } else if (categoryKey === "social") {
      onChannelSelect("instagram_post" as Channel);
    }
  };

  const handleFormatSelect = (format: ContentFormat) => {
    const isChangingFormat = internalFormat !== null && internalFormat !== format;

    setInternalFormat(format);

    if (isChangingFormat) {
      setInternalPlatforms([]);
      if (onPlatformsSelect) {
        onPlatformsSelect([]);
      }
    }

    if (onFormatSelect) {
      onFormatSelect(format);
    }
  };

  const handlePlatformToggle = (platform: Platform) => {
    const newPlatforms = internalPlatforms.includes(platform) ? internalPlatforms.filter((p) => p !== platform) : [...internalPlatforms, platform];

    setInternalPlatforms(newPlatforms);

    if (onPlatformsSelect) {
      onPlatformsSelect(newPlatforms);
    }

    if (onMultiChannelSelect && internalFormat) {
      const channels = newPlatforms.map((p) => buildChannelFromFormatAndPlatform(internalFormat, p)).filter(Boolean) as Channel[];
      onMultiChannelSelect(channels);
    }
  };

  const compatiblePlatforms = internalFormat ? getCompatiblePlatforms(internalFormat) : [];
  const maxCharLimit = internalPlatforms.length > 0 ? getPlatformMaxCharacters(internalPlatforms) : null;

  const handleRemoveCategory = () => {
    setSelectedCategory(null);
    setInternalFormat(null);
    setInternalPlatforms([]);
    if (onFormatSelect) {
      onFormatSelect(null);
    }
    if (onPlatformsSelect) {
      onPlatformsSelect([]);
    }
  };

  const handleRemoveFormat = () => {
    setInternalFormat(null);
    setInternalPlatforms([]);
    if (onFormatSelect) {
      onFormatSelect(null);
    }
    if (onPlatformsSelect) {
      onPlatformsSelect([]);
    }
  };

  const handleRemovePlatform = (platform: Platform) => {
    const newPlatforms = internalPlatforms.filter((p) => p !== platform);
    setInternalPlatforms(newPlatforms);
    if (onPlatformsSelect) {
      onPlatformsSelect(newPlatforms);
    }
  };

  const renderBreadcrumb = () => {
    if (!selectedCategory) return null;

    const categoryName = CHANNEL_CATEGORIES[selectedCategory]?.name || selectedCategory;

    return (
      <div className="p-2 bg-white dark:bg-gray-800 border-b  border-gray-200 dark:border-gray-700 sticky -top-6 z-50 border-6">
        <div className="flex items-center gap-2 flex-wrap">
          {selectedCategory === "social" && (
            <>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-white dark:text-blue-300 rounded-md text-sm font-medium shadow-sm border border-blue-300">{categoryName}</span>
              {internalFormat && (
                <>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-white dark:text-blue-300 rounded-md text-sm font-medium shadow-sm border border-blue-300">{CONTENT_FORMATS[internalFormat]?.name || internalFormat}</span>
                </>
              )}

              {internalPlatforms.length > 0 && (
                <>
                  <div className="flex gap-1.5 flex-wrap">
                    {internalPlatforms.map((platform) => (
                      <span key={platform} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-white dark:text-blue-300 rounded-md text-sm font-medium shadow-sm border border-blue-300">
                        {getPlatformName(platform)}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {(selectedCategory === "email" || selectedCategory === "push") && <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 text-white dark:text-blue-300 rounded-md text-sm font-medium shadow-sm border border-blue-300">{categoryName}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderBreadcrumb()}
      <div className="px-2">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Tipo de Publicación</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(CHANNEL_CATEGORIES).map(([key, category]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleCategorySelect(key)}
              className={`
                p-4 rounded border-2 transition-all duration-200
                flex flex-col items-center gap-2 text-center
                ${selectedCategory === key ? "border-blue-300 bg-blue-50 dark:bg-blue-900/30 shadow-lg ring-2 ring-blue-300 dark:ring-blue-700 scale-[1.01]" : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-300 hover:shadow-md"}
              `}
            >
              <div
                className={`
                ${selectedCategory === key ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"}
              `}
              >
                {getCategoryIcon(key)}
              </div>
              <div>
                <div
                  className={`
                  font-medium text-sm
                  ${selectedCategory === key ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}
                `}
                >
                  {category.name}
                </div>
                {category.description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{category.description}</div>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedCategory === "social" && (
        <>
          <div className="px-2">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Selecciona el Formato de Contenido</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(CONTENT_FORMATS).map(([key, formatData]) => {
                const format = key as ContentFormat;
                const isSelected = internalFormat === format;

                return (
                  <button
                    key={format}
                    type="button"
                    onClick={() => handleFormatSelect(format)}
                    className={`
                      p-4 rounded border-2 transition-all duration-200
                      flex flex-col items-center gap-2 text-center min-h-[140px]
                      ${isSelected ? "border-blue-300 bg-blue-50 dark:bg-blue-900/30 shadow-lg ring-2 ring-blue-300 dark:ring-blue-700 scale-[1.01]" : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-300 hover:shadow-md"}
                    `}
                  >
                    <div
                      className={`
                      ${isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"}
                    `}
                    >
                      {getFormatIcon(format)}
                    </div>
                    <div className="w-full">
                      <div
                        className={`
                        font-semibold text-sm
                        ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}
                      `}
                      >
                        {formatData.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatData.description}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {formatData.platforms.length} plataforma{formatData.platforms.length > 1 ? "s" : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {internalFormat && (
            <div className="px-2">
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Selecciona las Plataformas (múltiple)</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {compatiblePlatforms.map((platform) => {
                  const isSelected = internalPlatforms.includes(platform);

                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => handlePlatformToggle(platform)}
                      className={`
                        p-4 rounded border-2 transition-all duration-200
                        flex items-center gap-3 text-left
                        ${isSelected ? "border-blue-300 bg-blue-50 dark:bg-blue-900/30 shadow-lg ring-2 ring-blue-300 dark:ring-blue-700 scale-[1.01]" : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-300 hover:shadow-md"}
                      `}
                    >
                      <div
                        className={`
                        flex-shrink-0
                        ${isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"}
                      `}
                      >
                        {getPlatformIcon(platform)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`
                          font-semibold text-sm
                          ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}
                        `}
                        >
                          {getPlatformName(platform)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
