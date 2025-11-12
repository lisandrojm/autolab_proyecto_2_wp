import { ShoppingCart, Umbrella, FileText, Receipt, CheckCircle, File, Users, BarChart3 } from "lucide-react";
import { ViewType } from "../types";
import { useAuthStore } from "../../../../stores/authStore";

interface HomeProps {
  onNavigate: (view: ViewType) => void;
}

export default function Home({ onNavigate }: HomeProps) {
  const { user, hasPermission } = useAuthStore();

  const isMobileCoordinator = hasPermission("mobile:coordinator");
  const isMobileCollaborator = hasPermission("mobile:collaborator");

  const baseActions = [
    {
      icon: ShoppingCart,
      title: "Mis Pedidos",
      description: "Gestiona tus pedidos",
      view: "orders" as ViewType,
      roles: ["coordinator", "collaborator"],
    },
    {
      icon: Umbrella,
      title: "Solicitar Vacaciones",
      description: "Solicita tus días libres",
      view: "vacations" as ViewType,
      roles: ["coordinator", "collaborator"],
    },
    {
      icon: FileText,
      title: "Mis Contratos",
      description: "Consulta tus documentos",
      view: "documents" as ViewType,
      roles: ["coordinator", "collaborator"],
    },
    {
      icon: Receipt,
      title: "Mis Recibos",
      description: "Accede a tus nóminas",
      view: "documents" as ViewType,
      roles: ["coordinator", "collaborator"],
    },
  ];

  const coordinatorActions = [
    {
      icon: Users,
      title: "Gestión de Equipo",
      description: "Administra tu equipo",
      view: "home" as ViewType,
      roles: ["coordinator"],
    },
    {
      icon: BarChart3,
      title: "Reportes",
      description: "Ver métricas y estadísticas",
      view: "home" as ViewType,
      roles: ["coordinator"],
    },
  ];

  const quickActions = isMobileCoordinator ? [...baseActions, ...coordinatorActions] : baseActions;

  const recentActivities = [
    {
      icon: CheckCircle,
      title: "Solicitud de días libres",
      description: "Aprobada (hace 2 días)",
      bgColor: "bg-green-100 dark:bg-green-900/50",
      iconColor: "text-green-600 dark:text-green-400",
    },
    {
      icon: File,
      title: "Recibo de Noviembre 2023",
      description: "Disponible para descargar",
      bgColor: "bg-blue-100 dark:bg-blue-900/50",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
  ];

  return (
    <div className="flex-1 pb-24">
      <h1 className="px-4 pb-3 pt-6 text-3xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100">Hola, {user?.firstName || "Usuario"}</h1>

      {/* ALERT TAILWIND */}
      <div className="p-4">
        <div className="flex items-start gap-3 rounded-xl border border-green-500 bg-green-50 p-4 shadow-sm dark:border-green-400 dark:bg-green-900/40">
          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800 dark:text-green-100">Tu solicitud de vacaciones fue aprobada</p>
            <p className="text-sm text-green-700 dark:text-green-300">Notificación importante</p>
          </div>
          <button className="flex h-9 min-w-[84px] max-w-[160px] cursor-pointer items-center justify-center overflow-hidden rounded-lg px-3 text-xs font-medium leading-normal text-white bg-primary shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50">
            <span className="truncate">Ver detalles</span>
          </button>
        </div>
      </div>

      <div className={`grid ${isMobileCoordinator ? "grid-cols-2" : "grid-cols-2"} gap-4 p-4`}>
        {quickActions.map((action, index) => {
          const Icon = action.icon;
          const isCoordinatorOnly = action.roles?.includes("coordinator") && !action.roles?.includes("collaborator");

          return (
            <button key={index} onClick={() => onNavigate(action.view)} className={`flex flex-col flex-1 gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] dark:bg-slate-900/70 ${isCoordinatorOnly ? "border-blue-200 dark:border-blue-800" : "border-slate-200 dark:border-slate-800"}`}>
              <Icon className={`h-6 w-6 ${isCoordinatorOnly ? "text-blue-600 dark:text-blue-400" : "text-primary"}`} />
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-bold leading-tight text-slate-900 dark:text-slate-100">{action.title}</h2>
                <p className="text-sm font-normal leading-normal text-slate-500 dark:text-slate-400">{action.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      <h3 className="px-4 pb-2 pt-4 text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-slate-100">Actividad Reciente</h3>

      <div className="flex flex-col gap-3 px-4">
        {recentActivities.map((activity, index) => {
          const Icon = activity.icon;
          return (
            <div key={index} className="flex items-center gap-4 rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900/70">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${activity.bgColor}`}>
                <Icon className={`h-5 w-5 ${activity.iconColor}`} />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-800 dark:text-slate-200">{activity.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{activity.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
