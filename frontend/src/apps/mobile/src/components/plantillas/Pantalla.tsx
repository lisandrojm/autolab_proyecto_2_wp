import React, { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCheck, faChevronRight, faCircleExclamation, faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
import { usePlantillas } from "./contexto";

/*
  EL ESQUELETO DE CADA PANTALLA DE PLANTILLAS.

  Arriba: Atrás + título + contexto («Sábado noche · Equipo Técnica · La Nación | LN+») y el estado del
  guardado automático. Abajo, fijo: UN solo botón principal, con verbo y conteo. Si está deshabilitado,
  debajo dice qué falta, y tocarlo lleva a completarlo.

  ATRÁS vuelve a la pantalla anterior de la app (el historial del navegador). Si se entró directo por
  la URL (recargada o compartida) no hay anterior: va a `atras`, el padre en la jerarquía.
*/

export interface BotonPrincipal {
  texto: string;
  onClick: () => void;
  deshabilitado?: boolean;
  /** Qué falta para poder tocarlo. */
  motivo?: string;
  /** Llevar a lo que falta. */
  onMotivo?: () => void;
  cargando?: boolean;
  tono?: "azul" | "verde";
}

interface Props {
  titulo: string;
  contexto?: string;
  /** El padre en la jerarquía, para cuando no hay pantalla anterior en el historial. */
  atras: string | { pathname: string; state?: any };
  children: React.ReactNode;
  boton?: BotonPrincipal;
  /** Lo que va debajo del botón (ej. «Se envían todas juntas…»). */
  notaBoton?: string;
  /** Guardar y recuperar la posición del scroll al volver (se habilita cuando el contenido ya está). */
  listo?: boolean;
  /** Un pie propio en vez del botón principal (ej. «‹ Puesto anterior / Puesto siguiente ›»). */
  pie?: React.ReactNode;
  /** Atrás va siempre a `atras` (ej. después de enviar, no se vuelve a la revisión). */
  atrasFijo?: boolean;
  /**
   * LO QUE SE VA NOMBRANDO, en el encabezado.
   *
   * Un formulario largo se scrollea, y a la cuarta pantalla ya no se ve cómo se llamó el grupo ni el
   * equipo que se está armando. Como el encabezado está fijo, el nombre viaja con él.
   *
   * Los vacíos se descartan: aparecen a medida que se escriben.
   */
  chips?: (string | undefined | null)[];
}

const claveScroll = (path: string) => `plantillas:scroll:${path}`;

/**
 * CUÁNTO MIDE EL ENCABEZADO, para lo que quiera quedar pegado JUSTO DEBAJO.
 *
 * Sin saberlo, una sección `sticky` se pega al borde de la ventana y el encabezado se le monta
 * encima. Era un número fijo (61), y dejó de servir apenas el encabezado pasó a tener chips: con dos
 * renglones más, el rótulo pegado quedaba tapado.
 *
 * Ahora se MIDE y se publica como variable CSS en la pantalla, así que cualquier alto funciona y
 * nadie tiene que mantener una constante sincronizada con un padding. El 61 queda de respaldo por si
 * se lee antes del primer render.
 */
export const TOPE_PEGADO = "var(--alto-encabezado, 61px)";

export function Pantalla({ titulo, contexto, atras, children, boton, notaBoton, listo = true, pie, atrasFijo, chips }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { estado } = usePlantillas();
  const encabezado = useRef<HTMLElement>(null);
  const raiz = useRef<HTMLDivElement>(null);

  // El alto real del encabezado, publicado para las secciones que se pegan debajo (ver TOPE_PEGADO).
  useLayoutEffect(() => {
    const el = encabezado.current;
    const root = raiz.current;
    if (!el || !root) return;
    const medir = () => root.style.setProperty("--alto-encabezado", `${el.offsetHeight}px`);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const volver = () => {
    // react-router guarda en `history.state.idx` cuántas pantallas de la app hay detrás.
    if (!atrasFijo && (window.history.state?.idx ?? 0) > 0) navigate(-1);
    else if (typeof atras === "string") navigate(atras, { replace: true });
    else navigate(atras.pathname, { replace: true, state: atras.state });
  };

  // El scroll como estaba al volver.
  useLayoutEffect(() => {
    if (!listo) return;
    try {
      const y = Number(sessionStorage.getItem(claveScroll(location.pathname)) || 0);
      window.scrollTo(0, y);
    } catch {
      /* sin storage, arranca arriba */
    }
  }, [listo, location.pathname]);
  useEffect(() => {
    const guardar = () => {
      try {
        sessionStorage.setItem(claveScroll(location.pathname), String(window.scrollY));
      } catch {
        /* sin storage, no se recuerda */
      }
    };
    window.addEventListener("scroll", guardar, { passive: true });
    return () => window.removeEventListener("scroll", guardar);
  }, [location.pathname]);

  return (
    <div ref={raiz} className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-900">
      <header ref={encabezado} className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-2 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex items-center gap-2">
          <button type="button" onClick={volver} aria-label="Atrás" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          {/*
            EL TÍTULO Y EL PROYECTO, EN UN RENGLÓN.

            El proyecto iba debajo del título y el encabezado gastaba tres renglones —título,
            proyecto y chips— antes de que empezara el formulario. Al lado, el encabezado mide uno
            menos y el proyecto se sigue leyendo: es contexto, no un dato que haya que deletrear.

            El título no se achica (`shrink-0`) y el que se corta es el proyecto: entre «Nuevo
            equipo» y «La Nación | LN+», lo que no puede faltar es saber qué pantalla es.
          */}
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h1 className="shrink-0 text-base font-bold text-slate-900 dark:text-white">{titulo}</h1>
            {contexto && (
              <>
                {/* La barra separa el título del contexto: pegados se leían como un solo nombre largo. */}
                <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500" aria-hidden>
                  |
                </span>
                <p className="min-w-0 truncate text-xs text-slate-600 dark:text-slate-300">{contexto}</p>
              </>
            )}
          </div>
          <EstadoGuardado estado={estado} />
        </div>
        {(chips || []).some(Boolean) && (
          <div className="flex flex-wrap gap-1.5 px-1 pb-0.5 pt-1.5">
            {(chips || []).filter(Boolean).map((c) => (
              <span key={c as string} className="inline-flex max-w-full items-center truncate rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                {c}
              </span>
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 px-4 pb-6 pt-4">{children}</main>

      {pie && !boton && <footer className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-4 pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">{pie}</footer>}
      {boton && (
        <footer className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-4 pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            onClick={boton.onClick}
            disabled={boton.deshabilitado || boton.cargando}
            className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 ${boton.tono === "verde" ? "bg-emerald-600" : "bg-blue-600"}`}
          >
            {boton.cargando && <FontAwesomeIcon icon={faSpinner} spin />}
            {boton.texto}
          </button>
          {boton.deshabilitado && boton.motivo && (
            <button type="button" onClick={boton.onMotivo} disabled={!boton.onMotivo} className="mt-2 flex min-h-[32px] w-full items-center justify-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <FontAwesomeIcon icon={faCircleExclamation} />
              {boton.motivo}
              {boton.onMotivo && <FontAwesomeIcon icon={faChevronRight} className="h-2.5 w-2.5" />}
            </button>
          )}
          {notaBoton && !(boton.deshabilitado && boton.motivo) && <p className="mt-2 text-center text-xs text-slate-600 dark:text-slate-300">{notaBoton}</p>}
        </footer>
      )}
    </div>
  );
}

function EstadoGuardado({ estado }: { estado: string }) {
  if (estado === "quieto") return null;
  return (
    <span role="status" className={`flex shrink-0 items-center gap-1 pr-2 text-xs font-semibold ${estado === "error" ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
      <FontAwesomeIcon icon={estado === "guardando" ? faSpinner : estado === "error" ? faXmark : faCheck} spin={estado === "guardando"} />
      {estado === "guardando" ? "Guardando…" : estado === "error" ? "No se guardó" : "Guardado"}
    </span>
  );
}

/** Una tarjeta de sección con su título. */
export function Seccion({ titulo, accion, children, id }: { titulo?: React.ReactNode; accion?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-5 scroll-mt-20">
      {(titulo || accion) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{titulo}</h2>}
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

/** Estado vacío: una línea y una acción. */
export function Vacio({ texto, accion, onAccion }: { texto: string; accion?: string; onAccion?: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-600">
      <p className="text-sm text-slate-700 dark:text-slate-200">{texto}</p>
      {accion && onAccion && (
        <button type="button" onClick={onAccion} className="mt-3 min-h-[44px] rounded-xl bg-blue-600 px-4 text-sm font-bold text-white">
          {accion}
        </button>
      )}
    </div>
  );
}

/** Una acción secundaria con texto (nada de íconos sueltos). */
export function AccionTexto({ children, onClick, peligro }: { children: React.ReactNode; onClick: () => void; peligro?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-[44px] w-full items-center rounded-xl px-3 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 ${peligro ? "text-red-600 dark:text-red-400" : "text-blue-700 dark:text-blue-300"}`}>
      {children}
    </button>
  );
}
