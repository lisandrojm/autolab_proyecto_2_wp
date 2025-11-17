import { Mail, Phone, MapPin, Briefcase, Calendar, LogOut, Settings, Shield, UserCheck } from 'lucide-react';
import { useAuthStore } from '../../../../stores/authStore';
import { sweetAlert } from '../utils/sweetAlert';

export default function Profile() {
  const { user, hasPermission, logout } = useAuthStore();

  const isMobileCoordinator = hasPermission('mobile:coordinator');
  const isMobileCollaborator = hasPermission('mobile:collaborator');

  const userRole = isMobileCoordinator ? 'Coordinador' : isMobileCollaborator ? 'Colaborador' : 'Usuario';
  const roleColor = isMobileCoordinator ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';

  const userInfo = {
    name: user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : user?.firstName || 'Usuario',
    position: 'Desarrollador Senior',
    department: 'Tecnología',
    email: user?.email || 'usuario@empresa.com',
    phone: '+34 612 345 678',
    location: 'Madrid, España',
    startDate: '2020-03-15',
    employeeId: user?.id?.slice(-8).toUpperCase() || 'EMP-001',
  };

  const stats = [
    { label: 'Días trabajados', value: '1,450', icon: Calendar },
    { label: 'Días de vacaciones', value: '18', icon: Briefcase },
  ];

  const handleLogout = async () => {
    const result = await sweetAlert.confirm(
      '¿Cerrar sesión?',
      '¿Estás seguro de que deseas salir de la aplicación?',
      'Sí, cerrar sesión',
      'Cancelar'
    );

    if (result.isConfirmed) {
      logout();
      await sweetAlert.success('Sesión cerrada', 'Has salido correctamente');
    }
  };

  const handleSettings = async () => {
    await sweetAlert.info('Próximamente', 'Esta función estará disponible pronto');
  };

  const handlePrivacy = async () => {
    await sweetAlert.info('Próximamente', 'Esta función estará disponible pronto');
  };

  const menuItems = [
    {
      icon: Settings,
      label: 'Configuración',
      description: 'Preferencias y ajustes',
      onClick: handleSettings,
    },
    {
      icon: Shield,
      label: 'Privacidad',
      description: 'Seguridad y datos',
      onClick: handlePrivacy,
    },
    {
      icon: LogOut,
      label: 'Cerrar Sesión',
      description: 'Salir de la aplicación',
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <div className="flex-1 pb-24">
      <div className="px-4 pt-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-6">Mi Perfil</h1>

        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-6 shadow-sm mb-6">
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-24 h-24 rounded-full bg-cover bg-center bg-no-repeat mb-4"
              style={{
                backgroundImage:
                  'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDnU5QgjujmeNxIQ7pvt9_qea6WcNgYxkcEOwLGTbpmOMgiHIGlCVJThmfNMwgtI2StbRn_-fsM4f2H7D7V7kzSdBD4nl_ux9WkpBnkzSk7BN0kYBID1tvvY2bitI_6gegGrxmOzHiS4cBqDuzypMZcKskWJpeJXG0rzlDTUzQc-HZBlyLAeYLSuh1IcJJvQzn6IscRJR31tvtB3H3azl8Fs8xuNtTR-PeJrgaFtrYj5-SY0PtflPUrD8ogDtnJCfL_bvQfVpffK5c")',
              }}
            />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">{userInfo.name}</h2>
            <p className="text-base text-slate-500 dark:text-slate-400 mb-1">{userInfo.position}</p>
            <p className="text-sm text-slate-400 dark:text-slate-500">{userInfo.department}</p>
            <div className="flex gap-2 mt-4">
              <div className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 ${roleColor}`}>
                <UserCheck className="w-4 h-4" />
                <p className="text-sm font-semibold">{userRole}</p>
              </div>
              <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">ID: {userInfo.employeeId}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <Mail className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{userInfo.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <Phone className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Teléfono</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{userInfo.phone}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <MapPin className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Ubicación</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{userInfo.location}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <Briefcase className="w-5 h-5 text-primary" />
              <div className="flex-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">Fecha de ingreso</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {new Date(userInfo.startDate).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
                <Icon className="w-6 h-6 text-primary mb-2" />
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">{stat.value}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={index}
                onClick={item.onClick}
                className={`w-full flex items-center gap-4 p-4 rounded-xl shadow-sm transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                  item.danger
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : 'bg-white dark:bg-slate-900/70'
                }`}
              >
                <div
                  className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                    item.danger
                      ? 'bg-red-100 dark:bg-red-900/50'
                      : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  <Icon
                    className={`w-6 h-6 ${
                      item.danger
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-primary'
                    }`}
                  />
                </div>
                <div className="flex-1 text-left">
                  <p
                    className={`font-semibold ${
                      item.danger
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {item.label}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
