import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import React, { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "95" | "fullscreen" | "full";
  footer?: React.ReactNode;
  zIndex?: number;
  customHeader?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, size = "md", footer, zIndex = 50, customHeader }) => {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;

    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = originalOverflow;
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);
  if (!isOpen) return null;

  const titleId = "modal-title";
  const subtitleId = subtitle ? "modal-subtitle" : undefined;

  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "max-w-md";
      case "lg":
        return "max-w-4xl";
      case "xl":
        return "max-w-6xl";
      case "95":
        return "max-w-[95vw]";
      case "fullscreen":
        return "max-w-[98vw] max-h-svh";
      case "full":
        return "max-w-[1600px] h-[96svh]";
      default:
        return "max-w-2xl";
    }
  };

  const isFullscreen = size === "fullscreen" || size === "full";

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ zIndex }}>
      <div className={`flex min-h-screen items-center justify-center ${size === "full" ? "p-4" : isFullscreen ? "p-2" : "p-4"}`}>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition duration-200 z-[1]" onClick={onClose} />

        {/* Panel */}
        <div className={`relative z-[2] bg-white dark:bg-gray-800 shadow-xl w-full ${getSizeClasses()} overflow-hidden flex flex-col ${size === "full" ? "rounded-xl" : "rounded-2xl"} ${!isFullscreen ? "max-h-[90vh]" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitleId} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          {customHeader ? (
            customHeader
          ) : (
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-50">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="text-xl font-bold text-gray-900 dark:text-white truncate">
                  {title}
                </h2>
                {subtitle &&
                  (typeof subtitle === "string" ? (
                    <p id={subtitleId} className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                      {subtitle}
                    </p>
                  ) : (
                    <div id={subtitleId} className="mt-1">
                      {subtitle}
                    </div>
                  ))}
              </div>
              <button onClick={onClose} className="ml-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors shrink-0" aria-label="Cerrar modal" title="Cerrar">
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Content */}
          <div className={`flex-1 overflow-y-auto ${!isFullscreen ? "p-6 pt-4" : ""}`}>{children}</div>

          {/* Footer */}
          {footer && <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky bottom-0 z-50">{footer}</div>}
        </div>
      </div>
    </div>
  );
};
