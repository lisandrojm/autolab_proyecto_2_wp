import React, { useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { faListCheck } from '@fortawesome/free-solid-svg-icons';
import { CategoriasSatTab } from '../components/categoriasSat/CategoriasSatTab';
import { FuncionesFrameTab } from '../components/categoriasSat/FuncionesFrameTab';

type TabKey = 'categorias' | 'funciones';

export const CategoriasSatPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('categorias');
  const [showInfo, setShowInfo] = useState(false);

  const helpKey = activeTab === 'categorias' ? ('categoriasSat' as const) : ('funcionesFrame' as const);
  const helpEntry = getHelp(helpKey);

  return (
    <PageLayout
      title="Categorías"
      subtitle={activeTab === 'categorias' ? 'Categorías profesionales por Convenio Colectivo. La escala salarial vive en el grupo.' : 'Todos los roles externos del sistema y su asociación con categorías'}
      faIcon={{ icon: faListCheck }}
      shouldShowInfo={hasHelp(helpKey)}
      infoModal={{
        isOpen: showInfo,
        onOpen: () => setShowInfo(true),
        onClose: () => setShowInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      searchAndFilters={
        <div className="mx-auto w-full">
          {/* Tabs Header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-gray-100 dark:bg-gray-900 overflow-x-auto">
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'categorias' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('categorias')}>
              Categorías
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'funciones' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('funciones')}>
              Funciones FRAME
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === 'categorias' && <CategoriasSatTab />}
            {activeTab === 'funciones' && <FuncionesFrameTab />}
          </div>
        </div>
      }
      children={null}
    />
  );
};

export default CategoriasSatPage;
