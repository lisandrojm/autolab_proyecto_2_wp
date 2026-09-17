import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition, faArrowLeft, faCircleInfo, faSignOutAlt, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "../../../../stores/authStore";

interface SectionHeaderProps {
  icon: IconDefinition;
  titulo: string;
  subtitulo?: string;
  /** Qué se hace en esta sección, en dos o tres oraciones. Se abre con la «i» al lado del título. */
  info: string;
  /** Sin `onBack` no hay flecha: las vistas de la barra de abajo no tienen a dónde volver. */
  onBack?: () => void;
  /** Un botón extra dentro del info, para lo que la sección ya tenía (p. ej. los datos de vacaciones). */
  extra?: { label: string; onClick: () => void };
  /**
   * Acciones de la sección, al lado del título.
   *
   * Es para lo que se usa DESDE la sección y tiene que verse al entrar —la carga masiva de
   * Contratación, por ejemplo—. Va acá y no en un botón flotante porque el flotante ya es el «+»:
   * un segundo botón redondo al lado compite con él y termina leyéndose como un adorno.
   *
   * Se dibuja pegado a la «i» y no contra el borde derecho: las dos cosas son de la sección, y a la
   * derecha del todo está «salir», que es de la app. Con el título truncado, la acción no se corre.
   */
  acciones?: React.ReactNode;
}

/**
 * EL ENCABEZADO DE TODAS LAS SECCIONES DEL MÓVIL.
 *
 * Volver a la izquierda, título con su «i» y salir de la aplicación en rojo a la derecha. Antes cada
 * vista tenía su propio encabezado copiado —con pequeñas diferencias— y ninguna dejaba salir sin volver
 * al inicio. La «i» explica qué se hace ahí: el que entra por primera vez no tiene a quién preguntar.
 */
export default function SectionHeader({ icon, titulo, subtitulo, info, onBack, extra, acciones }: SectionHeaderProps) {
  const { logout } = useAuthStore();
  const [verInfo, setVerInfo] = useState(false);

  const salir = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-slate-800 bg-slate-50/90 px-4 py-4 backdrop-blur-sm dark:bg-slate-900/90">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {onBack && (
              <button onClick={onBack} aria-label="Volver" className="flex h-10 w-10 shrink-0 items-center justify-center rounded transition-colors hover:bg-slate-200 dark:hover:bg-slate-800">
                <FontAwesomeIcon icon={faArrowLeft} className="h-5 w-5 text-slate-900 dark:text-slate-100" />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={icon} className="h-5 w-5 shrink-0 text-slate-900 dark:text-slate-100" />
                <h1 className="truncate text-xl font-bold text-slate-900 dark:text-slate-100">{titulo}</h1>
                <button onClick={() => setVerInfo(true)} aria-label={`Qué se hace en ${titulo}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-300 dark:text-slate-400">
                  <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
                </button>
                {acciones}
              </div>
              {subtitulo && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{subtitulo}</p>}
            </div>
          </div>
          <button onClick={salir} aria-label="Cerrar sesión" className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-red-600 transition-colors hover:text-gray-800 dark:text-red-400 dark:hover:text-gray-300">
            <FontAwesomeIcon icon={faSignOutAlt} className="h-5 w-5" />
          </button>
        </div>
      </div>

      {verInfo && (
        // Centrado en la pantalla: pegado abajo se confundía con la barra de navegación.
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setVerInfo(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                <FontAwesomeIcon icon={icon} className="h-4 w-4" /> {titulo}
              </p>
              <button onClick={() => setVerInfo(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded text-slate-500">
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-300">{info}</p>
              {extra && (
                <button
                  onClick={() => {
                    setVerInfo(false);
                    extra.onClick();
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                >
                  {extra.label}
                </button>
              )}
              <button onClick={() => setVerInfo(false)} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
