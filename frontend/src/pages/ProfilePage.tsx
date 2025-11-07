import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { profileAPI, Profile, ProfileStats } from '../api/hr';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { FormField } from '../components/forms/FormField';
import { Modal } from '../components/ui/Modal';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faEnvelope,
  faPhone,
  faMapMarkerAlt,
  faUserTie,
  faBuilding,
  faCalendar,
  faPhone as faEmergencyPhone,
  faCamera,
  faEdit,
  faSave,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';

export const ProfilePage: React.FC = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Profile>>({});
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchStats();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data } = await profileAPI.get();
      setProfile(data);
      setEditData(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
      await sweetAlert.error('Error', 'No se pudo cargar el perfil');
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const { data } = await profileAPI.getStats();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleEdit = () => {
    setEditData(profile || {});
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditData(profile || {});
    setIsEditing(false);
  };

  const handleSave = async () => {
    try {
      const { data } = await profileAPI.update(editData);
      setProfile(data);
      setIsEditing(false);
      await sweetAlert.success('Éxito', 'Perfil actualizado correctamente');
    } catch (error) {
      console.error('Error updating profile:', error);
      await sweetAlert.error('Error', 'No se pudo actualizar el perfil');
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoUpload = async () => {
    if (!photoFile) return;

    try {
      const formData = new FormData();
      formData.append('photo', photoFile);
      const { data } = await profileAPI.updatePhoto(formData);
      setProfile(data);
      setIsPhotoModalOpen(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      await sweetAlert.success('Éxito', 'Foto actualizada correctamente');
    } catch (error) {
      console.error('Error uploading photo:', error);
      await sweetAlert.error('Error', 'No se pudo actualizar la foto');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando perfil..." />;
  }

  const displayName =
    profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : profile?.firstName || profile?.lastName || profile?.email || 'Usuario';

  return (
    <PageLayout
      title="Mi Perfil"
      subtitle="Información personal y estadísticas"
      faIcon={{ icon: faUser }}
      headerActions={
        !isEditing ? (
          <button onClick={handleEdit} className="btn-primary">
            <FontAwesomeIcon icon={faEdit} className="mr-2" />
            Editar Perfil
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={handleSave} className="btn-primary">
              <FontAwesomeIcon icon={faSave} className="mr-2" />
              Guardar
            </button>
            <button onClick={handleCancel} className="btn-ghost">
              <FontAwesomeIcon icon={faTimes} className="mr-2" />
              Cancelar
            </button>
          </div>
        )
      }
    >
      <div className="space-y-6">
        {/* Profile Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Photo */}
            <div className="relative">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-200 dark:border-gray-700 bg-primary-600 flex items-center justify-center">
                {profile?.photo ? (
                  <img
                    src={profile.photo}
                    alt={displayName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-bold text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={() => setIsPhotoModalOpen(true)}
                className="absolute bottom-0 right-0 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-colors"
                title="Cambiar foto"
              >
                <FontAwesomeIcon icon={faCamera} />
              </button>
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                {displayName}
              </h2>
              <p className="text-lg text-gray-600 dark:text-gray-400 mt-1">
                {profile?.position || 'Empleado'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
                {profile?.department || 'Sin departamento'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                <FontAwesomeIcon icon={faEnvelope} className="mr-2" />
                {profile?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <FontAwesomeIcon
                    icon={faCalendar}
                    className="h-6 w-6 text-blue-600 dark:text-blue-400"
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Días Trabajados</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.daysWorked}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <FontAwesomeIcon
                    icon={faCalendar}
                    className="h-6 w-6 text-blue-600 dark:text-blue-400"
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Vacaciones Disponibles
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.vacationDaysAvailable}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <FontAwesomeIcon
                    icon={faCalendar}
                    className="h-6 w-6 text-blue-600 dark:text-blue-400"
                  />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Solicitudes Pendientes
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {stats.pendingRequests}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profile Details */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Información Personal
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Nombre" icon={faUser}>
              <input
                type="text"
                value={editData.firstName || ''}
                onChange={(e) => setEditData({ ...editData, firstName: e.target.value })}
                disabled={!isEditing}
                className="input-field"
              />
            </FormField>

            <FormField label="Apellido" icon={faUser}>
              <input
                type="text"
                value={editData.lastName || ''}
                onChange={(e) => setEditData({ ...editData, lastName: e.target.value })}
                disabled={!isEditing}
                className="input-field"
              />
            </FormField>

            <FormField label="Email" icon={faEnvelope}>
              <input
                type="email"
                value={editData.email || ''}
                disabled
                className="input-field bg-gray-100 dark:bg-gray-700"
              />
            </FormField>

            <FormField label="Teléfono" icon={faPhone}>
              <input
                type="tel"
                value={editData.phone || ''}
                onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                disabled={!isEditing}
                className="input-field"
              />
            </FormField>

            <FormField label="Dirección" icon={faMapMarkerAlt} className="md:col-span-2">
              <input
                type="text"
                value={editData.address || ''}
                onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                disabled={!isEditing}
                className="input-field"
              />
            </FormField>

            <FormField label="Contacto de Emergencia" icon={faEmergencyPhone}>
              <input
                type="text"
                value={editData.emergencyContact || ''}
                onChange={(e) =>
                  setEditData({ ...editData, emergencyContact: e.target.value })
                }
                disabled={!isEditing}
                className="input-field"
              />
            </FormField>

            <FormField label="Posición" icon={faUserTie}>
              <input
                type="text"
                value={editData.position || ''}
                disabled
                className="input-field bg-gray-100 dark:bg-gray-700"
              />
            </FormField>

            <FormField label="Departamento" icon={faBuilding}>
              <input
                type="text"
                value={editData.department || ''}
                disabled
                className="input-field bg-gray-100 dark:bg-gray-700"
              />
            </FormField>

            <FormField label="Fecha de Contratación" icon={faCalendar}>
              <input
                type="date"
                value={editData.hireDate || ''}
                disabled
                className="input-field bg-gray-100 dark:bg-gray-700"
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* Photo Upload Modal */}
      <Modal
        isOpen={isPhotoModalOpen}
        onClose={() => {
          setIsPhotoModalOpen(false);
          setPhotoFile(null);
          setPhotoPreview(null);
        }}
        title="Actualizar Foto de Perfil"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="w-48 h-48 rounded-full overflow-hidden border-4 border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              {photoPreview ? (
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : profile?.photo ? (
                <img
                  src={profile.photo}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-6xl font-bold text-gray-400">
                  {displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Seleccionar Imagen
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-300"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setIsPhotoModalOpen(false);
                setPhotoFile(null);
                setPhotoPreview(null);
              }}
              className="btn-ghost"
            >
              Cancelar
            </button>
            <button
              onClick={handlePhotoUpload}
              disabled={!photoFile}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Guardar Foto
            </button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};
