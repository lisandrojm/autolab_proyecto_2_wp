import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faThumbtack, faThumbtackSlash, faTrash } from "@fortawesome/free-solid-svg-icons";
import { getImageUrl } from "../../utils/imageHelpers";

interface CardAction {
  icon: IconDefinition;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  variant?: "default" | "blue" | "success" | "warning";
  disabled?: boolean;
}

interface CardBadge {
  text: string;
  variant?: "default" | "success" | "warning" | "blue" | "info" | "green" | "social" | "purple";
  icon?: IconDefinition;
  className?: string;
}

interface CardAvatar {
  src?: string;
  fallback: string;
  alt?: string;
}

/** Breadcrumbs */
type CrumbProps = {
  icon?: IconDefinition;
  text?: string;
  /** Estilo visual del crumb. Por defecto: "gray" para el primero y "blue" para el segundo */
  variant?: "gray" | "blue";
};
type BreadcrumbsProps = {
  first?: CrumbProps; // ej: Proyecto
  second?: CrumbProps; // ej: Campaña
};

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  icon?: IconDefinition;
  avatar?: CardAvatar;
  badges?: CardBadge[];
  /** NUEVO: breadcrumbs debajo de los badges */
  breadcrumbs?: BreadcrumbsProps;
  /** Fijo: control de favorito/anclado */
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

interface CardFooterProps {
  leftContent?: React.ReactNode;
  actions?: CardAction[];
}

interface CardProps {
  header?: CardHeaderProps;
  children?: React.ReactNode;
  footer?: CardFooterProps;
  onClick?: () => void;
  className?: string;
  variant?: "default" | "create" | "highlight";
}

export const Card: React.FC<CardProps> = ({ header, children, footer, onClick, className = "", variant = "default" }) => {
  const getVariantClasses = () => {
    switch (variant) {
      case "create":
        return "border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 dark:hover:border-primary-400";
      case "highlight":
        return "ring-2 ring-primary-500 dark:ring-primary-400";
      default:
        return "shadow-sm hover:shadow-md";
    }
  };

  const getBadgeClasses = (badgeVariant: string = "default") => {
    switch (badgeVariant) {
      case "success":
        return "bg-blue-100/20 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "warning":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "blue":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "info":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "green":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "social":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "purple":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const getActionClasses = (actionVariant: string = "default") => {
    switch (actionVariant) {
      case "blue":
        return "hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400";
      case "success":
        return "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400";
      case "warning":
        return "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400";
      default:
        return "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400";
    }
  };

  const renderCrumb = (c: CrumbProps, position: "first" | "second") => {
    const variant = c.variant ?? (position === "first" ? "gray" : "blue");

    const wrap = variant === "blue" ? "flex items-center space-x-2 border-b pb-2 border-gray-700" : "flex items-center space-x-2 pt-1 border-gray-700";

    const dot = variant === "blue" ? "w-5 h-5 flex items-center justify-center" : "w-5 h-5 flex items-center justify-center";

    const textCls = variant === "blue" ? "text-xs font-medium truncate" : "text-xs font-medium truncate";

    const fallbackText = position === "first" ? "Proyecto" : "Campaña";

    return (
      <div className={wrap}>
        <div className={dot}>{c.icon ? <FontAwesomeIcon icon={c.icon} className="h-2.5 w-2.5 text-blue-500" /> : <span className="text-[10px] leading-none text-white font-semibold">{(c.text || fallbackText).charAt(0).toUpperCase()}</span>}</div>
        <span className={textCls}>{c.text || fallbackText}</span>
      </div>
    );
  };

  const renderBreadcrumbs = () => {
    const crumbs = header.breadcrumbs;
    if (!crumbs || (!crumbs.first && !crumbs.second)) return null;
    return (
      <div className="mt-2">
        <div className="space-y-2">
          {crumbs.first && renderCrumb(crumbs.first, "first")}
          {crumbs.second && renderCrumb(crumbs.second, "second")}
        </div>
      </div>
    );
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl transition-all duration-200 overflow-hidden min-h-[25svh] ${getVariantClasses()} ${onClick ? "cursor-pointer hover:scale-[1.02] hover:shadow-lg" : ""} ${className} h-full flex flex-col`} onClick={onClick}>
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Header + Content */}
        <div className="flex flex-col gap-2 h-full">
          {/* Header */}
          {header && (
            <div className="h-full flex flex-col">
              {/* Badges + Fav/Pin */}
              <div className="flex items-center space-x-2">
                <div className="flex flex-wrap gap-2 w-full justify-between">
                  {header.badges?.map((badge, index) => (
                    <span key={index} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium shadow-sm ${badge.className || getBadgeClasses(badge.variant)}`}>
                      {badge.icon && <FontAwesomeIcon icon={badge.icon} className="h-3 w-3" />}
                      <span>{badge.text}</span>
                    </span>
                  ))}
                </div>

                {header.onToggleFavorite && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      header.onToggleFavorite?.();
                    }}
                    className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title={header.favorite ? "Desanclar" : "Anclar"}
                  >
                    <FontAwesomeIcon icon={header.favorite ? faThumbtack : faThumbtackSlash} className={`h-4 w-4 ${header.favorite ? "text-blue-600 rotate-45" : "text-gray-400 hover:text--500"}`} />
                  </button>
                )}
              </div>

              {/* Breadcrumbs debajo de los badges */}
              {renderBreadcrumbs()}

              {/* Avatar/Icon + Title */}
              <div className="flex items-center space-x-3 flex-1 min-w-0 mt-2">
                {header.avatar && (
                  <div className="w-10 h-10 flex-shrink-0">
                    {header.avatar.src ? (
                      <img src={getImageUrl(header.avatar.src)} alt={header.avatar.alt || header.title} className="w-full h-full object-cover rounded-full border-2 border-gray-200 dark:border-gray-600" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-bold text-sm">{header.avatar.fallback}</span>
                      </div>
                    )}
                  </div>
                )}

                {header.icon && !header.avatar && (
                  <div className="flex-shrink-0">
                    <FontAwesomeIcon icon={header.icon} className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{header.title}</h3>
                  {header.subtitle && <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{header.subtitle}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          {children && <div className="space-y-3">{children}</div>}
        </div>
      </div>

      {/* Footer */}
      {footer && (footer.leftContent || (footer.actions && footer.actions.length > 0)) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex-1">{footer.leftContent}</div>
          {footer.actions && footer.actions.length > 0 && (
            <div className="flex items-center space-x-2">
              {footer.actions.map((action, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick(e);
                  }}
                  disabled={action.disabled}
                  className={`p-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${getActionClasses(action.variant)}`}
                  title={action.title}
                >
                  <FontAwesomeIcon icon={action.icon} className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
