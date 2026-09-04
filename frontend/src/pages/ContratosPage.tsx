import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageLayout } from '../components/ui/PageLayout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faFilePdf, faPlus } from '@fortawesome/free-solid-svg-icons';
import { ContractTypesTab, type ContractTypesTabHandle } from '../components/contratos/ContractTypesTab';
import { ContractStatesTab } from '../components/contratos/ContractStatesTab';
import { DependencyFlowEditor } from '../components/contratos/DependencyFlowEditor';

type TabKey = 'types' | 'states' | 'dependencies';

const TAB_DE_PARAM: Record<string, TabKey> = { types: 'types', states: 'states', dependencies: 'dependencies' };

const GUIA_CONTRATOS = (
  <div className="space-y-4 text-gray-400">
    <p>
      Un <strong>Contrato</strong> es el tipo real (Jornada, Plazo fijo 5x7, Tiempo Indeterminado, ...): define cuántas jornadas tiene, su multiplicador diario y si es de tiempo indeterminado. Es lo que
      elegís en <strong>Agregar/Configurar miembro</strong>.
    </p>
    <div className="space-y-2">
      <h4 className="text-white font-medium">Plantillas</h4>
      <p className="text-sm">
        El documento PDF (contenido + membrete) se administra aparte, en <strong>Plantillas | Contratos</strong>. Cada Plantilla elige a qué Contrato pertenece; un mismo Contrato puede tener más de una
        Plantilla (por ejemplo variantes con y sin membrete).
      </p>
    </div>
    <div className="space-y-2">
      <h4 className="text-white font-medium">Estados</h4>
      <p className="text-sm">
        La columna <strong>Estados</strong> muestra qué estados (tab Estados) se pueden elegir para este Contrato: los vinculados a alguna de sus Plantillas, más los que no restringen ningún tipo de
        contrato (esos aplican a todos).
      </p>
    </div>
    <div className="space-y-2">
      <h4 className="text-white font-medium">Eliminar</h4>
      <p className="text-sm">No se puede eliminar un Contrato mientras tenga Plantillas asignadas: primero hay que reasignarlas o eliminarlas.</p>
    </div>
  </div>
);

const GUIA_ESTADOS = (
  <div className="space-y-4 text-gray-400">
    <p>
      Estos son los estados que aparecen en el campo <strong>Estado</strong> del contrato, en Agregar y Configurar miembro.
    </p>
    <div className="space-y-2">
      <h4 className="text-white font-medium">Color</h4>
      <p className="text-sm">Elegís el color de la tipografía; el fondo del badge se genera automáticamente con ese mismo color y transparencia.</p>
    </div>
    <div className="space-y-2">
      <h4 className="text-white font-medium">Tipos de contrato</h4>
      <p className="text-sm">Si vinculás el estado a uno o varios tipos de contrato, solo se ofrece cuando el contrato es de ese tipo. Sin ninguno, está disponible siempre.</p>
    </div>
    <div className="space-y-2">
      <h4 className="text-white font-medium">Nombre en el contrato</h4>
      <p className="text-sm">
        Es cómo se muestra el estado dentro del contrato. Es obligatorio para <strong>Activo</strong> e <strong>Inactivo</strong>, que ya se usan para el estado del usuario.
      </p>
    </div>
    <div className="space-y-2">
      <h4 className="text-white font-medium">Orden</h4>
      <p className="text-sm">Se arrastra desde la tabla ("Ordenar"): es una guía visual (define el orden del dropdown en el wizard), no bloquea qué estado se puede elegir en cada momento.</p>
    </div>
  </div>
);

const GUIA_DEPENDENCIAS = (
  <div className="space-y-4 text-gray-400">
    <p>
      Armá el <strong>flujo de dependencias</strong>: agrupá los estados en pasos ordenados. Los estados en el mismo paso son alternativas (uno u otro).
    </p>
    <div className="space-y-2">
      <h4 className="text-white font-medium">Transición automática</h4>
      <p className="text-sm">Cada estado del flujo puede avanzar solo cuando aparece un archivo en una carpeta de Dropbox vigilada — configurable desde el rayo de cada estado.</p>
    </div>
  </div>
);

export const ContratosPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Permite llegar directo a una pestaña con /contratos?tab=states|dependencies (p. ej. desde el link de
  // ayuda del campo Estado en Agregar/Configurar miembro, o desde "Configurar transición automática" en
  // Documentos/Dropbox). Reactivo: si el query param cambia estando ya en /contratos, cambia la pestaña.
  const [activeTab, setActiveTab] = useState<TabKey>(TAB_DE_PARAM[searchParams.get('tab') || ''] || 'types');
  useEffect(() => {
    const next = TAB_DE_PARAM[searchParams.get('tab') || ''];
    if (next) setActiveTab(next);
  }, [searchParams]);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // El [+] de «Nuevo contrato» se dibuja en el encabezado, pero el formulario vive en la pestaña.
  const tiposRef = useRef<ContractTypesTabHandle>(null);

  const cambiarTab = (tab: TabKey) => {
    setActiveTab(tab);
    navigate(`/contratos?tab=${tab}`, { replace: true });
  };

  const subtitle = activeTab === 'types' ? 'Tipos de contrato: jornadas, multiplicador y vigencia' : activeTab === 'states' ? 'Estados del contrato que se eligen al agregar o configurar un miembro' : 'Flujo de pasos y transición automática por Dropbox';
  const guia = activeTab === 'types' ? GUIA_CONTRATOS : activeTab === 'states' ? GUIA_ESTADOS : GUIA_DEPENDENCIAS;

  return (
    <PageLayout
      title="Contratos"
      subtitle={subtitle}
      faIcon={{ icon: faFileContract }}
      headerActions={
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/contratos-frame')} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faFilePdf} />
            <span className="hidden lg:block">Plantillas | Contratos</span>
          </button>
          {/* Solo en «Tipos»: es la única pestaña que da de alta desde acá. */}
          {activeTab === 'types' && (
            <button onClick={() => tiposRef.current?.abrirCrear()} title="Nuevo contrato" aria-label="Nuevo contrato" className="px-2 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors text-sm font-semibold">
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
        </div>
      }
      infoModal={{
        isOpen: showInfoModal,
        onOpen: () => setShowInfoModal(true),
        onClose: () => setShowInfoModal(false),
        title: activeTab === 'types' ? 'Guía de Contratos' : activeTab === 'states' ? 'Guía de Estados' : 'Guía de Dependencias',
        content: guia,
      }}
      searchAndFilters={
        <div className="mx-auto w-full">
          {/* Tabs Header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-gray-100 dark:bg-gray-900 overflow-x-auto">
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'types' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => cambiarTab('types')}>
              Tipos
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'states' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => cambiarTab('states')}>
              Estados
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'dependencies' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => cambiarTab('dependencies')}>
              Dependencias
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === 'types' && <ContractTypesTab ref={tiposRef} />}
            {activeTab === 'states' && <ContractStatesTab />}
            {activeTab === 'dependencies' && <DependencyFlowEditor />}
          </div>
        </div>
      }
      children={null}
    />
  );
};

export default ContratosPage;
