import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faBuilding, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../ui/PageLayout';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { companiesAPI, Company } from '../../api/companies';
import { useEmpresaContextStore } from '../../stores/empresaContextStore';
import { AlcanceBanner } from '../context/AlcanceBanner';

/**
 * Shell de todas las pantallas del contexto Empresa.
 *
 * Resuelve la empleadora desde la URL (`/empresas/:empresaId/...`) y no desde el store: la URL es la
 * fuente de verdad, así un link compartido o un refresh abren la empresa correcta. El store se
 * sincroniza para que el nav muestre el contexto correspondiente.
 */
export const useEmpresaDelContexto = (): { empresa: Company | null; cargando: boolean; recargar: () => Promise<void> } => {
  const { empresaId } = useParams<{ empresaId: string }>();
  const { selectedEmpresa, setSelectedEmpresa } = useEmpresaContextStore();
  const [empresa, setEmpresa] = useState<Company | null>(selectedEmpresa?._id === empresaId ? selectedEmpresa : null);
  const [cargando, setCargando] = useState(selectedEmpresa?._id !== empresaId);

  const cargar = React.useCallback(async () => {
    if (!empresaId) return;
    try {
      setCargando(true);
      const encontrada = (await companiesAPI.list()).find((c) => c._id === empresaId) || null;
      setEmpresa(encontrada);
      // El nav sigue a la URL: entrar por link a otra empresa cambia el contexto, no lo contradice.
      setSelectedEmpresa(encontrada);
    } finally {
      setCargando(false);
    }
  }, [empresaId, setSelectedEmpresa]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { empresa, cargando, recargar: cargar };
};

interface Props {
  titulo: string;
  subtitulo?: string;
  icono?: IconDefinition;
  /** Acciones de la barra superior (botones de guardar, importar, etc.). */
  acciones?: React.ReactNode;
  children: (empresa: Company, recargar: () => Promise<void>) => React.ReactNode;
}

export const EmpresaContextLayout: React.FC<Props> = ({ titulo, subtitulo, icono = faBuilding, acciones, children }) => {
  const { empresa, cargando, recargar } = useEmpresaDelContexto();

  return (
    <PageLayout
      title={titulo}
      subtitle={empresa ? `${empresa.razonSocial}${empresa.cuit ? ` · CUIT ${empresa.cuit}` : ''}${subtitulo ? ` — ${subtitulo}` : ''}` : subtitulo}
      faIcon={{ icon: icono }}
      headerActions={acciones}
    >
      {/* Todas las pantallas del contexto están acotadas a esta empleadora: el chip lo dice y además
          es por dónde se sale. Sin esto, "Contratos" acá y "Todos los contratos" en el menú se ven
          igual de global una vez que estás adentro. */}
      {empresa && (
        <div className="mb-4">
          <AlcanceBanner eje="empresa" modo="filtrado" nombre={empresa.razonSocial} />
        </div>
      )}

      {cargando ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando la empresa..." />
        </div>
      ) : !empresa ? (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-6 flex items-start gap-3">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">Esta empresa no existe</h3>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">Puede haberse eliminado. Elegí otra en el selector de Empresa.</p>
          </div>
        </div>
      ) : (
        children(empresa, recargar)
      )}
    </PageLayout>
  );
};

/**
 * Encabezado de una sección de "Datos del Empleador": qué es, y la aclaración de que el dato sale del
 * padrón de ESTE CUIT. Se repite en cada pantalla del contexto porque es lo que las distingue del
 * nomenclador universal que vive en Configuración → ARCA.
 */
export const SeccionEmpleador: React.FC<{ titulo: string; descripcion: string; nota?: string; children: React.ReactNode }> = ({ titulo, descripcion, nota, children }) => (
  <div className="space-y-4">
    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
      <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200">{titulo}</h3>
      <p className="text-xs text-blue-800 dark:text-blue-300 mt-1">{descripcion}</p>
      {nota && <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-1.5">{nota}</p>}
    </div>
    {children}
  </div>
);
