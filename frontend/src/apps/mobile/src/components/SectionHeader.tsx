import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition, faArrowLeft, faCircleInfo, faSignOutAlt } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "../../../../stores/authStore";
import { ModalInfo } from "./ModalInfo";

interface SectionHeaderProps {
  icon: IconDefinition;
  titulo: string;
  subtitulo?: string;
  /** Qué se hace en esta sección, en dos o tres oraciones. Se abre con la «i» al lado del título. */
  info: string;
  /**
   * Sin `onBack` no hay flecha. Hoy la llevan TODAS las secciones, incluidas las de la barra de
   * abajo: técnicamente no se «entra» a ellas desde ningún lado, pero sin la flecha la pantalla se lee
   * a medio hacer, y volver al inicio es lo que se espera al tocarla.
   */
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

      {/* El mismo modal que usa cualquier «i» de la app: vive en ModalInfo.tsx. */}
      {verInfo && <ModalInfo icono={icon} titulo={titulo} texto={info} extra={extra} onCerrar={() => setVerInfo(false)} />}
    </>
  );
}
