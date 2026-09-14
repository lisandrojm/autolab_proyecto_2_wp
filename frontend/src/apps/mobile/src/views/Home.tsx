import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShoppingCart, faUmbrellaBeach, faFileAlt, faBell, faSignOutAlt, faUserPlus, faSitemap, faCalendarCheck } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useAuthStore } from "../../../../stores/authStore";
import { useNotifications } from "../hooks/useNotifications";
import UserHeader from "../components/UserHeader";
import { useProfile } from "../hooks/useProfile";
import { usePermisoInactivo } from "../../../../stores/permisosInactivosStore";
import { ProfileData } from "../../../../api/personnel";
// Una tarjeta = un permiso. El porqué y la contraparte del server están en ese módulo.
import { MOBILE_ACTIVITY_COMPLIANCE, MOBILE_ACTIVITY_LOGS, MOBILE_ORDERS, MOBILE_TEAMS, MOBILE_USERS, MOBILE_VACATIONS } from "../../../../utils/permisosMobile";

/** La notificación destacada arriba de las tarjetas, apagada hasta que vivan en la campanita. Ver el render. */
const MOSTRAR_NOTIFICACION_DESTACADA = false;

/**
 * EL ORDEN DE LAS TARJETAS. Lo que tiene que ver con la gente a cargo primero; después Contratación y
 * Cargar novedades, que son lo que se hace todos los días; y al final lo propio —Pedidos y Vacaciones—.
 * Va por vista y no por el orden en que se agregan abajo, así sumar una tarjeta no reordena las demás.
 */
const ORDEN_DE_TARJETAS: ViewType[] = ["my_teams", "activity_compliance", "user_history", "activity_logs", "orders", "vacations"];

interface HomeProps {
  onNavigate: (view: ViewType) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { user, logout } = useAuthStore();
  const { notifications, unreadCount, loading: notifLoading } = useNotifications();
  const { profile, loading: profileLoading } = useProfile();

  /*
    Se leen los permisos crudos y no `hasPermission`: en el servidor un Admin pasa cualquier chequeo,
    y acá eso le mostraría tarjetas que su rol no tiene.
  */
  const puede = (permiso: string) => (user?.permissions || []).includes(permiso);
  const latestNotification = notifications.find((n) => !n.isRead);

  const hasActiveContract = (p: ProfileData | null): boolean => {
    if (!p || !p.metadata?.projects) return false;
    let hasActive = false;
    p.metadata.projects.forEach((proj: any) => {
      if (proj.contracts) {
        proj.contracts.forEach((c: any) => {
          const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
          const isActive = !endDate || endDate >= new Date();
          if (isActive) hasActive = true;
        });
      }
    });
    return hasActive;
  };

  /*
    LAS TARJETAS: UNA POR PERMISO.

    Antes se armaban por rol —el coordinador veía Novedades y Usuarios, el colaborador no— y cambiarlo
    exigía tocar este archivo. Ahora cada una aparece si el permiso está, y qué permisos tiene cada
    rol se decide en Usuarios → Roles. El campo `roles` de cada acción se fue con eso: no lo leía nadie.

    EL CHEQUEO DE CONTRATO AHORA VALE PARA TODOS, y antes no.

    Pedidos y Vacaciones se muestran apagadas, con el motivo, cuando no hay contrato activo. Es
    distinto de no tener el permiso —ahí la tarjeta directamente no está—: "sin contrato activo" es
    algo que se resuelve, y conviene que se vea.

    Antes ese chequeo lo esquivaba quien tuviera el rol Colaborador, que era casi todo el mundo: en
    los hechos sólo lo sufrían los coordinadores. No hay forma de traducir esa excepción sin el rol
    que la definía, así que la regla queda pareja para todos.

    Mientras el perfil se está cargando no se apaga nada: `profile` arranca en null y apagarlas ahí
    mostraría "Sin contrato activo" a alguien que sí lo tiene, hasta que llegue la respuesta.
  */
  const sinContrato = !profileLoading && !hasActiveContract(profile);

