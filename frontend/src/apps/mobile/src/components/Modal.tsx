import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Texto, o un nodo cuando el encabezado lleva una acción al lado (igual que el modal del panel). */
  title: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "fullscreen";
  footer?: React.ReactNode;
  zIndex?: number;
  customHeader?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, size = "md", footer, zIndex = 50, customHeader }) => {
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
      case "fullscreen":
        return "max-w-[98vw] h-[95vh]";
      default:
        return "max-w-2xl";
    }
  };

  const isFullscreen = size === "fullscreen";

  /*
    UNA SOLA BARRA DE SCROLL.

    Había dos, una adentro de la otra: scrolleaba el contenedor de afuera (`fixed inset-0` con
    `overflow-y-auto`) Y el panel (`max-h-[95vh] overflow-y-auto`). Con 95vh de alto más el padding
    de 16px, el panel siempre superaba la pantalla por unos pocos píxeles, así que el contenedor
    externo también tenía algo que scrollear: dos barras al costado, y la rueda del mouse moviendo
    una u otra según dónde estuviera el puntero.

    Ahora el panel NO crece más que el espacio disponible (`max-h-full` dentro de un contenedor con
    el padding ya descontado) y el que scrollea es el cuerpo, no el panel entero. Efecto de arrastre
    buscado: el encabezado y el pie quedan fijos de verdad, por estructura y no por `sticky`.
  */
  return (
    <div className="fixed inset-0 overflow-hidden" style={{ zIndex }}>
      <div className={`flex h-full items-center justify-center ${isFullscreen ? "p-2" : "p-4"}`}>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 transition duration-200 h-vh" />

        {/* Panel */}
        <div className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full flex flex-col overflow-hidden ${getSizeClasses()} ${isFullscreen ? "" : "max-h-full"}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitleId}>
          {/* Header */}
          {customHeader ? (
            customHeader
          ) : (
            <div className="shrink-0 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 py-3">
              <div>
                <h2 id={titleId} className="text-xl font-bold text-gray-900 dark:text-white">
                  {title}
                </h2>
                {subtitle &&
                  (typeof subtitle === "string" ? (
                    <p id={subtitleId} className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {subtitle}
                    </p>
                  ) : (
                    <div id={subtitleId} className="mt-1">
                      {subtitle}
                    </div>
                  ))}
              </div>
              <button onClick={onClose} className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar modal" title="Cerrar">
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          )}

          {/* Content — el único que scrollea. `min-h-0` es lo que se lo permite: sin eso, un hijo
              flex no se encoge por debajo de su contenido y el scroll se vuelve a ir al panel. */}
          <div className={isFullscreen ? "flex-1 min-h-0 overflow-hidden" : "flex-1 min-h-0 overflow-y-auto p-6"}>{children}</div>

          {/* Footer — hermano del cuerpo, así que queda abajo sin necesidad de `sticky`. */}
          {footer && <div className="shrink-0 flex items-center justify-end space-x-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 py-3">{footer}</div>}
        </div>
      </div>
    </div>
  );
};
