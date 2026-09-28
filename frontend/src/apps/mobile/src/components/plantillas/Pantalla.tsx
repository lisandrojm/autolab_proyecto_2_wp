import React, { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition, faArrowLeft, faCheck, faChevronRight, faCircleExclamation, faSpinner, faXmark } from "@fortawesome/free-solid-svg-icons";
import { usePlantillas } from "./contexto";
import { Pasos } from "./Pasos";

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
   * VOLVER AL PASO ANTERIOR, pegado al botón que avanza.
   *
   * La flecha de arriba es la de la pantalla y en un teléfono queda lejos del pulgar. Retroceder un
   * paso es el gemelo de avanzarlo, así que va donde está el que avanza: las dos direcciones del
   * mismo movimiento, juntas y al alcance de la mano.
   *
   * Sólo el ícono: el texto es del botón que avanza, que es lo que casi siempre se quiere.
   */
  atrasPaso?: () => void;
  /**
   * EN QUÉ PASO SE ESTÁ, DEBAJO DEL TÍTULO Y FIJO CON ÉL.
   *
   * Estaba adentro del formulario y se iba con el primer scroll, que es justo cuando hace falta:
   * mirás una lista de cinco áreas y ya no sabés si te quedan dos pantallas o media. Acá arriba «en
   * cuál voy y cuántos son» se contesta siempre, y no cuesta nada, porque el encabezado ya estaba
   * fijo. El alto lo mide el ResizeObserver de siempre, así que lo que se pega debajo se acomoda.
   */
  pasos?: { actual: number; etiquetas: string[] };
}

/*
  SE FUERON LOS CHIPS de «Grupo | Técnica» y «Equipo | Mañana».

  Existían porque el alta era una sola pantalla larga: a la cuarta pantalla de scroll ya no se veía
  cómo se había llamado lo que se estaba armando, y dos nombres viajando en el encabezado lo
  resolvían. Pero mostraban DOS de las ocho decisiones —las dos que entraban en un renglón— y ese
  renglón se pagaba en todas las pantallas.

  Partida el alta en pasos, el problema cambió: no hace falta acordarse a mitad de camino, hace falta
  ver todo junto antes de crear. Eso es el resumen del último paso, que los reemplaza con ventaja
  porque no tiene que caber en un renglón.
*/

const claveScroll = (path: string) => `plantillas:scroll:${path}`;

/**
 * CUÁNTO MIDE EL ENCABEZADO, para lo que quiera quedar pegado JUSTO DEBAJO.
 *
 * Sin saberlo, una sección `sticky` se pega al borde de la ventana y el encabezado se le monta
 * encima. Era un número fijo (61), y dejó de servir apenas el encabezado pasó a tener más de un
 * renglón —los chips primero, los pasos después—: el rótulo pegado quedaba tapado.
 *
 * Ahora se MIDE y se publica como variable CSS en la pantalla, así que cualquier alto funciona y
 * nadie tiene que mantener una constante sincronizada con un padding. El 61 queda de respaldo por si
 * se lee antes del primer render.
 */
export const TOPE_PEGADO = "var(--alto-encabezado, 61px)";

