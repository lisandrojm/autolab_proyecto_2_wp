import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
/*
  Cada tarjeta lleva EL ÍCONO DE SU SECCIÓN, el mismo que muestra su encabezado al entrar. Es lo que
  hace que la tarjeta y la pantalla se lean como la misma cosa; con íconos elegidos aparte, entrar a
  «Contratación» llevaba a una pantalla que arriba mostraba otro dibujo.
*/
import { faBell, faCalendar, faLink, faShoppingCart, faSignOutAlt, faUmbrellaBeach, faUsers } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useAuthStore } from "../../../../stores/authStore";
import { useNotifications } from "../hooks/useNotifications";
import { useRefrescoEnFoco } from "../hooks/useRefrescoEnFoco";
import UserHeader from "../components/UserHeader";
import { useProfile } from "../hooks/useProfile";
import { usePermisoInactivo } from "../../../../stores/permisosInactivosStore";
import { NOVEDADES_CONTRATACION, NOVEDAD_REGISTRO, ProfileData } from "../../../../api/personnel";
import { contratosPorVencerAPI } from "../../../../api/contratosPorVencer";
// Una tarjeta = un permiso. El porqué y la contraparte del server están en ese módulo.
import { MOBILE_ACTIVITY_COMPLIANCE, MOBILE_ACTIVITY_LOGS, MOBILE_ORDERS, MOBILE_REGISTRO, MOBILE_USERS, MOBILE_VACATIONS } from "../../../../utils/permisosMobile";

/** La notificación destacada arriba de las tarjetas, apagada hasta que vivan en la campanita. Ver el render. */
const MOSTRAR_NOTIFICACION_DESTACADA = false;

/**
 * EL ORDEN DE LAS TARJETAS: Equipos, Contratación, Cumplimiento, Novedades, y al final lo
 * propio —Pedidos y Vacaciones—. Va por vista y no por el orden en que se agregan abajo, así sumar una
 * tarjeta no reordena las demás.
 */
// Registro va pegado a Contratación: son las dos formas de sumar gente.
// «Mis equipos» no está: vive en la barra de abajo (ver `components/BottomNav`), no en una tarjeta.
const ORDEN_DE_TARJETAS: ViewType[] = ["user_history", "registro", "activity_logs", "orders", "vacations"];

interface HomeProps {
  onNavigate: (view: ViewType) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { user, logout } = useAuthStore();
  const { notifications, unreadCount, loading: notifLoading, porTipo } = useNotifications();
  /*
    LOS NÚMEROS DE LAS TARJETAS: lo que pasó y todavía no se miró.

    Registro cuenta quiénes se registraron con el link; Contratación, las solicitudes que entraron y
    las decisiones sobre las que uno pidió —aprobada o rechazada es tan novedad como una nueva—. El
    número no se borra al entrar a la pantalla: se marca leído desde ahí o desde la campanita, así
    nadie pierde de vista algo por haber tocado la tarjeta sin tiempo de resolverlo.
  */
  const nuevosRegistros = porTipo[NOVEDAD_REGISTRO] || 0;
  const nuevasContrataciones = NOVEDADES_CONTRATACION.reduce((total, tipo) => total + (porTipo[tipo] || 0), 0);
  /*
    CONTRATOS POR VENCER: el aviso de la semana previa. Se muestra en la tarjeta Contratación, que es
    donde se resuelven (pestaña «Vencimientos»). Con su catch: sin el número, la tarjeta sigue igual.

    Se vuelve a contar mientras la app está a la vista, igual que las novedades: un contrato entra en
    la ventana de aviso por el paso del tiempo, sin que nadie toque nada, y la app puede llevar días
    abierta con el número del día que se abrió.
  */
  const [porVencer, setPorVencer] = useState(0);
  const contarPorVencer = useCallback(() => {
    if (!(user?.permissions || []).includes(MOBILE_USERS)) return;
    contratosPorVencerAPI
      .contar()
      .then(setPorVencer)
      .catch(() => undefined);
  }, [user]);
  useEffect(() => {
    contarPorVencer();
  }, [contarPorVencer]);
  useRefrescoEnFoco(contarPorVencer);
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
    dejaría en gris, sin poder entrar, a alguien que sí tiene contrato —hasta que llegue la respuesta.
  */
  const sinContrato = !profileLoading && !hasActiveContract(profile);

