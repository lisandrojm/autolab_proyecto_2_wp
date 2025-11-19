import { Bell, Sun, Moon, LogOut } from "lucide-react";
import { useThemeStore } from "../../../../stores/themeStore";
import { useAuthStore } from "../../../../stores/authStore";
import { useNavigate } from "react-router-dom";

interface TopBarProps {
  title: string;
  hasNotifications?: boolean;
  onNotificationClick?: () => void;
  userRole?: "coordinator" | "collaborator" | null;
  userName?: string;
}

export default function TopBar({ title, hasNotifications = false, onNotificationClick, userRole, userName }: TopBarProps) {
  const { theme, toggleTheme } = useThemeStore();
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    window.location.href = "/login";
  };

  const roleConfig = {
    coordinator: {
      label: "Coordinador",
      bgColor: "bg-gradient-to-r from-blue-500 to-indigo-600",
      textColor: "text-white",
      icon: "👔",
    },
    collaborator: {
      label: "Colaborador",
      bgColor: "bg-gradient-to-r from-green-500 to-teal-600",
      textColor: "text-white",
      icon: "👥",
    },
  };

  const currentRole = userRole ? roleConfig[userRole] : null;
  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 py-3">
      <div className="flex items-center justify-between p-4 pb-2">
        {/*         <div className="flex size-12 shrink-0 items-center">
          <div
            className="aspect-square size-10 rounded-full bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDnU5QgjujmeNxIQ7pvt9_qea6WcNgYxkcEOwLGTbpmOMgiHIGlCVJThmfNMwgtI2StbRn_-fsM4f2H7D7V7kzSdBD4nl_ux9WkpBnkzSk7BN0kYBID1tvvY2bitI_6gegGrxmOzHiS4cBqDuzypMZcKskWJpeJXG0rzlDTUzQc-HZBlyLAeYLSuh1IcJJvQzn6IscRJR31tvtB3H3azl8Fs8xuNtTR-PeJrgaFtrYj5-SY0PtflPUrD8ogDtnJCfL_bvQfVpffK5c")',
            }}
          />
        </div> */}
        {currentRole && (
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${currentRole.bgColor} ${currentRole.textColor} text-sm font-semibold shadow-sm`}>
            <span>{currentRole.icon}</span>
            <span>{currentRole.label}</span>
            {userName && (
              <>
                <span className="opacity-70">•</span>
                <span className="font-normal">{userName}</span>
              </>
            )}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button onClick={toggleTheme} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-transparent text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Cambiar tema">
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={handleLogout} className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-transparent text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" aria-label="Cerrar sesión">
            <LogOut className="w-5 h-5" />
          </button>
          <button onClick={onNotificationClick} className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg bg-transparent text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" aria-label="Notificaciones">
            <Bell className="w-5 h-5" />
            {hasNotifications && (
              <span className="absolute right-2 top-2 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
