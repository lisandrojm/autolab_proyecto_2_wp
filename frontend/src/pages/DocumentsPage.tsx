import React, { useEffect, useState } from 'react';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Card } from '../components/ui/Card';
// USANDO MOCKS - API real comentada
// import { personnelAPI, DocumentData } from '../api/personnel';
import { mockPersonnelAPI } from '../mocks';
import type { DocumentAPI as DocumentData } from '../mocks';
import { sweetAlert } from '../utils/sweetAlert';
import { useAuthStore } from '../stores/authStore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileLines, faPlus, faDownload, faTrash, faFilter } from '@fortawesome/free-solid-svg-icons';

const DOCUMENT_TYPES = [
  { value: 'all', label: 'Todos' },
  { value: 'contract', label: 'Contratos' },
  { value: 'payslip', label: 'Nóminas' },
  { value: 'certificate', label: 'Certificados' },
  { value: 'other', label: 'Otros' },
];

export const DocumentsPage: React.FC = () => {
  const { hasPermission } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [filteredDocs, setFilteredDocs] = useState<DocumentData[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    file: null as File | null,
    type: 'contract' as 'contract' | 'payslip' | 'certificate' | 'other',
    title: '',
  });

  const isAdmin = hasPermission('documents:manage');

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (filterType === 'all') {
      setFilteredDocs(documents);
    } else {
      setFilteredDocs(documents.filter((doc) => doc.type === filterType));
    }
  }, [filterType, documents]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      // USANDO MOCKS - API real comentada
      // const data = await personnelAPI.getDocuments();
      const data = await mockPersonnelAPI.getDocuments();
      setDocuments(data);
    } catch (error) {
      console.error('Error fetching documents:', error);
      sweetAlert.error('Error', 'No se pudieron cargar los documentos');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (doc: DocumentData) => {
    try {
      // USANDO MOCKS - API real comentada
      // const blob = await personnelAPI.downloadDocument(doc._id);
      const blob = await mockPersonnelAPI.downloadDocument(doc._id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo descargar el documento');
    }
  };

  const handleDelete = async (doc: DocumentData) => {
    if (!isAdmin) {
      sweetAlert.error('Error', 'No tienes permisos para eliminar documentos');
      return;
    }
    const result = await sweetAlert.confirm('¿Eliminar documento?', '¿Estás seguro de eliminar este documento?');
    if (!result.isConfirmed) return;

    try {
      // USANDO MOCKS - API real comentada
      // await personnelAPI.deleteDocument(doc._id);
      await mockPersonnelAPI.deleteDocument(doc._id);
      sweetAlert.success('Documento eliminado', 'El documento se eliminó correctamente');
      fetchDocuments();
    } catch (error) {
      sweetAlert.error('Error', 'No se pudo eliminar el documento');
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file) return;

    try {
      setUploading(true);
      // USANDO MOCKS - API real comentada
      // await personnelAPI.uploadDocument(uploadForm.file, uploadForm.type, uploadForm.title);
      await mockPersonnelAPI.uploadDocument(uploadForm.file, uploadForm.type, uploadForm.title);
      sweetAlert.success('Documento subido', 'El documento se subió correctamente');
      setShowUploadModal(false);
      setUploadForm({ file: null, type: 'contract', title: '' });
      fetchDocuments();
    } catch (error: any) {
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo subir el documento');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Cargando documentos..." />;
  }

  const getTypeLabel = (type: string) => {
    return DOCUMENT_TYPES.find((t) => t.value === type)?.label || type;
  };

  return (
    <PageLayout
      title="Documentos"
      subtitle="Contratos, nóminas y certificados"
      faIcon={{ icon: faFileLines }}
      headerActions={
        isAdmin ? (
          <button onClick={() => setShowUploadModal(true)} className="btn-primary">
            <FontAwesomeIcon icon={faPlus} className="mr-2" />
            Subir Documento
          </button>
        ) : undefined
      }
      modal={{
        isOpen: showUploadModal,
        onClose: () => setShowUploadModal(false),
        title: 'Subir Documento',
        subtitle: 'Sube un nuevo documento',
        size: 'md',
        actions: [
          {
            label: uploading ? 'Subiendo...' : 'Subir',
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>('#upload-form');
              form?.requestSubmit();
            },
            variant: 'primary',
          },
          { label: 'Cancelar', onClick: () => setShowUploadModal(false), variant: 'ghost' },
        ],
        content: (
          <form id="upload-form" onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Archivo *</label>
              <input
                type="file"
                required
                onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo *</label>
              <select
                required
                value={uploadForm.type}
                onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value as any })}
                className="input-field"
              >
                {DOCUMENT_TYPES.filter((t) => t.value !== 'all').map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título *</label>
              <input
                type="text"
                required
                value={uploadForm.title}
                onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                className="input-field"
                placeholder="Título del documento"
              />
            </div>
          </form>
        ),
      }}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <FontAwesomeIcon icon={faFilter} className="text-gray-600 dark:text-gray-400" />
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="input-field max-w-xs">
            {DOCUMENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredDocs.map((doc) => (
            <Card
              key={doc._id}
              header={{
                title: doc.title,
                subtitle: getTypeLabel(doc.type),
                icon: faFileLines,
              }}
              footer={{
                leftContent: <span className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleDateString()}</span>,
                actions: [
                  {
                    icon: faDownload,
                    onClick: () => handleDownload(doc),
                    title: 'Descargar',
                    variant: 'default',
                  },
                  ...(isAdmin
                    ? [
                        {
                          icon: faTrash,
                          onClick: () => handleDelete(doc),
                          title: 'Eliminar',
                          variant: 'blue' as const,
                        },
                      ]
                    : []),
                ],
              }}
            >
              <p className="text-sm text-gray-600 dark:text-gray-400">{doc.fileName}</p>
            </Card>
          ))}
        </div>

        {filteredDocs.length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
            <FontAwesomeIcon icon={faFileLines} className="h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No hay documentos {filterType !== 'all' ? `de tipo ${getTypeLabel(filterType)}` : ''}</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
