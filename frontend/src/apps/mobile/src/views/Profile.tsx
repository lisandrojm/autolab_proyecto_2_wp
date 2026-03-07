import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faPhone, faMapMarkerAlt, faBriefcase, faCalendar, faSignOutAlt, faCog, faShield, faUserCheck, faBuilding, faIdCard, faClock, faLayerGroup, faUserTie, faUserGraduate, faFileContract, faMoneyBillWave } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "../../../../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";
import { useProfile } from "../hooks/useProfile";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Profile() {
  const { profile, stats, loading } = useProfile();

  const { user, hasPermission, logout } = useAuthStore();

  const isMobileCoordinator = hasPermission("mobile_coordinator:view");
  const isMobileCollaborator = hasPermission("mobile_collaborator:view");

  const userRole = isMobileCoordinator ? "Coordinador" : isMobileCollaborator ? "Colaborador" : "Usuario";
  const roleColor = isMobileCoordinator ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" : "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";

  // Helper to extract active contract info (similar to UsersPage logic)
  const getActiveContractInfo = () => {
    if (!profile?.metadata?.projects) return { type: "Sin contrato activo", seat: "Sin sede", schedule: "Sin horario", project: "Sin proyecto", dates: "Sin fechas", salary: "N/A" };

    let info = { type: null as string | null, seat: null as string | null, schedule: null as string | null, project: null as string | null, dates: null as string | null, salary: null as string | null };

    profile.metadata.projects.forEach((proj: any) => {
      if (proj.contracts) {
        proj.contracts.forEach((c: any) => {
          const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
          // Set end date to end of day to include the full day
          if (endDate) endDate.setHours(23, 59, 59, 999);

          const isActive = !endDate || endDate.getTime() >= new Date().getTime();

          if (isActive) {
            // Prioritize metadata values - check both field names
            const contractType = c.nombre_contrato || c.tipo_contrato;
            if (contractType) info.type = contractType;
            if (c.nombre_sede) info.seat = c.nombre_sede;
            if (c.sueldo_mano) info.salary = String(c.sueldo_mano);

            // Horario: check for 'horario_laboral' or 'horas_semanales'
            if (c.horario_laboral) {
              info.schedule = c.horario_laboral;
            } else if (c.horas_semanales) {
              info.schedule = `${c.horas_semanales} hs`;
            }

            // Fechas
            if (c.fecha_alta_contrato) {
              const start = format(new Date(c.fecha_alta_contrato), "yyyy-MM-dd");
              // Use original string or formatted date for display
              const end = c.fecha_baja_contrato ? format(new Date(c.fecha_baja_contrato), "yyyy-MM-dd") : "Actualidad";
              info.dates = `${start} - ${end}`;
            }

            // Try to find project name if available in basic project data, or use what we have
            if (proj.name) info.project = proj.name;
          }
        });
      }
    });

    // Fallback using externalInfo if metadata extraction failed for key fields
    if (!info.type && profile?.externalInfo?.contracts && profile.externalInfo.contracts.length > 0) {
      info.type = profile.externalInfo.contracts[0];
    }
    if (!info.schedule && profile?.externalInfo?.schedules && profile.externalInfo.schedules.length > 0) {
      info.schedule = profile.externalInfo.schedules[0];
    }

    return {
      type: info.type || "Sin contrato activo",
      seat: info.seat || "Sin sede",
      schedule: info.schedule || "Sin horario",
      project: profile.projectIds && profile.projectIds.length > 0 ? info.project || "Asignado" : "Sin proyecto",
      dates: info.dates || "Sin fechas",
      salary: info.salary || "N/A",
    };
  };

  const contractInfo = getActiveContractInfo();

  // Format hire date
  const hireDateFormatted = profile?.hireDate ? format(new Date(profile.hireDate), "dd MMM yyyy", { locale: es }) : "N/A";

  // Calculate detailed seniority (logic from UsersPage)
  const calculateTotalSeniority = () => {
    if (!profile?.metadata?.projects) return { totalDays: 0, text: "0 días" };

    const totalDays = (profile.metadata.projects || []).reduce(
      (acc: number, p: any) =>
        acc +
        (p.contracts || []).reduce((cAcc: number, c: any) => {
          const start = new Date(c.fecha_alta_contrato);
          const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
          return cAcc + Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        }, 0),
      0,
    );

    if (totalDays === 0) return { totalDays: 0, text: "0 días" };

    const years = Math.floor(totalDays / 365);
    const remainingAfterYears = totalDays % 365;
    const months = Math.floor(remainingAfterYears / 30);
    const remainingDays = remainingAfterYears % 30;

    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
    if (remainingDays > 0) parts.push(`${remainingDays} ${remainingDays === 1 ? "día" : "días"}`);

    const text = parts.length === 0 ? "0 días" : parts.length === 1 ? parts[0] : parts.length === 2 ? `${parts[0]} y ${parts[1]}` : `${parts[0]}, ${parts[1]} y ${parts[2]}`;

    return { totalDays, text };
  };

  const seniorityData = calculateTotalSeniority();
  // We use the simple seniorityText for the header overview (which uses years)
  // But for the stats card we want the detailed text

  // User Stats
  // User Stats
  const userStats = [
    { label: "Antigüedad Total", value: seniorityData.text, subValue: `(${seniorityData.totalDays} días en total)`, icon: faClock },
    {
      label: "Vacaciones Disponibles",
      value: stats?.vacations?.available !== undefined ? stats.vacations.available : "0",
      icon: faBriefcase,
    },
  ];

  /* 
    Mapping requested fields to Profile UI:
    - Ingreso: profile.hireDate
    - Antigüedad Total: profile.seniorityYears
    - Sede: contractInfo.seat
    - Rol Frame: profile.externalInfo?.rolFrames
    - Contrato: contractInfo.type
    - Horario: contractInfo.schedule (if available) -> externalInfo.schedules might be better
    - Proyecto Actual: profile.projectIds (names?)
    - Área: profile.areaName
    - Cargo: profile.positionName
    - Nivel: profile.levelName
    - Reglas: vacationRulesMeta (minDias, diasCorridos)
  */

  const realUserInfo = {
    name: profile?.firstName && profile?.lastName ? `${profile.firstName} ${profile.lastName}` : user?.firstName || "Usuario",
    position: profile?.positionName || "Sin Cargo",
    department: profile?.areaName || "Sin Área", // Using Area as Department equivalent
    email: profile?.email || user?.email || "",
    phone: profile?.phone || "Sin teléfono",
    location: contractInfo.seat, // Using Seat as Location
    startDate: hireDateFormatted,
    employeeId: profile?._id?.slice(-8).toUpperCase() || "ID-???",
    level: profile?.levelName || "Sin Nivel",
    seniority: seniorityData.text,
    roleFrame: profile?.externalInfo?.rolFrames?.[0] || "Sin Rol Frame",
    contractType: contractInfo.type,
    activeProject: stats?.project || contractInfo.project || "Sin proyecto activo",
    schedule: contractInfo.schedule || profile?.externalInfo?.schedules?.[0] || "Sin horario",
    dates: contractInfo.dates,
    salary: contractInfo.salary,
    rules: {
      minDays: stats?.vacationRulesMeta?.minDiasSource || "N/A",
      continuous: stats?.vacationRulesMeta?.diasCorridosSource || "N/A",
    },
  };

  const handleLogout = async () => {
    const result = await sweetAlert.confirm("¿Cerrar sesión?", "¿Estás seguro de que deseas salir de la aplicación?", "Sí, cerrar sesión", "Cancelar");

    if (result.isConfirmed) {
      logout();
      await sweetAlert.success("Sesión cerrada", "Has salido correctamente");
    }
  };

  const handleSettings = async () => {
    await sweetAlert.info("Próximamente", "Esta función estará disponible pronto");
  };

  const handlePrivacy = async () => {
    await sweetAlert.info("Próximamente", "Esta función estará disponible pronto");
  };

  return (
    <div className="flex-1 pb-24">
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Mi Perfil</h1>
          <button onClick={handleLogout} className="flex h-10 w-10 items-center justify-center rounded text-red-600 dark:text-red-400 hover:text-gray-800 dark:hover:text-gray-300 transition-colors">
            <FontAwesomeIcon icon={faSignOutAlt} className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-6 shadow-sm mb-6">
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-20 h-20 rounded bg-cover bg-center bg-no-repeat mb-4 bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-3xl"
              style={{
                backgroundImage: profile?.profilePhotoUrl ? `url("${profile.profilePhotoUrl}")` : undefined,
              }}
            >
              {!profile?.profilePhotoUrl && <span>{realUserInfo.name.charAt(0)}</span>}
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">{realUserInfo.name}</h2>
            <p className="text-base text-slate-500 dark:text-slate-400 mb-1">{realUserInfo.roleFrame}</p>
            <div className="flex gap-2 mt-4">
              <div className={`px-3 py-1.5 rounded flex items-center gap-1.5 ${roleColor}`}>
                <FontAwesomeIcon icon={faUserCheck} className="w-4 h-4" />
                <p className="text-sm font-semibold">{userRole}</p>
              </div>
              <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">ID: {realUserInfo.employeeId}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {/* ASIGNACIÓN (Assignment) */}
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 mt-4 ml-1">Asignación Actual</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Proyecto */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50 col-span-1 md:col-span-2">
                <FontAwesomeIcon icon={faBriefcase} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Proyecto Actual</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.activeProject}</p>
                </div>
              </div>

              {/* Sede */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faBuilding} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Sede</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.location}</p>
                </div>
              </div>

              {/* Rol Frame */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faIdCard} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Rol Frame</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.roleFrame}</p>
                </div>
              </div>
            </div>

            {/* DATOS DE PUESTO (Job Definition) */}
            {/*             <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 mt-4 ml-1">Puesto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faUserTie} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Cargo</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.position}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faUserGraduate} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Nivel</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.level}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50 col-span-1 md:col-span-2">
                <FontAwesomeIcon icon={faLayerGroup} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Área</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.department}</p>
                </div>
              </div>
            </div> */}

            {/* CONTRATO (Contract) */}
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 mt-4 ml-1">Detalles de Contrato</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Tipo de Contrato */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50 col-span-1 md:col-span-2">
                <FontAwesomeIcon icon={faFileContract} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Tipo de Contrato</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.contractType}</p>
                </div>
              </div>

              {/* Horario */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faCalendar} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Horario</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.schedule}</p>
                </div>
              </div>

              {/* Fechas */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faCalendar} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Vigencia</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.dates}</p>
                </div>
              </div>

              {/* Sueldo */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50 col-span-1 md:col-span-2">
                <FontAwesomeIcon icon={faMoneyBillWave} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Sueldo en mano</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.salary !== "N/A" && typeof realUserInfo.salary === "string" ? `$ ${!isNaN(Number(realUserInfo.salary.replace(/[,.]/g, ""))) ? Number(realUserInfo.salary.replace(/[,.]/g, "")).toLocaleString("es-ES") : realUserInfo.salary}` : "N/A"}</p>
                </div>
              </div>
            </div>

            {/* HISTORIAL Y CONTACTO */}
            <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 mt-4 ml-1">Historial y Contacto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Fecha de ingreso */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faBriefcase} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Fecha de ingreso</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.startDate}</p>
                </div>
              </div>

              {/* Antigüedad */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50">
                <FontAwesomeIcon icon={faClock} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Antigüedad</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.seniority}</p>
                </div>
              </div>

              {/* Email */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50 col-span-1 md:col-span-2">
                <FontAwesomeIcon icon={faEnvelope} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 md:truncate">{realUserInfo.email}</p>
                </div>
              </div>

              {/* Teléfono */}
              <div className="flex items-center gap-3 p-3 rounded bg-slate-50 dark:bg-slate-800/50 col-span-1 md:col-span-2">
                <FontAwesomeIcon icon={faPhone} className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-xs text-slate-500 dark:text-slate-400">Teléfono</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{realUserInfo.phone}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {userStats.map((stat, index) => {
            const icon = stat.icon;
            return (
              <div key={index} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm flex flex-col justify-between h-full">
                <div>
                  <FontAwesomeIcon icon={icon} className="w-6 h-6 text-primary mb-2" />
                  <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-0 leading-tight">{stat.value}</p>
                  {(stat as any).subValue && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{(stat as any).subValue}</p>}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{stat.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
