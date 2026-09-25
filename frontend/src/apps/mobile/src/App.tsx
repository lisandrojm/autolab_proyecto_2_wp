import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import RutasPlantillas from "./components/plantillas/RutasPlantillas";
import { ViewType } from "./types";
// import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import Home from "./views/Home";
import Calendar from "./views/Calendar";
import Documents from "./views/Documents";
import Profile from "./views/Profile";
import Proyectos from "./views/Proyectos";
import Vacations from "./views/Vacations";
import Orders from "./views/Orders";
import Requests from "./views/Requests";
import Novedades from "./views/Novedades";
import UserHistory from "./views/UserHistory";
import MyTeams from "./views/MyTeams";
import Registro from "./views/Registro";
import Notificaciones from "./views/Notificaciones";
import { useAuthStore } from "../../../stores/authStore";
import { useThemeStore } from "../../../stores/themeStore";
import { usePermisoInactivo } from "../../../stores/permisosInactivosStore";
import { useNotifications } from "./hooks/useNotifications";
import { useRefrescoEnFoco } from "./hooks/useRefrescoEnFoco";
// Una tarjeta = un permiso. El porqué y la contraparte del server están en ese módulo.
import { MOBILE_ACTIVITY_COMPLIANCE, MOBILE_ACTIVITY_LOGS, MOBILE_HIRING_TEMPLATES, MOBILE_ORDERS, MOBILE_REGISTRO, MOBILE_TEAMS, MOBILE_USERS, MOBILE_VACATIONS } from "../../../utils/permisosMobile";

