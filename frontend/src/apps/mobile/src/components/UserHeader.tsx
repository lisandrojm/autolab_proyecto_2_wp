import UserAvatar from "./UserAvatar";

interface User {
  firstName?: string;
  lastName?: string;
  primaryRole?: string | null;
  roles?: string[];
  photoUrl?: string;
}

interface UserHeaderProps {
  user: User | null;
  className?: string;
}

function getFullName(user: User | null): string {
  if (!user) return "Usuario";

  const firstName = user.firstName || "";
  const lastName = user.lastName || "";

  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || "Usuario";
}

function formatRole(role?: string | null): string {
  if (!role) return "Usuario";

  const roleMap: Record<string, string> = {
    admin: "Administrador",
    coordinator: "Coordinador",
    collaborator: "Colaborador",
    employee: "Empleado",
    manager: "Manager",
    "platform-admin": "Administrador de Plataforma",
    client: "Cliente",
  };

  return roleMap[role.toLowerCase()] || role;
}

export default function UserHeader({ user, className = "" }: UserHeaderProps) {
  const fullName = getFullName(user);
  const role = formatRole(user?.primaryRole || user?.roles?.[0]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <UserAvatar firstName={user?.firstName} lastName={user?.lastName} photoUrl={user?.photoUrl} size="lg" />
      <div className="flex flex-col">
        <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-slate-100">{fullName}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{role}</p>
      </div>
    </div>
  );
}
