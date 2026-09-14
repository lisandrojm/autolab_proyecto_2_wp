import { PROJECT_COORDINATOR, PROJECT_SUPERVISOR } from "../../../../utils/permisosMobile";

interface User {
  firstName?: string;
  lastName?: string;
  primaryRole?: string | null;
  roles?: string[];
  permissions?: string[];
  photoUrl?: string;
}

interface UserHeaderProps {
  user: User | null;
  className?: string;
}

function getFirstName(user: User | null): string {
  if (!user) return "Usuario";

  const firstName = user.firstName || "";
  return firstName || "Usuario";
}

/**
 * Qué es la persona en la jerarquía: Supervisor, Coordinador o Colaborador.
 *
 * Sale de las CAPACIDADES del rol (`project_supervisor:eligible`, `project_coordinator:eligible`), no
 * del nombre del rol ni de las tarjetas que ve: Supervisor y Coordinador ven las mismas tarjetas, y un
 * rol se puede llamar como cada tenant quiera. Quien puede las dos cosas lleva las dos. Sin ninguna, es
 * Colaborador. Los colores son los de la Jerarquía del panel web.
 */
function badgesDeJerarquia(user: User | null): { texto: string; clase: string }[] {
  const permisos = user?.permissions || [];
  const badges: { texto: string; clase: string }[] = [];
  if (permisos.includes(PROJECT_SUPERVISOR)) badges.push({ texto: "Coordinador", clase: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" });
  if (permisos.includes(PROJECT_COORDINATOR)) badges.push({ texto: "Supervisor", clase: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300" });
  if (badges.length === 0) badges.push({ texto: "Colaborador", clase: "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300" });
  return badges;
}

export default function UserHeader({ user, className = "" }: UserHeaderProps) {
  const firstName = getFirstName(user);

  return (
    // Sin avatar: las iniciales no dicen nada que no diga el nombre y la pantalla tiene que quedar limpia.
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-slate-100">Hola {firstName}!</h2>
        {badgesDeJerarquia(user).map((b) => (
          <span key={b.texto} className={`rounded border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${b.clase}`}>
            {b.texto}
          </span>
        ))}
      </div>
    </div>
  );
}
