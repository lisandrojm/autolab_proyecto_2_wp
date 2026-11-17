import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBellConcierge, faBriefcase, faCartShopping, faCalendarAlt, faCheck, faEye, faCircleCheck, faCircleXmark, faClock, faClockRotateLeft, faHourglassHalf, faUmbrellaBeach, faUserCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { vacationsAPI, type ItemDeAprobacion, type ItemDeHistorial } from "../../../../api/vacations";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import SectionHeader from "../components/SectionHeader";
import MenuDeTarjetas, { type OpcionDeMenu } from "../components/MenuDeTarjetas";
import DetalleAprobacionModal from "../components/DetalleAprobacionModal";
import { useRefrescoEnFoco } from "../hooks/useRefrescoEnFoco";
import { sweetAlert } from "../utils/sweetAlert";
import { ViewType } from "../types";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * APROBACIONES (15/11/2026, pedido del usuario)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Lo que la gente de su equipo pide y espera SU aprobación: Vacaciones y Pedidos, cada una en su tarjeta
 * con contador (en la app nunca van pestañas). Pedidos todavía no tiene aprobación: se ve apagada.
 *
 * La solicitud de vacaciones sube Supervisor → Coordinador → Admin:
 *   · El supervisor aprueba lo de su área y turno.
 *   · El coordinador aprueba lo que ya aprobó el supervisor (o lo de un área sin supervisor). Además ve lo
 *     que el supervisor todavía no aprobó y puede pedírselo; no aprobarlo por él.
 *   · Después la aprueba el admin, desde la web.
 *
 * Las reglas están en el server (`services/vacaciones/aprobacionPorEtapas.ts`): acá se muestra lo que
 * devuelve la bandeja.
 */

type Seccion = "vacaciones" | "pedidos";
type ParteVacaciones = "para_aprobar" | "esperando" | "historial";

const INFO = {
  menu: "Lo que la gente de tu equipo pide y espera tu aprobación, separado en Vacaciones y Pedidos. El número de cada tarjeta es cuántas cosas esperan tu respuesta.\n\nLos pedidos todavía no pasan por acá: la tarjeta queda apagada hasta que se sumen.",
  vacaciones:
    "Las vacaciones suben por la jerarquía del proyecto: primero las aprueba el supervisor del área y turno, después el coordinador del proyecto y al final el administrador. Si en el proyecto no hay supervisor o coordinador, ese paso se saltea.\n\n«Para aprobar» es lo que espera tu respuesta. «Esperando al supervisor» (sólo coordinadores) es lo que el supervisor todavía no aprobó: podés pedirle que lo revise.\n\n«Historial» es lo que ya aprobaste o rechazaste, como supervisor o como coordinador, y en qué quedó cada solicitud.",
};