export function Pantalla({ titulo, contexto, atras, children, boton, notaBoton, listo = true, pie, atrasFijo, atrasPaso, pasos }: Props) {
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

  /*
    LOS 64 PX DE ABAJO SON DE LA BARRA DE NAVEGACIÓN.

    Estas pantallas se dibujaban sin barra y por eso llegaban hasta el piso. Ahora la barra está (ver
    App.tsx: sin ella no había cómo salir de Plantillas) y va `fixed`, así que no empuja a nadie: el
    lugar hay que dejárselo. Sin este padding, el último renglón queda debajo de los íconos.
  */
  return (
    <div ref={raiz} className="flex min-h-screen flex-col bg-slate-50 pb-16 dark:bg-slate-900">
      <header ref={encabezado} className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-2 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="flex items-center gap-2">
          <button type="button" onClick={volver} aria-label="Atrás" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          {/*
            EL TÍTULO Y EL PROYECTO, EN UN RENGLÓN.

            El proyecto iba debajo del título y el encabezado gastaba tres renglones —título,
            proyecto y pasos— antes de que empezara el formulario. Al lado, el encabezado mide uno
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
        {/*
          LOS NÚMEROS, ADENTRO DEL MARGEN DE LA PANTALLA.

          El encabezado tiene 8 px de costado porque su primer elemento es la flecha de atrás, que es
          un botón de 44 y ya trae su propio aire. Los pasos no: el primer círculo y el último apoyan
          directo contra ese borde, que en un teléfono es donde están la curva de la pantalla y la
          zona del gesto de volver. Con 12 px propios quedan a 20 del vidrio, adentro de la columna
          donde vive el resto del formulario.
        */}
        {pasos && <Pasos actual={pasos.actual} pasos={pasos.etiquetas} className="px-3 pb-0.5 pt-2" />}
      </header>

      <main className="flex-1 px-4 pb-6 pt-4">{children}</main>

      {pie && !boton && <footer className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-4 pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">{pie}</footer>}
      {/* El botón se pega A 64 PX DEL PISO y no al piso: abajo está la barra, y quedaría tapado por ella. */}
      {boton && (
        <footer className="sticky bottom-16 z-20 border-t border-slate-200 bg-white/95 px-4 pb-4 pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex items-center gap-2">
            {atrasPaso && (
              <button type="button" onClick={atrasPaso} aria-label="Volver al paso anterior" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200">
                <FontAwesomeIcon icon={faArrowLeft} />
              </button>
            )}
            <button
              type="button"
              onClick={boton.onClick}
              disabled={boton.deshabilitado || boton.cargando}
              className={`flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 bg-blue-600`}
            >
              {boton.cargando && <FontAwesomeIcon icon={faSpinner} spin />}
              {boton.texto}
            </button>
          </div>
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
/**
 * EL PIE DE ACCIONES DE UNA TARJETA, como la Card de escritorio (`components/ui/Card.tsx`): a la
 * izquierda un dato chico y gris, a la derecha los íconos —editar, clonar, eliminar—, grises, sin
 * texto y con su `title`.
 *
 * Reemplaza a la sección «Más» que cerraba el grupo y el equipo: tres renglones de texto azul que
 * ocupaban una tarjeta entera para decir lo que en escritorio dicen tres íconos en una línea. Es la
 * misma plataforma; quien ya usó la de escritorio no tiene que aprender otra cosa acá.
 *
 * Lo único distinto es el blanco del dedo: 44 px por ícono en vez de los 4 px de padding del mouse.
 * El ícono se ve igual de chico; lo que crece es dónde se puede tocar.
 */
export function PieAcciones({ izquierda, acciones }: { izquierda?: React.ReactNode; acciones: { icono: IconDefinition; titulo: string; onClick: () => void }[] }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white py-1 pl-4 pr-1 dark:border-slate-700 dark:bg-slate-800/70">
      <div className="min-w-0 flex-1 truncate text-xs text-slate-500 dark:text-slate-400">{izquierda}</div>
      <div className="flex items-center">
        {acciones.map((a) => (
          <button key={a.titulo} type="button" onClick={a.onClick} title={a.titulo} aria-label={a.titulo} className="flex h-11 w-11 items-center justify-center rounded text-slate-400 transition-colors hover:text-slate-800 dark:hover:text-slate-200">
            <FontAwesomeIcon icon={a.icono} className="h-4 w-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function AccionTexto({ children, onClick, peligro, icono }: { children: React.ReactNode; onClick: () => void; peligro?: boolean; icono?: IconDefinition }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 ${peligro ? "text-red-600 dark:text-red-400" : "text-blue-700 dark:text-blue-300"}`}>
      {/* El ícono dice cuál es cuál antes de leer; sin él, tres renglones azules se distinguen sólo por el texto. */}
      {icono && <FontAwesomeIcon icon={icono} className="h-3.5 w-3.5 shrink-0 opacity-70" />}
      {children}
    </button>
  );
}
