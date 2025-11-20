import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faSun, faMoon, faBars, faCog } from "@fortawesome/free-solid-svg-icons";
import { useThemeStore } from "../../../../stores/themeStore";

interface MobileHeaderProps {
  onMenuToggle: () => void;
  hasNotifications?: boolean;
  notificationCount?: number;
  onNotificationClick?: () => void;
}

export default function MobileHeader({
  onMenuToggle,
  hasNotifications = false,
  notificationCount = 0,
  onNotificationClick
}: MobileHeaderProps) {
  const { theme, toggleTheme } = useThemeStore();

  return (
    <header className="sticky top-0 z-40 bg-slate-900 dark:bg-slate-950 border-b border-slate-800 dark:border-slate-900">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onMenuToggle}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-slate-800 dark:hover:bg-slate-900 transition-colors"
          aria-label="Abrir menú"
        >
          <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-slate-800 dark:hover:bg-slate-900 transition-colors"
            aria-label="Cambiar tema"
          >
            {theme === "dark" ? (
              <FontAwesomeIcon icon={faSun} className="w-5 h-5" />
            ) : (
              <FontAwesomeIcon icon={faMoon} className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={onNotificationClick}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-slate-800 dark:hover:bg-slate-900 transition-colors"
            aria-label="Notificaciones"
          >
            <FontAwesomeIcon icon={faBell} className="w-5 h-5" />
            {hasNotifications && notificationCount > 0 && (
              <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
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
