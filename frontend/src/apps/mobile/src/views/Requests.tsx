import { useState } from 'react';
import { ViewType } from '../types';
import RequestsMobileListPage from '../pages/requests/RequestsMobileListPage';
import RequestMobileNewPage from '../pages/requests/RequestMobileNewPage';
import RequestMobileDetailPage from '../pages/requests/RequestMobileDetailPage';

interface RequestsProps {
  onNavigate: (view: ViewType) => void;
}

type RequestView = 'list' | 'new' | 'detail';

export default function Requests({ onNavigate }: RequestsProps) {
  const [requestView, setRequestView] = useState<RequestView>('list');
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');

  const handleNavigate = (view: 'new' | 'detail', id?: string) => {
    if (view === 'detail' && id) {
      setSelectedRequestId(id);
      setRequestView('detail');
    } else if (view === 'new') {
      setRequestView('new');
    }
  };

  const handleBack = () => {
    setRequestView('list');
    setSelectedRequestId('');
  };

  const handleSuccess = () => {
    setRequestView('list');
  };

  const handleBackToHome = () => {
    onNavigate('home');
  };

  switch (requestView) {
    case 'new':
      return <RequestMobileNewPage onBack={handleBack} onSuccess={handleSuccess} />;
    case 'detail':
      return <RequestMobileDetailPage requestId={selectedRequestId} onBack={handleBack} />;
    default:
      return <RequestsMobileListPage onNavigate={handleNavigate} onBack={handleBackToHome} />;
  }
}
