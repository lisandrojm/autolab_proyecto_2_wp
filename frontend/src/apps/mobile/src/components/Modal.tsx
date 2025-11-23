import React from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "fullscreen";
  footer?: React.ReactNode;
  zIndex?: number;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  size = "md",
  footer,
  zIndex = 50
}) => {
  if (!isOpen) return null;

  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "max-w-md";
      case "lg":
        return "max-w-4xl";
      case "xl":
        return "max-w-6xl";
      case "fullscreen":
        return "max-w-[98vw] h-[95vh]";
      default:
        return "max-w-2xl";
    }
  };

  const isFullscreen = size === "fullscreen";

  return (
    <div className="fixed inset-0 overflow-y-auto" style={{ zIndex }}>
      <div className={`flex min-h-screen items-center justify-center ${isFullscreen ? 'p-2' : 'p-4'}`}>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm transition duration-200"
          onClick={onClose}
        />

        {/* Panel */}
        <div
          className={`relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full ${getSizeClasses()} ${
            isFullscreen ? 'overflow-hidden flex flex-col' : 'max-h-[95vh] overflow-y-auto'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-600/50 dark:border-slate-700 bg-white dark:bg-slate-800 sticky top-0 z-50">
            <div>
              <h2 id="modal-title" className="text-xl font-bold text-slate-900 dark:text-white">
                {title}
              </h2>
              {subtitle && (
                typeof subtitle === 'string' ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    {subtitle}
                  </p>
                ) : (
                  <div className="mt-1">{subtitle}</div>
                )
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            </button>
          </div>

          {/* Content */}
          <div className={isFullscreen ? 'flex-1 overflow-hidden' : 'p-6'}>
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="flex items-center justify-end space-x-3 p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 sticky bottom-0 z-50">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
