import { useState, type ComponentType } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faFilePdf } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { VacationConfigTab } from '../components/vacations/VacationConfigTab';
import { VacationOverlapRules } from '../components/vacations/VacationOverlapRules';

import { ProjectVacationConfigTab } from '../components/vacations/ProjectVacationConfigTab';
import { ConsecutiveDaysConfigTab } from '../components/vacations/ConsecutiveDaysConfigTab';
import { AnnualWindowConfigTab } from '../components/vacations/AnnualWindowConfigTab';
import { AntiguedadPorEmpresaTab } from '../components/vacations/AntiguedadPorEmpresaTab';

import { ContractConfigTab } from '../components/vacations/ContractConfigTab';
import { usePuedeAbrir } from '../hooks/usePuedeAbrir';
import { RUTA_REGLAS_VACACIONES, seccionDeRuta, seccionDeTabViejo, type ClaveSeccionVacaciones } from '../config/seccionesReglasVacaciones';

const HELP_KEY = 'vacationsRules' as const;

const CONTENIDO: Record<ClaveSeccionVacaciones, ComponentType> = {
  global: VacationConfigTab,
  fraccionamiento: ProjectVacationConfigTab,
  'dias-corridos': ConsecutiveDaysConfigTab,
  'ventana-anual': AnnualWindowConfigTab,
  'antiguedad-por-empresa': AntiguedadPorEmpresaTab,
  solapamiento: VacationOverlapRules,
  'visibilidad-por-contrato': ContractConfigTab,
};

/*
  CADA SECCIÓN ES UNA PÁGINA (15/11/2026, pedido del usuario): las siete pestañas ya no entraban a lo
  ancho, así que se mudaron al menú, en el subgrupo Configuración › Vacaciones (como Plantillas). La
  pantalla dibuja la sección de su ruta (ver `config/seccionesReglasVacaciones.ts`) y se titula
  «Vacaciones | <sección>».
*/
export function VacationsRulesPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const puedeAbrir = usePuedeAbrir();
  const helpEntry = getHelp(HELP_KEY);
  const [openInfo, setOpenInfo] = useState(false);

  // Un link viejo (`/vacations-rules?tab=company_seniority`) va a la ruta de su sección.
  const viejo = seccionDeTabViejo(params.get('tab'));
  if (viejo && viejo.ruta !== location.pathname) return <Navigate to={viejo.ruta} replace />;

  const seccion = seccionDeRuta(location.pathname);
  if (!seccion) return <Navigate to={RUTA_REGLAS_VACACIONES} replace />;
  const Contenido = CONTENIDO[seccion.clave];

  return (
    <PageLayout
      title={`Vacaciones | ${seccion.label}`}
      faIcon={{ icon: faGear }}
      onBack={puedeAbrir('/vacations') ? () => navigate('/vacations') : undefined}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="mx-auto">
          {/* key: al pasar de una sección a otra, la nueva arranca de cero (carga su configuración). */}
          <div key={seccion.clave} className="animate-in fade-in duration-300">
            <Contenido />
          </div>
        </div>
      }
      headerActions={
        <div>
          {puedeAbrir('/pdfs-vacaciones') && (
            <button onClick={() => navigate('/pdfs-vacaciones')} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
              <FontAwesomeIcon icon={faFilePdf} />
              <span className="hidden lg:block">Plantillas | Vacaciones</span>
            </button>
          )}
        </div>
      }
      children={undefined}
    ></PageLayout>
  );
}
