import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faFilePdf } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { OrderTypesTab } from '../components/orders/OrderTypesTab';
import { OrderContractDaysTab } from '../components/orders/OrderContractDaysTab';
import { UserOrderManagementTab } from '../components/orders/UserOrderManagementTab';

const HELP_KEY = 'orderTypes' as const;

export const OrderTypesPage: React.FC = () => {
  const navigate = useNavigate();
  const helpEntry = getHelp(HELP_KEY) || getHelp('orderCategories');
  const [showMainInfo, setShowMainInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<'types' | 'contract_days' | 'users_management'>('types');

  return (
    <PageLayout
      title="Pedidos"
      subtitle="Administra los tipos de pedidos y sus configuraciones"
      faIcon={{ icon: faGear }}
      onBack={() => navigate('/orders')}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{
        isOpen: showMainInfo,
        onOpen: () => setShowMainInfo(true),
        onClose: () => setShowMainInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      headerActions={
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/pdfs')} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faFilePdf} />
            <span className="hidden lg:block">Plantillas PDF</span>
          </button>
        </div>
      }
      searchAndFilters={
        <div className="mx-auto">
          {/* Tabs Header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-white dark:bg-gray-900 overflow-x-auto">
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'types' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('types')}>
              Tipos de Pedidos
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'contract_days' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('contract_days')}>
              Días por Tipo de Contrato
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'users_management' ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}`} onClick={() => setActiveTab('users_management')}>
              Gestión por Usuario
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === 'types' && <OrderTypesTab />}
            {activeTab === 'contract_days' && <OrderContractDaysTab />}
            {activeTab === 'users_management' && <UserOrderManagementTab />}
          </div>
        </div>
      }
      children={null}
    />
  );
};