  const novedadesAction = {
    icon: faFileAlt,
    // Se llama como su permiso («Cargar novedades»): así se sabe qué tarjeta da cada tilde del rol.
    title: "Cargar novedades",
    description: "La asistencia de tu gente",
    view: "activity_logs" as ViewType,
    disabled: false,
  };

  const vacationsAction = {
    icon: faUmbrellaBeach,
    title: "Vacaciones",
    description: "Solicitá tus días libres",
    view: "vacations" as ViewType,
    disabled: false,
    /*       badge: "New", */
    badgeBg: "bg-red-500",
    badgeText: "text-white",
  };

  const ordersAction = {
    icon: faShoppingCart,
    title: "Pedidos",
    description: "Gestiona tus pedidos",
    view: "orders" as ViewType,
    disabled: false,
    /*       badge: "Finish", */
    badgeBg: "bg-blue-500",
    badgeText: "text-white",
  };

  const userCreateAction = {
    icon: faUserPlus,
    // «Contratación» y no «Usuarios»: lo que se hace acá es pedir un alta, no administrar gente. El
    // nombre viejo prometía una pantalla de usuarios que esta no es.
    title: "Contratación",
    // «Solicitudes» a secas: «de alta» se confunde con el alta temprana de ARCA, que es otra cosa.
    description: "Solicitudes",
    view: "user_history" as ViewType,
    disabled: false,
  };

  // «Mis equipos»: las áreas y turnos que la persona tiene a cargo, con su gente.
  const equiposAction = {
    icon: faSitemap,
    title: "Mis equipos",
    description: "Áreas, turnos y personas a cargo",
    view: "my_teams" as ViewType,
    disabled: false,
  };

  const quickActions: any[] = [];

  if (puede(MOBILE_TEAMS)) {
    quickActions.push(equiposAction);
  }

  /*
    NOVEDADES: CARGAR O SEGUIR.

    El coordinador carga las de su gente («Cargar novedades»); el supervisor sigue el cumplimiento de sus
    coordinadores («Cumplimiento»). Cada tarjeta se llama SIEMPRE como su permiso en el editor de roles,
    y no cambia de nombre según qué más tenga la persona: quien tiene dos roles (Supervisor y
    Coordinador) ve las dos, y tiene que poder saber de cuál de sus roles sale cada una.
  */
  const cargaNovedades = puede(MOBILE_ACTIVITY_LOGS);
  if (cargaNovedades) {
    quickActions.push(novedadesAction);
  }
  if (puede(MOBILE_ACTIVITY_COMPLIANCE)) {
    quickActions.push({
      icon: faCalendarCheck,
      title: "Cumplimiento",
      description: "De tus coordinadores",
      view: "activity_compliance" as ViewType,
      disabled: false,
    });
  }

  if (puede(MOBILE_ORDERS)) {
    quickActions.push(sinContrato ? { ...ordersAction, disabled: true, description: "Sin contrato activo" } : ordersAction);
  }

  if (puede(MOBILE_VACATIONS)) {
    const vacacionesDeshabilitadas = sinContrato || profile?.vacationsEnabled === false;
    quickActions.push(
      vacacionesDeshabilitadas
        ? {
            ...vacationsAction,
            disabled: true,
            description: sinContrato ? "Sin contrato activo" : "Módulo deshabilitado",
          }
        : vacationsAction,
    );
  }

  if (puede(MOBILE_USERS)) {
    quickActions.push(userCreateAction);
  }

  /*
    LEGAJOS, RECIBOS, GESTIÓN DE EQUIPO Y REPORTES NO SE MUESTRAN.

    Estaban en la grilla en gris, con `disabled: true`, ocupando cuatro de las ocho tarjetas. Un botón
    apagado promete algo que existe y todavía no está habilitado —«será que me falta un permiso»,
    «será que hay que pedirlo»— y estas cuatro pantallas no existen: no hay nada que habilitar ni a
    quién pedírselo. Mostrarlas era hacer que la mitad de la pantalla de inicio no sirva para nada.

    Se borraron también sus definiciones y sus íconos, en vez de dejarlas sin usar: cuatro objetos que
    nadie lee envejecen apuntando a vistas que quizá nunca existan, y ensucian el chequeo de tipos. El
    historial las conserva; volver a mostrarlas es escribirlas con lo que la pantalla sea ese día.
  */

