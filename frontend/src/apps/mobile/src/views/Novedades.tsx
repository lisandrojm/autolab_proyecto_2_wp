import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faSpinner, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import SectionHeader from "../components/SectionHeader";
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
 * es una pantalla con dos pestañas, igual que Contratación (Historial / Por vencer).
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

  const disponibles: Pestana[] = [...(puedeVerCumplimiento ? (["cumplimiento"] as const) : []), ...(tieneDondeCargar ? (["historial"] as const) : [])];

  /*
    Arranca en la que pidieron si la tiene; si no, en la primera disponible —que es Cumplimiento
    cuando están las dos—. `activa` vuelve a caer en la inicial si la elegida dejó de estar.
  */
  const inicial: Pestana = pestanaInicial && disponibles.includes(pestanaInicial) ? pestanaInicial : disponibles[0] || "cumplimiento";
  const [pestana, setPestana] = useState<Pestana | null>(null);
  const activa: Pestana = pestana && disponibles.includes(pestana) ? pestana : inicial;

  const esperandoRespuesta = puedeCargar && tieneDondeCargar === null;

  return (
    <div className="flex-1 pb-24">
      <SectionHeader icon={faCalendar} titulo="Novedades" onBack={() => onNavigate("home")} info={INFO[activa]} />

      {/*
        La barra se dibuja cuando se sabe QUÉ pestañas hay, no antes: apareciendo a medias cambiaría
        sola bajo el dedo. Y con una sola pestaña no se dibuja: un selector de una opción no es una
        elección y le come un renglón a la pantalla.
      */}
      {!esperandoRespuesta && disponibles.length > 1 && (
        <div className="px-4 pt-4">
          {/* Mismo selector que Contratación: dos mitades, la activa en blanco. */}
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
            {(
              [
                { id: "cumplimiento", label: "Cumplimiento" },
                { id: "historial", label: "Mis novedades" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setPestana(t.id)}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors ${activa === t.id ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {esperandoRespuesta && !puedeVerCumplimiento ? (
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
      ) : activa === "cumplimiento" ? (
        <div className="px-4 pt-4">
          <SeguimientoNovedades onNavigate={onNavigate} embebido />
        </div>
      ) : (
        /*
          La pestaña que no se mira NO SE MONTA.

          Cada una carga lo suyo al montarse —el calendario del mes, las novedades del día— y son
          consultas distintas contra el server. Montando las dos, quien sólo tiene uno de los dos
          permisos dispararía la consulta de la otra y se comería un 403 que no puede resolver.
        */
        <ActivityLogs onNavigate={onNavigate} embebido />
      )}
    </div>
  );
}
