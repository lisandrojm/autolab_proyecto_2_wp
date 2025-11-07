import { Document, DocumentAPI } from './types';

export const mockDocuments: Document[] = [
  {
    id: '1',
    tipo: 'contrato',
    nombre: 'Contrato de Trabajo',
    descripcion: 'Contrato inicial de trabajo',
    fechaEmision: '2022-03-15',
    url: '/documents/contrato_trabajo_maria_gonzalez.pdf',
    tamaño: '245 KB'
  },
  {
    id: '2',
    tipo: 'recibo',
    nombre: 'Recibo de Sueldo - Enero 2025',
    descripcion: 'Recibo correspondiente al mes de enero 2025',
    fechaEmision: '2025-01-31',
    url: '/documents/recibo_enero_2025.pdf',
    tamaño: '128 KB'
  },
  {
    id: '3',
    tipo: 'recibo',
    nombre: 'Recibo de Sueldo - Diciembre 2024',
    descripcion: 'Recibo correspondiente al mes de diciembre 2024',
    fechaEmision: '2024-12-31',
    url: '/documents/recibo_diciembre_2024.pdf',
    tamaño: '132 KB'
  },
  {
    id: '4',
    tipo: 'certificado',
    nombre: 'Certificado de Trabajo',
    descripcion: 'Certificado de servicios prestados',
    fechaEmision: '2024-11-20',
    url: '/documents/certificado_trabajo.pdf',
    tamaño: '98 KB'
  },
  {
    id: '5',
    tipo: 'liquidacion',
    nombre: 'Liquidación Anual 2024',
    descripcion: 'Liquidación final del año 2024',
    fechaEmision: '2024-12-31',
    url: '/documents/liquidacion_2024.pdf',
    tamaño: '310 KB'
  }
];

export const mockDocumentsAPI: DocumentAPI[] = [
  {
    _id: 'doc_001',
    employeeId: 'user_001',
    type: 'contract',
    title: 'Contrato de Trabajo',
    fileName: 'contrato_trabajo_maria_gonzalez.pdf',
    url: '/documents/contrato_trabajo_maria_gonzalez.pdf',
    createdAt: '2022-03-15T10:00:00Z'
  },
  {
    _id: 'doc_002',
    employeeId: 'user_001',
    type: 'payslip',
    title: 'Recibo de Sueldo - Enero 2025',
    fileName: 'recibo_enero_2025.pdf',
    url: '/documents/recibo_enero_2025.pdf',
    createdAt: '2025-01-31T08:00:00Z'
  },
  {
    _id: 'doc_003',
    employeeId: 'user_001',
    type: 'payslip',
    title: 'Recibo de Sueldo - Diciembre 2024',
    fileName: 'recibo_diciembre_2024.pdf',
    url: '/documents/recibo_diciembre_2024.pdf',
    createdAt: '2024-12-31T08:00:00Z'
  },
  {
    _id: 'doc_004',
    employeeId: 'user_001',
    type: 'certificate',
    title: 'Certificado de Trabajo',
    fileName: 'certificado_trabajo.pdf',
    url: '/documents/certificado_trabajo.pdf',
    createdAt: '2024-11-20T10:00:00Z'
  },
  {
    _id: 'doc_005',
    employeeId: 'user_001',
    type: 'other',
    title: 'Liquidación Anual 2024',
    fileName: 'liquidacion_2024.pdf',
    url: '/documents/liquidacion_2024.pdf',
    createdAt: '2024-12-31T12:00:00Z'
  }
];
