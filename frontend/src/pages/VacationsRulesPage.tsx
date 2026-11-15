import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

const HELP_KEY = 'vacationsRules' as const;

const PESTANAS_REGLAS = ['global', 'overlap', 'projects', 'consecutive_days', 'annual_window', 'contracts', 'company_seniority'] as const;
type PestanaReglas = (typeof PESTANAS_REGLAS)[number];

export function VacationsRulesPage() {
  const navigate = useNavigate();
  const puedeAbrir = usePuedeAbrir();
  const helpEntry = getHelp(HELP_KEY);
  const [openInfo, setOpenInfo] = useState(false);
  /*
    LA PESTAÑA VA EN LA URL (?tab=…, 15/11/2026): Gestión por Usuario linkea a «Antigüedad por empresa»
    (?tab=company_seniority) y tiene que abrirse en esa pestaña. Cambiar de pestaña escribe la URL, así
    el «atrás» del navegador vuelve a la anterior.
  */
  const [params, setParams] = useSearchParams();
  const activeTab: PestanaReglas = (PESTANAS_REGLAS as readonly string[]).includes(params.get('tab') || '') ? (params.get('tab') as PestanaReglas) : 'global';
  const setActiveTab = (tab: PestanaReglas) => setParams(tab === 'global' ? {} : { tab });

  return (
    <PageLayout
      title="Vacaciones"
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
          {/* Tabs Header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-white dark:bg-gray-900 overflow-x-auto">
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'global' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('global')}>
              Configuración Global
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'projects' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('projects')}>
              Fraccionamiento
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'consecutive_days' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('consecutive_days')}>
              Días Corridos
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'annual_window' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('annual_window')}>
              Ventana Anual
            </button>
            {/* De qué empleadora se toma la antigüedad (15/11/2026): ya no se suman. */}
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'company_seniority' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('company_seniority')}>
              Antigüedad por empresa
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'overlap' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('overlap')}>
              Solapamiento
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'contracts' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('contracts')}>
              Visibilidad por tipo de Contrato
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === 'global' && <VacationConfigTab />}
            {activeTab === 'projects' && <ProjectVacationConfigTab />}
            {activeTab === 'consecutive_days' && <ConsecutiveDaysConfigTab />}
            {activeTab === 'annual_window' && <AnnualWindowConfigTab />}
            {activeTab === 'company_seniority' && <AntiguedadPorEmpresaTab />}
            {activeTab === 'overlap' && <VacationOverlapRules />}
            {/* «Gestión por Usuario» se mudó a Vacaciones (Admin General): los saldos se miran junto a
                las solicitudes, no acá, que es donde se configuran las reglas. */}
            {activeTab === 'contracts' && <ContractConfigTab />}
          </div>
        </div>
      }
      //headerActions={}
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
