import { useState } from 'react';
import { ViewType } from './types';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import Home from './views/Home';
import Calendar from './views/Calendar';
import Documents from './views/Documents';
import Profile from './views/Profile';
import Vacations from './views/Vacations';
import Orders from './views/Orders';

function App() {
  const [currentView, setCurrentView] = useState<ViewType>('home');

  const getTitle = (view: ViewType): string => {
    switch (view) {
      case 'home':
        return 'Inicio';
      case 'calendar':
        return 'Calendario';
      case 'documents':
        return 'Documentos';
      case 'profile':
        return 'Perfil';
      case 'vacations':
        return 'Vacaciones';
      case 'orders':
        return 'Pedidos';
      default:
        return 'Inicio';
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return <Home onNavigate={setCurrentView} />;
      case 'calendar':
        return <Calendar />;
      case 'documents':
        return <Documents />;
      case 'profile':
        return <Profile />;
      case 'vacations':
        return <Vacations onNavigate={setCurrentView} />;
      case 'orders':
        return <Orders onNavigate={setCurrentView} />;
      default:
        return <Home onNavigate={setCurrentView} />;
    }
  };

  const showTopBar = currentView === 'home' || currentView === 'calendar' || currentView === 'documents' || currentView === 'profile';

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background-light dark:bg-background-dark text-slate-800 dark:text-slate-200 font-display">
      {showTopBar && (
        <TopBar
          title={getTitle(currentView)}
          hasNotifications={true}
          onNotificationClick={() => alert('Notificaciones')}
        />
      )}
      {renderView()}
      <BottomNav currentView={currentView} onNavigate={setCurrentView} />
    </div>
  );
}

export default App;
