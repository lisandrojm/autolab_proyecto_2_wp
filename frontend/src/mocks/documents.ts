import { Document } from './types';

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
