import { DocumentAPI } from '../mocks/types';

let documents: DocumentAPI[] = [
  {
    _id: 'doc_001',
    employeeId: 'user_current',
    type: 'contract',
    title: 'Contrato de trabajo',
    fileName: 'contrato_2023.pdf',
    url: '/documents/contrato_2023.pdf',
    createdAt: '2023-03-15T10:00:00.000Z'
  },
  {
    _id: 'doc_002',
    employeeId: 'user_current',
    type: 'payslip',
    title: 'Recibo de sueldo - Octubre 2025',
    fileName: 'recibo_octubre_2025.pdf',
    url: '/documents/recibo_octubre_2025.pdf',
    createdAt: '2025-10-31T15:30:00.000Z'
  },
  {
    _id: 'doc_003',
    employeeId: 'user_current',
    type: 'payslip',
    title: 'Recibo de sueldo - Septiembre 2025',
    fileName: 'recibo_septiembre_2025.pdf',
    url: '/documents/recibo_septiembre_2025.pdf',
    createdAt: '2025-09-30T15:30:00.000Z'
  },
  {
    _id: 'doc_004',
    employeeId: 'user_current',
    type: 'certificate',
    title: 'Certificado de servicios',
    fileName: 'certificado_servicios.pdf',
    url: '/documents/certificado_servicios.pdf',
    createdAt: '2025-06-10T12:00:00.000Z'
  }
];

export const mockDocumentsService = {
  getDocuments: async (): Promise<DocumentAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return documents.filter(d => d.employeeId === 'user_current');
  },

  getDocument: async (id: string): Promise<DocumentAPI | null> => {
    await new Promise(resolve => setTimeout(resolve, 200));
    return documents.find(d => d._id === id) || null;
  },

  downloadDocument: async (id: string): Promise<Blob> => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const doc = documents.find(d => d._id === id);
    const content = `Mock document: ${doc?.title || 'Unknown'}`;
    return new Blob([content], { type: 'application/pdf' });
  },

  filterDocuments: async (type: string): Promise<DocumentAPI[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return documents.filter(d => d.employeeId === 'user_current' && d.type === type);
  },

  uploadDocument: async (file: File, type: string, title: string): Promise<DocumentAPI> => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const newDoc: DocumentAPI = {
      _id: `doc_${Date.now()}`,
      employeeId: 'user_current',
      type: type as DocumentAPI['type'],
      title,
      fileName: file.name,
      url: URL.createObjectURL(file),
      createdAt: new Date().toISOString()
    };
    documents.push(newDoc);
    return newDoc;
  },

  deleteDocument: async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 400));
    documents = documents.filter(d => d._id !== id);
  }
};
