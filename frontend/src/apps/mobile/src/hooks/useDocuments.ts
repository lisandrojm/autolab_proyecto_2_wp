import { useState, useEffect } from 'react';
import { personnelAPI, DocumentData } from '../../../../api/personnel';

export const useDocuments = () => {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await personnelAPI.getDocuments();
      setDocuments(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cargar documentos');
      console.error('Error fetching documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterDocuments = async (type: string) => {
    try {
      setLoading(true);
      setError(null);
      if (type === 'all') {
        const data = await personnelAPI.getDocuments();
        setDocuments(data);
      } else {
        const data = await personnelAPI.filterDocuments(type);
        setDocuments(data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al filtrar documentos');
      console.error('Error filtering documents:', err);
    } finally {
      setLoading(false);
    }
  };

  const getDocumentsByType = (type: string) => {
    return documents.filter(doc => doc.type === type);
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  return {
    documents,
    loading,
    error,
    refetch: fetchDocuments,
    filterDocuments,
    getDocumentsByType,
  };
};
