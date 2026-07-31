import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from '../components/ui/PageLayout';
import { Card } from '../components/ui/Card';
import { MembreteToggle } from '../components/MembreteToggle';
import { SearchAndFilters } from '../components/ui/SearchAndFilters';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faEdit, faTrash, faFileContract, faEye, faList, faInfoCircle, faDownload, faShoppingCart, faUmbrellaBeach } from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

import { pdfsAPI, Pdf, PdfInput, codeOptions, variablesByCode, systemVariables } from '../api/pdf';
import { pdfPreviewAPI } from '../api/pdfPreview';

import Swal from 'sweetalert2';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { Modal } from '../components/ui/Modal';
import { RichTextEditor } from '../components/ui/RichTextEditor';
import { ViewToggle, ViewMode } from '../components/ui/ViewToggle';
import { PdfAssignmentStatus } from './PdfAssignmentStatus';

const HELP_KEY = 'pdfTemplates' as const;

type PdfTemplatesScope = 'pedidos' | 'vacaciones';

/**
 * Un solo componente para las plantillas de Pedidos y de Vacaciones: comparten el mismo modelo
 * (Pdf.code) y solo se diferencian por el subconjunto de códigos que administran. El código
 * "vacaciones" queda exclusivamente en el scope "vacaciones"; el resto ("Pedidos | ...") en "pedidos".
 */
const SCOPE_CONFIG: Record<
  PdfTemplatesScope,
  {
    title: string;
    subtitle: string;
    storageKey: string;
    codes: (typeof codeOptions)[number][];
    section: 'Pedidos' | 'Vacaciones';
    faIcon: IconDefinition;
    backLabel: string;
    backRoute: string;
    backIcon: IconDefinition;
  }
> = {
  pedidos: {
    title: 'Plantillas | Pedidos',
    subtitle: 'Crea y gestiona plantillas PDF para pedidos',
    storageKey: 'pdfTemplatesViewMode_pedidos_v1',
    codes: codeOptions.filter((c) => c.value !== 'vacaciones'),
    section: 'Pedidos',
    faIcon: faFileContract,
    backLabel: 'Pedidos',
    backRoute: '/order-types',
    backIcon: faShoppingCart,
  },
  vacaciones: {
    title: 'Plantillas | Vacaciones',
    subtitle: 'Crea y gestiona la plantilla PDF de vacaciones',
    storageKey: 'pdfTemplatesViewMode_vacaciones_v1',
    codes: codeOptions.filter((c) => c.value === 'vacaciones'),
    section: 'Vacaciones',
    faIcon: faUmbrellaBeach,
    backLabel: 'Vacaciones',
    backRoute: '/vacations-rules',
    backIcon: faUmbrellaBeach,
  },
};

/** El editor devuelve "<p></p>" cuando está vacío: chequeamos que haya texto real. */
const hasContent = (html: string): boolean =>
  !!html &&
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim().length > 0;

const looksLikeHtml = (s: string): boolean => /<\/?(p|div|h[1-6]|ul|ol|li|table|tr|td|strong|em|u|br)\b/i.test(s || '');

/**
 * Las plantillas creadas antes del editor con formato son texto plano con saltos de línea.
 * Al abrirlas hay que convertirlas a HTML para no perder esos saltos dentro del editor.
 */
