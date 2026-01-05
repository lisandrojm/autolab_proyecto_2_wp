import React, { useEffect, useState } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { personnelAPI } from "../api/personnel";
import type { ProfileData, ProfileStats } from "../api/personnel";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faSave, faCamera } from "@fortawesome/free-solid-svg-icons";

export const ProfilePage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<ProfileData>>({});

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    const timeoutId = setTimeout(() => {
      console.warn("Profile request taking longer than expected");
    }, 5000);

    try {
      setLoading(true);
      const [profileData, statsData] = await Promise.all([
        personnelAPI.getProfile().catch((err) => {
          console.error("Profile fetch error:", err);
          return null;
        }),
        personnelAPI.getProfileStats().catch((err) => {
          console.error("Stats fetch error:", err);
          return { daysWorked: 0, vacations: { total: 0, used: 0, available: 0 } };
        }),
      ]);

      clearTimeout(timeoutId);

      if (profileData) {
        setProfile(profileData);
        setFormData(profileData);
      } else {
        sweetAlert.error("Error", "No se pudo cargar el perfil");
      }

      setStats(statsData);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("Error fetching profile:", error);
      const errorMsg = error?.response?.data?.error || error?.message || "No se pudo cargar el perfil";
      sweetAlert.error("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updated = await personnelAPI.updateProfile(formData);
      setProfile(updated);
      setIsEditing(false);
      sweetAlert.success("Perfil actualizado", "Los cambios se guardaron correctamente");
    } catch (error: any) {
      console.error("Error updating profile:", error);
      const errorMsg = error?.response?.data?.error || "No se pudo actualizar el perfil";
      sweetAlert.error("Error", errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const photoUrl = reader.result as string;
        const result = await personnelAPI.updateProfilePhoto(photoUrl);
        setProfile((prev) => (prev ? { ...prev, profilePhotoUrl: result.profilePhotoUrl } : null));
        sweetAlert.success("Foto actualizada", "La foto de perfil se actualizó correctamente");
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      console.error("Error uploading photo:", error);
      const errorMsg = error?.response?.data?.error || "No se pudo actualizar la foto";
      sweetAlert.error("Error", errorMsg);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando perfil..." />;
  }

  return (
    <PageLayout
      title="Mi Perfil"
      subtitle="Información personal y estadísticas"
      faIcon={{ icon: faUser }}
      headerActions={
        !isEditing ? (
          <button onClick={() => setIsEditing(true)} className="btn-primary">
            Editar
          </button>
        ) : null
      }
    >
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-6 mb-6">
            <div className="relative">
              <div className="w-24 h-24 rounded overflow-hidden bg-gray-200 dark:bg-gray-700 flex items-center justify-center">{profile?.profilePhotoUrl ? <img src={profile.profilePhotoUrl} alt="Profile" className="w-full h-full object-cover" /> : <span className="text-3xl font-bold text-gray-400">{profile?.firstName?.charAt(0) || profile?.email?.charAt(0) || "?"}</span>}</div>
              <label className="absolute bottom-0 right-0 p-2 bg-blue-600 rounded cursor-pointer hover:bg-blue-700 transition-colors">
                <FontAwesomeIcon icon={faCamera} className="h-4 w-4 text-white" />
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                {profile?.firstName} {profile?.lastName}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">{profile?.position || "Sin posición"}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">{profile?.email}</p>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded">
                <p className="text-sm text-gray-600 dark:text-gray-400">Días Trabajados</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.daysWorked}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded">
                <p className="text-sm text-gray-600 dark:text-gray-400">Vacaciones Disponibles</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.vacations.available}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded">
                <p className="text-sm text-gray-600 dark:text-gray-400">Vacaciones Usadas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.vacations.used}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre</label>
                <input type="text" value={formData.firstName || ""} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} disabled={!isEditing} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Apellido</label>
                <input type="text" value={formData.lastName || ""} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} disabled={!isEditing} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teléfono</label>
                <input type="tel" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} disabled={!isEditing} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Calle</label>
                <input type="text" value={formData.address?.street || ""} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} disabled={!isEditing} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ciudad</label>
                <input type="text" value={formData.address?.city || ""} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })} disabled={!isEditing} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Departamento</label>
                <input type="text" value={formData.department || ""} onChange={(e) => setFormData({ ...formData, department: e.target.value })} disabled={!isEditing} className="input-field" />
              </div>
            </div>

            {isEditing && (
              <div className="flex gap-3 pt-4">
                <button type="submit" disabled={saving} className="btn-primary">
                  <FontAwesomeIcon icon={faSave} className="mr-2" />
                  {saving ? "Guardando..." : "Guardar Cambios"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setFormData(profile || {});
                  }}
                  className="btn-ghost"
                >
                  Cancelar
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </PageLayout>
  );
};
