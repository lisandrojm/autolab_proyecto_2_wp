import React, { useEffect, useState } from 'react';
import { SimpleCatalogItem } from '../../api/simpleCatalog';
import { listarPuestos } from '../arca/SelectorPuestoDesempenado';

/**
 * El puesto desempeñado por defecto de un convenio, en la tabla de Convenios: código y descripción.
 *
 * El catálogo de puestos se pide una sola vez para toda la pantalla (`listarPuestos` lo cachea), y
 * sólo si la fila tiene un código: de los 2.669 convenios lo van a tener unos pocos.
 *
 * Un código que no está en el catálogo se muestra igual, marcado: es justo lo que hay que ver.
 */
export const CeldaPuestoConvenio: React.FC<{ codigo?: string | null }> = ({ codigo }) => {
  const [puestos, setPuestos] = useState<SimpleCatalogItem[] | null>(null);
  useEffect(() => {
    if (codigo) void listarPuestos().then(setPuestos);
  }, [codigo]);

  if (!codigo) return <span className="text-gray-400 dark:text-gray-600">—</span>;
  const puesto = puestos?.find((p) => p.externalId === codigo);
  return (
    <span className="block text-sm text-gray-900 dark:text-gray-100" title="Rige cuando ni el Rol Empresa ni la Categoría del contrato tienen puesto, y antes que el default de la empleadora.">
      <span className="font-mono text-xs opacity-70 mr-1.5">{codigo}</span>
      {puesto ? puesto.name : puestos ? <span className="text-xs italic text-amber-600 dark:text-amber-400">no está en el catálogo</span> : ''}
    </span>
  );
};