const toEditorHtml = (content: string): string => {
  const text = content || '';
  if (!text.trim() || looksLikeHtml(text)) return text;
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escape(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
};

export function PdfTemplatesPage({ scope }: { scope: PdfTemplatesScope }) {
  const navigate = useNavigate();
  const config = SCOPE_CONFIG[scope];

  // data
  const [templates, setTemplates] = useState<Pdf[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [isFetching, setIsFetching] = useState(false);

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
      const saved = localStorage.getItem(config.storageKey);
      if (saved === 'table' || saved === 'cards') setViewMode(saved as ViewMode);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (isLarge) localStorage.setItem(config.storageKey, viewMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isLarge]);
  const effectiveViewMode: ViewMode = isLarge ? viewMode : 'cards';

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Pdf | null>(null);
  const [saving, setSaving] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // form
  const [formData, setFormData] = useState<PdfInput>({
    code: config.codes[0].value,
    name: '',
    content: '',
    variablesHint: '',
    isActive: true,
    usaMembrete: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // help modal
  const [openInfo, setOpenInfo] = useState(false);
  const showHelp = hasHelp(HELP_KEY);
  const helpEntry = showHelp ? getHelp(HELP_KEY) : { title: 'Ayuda', size: 'md' as const, content: <div /> };

  const handlePreview = async () => {
    try {
      Swal.fire({
        title: 'Generando previsualización...',
        text: 'Por favor espere',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const blob = await pdfPreviewAPI.preview(formData.content, formData.code, formData.title, undefined, formData.usaMembrete ?? false);
      Swal.close();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'No se pudo generar la previsualización', 'error');
    }
  };

  /** Descarga el PDF de la plantilla ya guardada, con valores de ejemplo (igual que en Releases). */
  const handleDownload = async (template: Pdf) => {
    try {
      const blob = await pdfPreviewAPI.preview(template.content, template.code, template.title, undefined, template.usaMembrete ?? false);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${template.name || 'Plantilla'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'No se pudo generar el PDF de la plantilla', 'error');
    }
  };

  /** Abre la previsualización de la plantilla en una pestaña nueva, sin entrar a editar. */
  const handlePreviewItem = async (template: Pdf) => {
    try {
      const blob = await pdfPreviewAPI.preview(template.content, template.code, template.title, undefined, template.usaMembrete ?? false);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'No se pudo generar la previsualización', 'error');
    }
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = await pdfsAPI.getAll();
      setTemplates(data);
    } catch {
      Swal.fire('Error', 'No se pudieron cargar las plantillas', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Solo las plantillas cuyo código pertenece a este scope (Pedidos o Vacaciones).
  const scopedTemplates = templates.filter((t) => config.codes.some((c) => c.value === t.code));

  // filtering
  const filteredTemplates = scopedTemplates.filter((t) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const match = t.name.toLowerCase().includes(term) || t.content.toLowerCase().includes(term);
      if (!match) return false;
    }

    if (filterActive === 'active' && !t.isActive) return false;
    if (filterActive === 'inactive' && t.isActive) return false;

    return true;
  });

  const openCreate = () => {
    setEditingTemplate(null);

    // Primer código libre del scope. Nunca dejar "" : el <select> mostraría la primera opción sin que el
    // estado coincida, y las variables del pedido quedarían vacías hasta cambiar el select.
    const used = new Set(templates.map((t) => t.code));
    const firstAvailable = config.codes.find((opt) => !used.has(opt.value))?.value ?? config.codes[0].value;

    setFormData({
      code: firstAvailable as any,
      name: '',
      content: '',
      variablesHint: '',
      isActive: true,
      usaMembrete: false,
    });

    setErrors({});
    setShowModal(true);
  };

  const openEdit = (template: Pdf) => {
    setEditingTemplate(template);
    setFormData({
      code: template.code,
      name: template.name,
      title: template.title || '',
      content: toEditorHtml(template.content),
      variablesHint: template.variablesHint || '',
      isActive: template.isActive,
      usaMembrete: template.usaMembrete ?? false,
    });
    setErrors({});
    setShowModal(true);
  };

  const handleDelete = async (template: Pdf) => {
    const result = await Swal.fire({
      title: '¿Eliminar plantilla?',
      text: `Se eliminará la plantilla "${template.name}"`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Eliminar',
    });

    if (!result.isConfirmed) return;

    try {
      await pdfsAPI.delete(template._id);
      Swal.fire('Eliminada', 'La plantilla ha sido eliminada', 'success');
      loadTemplates();
    } catch {
      Swal.fire('Error', 'No se pudo eliminar la plantilla', 'error');
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido';
    if (!hasContent(formData.content)) newErrors.content = 'El contenido es requerido';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSaving(true);
      if (editingTemplate) {
        await pdfsAPI.update(editingTemplate._id, formData);
        Swal.fire('Actualizada', 'La plantilla ha sido actualizada', 'success');
      } else {
        await pdfsAPI.create(formData);
        Swal.fire('Creada', 'La plantilla ha sido creada', 'success');
      }
      setShowModal(false);
      setEditingTemplate(null);
      loadTemplates();
    } catch (error: any) {
      Swal.fire('Error', error.response?.data?.error || 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const usedCodes = templates.map((t) => t.code);
  const availableCodes = config.codes.filter((c) => !usedCodes.includes(c.value));
  const isAddDisabled = availableCodes.length === 0;

  // Un código ya usado por OTRA plantilla no se puede elegir (índice único tenant+code):
  // se muestra igual en el select pero deshabilitado, para que se entienda por qué no está disponible.
  const isCodeTaken = (code: (typeof codeOptions)[number]['value']) => usedCodes.includes(code) && code !== editingTemplate?.code;

  return (
    <PageLayout
      title={config.title}
      itemCount={filteredTemplates.length}
      subtitle={config.subtitle}
      faIcon={{ icon: config.faIcon }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <div className="flex flex-wrap gap-2">
          <button onClick={isAddDisabled ? undefined : openCreate} disabled={isAddDisabled} aria-label="Nueva plantilla" className={`inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg transition-colors ${isAddDisabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500' : 'bg-blue-600 text-white hover:bg-blue-700'}`} title={isAddDisabled ? 'Todos los códigos ya tienen asignada una plantilla' : 'Nueva plantilla'}>
            <FontAwesomeIcon icon={faPlus} />
          </button>
          <button onClick={() => navigate(config.backRoute)} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={config.backIcon} />
            <span className="hidden lg:block">{config.backLabel}</span>
          </button>
          <button onClick={() => setShowStatusModal(true)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors" title="Ver estado de asignación">
            <FontAwesomeIcon icon={faList} className="h-4 w-4" />
            <span>Estado</span>
          </button>
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por nombre o contenido..."
              filters={[
                {
                  value: filterActive,
                  onChange: (v) => setFilterActive(v as any),
                  options: [
                    { value: 'all', label: 'Todas' },
                    { value: 'active', label: 'Activas' },
                    { value: 'inactive', label: 'Inactivas' },
                  ],
                },
              ]}
            />
          </div>
          {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
        </div>
      }
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando plantillas..." />
        </div>
      ) : (
        <>
          {/* Todos los códigos del scope ya tienen su plantilla: no hace falta (ni se puede) crear más. */}
          {isAddDisabled && (
            <div className="mb-6 mx-0.5 lg:mx-0 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-900/20">
              <FontAwesomeIcon icon={faInfoCircle} className="h-5 w-5 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="text-sm">
                <p className="font-semibold text-blue-800 dark:text-blue-300">Ya están creadas las {config.codes.length} plantillas disponibles</p>
                <p className="text-blue-700 dark:text-blue-300/80 mt-0.5">Cada código admite una sola plantilla, así que no es necesario crear más. Para cambiar un documento, editá la plantilla del código correspondiente.</p>
              </div>
            </div>
          )}

          <div className="relative">
            {isFetching && <div className="absolute -top-6 right-0 text-xs text-gray-500 dark:text-gray-400">Filtrando…</div>}

            {effectiveViewMode === 'table' ? (
              <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg mx-0.5 lg:mx-0">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-900/50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Código</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Membrete | Firma</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Contenido</th>
                      <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {filteredTemplates.map((template) => (
                      <tr key={template._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/20 cursor-pointer" onClick={() => openEdit(template)}>
                        <td className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white">{template.name}</td>
                        <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{codeOptions.find((c) => c.value === template.code)?.label || template.code}</td>
                        <td className="px-5 py-3 text-sm whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${template.isActive ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>{template.isActive ? 'Activa' : 'Inactiva'}</span>
                        </td>
                        <td className="px-5 py-3 text-sm whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${template.usaMembrete ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>{template.usaMembrete ? 'Activo' : 'Inactivo'}</span>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                          <span className="truncate max-w-[320px] block" title="Contenido de la plantilla">
                            {(template.content || '')
                              .replace(/<[^>]*>/g, ' ')
                              .replace(/&nbsp;/g, ' ')
                              .trim()
                              .slice(0, 70)}
                            {(template.content || '').length > 70 ? '…' : ''}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button onClick={() => handlePreviewItem(template)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Previsualizar">
                              <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDownload(template)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Descargar PDF de ejemplo">
                              <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                            </button>
                            <button onClick={() => openEdit(template)} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors" title="Editar">
                              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDelete(template)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Eliminar">
                              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
                {filteredTemplates.map((template) => (
                  <Card
                    key={template._id}
                    onClick={() => openEdit(template)}
                    className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
                    header={{
                      icon: faFileContract,
                      title: template.name,
                      subtitle: codeOptions.find((c) => c.value === template.code)?.label || template.code,
                      badges: [template.isActive ? { text: 'Activa', variant: 'green' } : { text: 'Inactiva', variant: 'destructive' }, template.usaMembrete ? { text: 'Membrete activo', variant: 'green' } : { text: 'Membrete inactivo', variant: 'default' }],
                    }}
                    footer={{
                      leftContent: null,
                      actions: [
                        {
                          icon: faEye,
                          title: 'Previsualizar',
                          onClick: (e) => {
                            e.stopPropagation();
                            handlePreviewItem(template);
                          },
                        },
                        {
                          icon: faDownload,
                          title: 'Descargar PDF de ejemplo',
                          onClick: (e) => {
                            e.stopPropagation();
                            handleDownload(template);
                          },
                        },
                        {
                          icon: faEdit,
                          title: 'Editar',
                          onClick: (e) => {
                            e.stopPropagation();
                            openEdit(template);
                          },
                        },
                        {
                          icon: faTrash,
                          title: 'Eliminar',
                          onClick: (e) => {
                            e.stopPropagation();
                            handleDelete(template);
                          },
                        },
                      ],
                    }}
                  >
                    {/* YA NO HAY preview ni variables */}
                  </Card>
                ))}

                {/* CREATE CARD — oculta si ya no quedan códigos libres (igual que el botón del header) */}
                {!isAddDisabled && (
                  <Card
                    variant="create"
                    onClick={openCreate}
                    header={{
                      icon: faFileContract,
                      title: 'Nueva Plantilla',
                      subtitle: 'Crear nueva plantilla',
                    }}
                  />
                )}
              </div>
            )}
          </div>
          {filteredTemplates.length === 0 && !isFetching && (
            <EmptyState
              icon={faFileContract}
              title="No hay plantillas"
              description="No hay plantillas definidas."
              action={
                isAddDisabled
                  ? undefined
                  : {
                      label: 'Nueva Plantilla',
                      onClick: openCreate,
                      icon: faPlus,
                    }
              }
            />
          )}
        </>
      )}

      {/* MODAL */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingTemplate(null);
        }}
        title={editingTemplate ? 'Editar Plantilla' : 'Nueva Plantilla'}
        size="xl"
        footer={
          <div className="flex justify-between w-full">
            <button type="button" className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700" onClick={handlePreview}>
              <FontAwesomeIcon icon={faEye} className="mr-2" />
              Previsualizar
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                onClick={() => {
                  setShowModal(false);
                  setEditingTemplate(null);
                }}
              >
                Cancelar
              </button>
              <button type="submit" form="template-form" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? 'Guardando...' : editingTemplate ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </div>
        }
      >
        <form id="template-form" onSubmit={handleSubmitForm}>
          <div className="space-y-6">
            {/* form fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
                {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código *</label>
                <select
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value as any,
                    })
                  }
                  className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  {config.codes.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={isCodeTaken(opt.value)}>
                      {opt.label}
                      {isCodeTaken(opt.value) ? ' — ya en uso' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Título del Documento</label>
              <input type="text" value={formData.title || ''} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Ej: AUTORIZACIÓN GENERAL DE SOLICITUDES DE RECURSOS HUMANOS" className="input-field w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" />
              <p className="text-xs text-gray-500 mt-1">Este título aparecerá centrado en el PDF, debajo del encabezado.</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    isActive: e.target.checked,
                  })
                }
                className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
              />
              Plantilla activa
            </label>

            <MembreteToggle checked={formData.usaMembrete ?? false} onChange={(v) => setFormData({ ...formData, usaMembrete: v })} />

            {/* contenido */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contenido *</label>
              <RichTextEditor
                value={formData.content}
                onChange={(html) => setFormData({ ...formData, content: html })}
                variables={[
                  { grupo: formData.code === 'vacaciones' ? 'Variables de vacaciones' : 'Variables del pedido', vars: variablesByCode[formData.code] || [] },
                  { grupo: 'Variables de la empresa', vars: systemVariables.map((s) => s.variable) },
                ]}
                variablesTitle="Variables disponibles (click para insertar)"
              />
              {errors.content && <p className="text-sm text-red-500 mt-1">{errors.content}</p>}
            </div>
          </div>
        </form>
      </Modal>
      {/* Status Modal */}
      <Modal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} title="Estado de Asignación de Plantillas" size="xl">
        <PdfAssignmentStatus templates={templates} section={config.section} />
      </Modal>
    </PageLayout>
  );
}
