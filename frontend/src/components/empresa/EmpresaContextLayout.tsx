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
import { getHelp, hasHelp, HelpKey } from '../../data/help/helpContent';

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
  /**
   * Contenido del ⓘ del encabezado.
   *
   * Es obligatorio en la práctica: `PageLayout` muestra el botón cuando hay subtítulo, y acá SIEMPRE
   * hay uno (la razón social). Sin esta prop el botón se dibujaba igual y no abría nada —un ⓘ muerto
   * en las siete pantallas de la ficha—, así que si no se pasa, ahora directamente no se muestra.
   */
  ayuda?: HelpKey;
  children: (empresa: Company, recargar: () => Promise<void>) => React.ReactNode;
}

export const EmpresaContextLayout: React.FC<Props> = ({ titulo, subtitulo, icono = faBuilding, acciones, ayuda, children }) => {
  const { empresa, cargando, recargar } = useEmpresaDelContexto();
  const [verAyuda, setVerAyuda] = useState(false);
  const help = ayuda && hasHelp(ayuda) ? getHelp(ayuda) : null;

  return (
    <PageLayout
      title={titulo}
      subtitle={empresa ? `${empresa.razonSocial}${empresa.cuit ? ` · CUIT ${empresa.cuit}` : ''}${subtitulo ? ` — ${subtitulo}` : ''}` : subtitulo}
      faIcon={{ icon: icono }}
      headerActions={acciones}
      shouldShowInfo={!!help}
      infoModal={help ? { isOpen: verAyuda, onOpen: () => setVerAyuda(true), onClose: () => setVerAyuda(false), title: help.title, size: help.size, content: help.content } : undefined}
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
/**
 * El contenedor de una sección de la ficha de empleadora. Hoy solo aporta el espaciado.
 *
 * Tenía además un cartel azul con título, descripción y una nota — y esa información YA ESTABA, casi
 * palabra por palabra, en el ⓘ del encabezado de cada pantalla. Eran dos textos que decían lo mismo
 * y que había que mantener sincronizados a mano: el de Convenios repetía hasta la regla de «se
 * guarda con Guardar cambios». Ahora la explicación vive en un solo lugar, el ⓘ, y la pantalla
 * arranca mostrando los datos.
 *
 * Se conserva el componente en vez de reemplazarlo por un <div>: nombra qué es cada bloque en el
 * árbol y deja dónde volver a colgar algo común a las siete pantallas.
 */
export const SeccionEmpleador: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="space-y-4">{children}</div>;
