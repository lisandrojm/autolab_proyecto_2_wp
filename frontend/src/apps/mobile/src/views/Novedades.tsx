import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faSpinner, faLayerGroup, faUsers, faClipboardCheck } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import SectionHeader from "../components/SectionHeader";
import MenuDeTarjetas, { type OpcionDeMenu } from "../components/MenuDeTarjetas";
import ActivityLogs from "./ActivityLogs";
import SeguimientoNovedades from "./SeguimientoNovedades";
import { useAuthStore } from "../../../../stores/authStore";
import { usePermisoInactivo } from "../../../../stores/permisosInactivosStore";
import { projectsAPI } from "../../../../api/projects";
import { MOBILE_ACTIVITY_COMPLIANCE, MOBILE_ACTIVITY_LOGS } from "../../../../utils/permisosMobile";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * NOVEDADES: QUIÉN LAS CARGÓ, Y CARGAR LAS PROPIAS
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Son dos lados de la misma tarea. El coordinador mira si sus supervisores cargaron («Cumplimiento»);
 * el supervisor carga la asistencia de su gente («Historial»).
 *
 * Eran DOS TARJETAS DE LA HOME, y eso obligaba a volver al inicio para pasar de una a la otra —justo
 * lo que se hace cuando alguien no cargó: mirás el cumplimiento, le avisás, y volvés a mirar—. Ahora
 * es una pantalla con un menú de tarjetas, igual que Contratación (ver `components/MenuDeTarjetas`).
 *
 * CUMPLIMIENTO VA PRIMERO Y ABRE ACTIVA. Es la pestaña de control: se entra a ver cómo viene el
 * equipo. Cargar las novedades propias es lo que se hace después, y sólo si además se tiene gente a
 * cargo.
 *
 * CADA PESTAÑA DEPENDE DE SU PROPIO PERMISO. Los roles no se superponen: el Supervisor sólo tiene
 * «Cargar novedades» y el Coordinador sólo «Cumplimiento». Si la pantalla exigiera uno para entrar,
 * la mitad se quedaba sin la suya. Así, cada uno entra y ve lo que le toca; y quien tiene los dos
 * permisos —que existe— tiene las dos pestañas.
 */

type Pestana = "cumplimiento" | "historial";
/** Las tarjetas del menú. */
type Seccion = "mias" | "supervisadas" | "cumplimiento";

interface NovedadesProps {
  onNavigate: (view: ViewType) => void;
  /** Con cuál abre. Lo usa la notificación de cumplimiento, que antes llevaba a su propia pantalla. */
  pestanaInicial?: Pestana;
}

const INFO: Record<Pestana, string> = {
  cumplimiento:
    "Seguí si tus supervisores cargan las novedades de su gente. El calendario muestra, día por día, quién las envió y a quién le falta.\n\nElegí un supervisor para ver su detalle y usá «Recordar» para avisarle a quien esté atrasado.",
  historial:
    "Cargá las novedades de la gente de tus áreas y turnos: quién vino, ausencias, reemplazos, horas extra y bajas.\n\nElegí el día, completá lo que pasó y envialo. Cada día tiene que quedar enviado: si no, tu coordinador lo ve como pendiente.",
};

