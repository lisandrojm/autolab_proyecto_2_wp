import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelope, faPhone, faBriefcase, faCalendar, faSignOutAlt, faClock, faUser, faMapMarkerAlt, faUniversity, faPenToSquare , faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { useAuthStore } from '../../../../stores/authStore';
import { sweetAlert } from '../utils/sweetAlert';
import { useProfile } from '../hooks/useProfile';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { infoAPI, InfoItem } from '../../../../api/info';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../../../api/simpleCatalog';
import { MOBILE_ACTIVITY_LOGS } from '../../../../utils/permisosMobile';
import { resumenSinBanco } from '../../../../utils/bancarios';

type RegistroInfoTab = 'general' | 'domicilio' | 'bancarios';

/** Fila compacta etiqueta/valor para el detalle de datos del registro. */
const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) => (
  <div className="flex justify-between items-center gap-3 py-1.5 border-b border-slate-50 dark:border-slate-800/50 last:border-b-0">
    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter shrink-0">{label}</p>
    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 text-right truncate">{value !== undefined && value !== null && value !== '' ? value : <span className="text-slate-300 dark:text-slate-600">—</span>}</p>
  </div>
);

/**
 * `onBack` es la flecha del encabezado.
 *
 * El Perfil se abre desde la barra de abajo, así que técnicamente no se «entra» desde ningún lado.
 * Pero el resto de las secciones tienen su flecha arriba a la izquierda —y este encabezado ya copia
 * el botón de salir de `SectionHeader`—: sin ella la pantalla parece a medio hacer.
 */
