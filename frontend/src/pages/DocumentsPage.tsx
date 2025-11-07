import React, { useEffect, useState } from 'react';
import { documentsAPI, Document } from '../api/hr';
import { useAuthStore } from '../stores/authStore';
import { PageLayout } from '../components/ui/PageLayout';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { Modal } from '../components/ui/Modal';
import { Card } from '../components/ui/Card';
import { FormField } from '../components/forms/FormField';
import { EmptyState } from '../components/ui/EmptyState';
import { sweetAlert } from '../utils/sweetAlert';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFileAlt,
  faDownload,
  faUpload,
  faTrash,
  faFilter,
} from '@fortawesome/free-solid-svg-icons';

const DOCUMENT_TYPES = [
  { value: 'contract', label: 'Contrato' },
  { value: 'payroll', label: 'Nómina' },
  { value: 'certificate', label: 'Certificado' },
  { value: 'other', label: 'Otro' },
];

export const DocumentsPage: React.FC = () => {
  const { user, hasPermission } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadData, setUploadData] = useState({
    title: '',
    type: 'contract' as Document['type'],
  });

  const isAdmin = hasPermission('documents:create');

  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (filterType === 'all') {
      setFilteredDocuments(documents);
    } else {
      setFilteredDocuments(documents.filter((doc) => doc.type === filterType));
    }
  }, [filterType, documents]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data } = await documentsAPI.list();
      setDocuments(data);
      setFilteredDocuments(data);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id: string, title: string) => {
    try {
      const { data } = await documentsAPI.download(id);
      const url = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.download = title;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading document:', error);
      await sweetAlert.error('Error', 'No se pudo descargar el documento');
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadData.title) {
      await sweetAlert.error('Error', 'Debes completar todos los campos');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadData.title);
      formData.append('type', uploadData.type);
      await documentsAPI.create(formData);
      setIsUploadModalOpen(false);
      setUploadFile(null);
      setUploadData({ title: '', type: 'contract' });
      await sweetAlert.success('Éxito', 'Documento subido correctamente');
      fetchDocuments();
    } catch (error) {
      console.error('Error uploading document:', error);
      await sweetAlert.error('Error', 'No se pudo subir el documento');
    }
  };

  const handleDelete = async (id: string) => {
    const result = await sweetAlert.confirm(
      'Confirmar',
      '¿Estás seguro de que deseas eliminar este documento?'
    );
    if (!result.isConfirmed) return;

    try {
      await documentsAPI.delete(id);
      await sweetAlert.success('Éxito', 'Documento eliminado');
      fetchDocuments();
    } catch (error) {
      console.error('Error deleting document:', error);
      await sweetAlert.error('Error', 'No se pudo eliminar el documento');
    }
  };

  const getDocumentTypeName = (type: string) => {
    return DOCUMENT_TYPES.find((t) => t.value === type)?.label || type;
  };

  if (loading) {
    return <LoadingSpinner message="Cargando documentos..." />;
  }

  return (
    <PageLayout
      title="Mis Documentos"
      subtitle="Contratos, nóminas y certificados"
      faIcon={{ icon: faFileAlt }}
      headerActions={
        isAdmin ? (
          <button onClick={() => setIsUploadModalOpen(true)} className="btn-primary">
            <FontAwesomeIcon icon={faUpload} className="mr-2" />
            Subir Documento
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-4">
            <FontAwesomeIcon icon={faFilter} className="text-gray-500" />
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filterType === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                Todos
              </button>
              {DOCUMENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => setFilterType(type.value)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filterType === type.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Documents List */}
        {filteredDocuments.length === 0 ? (
          <EmptyState
            title="No hay documentos"
            description={
              filterType === 'all'
                ? 'Aún no tienes documentos cargados'
                : `No hay documentos del tipo: ${getDocumentTypeName(filterType)}`
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDocuments.map((document) => (
              <Card
                key={document._id}
                header={{
                  title: document.title,
                  subtitle: new Date(document.uploadDate).toLocaleDateString('es-ES'),
                  icon: faFileAlt,
                  badges: [
                    {
                      text: getDocumentTypeName(document.type),
                      variant: 'info',
                    },
                  ],
                }}
                footer={{
                  actions: [
                    {
                      icon: faDownload,
                      onClick: () => handleDownload(document._id, document.title),
                      title: 'Descargar',
                      variant: 'success',
                    },
                    ...(isAdmin
                      ? [
                          {
                            icon: faTrash,
                            onClick: () => handleDelete(document._id),
                            title: 'Eliminar',
                            variant: 'blue' as const,
                          },
                        ]
                      : []),
                  ],
                }}
              >
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {document.size && (
                    <p>Tamaño: {(document.size / 1024 / 1024).toFixed(2)} MB</p>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setUploadFile(null);
          setUploadData({ title: '', type: 'contract' });
        }}
        title="Subir Documento"
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Título del Documento" required>
            <input
              type="text"
              value={uploadData.title}
              onChange={(e) => setUploadData({ ...uploadData, title: e.target.value })}
              className="input-field"
              placeholder="Ej: Contrato 2024"
            />
          </FormField>

          <FormField label="Tipo de Documento" required>
            <select
              value={uploadData.type}
              onChange={(e) =>
                setUploadData({ ...uploadData, type: e.target.value as Document['type'] })
              }
              className="input-field"
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Archivo" required>
            <input
              type="file"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {uploadFile && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Seleccionado: {uploadFile.name}
              </p>
            )}
          </FormField>

          <div className="flex justify-end gap-3 pt-4">
            <button onClick={() => setIsUploadModalOpen(false)} className="btn-ghost">
              Cancelar
            </button>
            <button onClick={handleUpload} className="btn-primary">
              Subir Documento
            </button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};
