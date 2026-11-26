import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import React, { useEffect } from "react";
import { createPortal } from "react-dom";

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

/*
  EL BLOQUEO DEL SCROLL DEL BODY, CON CONTADOR (26/11/2026).

  Cada modal guardaba el `overflow` que encontraba al correr su efecto y lo devolvía al cerrarse. Un
  modal que corre su efecto MIENTRAS otro está abierto —se monta adentro de él, o al lado en el mismo
  render, o se abre con una hoja del móvil abierta— guarda "hidden" y lo devuelve más tarde: el body
  queda bloqueado y la página no scrollea más, sin ningún modal a la vista.

  Con un contador de modales abiertos, el scroll se devuelve cuando se cierra el ÚLTIMO, y lo que se
  devuelve es lo que había antes del PRIMERO; un "hidden" encontrado al abrir nunca se guarda como
  «lo de antes». Lo mismo que hace `HojaModal` en el móvil.
*/
let modalesAbiertos = 0;
let overflowAntesDelPrimero = "";

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, size = "md", footer, zIndex = 50, customHeader }) => {
  useEffect(() => {
    if (!isOpen) return;
    if (modalesAbiertos === 0) overflowAntesDelPrimero = document.body.style.overflow === "hidden" ? "" : document.body.style.overflow;
    modalesAbiertos += 1;
    document.body.style.overflow = "hidden";
    return () => {
      modalesAbiertos -= 1;
      if (modalesAbiertos <= 0) {
        modalesAbiertos = 0;
        document.body.style.overflow = overflowAntesDelPrimero;
      }
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
        // `100svh` a secas se pasa: el contenedor de afuera tiene `p-2`, así que un panel de alto
        // completo deja el overlay 16px más largo que la pantalla y aparece un scroll de un renglón
        // que no lleva a ningún lado. Se le descuenta ese padding.
        return "max-w-[98vw] max-h-[calc(100svh-1rem)]";
      case "full":
        // 98vw, con tope: la tabla de Reportes tiene ~14 columnas y a 1600px quedaban márgenes
        // grandes al costado mientras el contenido scrolleaba en horizontal. El tope de 2200px es
        // para que en un monitor ultrawide no se estire hasta volverse incómoda de leer.
        return "max-w-[min(98vw,2200px)] h-[96svh]";
      default:
        return "max-w-2xl";
    }
  };

  const isFullscreen = size === "fullscreen" || size === "full";

  /*
    EN UN PORTAL, directo en <body>. Dibujado adentro de la página quedaba atrapado en el contexto de
    apilamiento de algún contenedor (las barras fijas de las bandejas, por ejemplo): con z-50 y todo,
    la barra superior (z-40) y los encabezados fijos le pasaban por encima a él y al overlay.
    El portal conserva el contexto de React; sólo cambia dónde vive en el DOM.
  */
  return createPortal(
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
    </div>,
    document.body,
  );
};