export default function Profile({ onChangePersonalData, onBack }: { onChangePersonalData?: () => void; onBack?: () => void }) {
  const { profile, stats, loading } = useProfile();
  const { user, logout } = useAuthStore();

  // Datos del registro (Historial y Contacto → tabs) + catálogos para resolver IDs → nombres.
  const [activeInfoTab, setActiveInfoTab] = useState<RegistroInfoTab>('general');
  const [documentTypes, setDocumentTypes] = useState<InfoItem[]>([]);
  const [genders, setGenders] = useState<InfoItem[]>([]);
  const [educationLevels, setEducationLevels] = useState<InfoItem[]>([]);
  const [nationalities, setNationalities] = useState<InfoItem[]>([]);
  const [countries, setCountries] = useState<InfoItem[]>([]);
  // País del DOMICILIO: ABM de Países de residencia (la nacionalidad sigue con los países de FRAME).
  const [paisesResidencia, setPaisesResidencia] = useState<SimpleCatalogItem[]>([]);
  const [banks, setBanks] = useState<InfoItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dt, g, el, n, c, b] = await Promise.all([infoAPI.listByType('tipo-documento'), infoAPI.listByType('genero'), infoAPI.listByType('nivel-estudio'), infoAPI.listByType('nacionalidad'), infoAPI.listByType('pais'), infoAPI.listByType('banco')]);
        if (cancelled) return;
        setDocumentTypes(dt);
        setGenders(g);
        setEducationLevels(el);
        setNationalities(n);
        setCountries(c);
        setBanks(b);
        // Aparte y con su catch: es nuevo, y si no responde el país se resuelve con los de FRAME (mismos ids).
        void createSimpleCatalogApi('/paises-residencia')
          .list()
          .then((pr) => !cancelled && setPaisesResidencia(Array.isArray(pr) ? pr : []))
          .catch(() => undefined);
      } catch {
        /* catálogos opcionales: si fallan, se muestran los valores crudos o "—" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Resuelve un id numérico contra un catálogo Info (data.id) → nombre.
  const nameFromInfo = (list: InfoItem[], id?: number | string | null) => {
    if (id === undefined || id === null || id === '') return '';
    return list.find((it) => String(it.data?.id) === String(id))?.name || '';
  };

  // Fecha en formato dd/MM/yyyy (tolera "YYYY-MM-DD" e ISO).
  const fmtDate = (v?: string) => {
    if (!v) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      const [y, m, d] = v.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
    const dt = new Date(v);
    return isNaN(dt.getTime()) ? v : format(dt, 'dd/MM/yyyy');
  };

  const md: any = (profile as any)?.metadata || {};
  const infoTabs: { key: RegistroInfoTab; label: string; icon: any }[] = [
    { key: 'general', label: 'General', icon: faUser },
    { key: 'domicilio', label: 'Domicilio', icon: faMapMarkerAlt },
    { key: 'bancarios', label: 'Bancarios', icon: faUniversity },
  ];

  // Explica que los datos personales solo se cambian vía un pedido, y ofrece Pedidos.
  const handleInfoDatosPersonales = async () => {
    const res = await sweetAlert.confirm('Cambiar datos personales', "Para modificar tus datos personales tenés que generar un pedido de tipo 'Datos Personales'. Solo vas a poder cambiar los campos habilitados por el administrador.", 'Pedidos', 'Cerrar');
    if (res.isConfirmed) onChangePersonalData?.();
  };

  if (loading) return null;

  /*
    El cartelito del perfil muestra EL ROL QUE LA PERSONA TIENE, con su nombre.

    Antes decía "Mobile-Coordinador" o "Mobile-Colaborador" según si el nombre del rol contenía esas
    palabras — dos roles que ya no existen como algo fijo, con lo cual el cartel habría dicho "Usuario"
    para cualquiera que armara los suyos. Y encima se contradecía con el resto de la app, que decidía
    por permiso mientras esto decidía por nombre.

    Lo que distingue a un coordinador es poder cargar novedades; eso se usa para el color, y el texto
    es sencillamente cómo se llama su rol.
  */
  const cargaNovedadesEnApp = (user?.permissions || []).includes(MOBILE_ACTIVITY_LOGS);
  const userRole = user?.roles?.[0] || 'Usuario';
  const roleColor = cargaNovedadesEnApp ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800' : 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20';


  // 2. Calculate Seniority
  const calculateTotalSeniority = () => {
    if (!profile?.metadata?.projects) return { totalDays: 0, text: '0 días' };

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

    if (totalDays === 0) return { totalDays: 0, text: '0 días' };

    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days = totalDays % 30;

    const parts = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
    if (days > 0) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);

    return { totalDays, text: parts.join(', ') };
  };

  const seniority = calculateTotalSeniority();

  const handleLogout = async () => {
    const result = await sweetAlert.confirm('¿Cerrar sesión?', '¿Estás seguro de que deseas salir?', 'Sí, cerrar sesión', 'Cancelar');
    if (result.isConfirmed) {
      logout();
      await sweetAlert.success('Sesión cerrada', 'Has salido correctamente');
    }
  };

  return (
    <div className="flex-1 pb-24 px-4 pt-4 space-y-4 animate-in fade-in duration-500">
      {/* Compact Header Section */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900/70 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
        {/* Misma flecha, mismo tamaño y mismo lugar que en `SectionHeader`. */}
        {onBack && (
          <button onClick={onBack} aria-label="Volver" className="-ml-2 mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded transition-colors hover:bg-slate-200 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faArrowLeft} className="h-5 w-5 text-slate-900 dark:text-slate-100" />
          </button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Mi Perfil</h1>
            <div className={`px-2 py-0.5 rounded-md flex items-center gap-1 ${roleColor}`}>
              <p className="text-[9px] font-black uppercase tracking-tighter">{userRole}</p>
            </div>
          </div>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400 leading-none">
            {profile?.firstName} {profile?.lastName}
          </p>
          <p className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest mt-1.5">ID: {profile?._id?.slice(-6).toUpperCase()}</p>
        </div>
        {/* Mismo botón de salir que el inicio y las secciones (`SectionHeader`): sin recuadro. */}
        <button onClick={handleLogout} aria-label="Cerrar sesión" className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-red-600 transition-colors hover:text-gray-800 dark:text-red-400 dark:hover:text-gray-300">
          <FontAwesomeIcon icon={faSignOutAlt} className="h-5 w-5" />
        </button>
      </div>

      {/* Stats Section - Compact Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500">
            <FontAwesomeIcon icon={faClock} size="sm" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-slate-100 leading-tight">{seniority.text || '0 días'}</p>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">Antigüedad</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
            <FontAwesomeIcon icon={faBriefcase} size="sm" />
          </div>
          <div>
            <p className="text-lg font-black text-slate-900 dark:text-slate-100 leading-tight">{stats?.vacations?.available || 0}</p>
            <p className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">Vacaciones</p>
          </div>
        </div>
      </div>

      {/* History & Contact - More compact */}
      <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm space-y-3 border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex-1 h-[1px] bg-slate-100 dark:bg-slate-800"></div>
          <h3 className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Historial y Contacto</h3>
          <div className="flex-1 h-[1px] bg-slate-100 dark:bg-slate-800"></div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700">
              <FontAwesomeIcon icon={faCalendar} size="sm" />
            </div>
            <div className="flex justify-between flex-1 items-center">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Ingreso</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{profile?.hireDate ? format(new Date(profile.hireDate), 'dd MMM yyyy', { locale: es }) : 'N/A'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700">
              <FontAwesomeIcon icon={faEnvelope} size="sm" />
            </div>
            <div className="flex justify-between flex-1 items-center overflow-hidden">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Email</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate ml-4">{profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-100 dark:border-slate-700">
              <FontAwesomeIcon icon={faPhone} size="sm" />
            </div>
            <div className="flex justify-between flex-1 items-center">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tighter">Teléfono</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{profile?.phone || 'Sin teléfono'}</p>
            </div>
          </div>
        </div>

        {/* Datos del registro, organizados en tabs */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <h4 className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Datos personales</h4>
              <button type="button" onClick={handleInfoDatosPersonales} title="¿Cómo cambio mis datos personales?" className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-primary transition-colors">
                <FontAwesomeIcon icon={faPenToSquare} className="text-[11px]" />
              </button>
            </div>
            {onChangePersonalData && (
              <button type="button" onClick={onChangePersonalData} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider hover:bg-primary/20 transition-colors">
                <FontAwesomeIcon icon={faPenToSquare} className="text-[9px]" />
                Cambiar datos
              </button>
            )}
          </div>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg p-1 mb-3">
            {infoTabs.map((t) => (
              <button key={t.key} type="button" onClick={() => setActiveInfoTab(t.key)} className={`flex-1 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-1 ${activeInfoTab === t.key ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-400'}`}>
                <FontAwesomeIcon icon={t.icon} className="text-[9px]" />
                {t.label}
              </button>
            ))}
          </div>

          {activeInfoTab === 'general' && (
            <div className="animate-in fade-in duration-300">
              <InfoRow label="Tipo de documento" value={nameFromInfo(documentTypes, md.tipoDocumentoId)} />
              <InfoRow label="Documento" value={md.documento} />
              <InfoRow label="CUIT / CUIL" value={md.cuit} />
              <InfoRow label="Fecha de nacimiento" value={fmtDate(md.fechaNac)} />
              <InfoRow label="Género" value={nameFromInfo(genders, md.generoId)} />
              <InfoRow label="Estado civil" value={md.estadoCivil} />
              <InfoRow label="Nivel de estudio" value={nameFromInfo(educationLevels, md.nivelEstudioId)} />
              <InfoRow label="Nacionalidad" value={nameFromInfo(nationalities.length ? nationalities : countries, md.nacionalidadId)} />
              {/* Sin "Obra social": se declara en el CONTRATO y se constata contra el padrón de la
                  SSS, no es un dato del legajo de la persona. */}
            </div>
          )}

          {activeInfoTab === 'domicilio' && (
            <div className="animate-in fade-in duration-300">
              <InfoRow label="País" value={paisesResidencia.find((p) => String(p.data?.id) === String(md.paisId))?.name || md.pais || nameFromInfo(countries, md.paisId)} />
              <InfoRow label="Localidad" value={md.localidad} />
              <InfoRow label="Calle" value={md.calle} />
              <InfoRow label="Altura" value={md.altura} />
              <InfoRow label="Piso / Depto" value={md.pisoDepto} />
              <InfoRow label="Código postal" value={md.codigoPostal} />
              <InfoRow label="Teléfono" value={md.telefono} />
            </div>
          )}

          {activeInfoTab === 'bancarios' && (
            <div className="animate-in fade-in duration-300">
              <InfoRow label="Banco" value={nameFromInfo(banks, md.bancoId) || (md.tipoEntidadFinanciera === 'sin_banco' ? resumenSinBanco(md) || 'No tiene banco' : '')} />
              <InfoRow label="CBU / CVU" value={md.cbu} />
              <InfoRow label="Tipo de cuenta" value={md.tipoDeCuentaBancaria} />
              <InfoRow label="Nro. de cuenta" value={md.nroDeCuentaBancaria} />
              <InfoRow label="Alias" value={md.aliasBancario} />
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