  const novedadesAction = {
    icon: faCalendar,
    // El permiso del rol se sigue llamando «Cargar novedades»; la tarjeta, corta, para que entre en el teléfono.
    title: "Novedades",
    view: "activity_logs" as ViewType,
    disabled: false,
  };

  const vacationsAction = {
    icon: faUmbrellaBeach,
    title: "Vacaciones",
    view: "vacations" as ViewType,
    disabled: false,
  };

  const ordersAction = {
    icon: faShoppingCart,
    title: "Pedidos",
    view: "orders" as ViewType,
    disabled: false,
  };

  const userCreateAction = {
    // «Contratos» y no «Usuarios»: lo que se hace acá es pedir altas y renovar contratos, no administrar
    // gente. El nombre viejo prometía una pantalla de usuarios que esta no es.
    icon: faUsers,
    title: "Contratos",
    view: "user_history" as ViewType,
    disabled: false,
    /*
      EL NÚMERO CUENTA TAMBIÉN LOS CONTRATOS POR VENCER.

      No es una novedad sin leer —no se marca leído, baja cuando se renuevan o se dejan vencer— pero
      es lo mismo que pide la tarjeta: algo que espera que alguien lo resuelva. Yendo sólo en el
      renglón de abajo, en gris, se perdía entre las tarjetas; el punto naranja es lo que se mira.
    */
    nuevos: nuevasContrataciones + porVencer,
  };

  /*
    «EQUIPOS» YA NO ES UNA TARJETA: está en la barra de abajo, al lado de Proyectos.

    Es a lo que se entra y se vuelve varias veces por día —quién está en qué turno— y desde una
    tarjeta del inicio eso eran dos toques cada vez. La barra la dibuja quien tenga el permiso
    `MOBILE_TEAMS`, que es de las plantillas Supervisor y Coordinador.
  */

  const quickActions: any[] = [];


  /*
    NOVEDADES: UNA SOLA TARJETA CON DOS PESTAÑAS.

    Cargar la asistencia y mirar quién la cargó son dos lados de la misma tarea: el supervisor la
    carga, el coordinador controla que esté. Eran DOS tarjetas, y eso obligaba a volver al inicio
    para pasar de una a la otra —justo lo que se hace cuando alguien no cargó: mirás el
    cumplimiento, le avisás, volvés a mirar—. Ahora entran las dos por acá (ver `views/Novedades`).

    Con UNO de los dos permisos alcanza para entrar: los roles no se superponen —el Supervisor
    sólo tiene «Cargar novedades» y el Coordinador sólo «Cumplimiento»— y exigir el primero habría
    dejado a todos los coordinadores sin su pantalla. Adentro, cada uno ve la pestaña que le toca.

    Qué encuentra adentro depende de sus permisos, y eso lo explica la «i» de la sección.
  */
  const cargaNovedades = puede(MOBILE_ACTIVITY_LOGS);
  const sigueCumplimiento = puede(MOBILE_ACTIVITY_COMPLIANCE);
  if (cargaNovedades || sigueCumplimiento) {
    quickActions.push(novedadesAction);
  }

  if (puede(MOBILE_ORDERS)) {
    quickActions.push(sinContrato ? { ...ordersAction, disabled: true } : ordersAction);
  }

  if (puede(MOBILE_VACATIONS)) {
    const vacacionesDeshabilitadas = sinContrato || profile?.vacationsEnabled === false;
    quickActions.push(
      vacacionesDeshabilitadas
        ? { ...vacationsAction, disabled: true }
        : vacationsAction,
    );
  }

  if (puede(MOBILE_USERS)) {
    quickActions.push(userCreateAction);
  }

