import React, { useState } from 'react';
import { encabezadoDeAmbito } from "../config/nomencladoresArca";
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { faListCheck } from '@fortawesome/free-solid-svg-icons';
import { CategoriasArcaTab } from '../components/arcaCategorias/CategoriasArcaTab';

/**
 * ARCA → Categorías. Vive en `/arca/categorias` junto al resto de los catálogos del organismo
 * (Sucursales, Tipos de Servicio, Modalidades). La ruta vieja `/categorias-sat` redirige acá: el
 * "SAT" describía un caso particular —las 106 categorías del convenio 0634/11— como si fuera la regla.
 */
export const ArcaCategoriasPage: React.FC = () => {
  const [showInfo, setShowInfo] = useState(false);

  const helpKey = 'categoriasSat' as const;
  const helpEntry = getHelp(helpKey);

  return (
    <PageLayout
      title="Categorías"
      {...encabezadoDeAmbito("categorias")}
      faIcon={{ icon: faListCheck }}
      shouldShowInfo={hasHelp(helpKey)}
      infoModal={{
        isOpen: showInfo,
        onOpen: () => setShowInfo(true),
        onClose: () => setShowInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      searchAndFilters={
        <div className="mx-auto w-full">
          <div className="animate-in fade-in duration-300">
            <CategoriasArcaTab />
          </div>
        </div>
      }
      children={null}
    />
  );
};

export default ArcaCategoriasPage;
