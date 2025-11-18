import React, { useState, useEffect } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { Card } from '../components/ui/Card';
import { sweetAlert } from '../utils/sweetAlert';
import { mockPersonnelTasks } from '../mocks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faListCheck, faPlus, faCheck, faClock, faExclamationCircle } from '@fortawesome/free-solid-svg-icons';

interface Task {
  id: string;
  title: string;
  description: string;
  type: 'reminder' | 'action' | 'deadline';
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  postponeCount: number;
  createdAt: string;
}

const MAX_POSTPONE = 3;

export const TasksPersonnelPage: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'reminder' as Task['type'],
    dueDate: '',
  });

  useEffect(() => {
    const stored = localStorage.getItem('personnelTasks');
    if (stored) {
      try {
        setTasks(JSON.parse(stored));
      } catch (error) {
        console.error('Error loading tasks:', error);
      }
    } else {
      setTasks(mockPersonnelTasks);
      localStorage.setItem('personnelTasks', JSON.stringify(mockPersonnelTasks));
    }
  }, []);

  const saveToStorage = (data: Task[]) => {
    localStorage.setItem('personnelTasks', JSON.stringify(data));
    setTasks(data);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newTask: Task = {
      id: Date.now().toString(),
      ...formData,
      status: 'pending',
      postponeCount: 0,
      createdAt: new Date().toISOString(),
    };
    saveToStorage([newTask, ...tasks]);
    sweetAlert.success('Tarea creada', 'La tarea se creó correctamente');
    setShowModal(false);
    setFormData({ title: '', description: '', type: 'reminder', dueDate: '' });
  };

  const markCompleted = (id: string) => {
    saveToStorage(tasks.map((task) => (task.id === id ? { ...task, status: 'completed' as const } : task)));
    sweetAlert.success('Tarea completada', 'La tarea se marcó como completada');
  };

  const postponeTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    if (task.postponeCount >= MAX_POSTPONE) {
      sweetAlert.error('Límite alcanzado', `No se puede posponer más de ${MAX_POSTPONE} veces`);
      return;
    }

    const newDate = new Date(task.dueDate);
    newDate.setDate(newDate.getDate() + 1);

    saveToStorage(
      tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              dueDate: newDate.toISOString().split('T')[0],
              postponeCount: t.postponeCount + 1,
            }
          : t
      )
    );
    sweetAlert.success('Tarea pospuesta', `Pospuesta hasta ${newDate.toLocaleDateString()}`);
  };

  const filteredTasks = tasks.filter((task) => {
    if (filterStatus === 'all') return true;
    return task.status === filterStatus;
  });

  const getStatusBadge = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return { variant: 'success' as const, text: 'Completada' };
      case 'in_progress':
        return { variant: 'warning' as const, text: 'En Progreso' };
      default:
        return { variant: 'default' as const, text: 'Pendiente' };
    }
  };

  const getTypeIcon = (type: Task['type']) => {
    switch (type) {
      case 'action':
        return faCheck;
      case 'deadline':
        return faExclamationCircle;
      default:
        return faClock;
    }
  };

  const isOverdue = (dueDate: string) => {
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  return (
    <PageLayout
      title="Tareas"
      subtitle="Gestión de recordatorios y acciones pendientes"
      faIcon={{ icon: faListCheck }}
      headerActions={
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Nueva Tarea
        </button>
      }
      modal={{
        isOpen: showModal,
        onClose: () => setShowModal(false),
        title: 'Nueva Tarea',
        subtitle: 'Crea un nuevo recordatorio o acción pendiente',
        size: 'md',
        actions: [
          {
            label: 'Crear',
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#task-form');
              form?.requestSubmit();
            },
            variant: 'primary',
          },
          { label: 'Cancelar', onClick: () => setShowModal(false), variant: 'ghost' },
        ],
        content: (
          <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="input-field"
                placeholder="Título de la tarea"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción *</label>
              <textarea
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="input-field"
                placeholder="Describe la tarea..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo *</label>
              <select
                required
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as Task['type'] })}
                className="input-field"
              >
                <option value="reminder">Recordatorio</option>
                <option value="action">Acción</option>
                <option value="deadline">Fecha límite</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fecha de Vencimiento *
              </label>
              <input
                type="date"
                required
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="input-field"
              />
            </div>
          </form>
        ),
      }}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="input-field max-w-xs"
          >
            <option value="all">Todas</option>
            <option value="pending">Pendientes</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completadas</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTasks.map((task) => {
            const badge = getStatusBadge(task.status);
            const overdue = isOverdue(task.dueDate);

            return (
              <Card
                key={task.id}
                header={{
                  title: task.title,
                  subtitle: new Date(task.dueDate).toLocaleDateString(),
                  icon: getTypeIcon(task.type),
                  badges: [
                    { text: badge.text, variant: badge.variant },
                    ...(overdue && task.status !== 'completed'
                      ? [{ text: 'Vencida', variant: 'blue' as const }]
                      : []),
                  ],
                }}
                footer={{
                  leftContent: (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        Pospuestas: {task.postponeCount}/{MAX_POSTPONE}
                      </span>
                    </div>
                  ),
                }}
              >
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{task.description}</p>
                {task.status !== 'completed' && (
                  <div className="flex gap-2">
                    <button onClick={() => markCompleted(task.id)} className="btn-primary text-sm flex-1">
                      <FontAwesomeIcon icon={faCheck} className="mr-1" />
                      Completar
                    </button>
                    {task.postponeCount < MAX_POSTPONE && (
                      <button onClick={() => postponeTask(task.id)} className="btn-ghost text-sm flex-1">
                        <FontAwesomeIcon icon={faClock} className="mr-1" />
                        Posponer
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {filteredTasks.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faListCheck} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No hay tareas {filterStatus !== 'all' ? filterStatus : ''}
            </p>
            <button onClick={() => setShowModal(true)} className="btn-primary">
              Crear Primera Tarea
            </button>
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            Las tareas se guardan localmente. Máximo {MAX_POSTPONE} posposiciones por tarea.
          </p>
        </div>
      </div>
    </PageLayout>
  );
};