  // Registro: el link para que la gente de su área y turno se registre sola, y quiénes lo hicieron.
  if (puede(MOBILE_REGISTRO)) {
    quickActions.push({ icon: faLink, title: "Registro", view: "registro" as ViewType, disabled: false, nuevos: nuevosRegistros });
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
    /*
      Novedades NO entra acá: la abren dos permisos distintos y apagarla por uno solo dejaría
      «En desarrollo» a quien entra por el otro. Se resuelve abajo, mirando los dos.
    */

    orders: MOBILE_ORDERS,
    vacations: MOBILE_VACATIONS,
    user_history: MOBILE_USERS,
    registro: MOBILE_REGISTRO,
  };
  const posicion = (vista: ViewType) => {
    const i = ORDEN_DE_TARJETAS.indexOf(vista);
    return i === -1 ? ORDEN_DE_TARJETAS.length : i; // una vista nueva sin lugar asignado va al final
  };
  // Novedades sólo se apaga si SUS DOS permisos están en desarrollo: con uno vivo, algo hay para ver.
  const novedadesEnDesarrollo = (!cargaNovedades || inactivo(MOBILE_ACTIVITY_LOGS)) && (!sigueCumplimiento || inactivo(MOBILE_ACTIVITY_COMPLIANCE));
  const enDesarrollo = (vista: ViewType) => (vista === "activity_logs" ? novedadesEnDesarrollo : inactivo(PERMISO_DE_VISTA[vista]));
  const acciones = quickActions
    /*
      Una función en desarrollo se ve APAGADA y nada más: sin el renglón que lo decía, la tarjeta
      gris y sin respuesta al tocarla ya cuenta que todavía no está.
    */
    .map((action) => (enDesarrollo(action.view as ViewType) ? { ...action, disabled: true } : action))
    .sort((a, b) => posicion(a.view as ViewType) - posicion(b.view as ViewType));

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 pt-4">
        <UserHeader user={user} perfil={profile} />

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
      <div className={`grid grid-cols-2 gap-3 p-4`}>
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
              /*
                TODAS DEL MISMO ALTO Y CON EL MISMO AIRE ALREDEDOR.

                `p-4` parejo en los cuatro lados: con el contenido en una sola línea, cualquier
                diferencia entre el margen de arriba y el de los costados se ve enseguida.

                `min-h` las iguala entre sí —una tarjeta de título corto quedaba más baja que la de al
                lado y la grilla se veía desparramada— y `items-center` mantiene el contenido centrado
                cuando un título ocupa dos renglones.
              */
              className={`relative flex min-h-[68px] items-center gap-2.5 rounded-xl border p-4 text-left shadow-sm transition-transform
                ${action.disabled ? "opacity-40 cursor-not-allowed bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-600" : "bg-white hover:scale-[1.02] active:scale-[0.98] dark:bg-slate-900/70 border-slate-200 dark:border-slate-600"}`}
            >
              {/*
                ÍCONO CHICO A LA IZQUIERDA DEL NOMBRE.

                El ícono acompaña al nombre, no compite con él: al tamaño del texto y pegado a la
                izquierda se lee como parte del mismo bloque. Más grande, o arriba en su propia fila,
                se vuelve el elemento principal de una tarjeta cuyo dato es el nombre.
              */}
              <FontAwesomeIcon icon={action.icon} className={`h-4 w-4 shrink-0 ${action.disabled ? "text-slate-400 dark:text-slate-500" : "text-primary"}`} />
              {/* Con contador, el título deja libre la esquina: si no, un nombre largo le pasa por debajo. */}
              <h2 className={`min-w-0 break-words text-[15px] font-bold leading-tight sm:text-base text-slate-900 dark:text-slate-100 ${(action as any).nuevos > 0 ? "pr-5" : ""}`}>{action.title}</h2>

              {/*
                CUÁNTO HAY SIN MIRAR: EN LA ESQUINA, CHICO Y VERDE.

                Iba al final del renglón, empujando al nombre: en «Contratación» —el título más largo—
                lo partía en dos o se salía de la tarjeta. En la esquina no le disputa el ancho a
                nadie, y como la tarjeta ya no tiene nada más, no tapa ningún dato.

                VERDE Y TRANSLÚCIDO, no naranja y macizo. El naranja se lee como un problema, y acá
                nunca lo es: son cosas nuevas para mirar. El fondo al 20% deja ver el número sin que
                el globo pese más que el nombre de la tarjeta; el color fuerte lo pone el texto, que
                es lo que hay que leer.
              */}
              {(action as any).nuevos > 0 && (
                <span className="absolute right-2 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500/20 px-1 text-[10px] font-black leading-none text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300">
                  {(action as any).nuevos > 9 ? "9+" : (action as any).nuevos}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
