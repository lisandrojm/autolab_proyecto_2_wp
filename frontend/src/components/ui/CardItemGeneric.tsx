import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface CardItemAction {
  icon: IconDefinition;
  onClick: (e?: React.MouseEvent) => void;
  title?: string;
  variant?: "default" | "danger";
}

interface CardItemGenericProps {
  title: string;
  subtitle?: string | React.ReactNode;
  avatarUrl?: string | null;
  avatarFallback?: string;
  badgesTop?: React.ReactNode[];
  badgesBottom?: React.ReactNode[];
  children?: React.ReactNode;
  footerLeft?: React.ReactNode;
  footerActions?: CardItemAction[];
  onClick?: () => void;
  className?: string;
}

export const CardItemGeneric: React.FC<CardItemGenericProps> = ({ title, subtitle, avatarUrl, avatarFallback = "?", badgesTop = [], badgesBottom = [], children, footerLeft, footerActions = [], onClick, className = "" }) => {
  const getActionClasses = (variant: string = "default") => {
    switch (variant) {
      case "danger":
        return "hover:text-gray-800 dark:hover:text-gray-300 text-red-600 dark:text-red-400";
      default:
        return "hover:text-gray-800 dark:hover:text-gray-300 text-gray-600 dark:text-gray-400";
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${onClick ? "cursor-pointer hover:scale-[1.01]" : ""} ${className} h-full flex flex-col`} onClick={onClick}>
      <div className="p-4 flex-1 flex flex-col gap-3">
        {/* Badges Top */}
        {badgesTop.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {badgesTop.map((badge, index) => (
              <React.Fragment key={index}>{badge}</React.Fragment>
            ))}
          </div>
        )}

        {/* Avatar + Title + Subtitle */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 flex-shrink-0">
            {avatarUrl ? (
              <img src={`${import.meta.env.VITE_API_URL}${avatarUrl}`} alt={title} className="w-full h-full object-cover rounded border-2 border-gray-200 dark:border-gray-600" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">{avatarFallback}</span>
              </div>
            )}
          </div>

          {/* Title + Subtitle */}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{subtitle}</p>}
          </div>
        </div>

        {/* Badges Bottom */}
        {badgesBottom.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badgesBottom.map((badge, index) => (
              <React.Fragment key={index}>{badge}</React.Fragment>
            ))}
          </div>
        )}

        {/* Content (children) */}
        {children && <div className="space-y-3 mt-2">{children}</div>}
      </div>

      {/* Footer */}
      {(footerLeft || footerActions.length > 0) && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex-1">{footerLeft}</div>

          {footerActions.length > 0 && (
            <div className="flex items-center space-x-2">
              {footerActions.map((action, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation();
                    action.onClick(e);
                  }}
                  className={`p-1 rounded transition-colors ${getActionClasses(action.variant)}`}
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
