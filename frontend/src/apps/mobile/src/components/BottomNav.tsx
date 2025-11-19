import { Home, Calendar, FolderOpen, User } from "lucide-react";
import { ViewType } from "../types";

interface BottomNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
}

export default function BottomNav({ currentView, onNavigate }: BottomNavProps) {
  const navItems = [
    { id: "home" as ViewType, icon: Home, label: "Inicio", disabled: false },
    { id: "calendar" as ViewType, icon: Calendar, label: "Calendario", disabled: true },
    { id: "documents" as ViewType, icon: FolderOpen, label: "Documentos", disabled: true },
    { id: "profile" as ViewType, icon: User, label: "Perfil", disabled: true },
  ];

  return (
    <nav>
      <div className="fixed bottom-0 left-0 z-30 w-full flex justify-center">
        <div className="z-10 w-full xl:w-1/2 backdrop-blur-sm border-t border-slate-800 py-1">
          <div className="mx-auto grid h-16 max-w-md grid-cols-4 px-2">
            {navItems.map(({ id, icon: Icon, label, disabled }) => {
              const isActive = currentView === id;
              const isClickable = !disabled;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={isClickable ? () => onNavigate(id) : undefined}
                  disabled={disabled}
                  aria-disabled={disabled}
                  className={`group inline-flex flex-col items-center justify-center px-5
                    ${disabled ? "text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60" : isActive ? "text-primary" : "text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary"}`}
                >
                  <Icon className="w-6 h-6" />
                  <span className={`text-xs ${disabled ? "font-medium" : isActive ? "font-bold" : "font-medium group-hover:font-bold"}`}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
