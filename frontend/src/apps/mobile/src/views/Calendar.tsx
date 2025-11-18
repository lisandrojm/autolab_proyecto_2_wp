import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { useState } from 'react';

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const events = [
    {
      id: 1,
      title: 'Reunión de equipo',
      date: '2024-02-15',
      time: '10:00',
      type: 'meeting' as const,
    },
    {
      id: 2,
      title: 'Vacaciones aprobadas',
      date: '2024-02-20',
      time: 'Todo el día',
      type: 'vacation' as const,
    },
    {
      id: 3,
      title: 'Capacitación',
      date: '2024-02-22',
      time: '14:00',
      type: 'training' as const,
    },
    {
      id: 4,
      title: 'Revisión trimestral',
      date: '2024-02-28',
      time: '11:30',
      type: 'review' as const,
    },
  ];

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, year, month };
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'meeting':
        return 'bg-blue-500';
      case 'vacation':
        return 'bg-green-500';
      case 'training':
        return 'bg-purple-500';
      case 'review':
        return 'bg-orange-500';
      default:
        return 'bg-slate-500';
    }
  };

  const getEventTypeBg = (type: string) => {
    switch (type) {
      case 'meeting':
        return 'bg-blue-100 dark:bg-blue-900/50';
      case 'vacation':
        return 'bg-green-100 dark:bg-green-900/50';
      case 'training':
        return 'bg-purple-100 dark:bg-purple-900/50';
      case 'review':
        return 'bg-orange-100 dark:bg-orange-900/50';
      default:
        return 'bg-slate-100 dark:bg-slate-800';
    }
  };

  return (
    <div className="flex-1 pb-24">
      <div className="px-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Calendario</h1>
          <CalendarIcon className="w-8 h-8 text-primary" />
        </div>

        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={previousMonth}
              className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <button
              onClick={nextMonth}
              className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {dayNames.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: startingDayOfWeek }).map((_, index) => (
              <div key={`empty-${index}`} className="aspect-square" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, index) => {
              const day = index + 1;
              const isToday =
                day === new Date().getDate() &&
                currentDate.getMonth() === new Date().getMonth() &&
                currentDate.getFullYear() === new Date().getFullYear();

              return (
                <button
                  key={day}
                  className={`aspect-square flex items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                    isToday
                      ? 'bg-primary text-white'
                      : 'text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Próximos Eventos</h3>

        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className={`rounded-xl p-4 shadow-sm border-l-4 ${getEventTypeColor(
                event.type
              )} ${getEventTypeBg(event.type)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{event.title}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {new Date(event.date).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{event.time}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
