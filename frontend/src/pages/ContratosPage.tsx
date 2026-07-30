import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/ui/PageLayout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileContract, faFilePdf } from '@fortawesome/free-solid-svg-icons';
import { ContractTypesTab } from '../components/contratos/ContractTypesTab';
import { ContractStatesTab } from '../components/contratos/ContractStatesTab';

type TabKey = 'types' | 'states';

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
        La columna <strong>Estados</strong> muestra qué estados (tab Estados de Contratos) se pueden elegir para este Contrato: los vinculados a alguna de sus Plantillas, más los que no restringen ningún
        tipo de contrato (esos aplican a todos).
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

export const ContratosPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('types');
  const [showInfoModal, setShowInfoModal] = useState(false);

  return (
    <PageLayout
      title="Contratos"
      subtitle={activeTab === 'types' ? 'Tipos de contrato: jornadas, multiplicador y vigencia' : 'Estados del contrato que se eligen al agregar o configurar un miembro'}
      faIcon={{ icon: faFileContract }}
      headerActions={
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/contratos-frame')} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faFilePdf} />
            <span className="hidden lg:block">Plantillas | Contratos</span>
          </button>
        </div>
      }
      infoModal={{
        isOpen: showInfoModal,
        onOpen: () => setShowInfoModal(true),
        onClose: () => setShowInfoModal(false),
        title: activeTab === 'types' ? 'Guía de Contratos' : 'Guía de Estados',
        content: activeTab === 'types' ? GUIA_CONTRATOS : GUIA_ESTADOS,
      }}
      searchAndFilters={
        <div className="mx-auto w-full">
          {/* Tabs Header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-gray-100 dark:bg-gray-900 overflow-x-auto">
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'types' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('types')}>
              Tipos de Contratos
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'states' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('states')}>
              Estados de Contratos
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === 'types' && <ContractTypesTab />}
            {activeTab === 'states' && <ContractStatesTab />}
          </div>
        </div>
      }
      children={null}
    />
  );
};

export default ContratosPage;