  /*
    LAS FUNCIONES EN DESARROLLO SE VEN, PERO APAGADAS.

    Si el permiso de una tarjeta está inactivo (Configuración → Permisos), la tarjeta sigue ahí —quien
    la tiene asignada sabe que viene—, gris y con «En desarrollo», sin poder entrar. `App.tsx` además
    cierra la vista, por si se llega sin pasar por acá.
  */
  const inactivo = usePermisoInactivo();
  const PERMISO_DE_VISTA: Partial<Record<ViewType, string>> = {
    activity_logs: MOBILE_ACTIVITY_LOGS,
    activity_compliance: MOBILE_ACTIVITY_COMPLIANCE,
    my_teams: MOBILE_TEAMS,
    orders: MOBILE_ORDERS,
    vacations: MOBILE_VACATIONS,
    user_history: MOBILE_USERS,
  };
  const posicion = (vista: ViewType) => {
    const i = ORDEN_DE_TARJETAS.indexOf(vista);
    return i === -1 ? ORDEN_DE_TARJETAS.length : i; // una vista nueva sin lugar asignado va al final
  };
  const acciones = quickActions
    .map((action) => (inactivo(PERMISO_DE_VISTA[action.view as ViewType]) ? { ...action, disabled: true, description: "En desarrollo" } : action))
    .sort((a, b) => posicion(a.view as ViewType) - posicion(b.view as ViewType));

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 pt-4">
        <UserHeader user={user} />

        <div className="flex items-center gap-1">
          {/* El cambio de tema se sacó: la app es siempre oscura (ver `stores/themeStore.ts`). */}
          <button onClick={handleLogout} className="flex h-10 w-10 items-center justify-center rounded text-red-600 dark:text-red-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors">
            <FontAwesomeIcon icon={faSignOutAlt} className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/*
        NOTIFICACIÓN DESTACADA: apagada por ahora. Mostraba la última no leída arriba de las tarjetas, sin
        contexto ni forma de verla entera, y confundía más de lo que avisaba. Las notificaciones van a
        vivir en la campanita de la barra de abajo; hasta entonces no se muestran acá.
      */}
      {MOSTRAR_NOTIFICACION_DESTACADA && !notifLoading && latestNotification && (
        <div className="p-4">
          <div className="flex items-start gap-3 rounded-xl border border-green-500 bg-green-50 p-4 shadow-sm dark:border-green-400 dark:bg-green-900/40">
            <FontAwesomeIcon icon={faBell} className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800 dark:text-green-100">{latestNotification.title}</p>
              <p className="text-sm text-green-700 dark:text-green-300">{latestNotification.message}</p>
            </div>
            {unreadCount > 1 && (
              <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 dark:bg-green-500">
                <span className="text-xs font-bold text-white">{unreadCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GRID */}
      <div className={`grid grid-cols-2 gap-4 p-4`}>
        {acciones.map((action, index) => {
          return (
            <button
              key={index}
              onClick={() => {
                if (action.disabled) return;
                if ((action as any).onClick) {
                  (action as any).onClick();
                } else {
                  onNavigate(action.view);
                }
              }}
              disabled={action.disabled}
              className={`relative flex flex-col gap-3 space-y-2 rounded-xl border p-4 text-left shadow-sm transition-transform
                ${action.disabled ? "opacity-40 cursor-not-allowed bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-600" : "bg-white hover:scale-[1.02] active:scale-[0.98] dark:bg-slate-900/70 border-slate-200 dark:border-slate-600"}`}
            >
              {/* BADGE */}
              <div>{(action as any).badge && <span className={`absolute top-4 right-4 rounded px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${(action as any).badgeBg} ${(action as any).badgeText}`}>{(action as any).badge}</span>}</div>
              <div className="flex-col gap-1 items-center space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center">
                    <FontAwesomeIcon icon={action.icon} className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{action.title}</h2>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{action.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
