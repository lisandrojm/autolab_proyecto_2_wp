import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { Card } from '../components/ui/Card';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faRocket, faDownload, faEye } from '@fortawesome/free-solid-svg-icons';

import { releasesAPI, Release, releaseVariables } from '../api/release';
import { releaseTiposAPI, ReleaseTipoItem } from '../api/releaseTipos';

import Swal from 'sweetalert2';
import { Modal } from '../components/ui/Modal';
import { MembreteToggle } from '../components/MembreteToggle';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';

interface ReleaseFormData {
  name: string;
  version: string;
  description: string;
  content: string;
  releaseTipoId: string;
  isActive: boolean;
  usaMembrete: boolean;
}

const EMPTY_FORM: ReleaseFormData = {
  name: '',
  version: '',
  description: '',
  content: '',
  releaseTipoId: '',
  isActive: true,
  usaMembrete: false,
};

/** El editor devuelve "<p></p>" cuando está vacío: chequeamos que haya texto real. */
const hasContent = (html: string): boolean =>
  !!html &&
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length > 0;

export function ReleasesPage() {
  const navigate = useNavigate();
  // data
  const HELP_KEY = 'releases' as const;
  const helpEntry = getHelp(HELP_KEY);
  const [showInfo, setShowInfo] = useState(false);
  const [releases, setReleases] = useState<Release[]>([]);
  const [tipos, setTipos] = useState<ReleaseTipoItem[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  // Vista (Tabla vs Tarjetas)
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode('cards');
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem('releasesViewMode_v2');
      if (saved === 'table' || saved === 'cards') setViewMode(saved as ViewMode);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  useEffect(() => {
    if (isLarge) localStorage.setItem('releasesViewMode_v2', viewMode);
  }, [viewMode, isLarge]);
  const effectiveViewMode: ViewMode = isLarge ? viewMode : 'cards';

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [formData, setFormData] = useState<ReleaseFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    loadReleases();
    releaseTiposAPI
      .list()
      .then(setTipos)
      .catch(() => setTipos([]));
  }, []);

  const loadReleases = async () => {
    try {
      setLoading(true);
      const data = await releasesAPI.getAll();
      setReleases(data);
    } catch {
      Swal.fire('Error', 'No se pudieron cargar los releases', 'error');
    } finally {
      setLoading(false);
    }
  };

  // filtering
  const filteredReleases = releases.filter((r) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match = r.name.toLowerCase().includes(term) || r.version.toLowerCase().includes(term) || (r.description || '').toLowerCase().includes(term);
      if (!match) return false;
    }

    if (filterActive === 'active' && !r.isActive) return false;
    if (filterActive === 'inactive' && r.isActive) return false;

    return true;
  });

  const openCreate = () => {
    setEditingRelease(null);
    setFormData(EMPTY_FORM);
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (release: Release) => {
    setEditingRelease(release);
    const tipoId = typeof release.releaseTipoId === 'object' ? release.releaseTipoId?._id : release.releaseTipoId;
    setFormData({
      name: release.name,
      version: release.version,
      description: release.description || '',
      content: release.content || '',
      releaseTipoId: tipoId || '',
      isActive: release.isActive,
      usaMembrete: release.usaMembrete ?? false,
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDelete = async (release: Release) => {
    const result = await Swal.fire({
      title: '¿Eliminar release?',
      text: `Se eliminará el release "${release.name}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Eliminar',
    });

    if (!result.isConfirmed) return;

    try {
      await releasesAPI.delete(release._id);
      Swal.fire('Eliminado', 'El release ha sido eliminado', 'success');
      loadReleases();
    } catch {
      Swal.fire('Error', 'No se pudo eliminar el release', 'error');
    }
  };

  const handleDownload = async (release: Release) => {
    try {
      await releasesAPI.download(release);
    } catch {
      Swal.fire('Error', 'No se pudo descargar el archivo', 'error');
    }
  };

  /** Abre la previsualización del release (PDF de ejemplo) en una pestaña nueva, sin entrar a editar. */
  const handlePreviewItem = async (release: Release) => {
    if (!hasContent(release.content || '')) {
      Swal.fire('Sin contenido', 'Este release no tiene contenido para previsualizar.', 'error');
      return;
    }
    try {
      const blob = await releasesAPI.preview(release.content || '', release.usaMembrete);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      Swal.fire('Error', 'No se pudo generar la previsualización', 'error');
    }
  };

  /** Genera y descarga un PDF de ejemplo con el contenido actual del editor (sin guardar). */
  const handlePreview = async () => {
    if (!hasContent(formData.content)) {
      Swal.fire('Sin contenido', 'Escribí el contenido del release para previsualizarlo', 'warning');
      return;
    }
    try {
      setPreviewing(true);
      const blob = await releasesAPI.preview(formData.content, formData.usaMembrete);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Preview_${formData.name || 'Release'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      Swal.fire('Error', 'No se pudo generar la previsualización', 'error');
    } finally {
      setPreviewing(false);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';
    if (!formData.version.trim()) newErrors.version = 'La versión es requerida';
    if (!formData.releaseTipoId) newErrors.releaseTipoId = 'El tipo de release es requerido';
    if (!hasContent(formData.content)) newErrors.content = 'El contenido es requerido';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      const payload = {
        name: formData.name,
        version: formData.version,
        description: formData.description,
        content: formData.content,
        releaseTipoId: formData.releaseTipoId,
        isActive: formData.isActive,
        usaMembrete: formData.usaMembrete,
      };

      if (editingRelease) {
        await releasesAPI.update(editingRelease._id, payload);
        Swal.fire('Actualizado', 'El release ha sido actualizado', 'success');
      } else {
        await releasesAPI.create(payload);
        Swal.fire('Creado', 'El release ha sido creado', 'success');
      }
      setShowModal(false);
      setEditingRelease(null);
      loadReleases();
    } catch (error: any) {
      Swal.fire('Error', error.response?.data?.error || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getBadge = (release: Release) => {
    if (release.isActive) {
      return { text: 'Activo', variant: 'green' as const };
    }
    return { text: 'Inactivo', variant: 'destructive' as const };
  };

  return (
    <PageLayout
      title="Plantillas | Release"
      itemCount={filteredReleases.length}
      subtitle="Crea y gestiona los releases con sus archivos adjuntos"
      faIcon={{ icon: faRocket }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}
      headerActions={
        <div className="flex gap-2">
          <button onClick={openCreate} aria-label="Nuevo release" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700" title="Nuevo release">
            <FontAwesomeIcon icon={faPlus} />
          </button>
          <button onClick={() => navigate('/releases-tipos')} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faRocket} />
            <span className="hidden lg:block">Releases</span>
          </button>
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por nombre, versión o descripción..."
              filters={[
                {
                  value: filterActive,
                  onChange: (v) => setFilterActive(v as any),
                  options: [
                    { value: 'all', label: 'Todos' },
                    { value: 'active', label: 'Activos' },
                    { value: 'inactive', label: 'Inactivos' },
                  ],
                },
              ]}
            />
          </div>
          {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando releases..." />
        </div>
      ) : (
        <>
          {effectiveViewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
              {filteredReleases.map((release) => (
                <Card
                  key={release._id}
                  onClick={() => openEdit(release)}
                  className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
                  header={{
                    icon: faRocket,
                    title: release.name,
                    subtitle: `Versión ${release.version}`,
                    badges: [getBadge(release), release.usaMembrete ? { text: 'Membrete activo', variant: 'green' as const } : { text: 'Membrete inactivo', variant: 'default' as const }],
                  }}
                  footer={{
                    leftContent: null,
                    actions: [
                      ...(release.content
                        ? [
                            {
                              icon: faEye,
                              title: 'Previsualizar',
                              onClick: (e: any) => {
                                e.stopPropagation();
                                handlePreviewItem(release);
                              },
                            },
                            {
                              icon: faDownload,
                              title: 'Descargar PDF de ejemplo',
                              onClick: (e: any) => {
                                e.stopPropagation();
                                handleDownload(release);
                              },
                            },
                          ]
                        : []),
                      {
                        icon: faEdit,
                        title: 'Editar',
                        onClick: (e: any) => {
                          e.stopPropagation();
                          openEdit(release);
                        },
                      },
                      {
                        icon: faTrash,
                        title: 'Eliminar',
                        onClick: (e: any) => {
                          e.stopPropagation();
                          handleDelete(release);
                        },
                      },
                    ],
                  }}
                >
                  {release.description && <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{release.description}</p>}
                </Card>
              ))}

              {/* CREATE CARD */}
              <Card
                variant="create"
                onClick={openCreate}
                header={{
                  icon: faRocket,
                  title: 'Nuevo Release',
                  subtitle: 'Crear nuevo release',
                }}
              />
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg mx-0.5 lg:mx-0">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Versión</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Membrete | Firma</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Contenido</th>
                    <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {filteredReleases.map((release) => (
                    <tr key={release._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20 cursor-pointer" onClick={() => openEdit(release)}>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">{release.name}</td>
                      <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{release.version}</td>
                      <td className="px-5 py-3 text-sm whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${release.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>{release.isActive ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      <td className="px-5 py-3 text-sm whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${release.usaMembrete ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>{release.usaMembrete ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                        {hasContent(release.content || '') ? (
                          <span className="truncate max-w-[260px] block" title="Contenido redactado">
                            {(release.content || '')
                              .replace(/<[^>]*>/g, ' ')
                              .replace(/&nbsp;/g, ' ')
                              .trim()
                              .slice(0, 60)}
                            …
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">Sin contenido</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          {release.content && (
                            <button onClick={() => handlePreviewItem(release)} className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors" title="Previsualizar">
                              <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                            </button>
                          )}
                          {release.content && (
                            <button onClick={() => handleDownload(release)} className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors" title="Descargar PDF de ejemplo">
                              <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={() => openEdit(release)} className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors" title="Editar">
                            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(release)} className="p-1.5 text-gray-500 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors" title="Eliminar">
                            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredReleases.length === 0 && (
            <EmptyState
              icon={faRocket}
              title="No hay releases"
              description="No hay releases definidos."
              action={{
                label: 'Nuevo Release',
                onClick: openCreate,
                icon: faPlus,
              }}
            />
          )}
        </>
      )}

      {/* MODAL */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingRelease(null);
        }}
        title={editingRelease ? 'Editar Release' : 'Nuevo Release'}
        size="lg"
        footer={
          <div className="flex justify-between gap-2 w-full">
            <button type="button" onClick={handlePreview} disabled={previewing} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700">
              <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
              {previewing ? 'Generando...' : 'Previsualizar'}
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowModal(false);
                  setEditingRelease(null);
                }}
              >
                Cancelar
              </button>
              <button type="submit" form="release-form" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Guardando...' : editingRelease ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        }
      >
        <form id="release-form" onSubmit={handleSubmitForm}>
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
                {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Versión *</label>
                <input type="text" value={formData.version} onChange={(e) => setFormData({ ...formData, version: e.target.value })} placeholder="Ej: 1" className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
                {errors.version && <p className="text-sm text-red-500 mt-1">{errors.version}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Release *</label>
              <select value={formData.releaseTipoId} onChange={(e) => setFormData({ ...formData, releaseTipoId: e.target.value })} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100">
                <option value="">{tipos.length ? 'Selecciona un tipo...' : 'No hay tipos cargados'}</option>
                {tipos.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                    {t.isActive === false ? ' (inactivo)' : ''}
                  </option>
                ))}
              </select>
              {errors.releaseTipoId && <p className="text-sm text-red-500 mt-1">{errors.releaseTipoId}</p>}
              <p className="text-xs text-gray-500 mt-1">
                Se administra en <strong>Releases</strong>.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={4} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })} className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50" />
              Release activo
            </label>

            <MembreteToggle checked={formData.usaMembrete} onChange={(v) => setFormData({ ...formData, usaMembrete: v })} />

            {/* Contenido del release */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contenido *</label>
              <RichTextEditor value={formData.content} onChange={(html) => setFormData((f) => ({ ...f, content: html }))} variables={releaseVariables} variablesTitle="Variables del release (click para insertar)" />
              <p className="text-xs text-gray-500 mt-1">Las variables se reemplazan al descargar con los datos de la persona y de la empresa seteada en el proyecto (Empresa del Release).</p>
              {errors.content && <p className="text-sm text-red-500 mt-1">{errors.content}</p>}
            </div>
          </div>
        </form>
      </Modal>
    </PageLayout>
  );
}