export default function Novedades({ onNavigate, pestanaInicial }: NovedadesProps) {
  /* Mismo criterio que `App.tsx`: el permiso tiene que estar Y no estar marcado como «en desarrollo». */
  const { user } = useAuthStore();
  const inactivo = usePermisoInactivo();
  const puede = (permiso: string) => (user?.permissions || []).includes(permiso) && !inactivo(permiso);
  const puedeVerCumplimiento = puede(MOBILE_ACTIVITY_COMPLIANCE);
  const puedeCargar = puede(MOBILE_ACTIVITY_LOGS);

  /*
    TENER EL PERMISO NO ES TENER DÓNDE CARGAR.

    «Cargar novedades» abre la pantalla; las novedades son de un ÁREA y un TURNO a cargo. Sin ninguno,
    esa pestaña se abre vacía y con un «+» que no lleva a ningún lado: no se ofrece.
    `null` = todavía no contestó el server (ver `projectsAPI.misAreasYTurnos`).
  */
  const [tieneDondeCargar, setTieneDondeCargar] = useState<boolean | null>(null);
  useEffect(() => {
    if (!puedeCargar) {
      setTieneDondeCargar(false);
      return;
    }
    let vigente = true;
    projectsAPI
      .misAreasYTurnos()
      .then((r) => vigente && setTieneDondeCargar(r.combinaciones > 0))
      .catch(() => {
        // Si la consulta falla no se le esconde la pestaña a quien sí tiene el permiso: que entre y vea.
        if (vigente) setTieneDondeCargar(true);
      });
    return () => {
      vigente = false;
    };
  }, [puedeCargar]);

  /*
    UN MENÚ DE TARJETAS, COMO LA HOME Y CONTRATACIÓN (25/10/2026). Eran dos barras de pestañas una
    adentro de la otra —«Mis novedades | Cumplimiento» y, dentro de la primera, «Mías | Las que
    superviso»— y ahora es un solo menú con las tres: tocar una ENTRA (el título pasa a ser el de esa
    parte) y la flecha vuelve a las tarjetas. Con una sola opción no hay menú: se entra directo.

    EL ORDEN es el de las tarjetas: «Mis novedades» primero, que es lo que la persona viene a hacer
    —cargar las suyas—; «Las que superviso» y «Cumplimiento» son de control.

    «Las que superviso» va con el mismo permiso que Cumplimiento (es lo que pedía el conmutador de
    adentro) y, como antes, dentro de la pantalla de carga: sin áreas ni turnos a cargo no se monta.
  */
  const opciones: OpcionDeMenu<Seccion>[] = [
    ...(tieneDondeCargar ? [{ id: "mias" as const, label: "Mis novedades", icon: faCalendar }] : []),
    ...(tieneDondeCargar && puedeVerCumplimiento ? [{ id: "supervisadas" as const, label: "Las que superviso", icon: faUsers }] : []),
    ...(puedeVerCumplimiento ? [{ id: "cumplimiento" as const, label: "Cumplimiento", icon: faClipboardCheck }] : []),
  ];
  const disponibles = opciones.map((o) => o.id);
  const conMenu = disponibles.length > 1;

  /* La notificación de cumplimiento abre directo en Cumplimiento; «historial» es el nombre viejo de «Mis novedades». */
  const pedida: Seccion | undefined = pestanaInicial === "historial" ? "mias" : pestanaInicial;
  const [elegida, setElegida] = useState<Seccion | "menu" | null>(pedida ?? null);
  const enMenu = conMenu && (elegida === null || elegida === "menu" || !disponibles.includes(elegida));
  const activa: Seccion = elegida && elegida !== "menu" && disponibles.includes(elegida) ? elegida : disponibles[0] || "cumplimiento";

  const esperandoRespuesta = puedeCargar && tieneDondeCargar === null;
  const opcionActiva = opciones.find((o) => o.id === activa);

  return (
    <div className="flex-1 pb-24">
      <SectionHeader
        icon={enMenu ? faCalendar : opcionActiva?.icon ?? faCalendar}
        titulo={enMenu ? "Novedades" : opcionActiva?.label ?? "Novedades"}
        onBack={() => (enMenu || !conMenu ? onNavigate("home") : setElegida("menu"))}
        info={enMenu ? `${INFO.historial}\n\n${INFO.cumplimiento}` : INFO[activa === "cumplimiento" ? "cumplimiento" : "historial"]}
      />

      {/*
        Mientras no se sabe QUÉ opciones hay, ni menú ni sección: apareciendo a medias, el menú
        cambiaría solo bajo el dedo.
      */}
      {esperandoRespuesta ? (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
          <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
          Buscando tus áreas y turnos…
        </div>
      ) : disponibles.length === 0 ? (
        /*
          TIENE EL PERMISO PERO NO TIENE NADA A CARGO.

          Se dice, y se dice qué falta. Esconder la pantalla sin explicar deja a alguien que sabe que
          le dieron «Cargar novedades» mirando un inicio donde su tarjeta no hace nada.
        */
        <div className="space-y-3 px-4 py-10 text-center">
          <FontAwesomeIcon icon={faLayerGroup} className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Todavía no tenés áreas ni turnos a cargo</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Las novedades son de la gente de un área y un turno. Cuando te asignen alguno en un proyecto, vas a poder cargarlas desde acá.</p>
        </div>
      ) : enMenu ? (
        <div className="px-4 pt-4">
          <MenuDeTarjetas opciones={opciones} onElegir={setElegida} />
        </div>
      ) : activa === "cumplimiento" ? (
        <div className="px-4 pt-4">
          <SeguimientoNovedades onNavigate={onNavigate} embebido />
        </div>
      ) : (
        /*
          La sección que no se mira NO SE MONTA.

          Cada una carga lo suyo al montarse —el calendario del mes, las novedades del día— y son
          consultas distintas contra el server. Montando las dos, quien sólo tiene uno de los dos
          permisos dispararía la consulta de la otra y se comería un 403 que no puede resolver.
          `key`: pasar de «Mías» a «Las que superviso» monta de nuevo, con su alcance.
        */
        <ActivityLogs key={activa} onNavigate={onNavigate} embebido alcanceFijo={activa === "supervisadas" ? "supervisadas" : "mias"} />
      )}
    </div>
  );
}