/** Dónde está hoy una solicitud del historial. */
const estadoActual = (h: ItemDeHistorial): { texto: string; clase: string } => {
  const ambar = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  if (h.status === "pending") return { texto: h.etapaActual === "coordinador" ? "Espera al coordinador" : "Espera al supervisor", clase: ambar };
  if (h.status === "pre_approved") return { texto: "Espera al administrador", clase: ambar };
  if (h.status === "approved") return { texto: "Aprobada", clase: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
  if (h.status === "delivered") return { texto: "Entregada", clase: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" };
  if (h.status === "rejected") return { texto: "Rechazada", clase: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" };
  return { texto: "Cancelada", clase: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" };
};

const fechaYHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

const periodo = (i: { startDate: string; endDate: string }) => `${fechaCorta(String(i.startDate).slice(0, 10))} → ${fechaCorta(String(i.endDate).slice(0, 10))}`;

export default function Aprobaciones({ onNavigate }: { onNavigate: (view: ViewType) => void }) {
  const [datos, setDatos] = useState<{
    paraAprobar: ItemDeAprobacion[];
    esperandoSupervisor: ItemDeAprobacion[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  // La solicitud abierta en el detalle (tocando la tarjeta).
  const [detalle, setDetalle] = useState<ItemDeAprobacion | null>(null);
  // Lo que ya aprobé o rechacé. Se carga al entrar al historial y se vuelve a pedir después de cada decisión.
  const [historial, setHistorial] = useState<ItemDeHistorial[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);
  const [detalleHistorial, setDetalleHistorial] = useState<string | null>(null);
  /*
    Dos niveles de tarjetas, como el resto de la app: primero Vacaciones / Pedidos (con su contador, como
    Contratos o Registro en la home) y, dentro de Vacaciones, «Para aprobar» / «Esperando al supervisor»
    cuando hay algo en la segunda. Pedidos se ve apagada: su aprobación todavía no existe.
  */
  const [seccion, setSeccion] = useState<Seccion | "menu">("menu");
  const [parte, setParte] = useState<ParteVacaciones | "menu">("menu");

  const cargar = useCallback(() => {
    vacationsAPI
      .aprobaciones()
      .then((d) => {
        setDatos(d);
        setError(null);
      })
      .catch((e) => setError(e?.response?.data?.error || "No se pudieron cargar las aprobaciones."));
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  useRefrescoEnFoco(cargar);

  const cargarHistorial = useCallback(() => {
    vacationsAPI
      .historialDeAprobaciones()
      .then((h) => {
        setHistorial(h);
        setErrorHistorial(null);
      })
      .catch((e) => setErrorHistorial(e?.response?.data?.error || "No se pudo cargar el historial."));
  }, []);
  useEffect(() => {
    if (parte === "historial" && historial === null) cargarHistorial();
  }, [parte, historial, cargarHistorial]);

  const paraAprobar = datos?.paraAprobar || [];
  const esperando = datos?.esperandoSupervisor || [];
  // «Esperando al supervisor» es sólo del coordinador: si no hay nada ahí, no hace falta el menú.
  const opciones: OpcionDeMenu<ParteVacaciones>[] = [
    {
      id: "para_aprobar",
      label: "Para aprobar",
      icon: faUserCheck,
      contador: paraAprobar.length,
    },
    ...(esperando.length
      ? [
          {
            id: "esperando" as const,
            label: "Esperando al supervisor",
            icon: faHourglassHalf,
            contador: esperando.length,
          },
        ]
      : []),
    // Lo que ya decidí: siempre está, aunque no haya nada pendiente.
    { id: "historial", label: "Historial", icon: faClockRotateLeft },
  ];
  const conMenu = opciones.length > 1;
  const activa: ParteVacaciones = !conMenu ? "para_aprobar" : parte === "menu" ? "para_aprobar" : parte;
  const enMenu = conMenu && parte === "menu";

  const sacar = (id: string) =>
    setDatos((d) =>
      d
        ? {
            paraAprobar: d.paraAprobar.filter((x) => x._id !== id),
            esperandoSupervisor: d.esperandoSupervisor.filter((x) => x._id !== id),
          }
        : d,
    );

  const aprobar = async (i: ItemDeAprobacion) => {
    const r = await sweetAlert.confirm(
      "¿Aprobar las vacaciones?",
      `${i.persona.nombre} · ${periodo(i)} (${i.daysRequested} días).${i.etapa === "supervisor" ? " Después las revisa el coordinador (si el proyecto tiene) y el administrador." : " Después las aprueba el administrador."}`,
      "Aprobar",
    );
    if (!r.isConfirmed) return;
    setProcesando(i._id);
    try {
      await vacationsAPI.aprobarEtapa(i._id);
      sacar(i._id);
      setHistorial(null);
      setDetalle(null);
      sweetAlert.success("Aprobadas", "Pasan al siguiente paso.");
    } catch (e: any) {
      sweetAlert.error("No se pudo aprobar", e?.response?.data?.error || "Probá de nuevo.");
      cargar();
    } finally {
      setProcesando(null);
    }
  };

  const rechazar = async (i: ItemDeAprobacion) => {
    const r = await sweetAlert.motivo("¿Rechazar las vacaciones?", `Contale a ${i.persona.nombre} por qué no se aprueban.`, {
      placeholder: "Ej.: se superponen con el cierre del proyecto",
      confirmText: "Rechazar",
      mensajeVacio: "Escribí el motivo del rechazo.",
    });
    if (!r.isConfirmed) return;
    setProcesando(i._id);
    try {
      await vacationsAPI.rechazarEtapa(i._id, String(r.value || "").trim());
      sacar(i._id);
      setHistorial(null);
      setDetalle(null);
      sweetAlert.success("Rechazadas", `Le avisamos a ${i.persona.nombre}.`);
    } catch (e: any) {
      sweetAlert.error("No se pudo rechazar", e?.response?.data?.error || "Probá de nuevo.");
      cargar();
    } finally {
      setProcesando(null);
    }
  };

  const recordar = async (i: ItemDeAprobacion) => {
    setProcesando(i._id);
    try {
      await vacationsAPI.recordarSupervisor(i._id);
      setDatos((d) =>
        d
          ? {
              ...d,
              esperandoSupervisor: d.esperandoSupervisor.map((x) => (x._id === i._id ? { ...x, recordadaHoy: true } : x)),
            }
          : d,
      );
      sweetAlert.success("Listo", "Le avisamos al supervisor.");
    } catch (e: any) {
      sweetAlert.error("No se pudo avisar", e?.response?.data?.error || "Probá de nuevo.");
    } finally {
      setProcesando(null);
    }
  };

  const tarjeta = (i: ItemDeAprobacion, acciones: React.ReactNode) => (
    <div key={i._id} className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate font-bold text-slate-900 dark:text-slate-100">{i.persona.nombre}</h4>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{i.vacationNumber}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{i.daysRequested} días</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div className="flex min-w-0 items-center gap-1.5">
            <FontAwesomeIcon icon={faCalendarAlt} className="h-3 w-3 text-primary opacity-70" />
            <span className="truncate">{periodo(i)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <FontAwesomeIcon icon={faBriefcase} className="h-3 w-3 text-primary opacity-70" />
            <span className="truncate">{i.proyectos.filter(Boolean).join(" · ") || "Sin proyecto"}</span>
          </div>
          {i.aprobadoPorSupervisor && (
            <div className="flex min-w-0 items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
              <span className="truncate">Aprobó el supervisor: {i.aprobadoPorSupervisor}</span>
            </div>
          )}
          {i.reason && i.reason !== "Solicitud de vacaciones" && <p className="italic">«{i.reason}»</p>}
        </div>
      </div>
      {/* El detalle para decidir: rol, turno, contrato, saldo y quién más sale esas fechas. */}
      <button type="button" onClick={() => setDetalle(i)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:active:bg-slate-800">
        <FontAwesomeIcon icon={faEye} />
        Ver detalle
      </button>
      <div className="mt-2">{acciones}</div>
    </div>
  );

  const renglonDeHistorial = (h: ItemDeHistorial) => {
    const estado = estadoActual(h);
    const aprobe = h.accion === "aprobada";
    return (
      <div key={`${h._id}-${h.accion}-${h.nivel}`} className="rounded-xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate font-bold text-slate-900 dark:text-slate-100">{h.persona.nombre}</h4>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{h.vacationNumber}</p>
          </div>
          <span className={`shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase ${estado.clase}`}>{estado.texto}</span>
        </div>
        <div className={`mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold ${aprobe ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
          <FontAwesomeIcon icon={aprobe ? faCircleCheck : faCircleXmark} />
          <span className="min-w-0 truncate">
            {aprobe ? "Aprobaste" : "Rechazaste"} como {h.nivel}
          </span>
          <span className="ml-auto shrink-0 font-normal opacity-80">{fechaYHora(h.at)}</span>
        </div>
        {!aprobe && h.motivo && <p className="mt-1.5 text-[11px] italic text-slate-500 dark:text-slate-400">Motivo: «{h.motivo}»</p>}
        <div className="mt-3 grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <div className="flex min-w-0 items-center gap-1.5">
            <FontAwesomeIcon icon={faCalendarAlt} className="h-3 w-3 text-primary opacity-70" />
            <span className="truncate">
              {periodo(h)} · {h.daysRequested} días
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <FontAwesomeIcon icon={faBriefcase} className="h-3 w-3 text-primary opacity-70" />
            <span className="truncate">{h.proyectos.filter(Boolean).join(" · ") || "Sin proyecto"}</span>
          </div>
        </div>
        <button type="button" onClick={() => setDetalleHistorial(h._id)} className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 py-2 text-xs font-bold text-slate-700 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:active:bg-slate-800">
          <FontAwesomeIcon icon={faEye} />
          Ver detalle
        </button>
      </div>
    );
  };

  const listaHistorial = () => {
    if (errorHistorial) return <p className="rounded-xl border p-6 text-center text-sm text-red-600 dark:border-slate-700 dark:text-red-400">{errorHistorial}</p>;
    if (!historial) return <LoadingSpinner message="Cargando datos..." />;
    if (historial.length === 0)
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-slate-50 p-10 text-center dark:bg-slate-800/50">
          <FontAwesomeIcon icon={faClockRotateLeft} className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no aprobaste ni rechazaste vacaciones</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Cuando apruebes o rechaces una solicitud, como supervisor o como coordinador, queda registrada acá.</p>
        </div>
      );
    return <div className="space-y-3">{historial.map(renglonDeHistorial)}</div>;
  };

  const lista = () => {
    if (activa === "historial") return listaHistorial();
    if (error) return <p className="rounded-xl border p-6 text-center text-sm text-red-600 dark:border-slate-700 dark:text-red-400">{error}</p>;
    if (!datos) return <LoadingSpinner message="Cargando aprobaciones..." />;
    const items = activa === "para_aprobar" ? paraAprobar : esperando;
    if (items.length === 0)
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-slate-50 p-10 text-center dark:bg-slate-800/50">
          <FontAwesomeIcon icon={faUmbrellaBeach} className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{activa === "para_aprobar" ? "No hay vacaciones esperando tu aprobación" : "El supervisor no tiene vacaciones pendientes"}</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Cuando alguien de tu equipo pida vacaciones y te toque aprobarlas, aparecen acá.</p>
        </div>
      );
    return <div className="space-y-3">{items.map((i) => tarjeta(i, accionesDe(i)))}</div>;
  };

  const accionesDe = (i: ItemDeAprobacion) =>
    activa === "para_aprobar" ? (
      // Los colores y los íconos del tilde y la cruz de la web; Aprobar es el grande.
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => rechazar(i)}
          disabled={procesando === i._id}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-100 py-2 text-xs font-bold text-red-700 active:bg-red-200 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-400"
        >
          <FontAwesomeIcon icon={faXmark} />
          Rechazar
        </button>
        <button
          type="button"
          onClick={() => aprobar(i)}
          disabled={procesando === i._id}
          className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg border border-green-200 bg-green-100 py-2 text-xs font-bold text-green-700 active:bg-green-200 disabled:opacity-50 dark:border-green-900/60 dark:bg-green-900/30 dark:text-green-400"
        >
          <FontAwesomeIcon icon={procesando === i._id ? faClock : faCheck} />
          {procesando === i._id ? "Guardando..." : "Aprobar"}
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => recordar(i)}
        disabled={procesando === i._id || i.recordadaHoy}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-600 active:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:active:bg-slate-800"
      >
        <FontAwesomeIcon icon={faBellConcierge} />
        {i.recordadaHoy ? "Avisado hoy" : procesando === i._id ? "Avisando..." : "Solicitar aprobación al supervisor"}
      </button>
    );

  const secciones: OpcionDeMenu<Seccion>[] = [
    {
      id: "vacaciones",
      label: "Vacaciones",
      icon: faUmbrellaBeach,
      contador: paraAprobar.length,
    },
    { id: "pedidos", label: "Pedidos", icon: faCartShopping, disabled: true },
  ];

  if (seccion === "menu")
    return (
      <div className="flex-1 pb-24">
        <SectionHeader icon={faCircleCheck} titulo="Aprobaciones" onBack={() => onNavigate("home")} info={INFO.menu} />
        <div className="space-y-3 px-4 pt-4">
          {error && <p className="rounded-xl border p-3 text-center text-sm text-red-600 dark:border-slate-700 dark:text-red-400">{error}</p>}
          <MenuDeTarjetas
            opciones={secciones}
            onElegir={(id) => {
              setSeccion(id);
              setParte("menu");
            }}
          />
        </div>
      </div>
    );

  const opcionActiva = opciones.find((o) => o.id === activa);
  const enLista = conMenu && !enMenu;
  return (
    <div className="flex-1 pb-24">
      <SectionHeader
        icon={enLista ? (opcionActiva?.icon ?? faUmbrellaBeach) : faUmbrellaBeach}
        titulo={enLista ? (opcionActiva?.label ?? "Vacaciones") : "Aprobaciones · Vacaciones"}
        onBack={() => (enLista ? setParte("menu") : setSeccion("menu"))}
        info={INFO.vacaciones}
      />
      <div className="space-y-3 px-4 pt-4">{enMenu ? <MenuDeTarjetas opciones={opciones} onElegir={setParte} /> : lista()}</div>
      <DetalleAprobacionModal vacationId={detalle?._id || null} onClose={() => setDetalle(null)} acciones={detalle ? accionesDe(detalle) : undefined} />
      {/* Lo del historial ya está decidido: el detalle se ve sin botones. */}
      <DetalleAprobacionModal vacationId={detalleHistorial} onClose={() => setDetalleHistorial(null)} />
    </div>
  );
}