function App() {
  const [currentView, setCurrentView] = useState<ViewType>("home");
  const location = useLocation();
  /*
    VOLVER DESDE PLANTILLAS: esas pantallas tienen URL propia, el resto de la app no. Al volver a
    `/mobile` dicen a qué vista y pestaña (por `state`), para no caer en el inicio.
  */
  const [pestanaContratacion, setPestanaContratacion] = useState<string | undefined>();
  useEffect(() => {
    const st = location.state as { vista?: ViewType; pestana?: string } | null;
    if (st?.vista) {
      setCurrentView(st.vista);
      setPestanaContratacion(st.pestana);
    }
  }, [location.key]);
  // Intent para abrir Pedidos con un tipo preseleccionado y bloqueado (ej: desde el perfil).
  const [ordersInitialType, setOrdersInitialType] = useState<string | null>(null);
  const { user, tenantId, setTenantId } = useAuthStore();
  const { theme } = useThemeStore();
  /*
    Los avisos se piden al abrir la app, no al entrar a la campanita: el número tiene que estar en la
    barra de abajo y en las tarjetas del inicio desde el primer momento, que es de lo que sirve.

    Y se vuelven a pedir mientras la app está a la vista: lo que se decide en el escritorio —aprobar,
    rechazar, reabrir una solicitud— pasa con la app ya abierta, y sin este refresco el número recién
    cambiaba la próxima vez que alguien la cerrara y la volviera a abrir.
  */
  const { unreadCount, ensureLoaded, refetch } = useNotifications();
  useEffect(() => {
    ensureLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useRefrescoEnFoco(() => void refetch());

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (user?.tenantId && (!tenantId || tenantId === "demo-tenant")) {
      setTenantId(user.tenantId);
      localStorage.setItem("tenantId", user.tenantId);
      if (user.tenantSlug) {
        localStorage.setItem("tenantSlug", user.tenantSlug);
      }
    }
  }, [user, tenantId, setTenantId]);

  /*
    QUÉ VE CADA UNO: UN PERMISO POR TARJETA.

    Se leen los permisos crudos y no `hasPermission` a propósito: en el servidor un Admin pasa
    cualquier chequeo de permisos, y acá eso convertiría a todo administrador en usuario de la app
    aunque su rol no la tenga. La app es de quien la tiene, no de quien manda.

    Antes esto eran dos roles cerrados —colaborador y coordinador— y qué mostraba cada uno estaba
    escrito acá abajo: el coordinador veía Novedades y Usuarios, el colaborador no, y no había forma
    de cambiarlo sin tocar el código. Ahora cada tarjeta es un permiso que se tilda en Usuarios → Roles.
  */
  const permisos = user?.permissions || [];
  // Un permiso inactivo (en desarrollo) no abre su vista: la tarjeta se ve apagada y, si se llega igual,
  // se vuelve al inicio. Al SuperAdmin no le aplica: es quien lo prueba. El ACCESO a la app no cambia.
  const inactivo = usePermisoInactivo();
  const puede = (permiso: string) => permisos.includes(permiso) && !inactivo(permiso);
  const hasMobileAccess = permisos.some((p) => p.startsWith("mobile_"));

  /*
    Cada vista se protege con su permiso, no sólo la tarjeta del inicio.

    Sin esto, quien conoce la pantalla podría llegar igual —la navegación es estado local, no URL— y
    la única puerta sería la tarjeta que no le mostramos. Sin permiso vuelve al inicio, que es lo
    único que siempre está: `home` y `profile` son de cualquiera que entre a la app.
  */
  const renderView = () => {
    const inicio = <Home onNavigate={setCurrentView} />;

    switch (currentView) {
      case "home":
        return inicio;
      case "calendar":
        return <Calendar />;
      case "documents":
        return <Documents />;
      case "profile":
        return (
          <Profile
            onBack={() => setCurrentView("home")}
            onChangePersonalData={() => {
              setOrdersInitialType("datos_personales");
              setCurrentView("orders");
            }}
          />
        );
      case "proyectos":
        return <Proyectos onNavigate={setCurrentView} />;
      case "vacations":
        return puede(MOBILE_VACATIONS) ? <Vacations onNavigate={setCurrentView} /> : inicio;
      case "orders":
        return puede(MOBILE_ORDERS) ? <Orders onNavigate={setCurrentView} initialCategoryType={ordersInitialType} onIntentConsumed={() => setOrdersInitialType(null)} /> : inicio;
      case "requests":
        return puede(MOBILE_USERS) ? <Requests onNavigate={setCurrentView} /> : inicio;
      /*
        Novedades es una pantalla con dos pestañas: cargar la asistencia y ver quién la cargó. Se
        entra con CUALQUIERA de los dos permisos y adentro se muestra la que corresponda.
      */
      case "activity_logs":
        return puede(MOBILE_ACTIVITY_LOGS) || puede(MOBILE_ACTIVITY_COMPLIANCE) ? <Novedades onNavigate={setCurrentView} /> : inicio;
      case "user_history":
        return puede(MOBILE_USERS) ? <UserHistory key={location.key} onNavigate={setCurrentView} pestanaInicial={pestanaContratacion as any} /> : inicio;
      case "my_teams":
        return puede(MOBILE_TEAMS) ? <MyTeams onNavigate={setCurrentView} /> : inicio;
      // Cumplimiento dejó de ser una pantalla propia: es una pestaña. Se conserva para que los avisos
      // y cualquier navegación vieja que apunte acá caigan en esa pestaña y no en el inicio.
      case "activity_compliance":
        return puede(MOBILE_ACTIVITY_COMPLIANCE) ? <Novedades onNavigate={setCurrentView} pestanaInicial="cumplimiento" /> : inicio;
      case "registro":
        return puede(MOBILE_REGISTRO) ? <Registro onNavigate={setCurrentView} /> : inicio;
      // Las notificaciones son de cualquiera que entre a la app: avisan sobre lo que ya puede ver.
      case "notifications":
        return <Notificaciones onNavigate={setCurrentView} />;
      default:
        return inicio;
    }
  };

  // const showTopBar =
  //   currentView === "home" ||
  //   currentView === "calendar" ||
  //   currentView === "documents" ||
  //   currentView === "profile";

  if (!hasMobileAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded flex items-center justify-center">
              <span className="text-red-600 dark:text-red-400 text-3xl">⚠️</span>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Acceso Restringido</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">No tienes permisos para acceder a esta aplicación. Por favor, contacta con tu administrador si necesitas acceso.</p>
          <a href="/dashboard" className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors duration-200">
            ← Volver al Dashboard
          </a>
        </div>
      </div>
    );
  }

  /*
    Acá había una segunda pantalla de bloqueo: "tu rol aún no está completamente configurado".

    Existía porque el acceso y el rol eran dos cosas distintas —se podía tener `mobile:access` sin ser
    ni colaborador ni coordinador— y en ese hueco la app no sabía qué mostrar. Ya no hay hueco: se
    entra con cualquier permiso del móvil, y ese permiso ES una tarjeta. Quien no tiene ninguno cae
    en el bloqueo de arriba, que dice lo que hay que hacer.
  */

  // Las pantallas de Plantillas (con URL): a pantalla completa, sin la barra de abajo.
  if (location.pathname.startsWith("/mobile/plantillas")) {
    const permitido = puede(MOBILE_USERS) && puede(MOBILE_HIRING_TEMPLATES);
    return (
      <div className="w-full dark:bg-gray-900 flex justify-center">
        <div className="relative flex min-h-screen flex-col text-slate-800 dark:text-slate-200 font-display w-full xl:w-1/2">{permitido ? <RutasPlantillas /> : <div className="p-6 text-center text-sm">No tenés acceso a Plantillas. <a href="/mobile" className="font-bold text-blue-600 underline">Volver</a></div>}</div>
      </div>
    );
  }

  return (
    <div className="w-full dark:bg-gray-900 flex justify-center">
      <div className="relative flex min-h-screen flex-col bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-display w-full xl:w-1/2">
        {renderView()}
        <BottomNav currentView={currentView} onNavigate={setCurrentView} sinLeer={unreadCount} puedeEquipos={puede(MOBILE_TEAMS)} />
      </div>
    </div>
  );
}

export default App;
