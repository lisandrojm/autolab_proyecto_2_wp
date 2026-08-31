import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEmpresaContextStore } from '../stores/empresaContextStore';
import { useAuthStore } from '../stores/authStore';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle, faLandmark, faFileContract, faChevronDown, faChevronRight, faBriefcaseMedical, faLocationDot, faListCheck, faSliders, faLayerGroup } from '@fortawesome/free-solid-svg-icons';

/**
 * Nav del contexto Empresa, gemelo de [ClientContextMenu].
 *
 * El árbol replica el de ARCA: "Datos del Empleador" (todo lo que el organismo lleva por CUIT) y la
 * operación que lo consume. Lo que NO está acá es a propósito:
 *
 *  - Los NOMENCLADORES (universo de obras sociales, convenios, tipos de servicio, actividades) viven
 *    en Configuración → ARCA: son iguales para todos los CUIT.
 *  - Las ESCALAS salariales viven en el convenio, no en la empresa: la escala de un CCT es la misma
 *    para todas las empleadoras que lo tengan registrado.
 *  - "Categorías" está acá pero de SOLO LECTURA: no se configura, se deriva de los convenios
 *    registrados. Igual que las actividades disponibles se derivan de los domicilios.
 */
export const EmpresaContextMenu: React.FC = () => {
  const { selectedEmpresa } = useEmpresaContextStore();
  const { hasPermission } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  // El subgrupo ARCA arranca abierto si ya estás parado en una de sus pantallas.
  const [arcaOpen, setArcaOpen] = useState<boolean>(() => localStorage.getItem('empresaArcaOpen') !== 'false' || location.pathname.includes('/arca/'));

  if (!selectedEmpresa) return null;

  const base = `/empresas/${selectedEmpresa._id}`;

  // El orden sigue la CADENA DE DECISIÓN, no el alfabeto: Convenios va primero porque de él cuelgan
  // las categorías posibles Y la obra social. Obras Sociales va después porque su rol principal pasó
  // a ser VALIDAR lo que el convenio ya resolvió, más el caso de los excluidos de convenio.
  const arcaChildren = [
    { path: `${base}/arca/convenios`, icon: faFileContract, label: 'Convenios' },
    { path: `${base}/arca/categorias`, icon: faListCheck, label: 'Categorías' },
    { path: `${base}/arca/domicilios`, icon: faLocationDot, label: 'Domicilios de Explotación' },
    { path: `${base}/arca/obras-sociales`, icon: faBriefcaseMedical, label: 'Obras Sociales' },
    // Grupos de Tipo de Servicio va PEGADO a Defaults, y antes: es la ★ que decide con qué queda
    // filtrado el Tipo de Servicio que se elige ahí. Al revés, se elige el tipo sin saber por qué el
    // combo ofrece 293 opciones o 140.
    { path: `${base}/arca/grupos-tipo-servicio`, icon: faLayerGroup, label: 'Grupos de Tipo de Servicio' },
    { path: `${base}/arca/defaults`, icon: faSliders, label: 'Defaults' },
  ];

  // El alta masiva NO va acá: es la misma pantalla que Admin GENERAL → Contratos → Gestión de
  // Contratos → Alta temprana de ARCA, que además ya tiene su filtro por Empresa Contrato. Tenerla
  // dos veces obligaba a elegir por cuál entrar para hacer lo mismo. Lo que evita el archivo
  // mezclado no es este menú: es que `generarTxt` se niega a armar un TXT de más de una empleadora.
  const items = [
    { path: base, icon: faInfoCircle, label: 'Información', exact: true },
    { path: `${base}/contratos`, icon: faFileContract, label: 'Contratos' },
  ];

  // Un solo permiso para todo el contexto: es la misma entidad Empresa que ya se administra en
  // Configuración → Empresas, vista desde su propio eje.
  if (!hasPermission('config_empresas:view')) return null;

  const isActive = (path: string, exact = false) => (exact ? location.pathname === path : location.pathname === path || location.pathname.startsWith(path + '/'));

  const itemClass = (active: boolean) => `group w-full relative flex items-center justify-between px-2 py-2 rounded text-left transition-all ${active ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-blue-900/30'}`;

  const renderItem = (item: { path: string; icon: any; label: string; exact?: boolean }, indent = false) => {
    const active = isActive(item.path, item.exact);
    return (
      <button key={item.path} onClick={() => navigate(item.path)} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
        <div className={`flex items-center space-x-3 flex-1 min-w-0 ${indent ? 'pl-2' : ''}`}>
          <FontAwesomeIcon icon={item.icon} className={`h-4 w-4 flex-shrink-0 ${active ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`} />
          <span className="text-sm font-medium truncate">{item.label}</span>
        </div>
      </button>
    );
  };

  return (
    <div>
      <nav className="space-y-1 mt-2 pl-2 border-l-2 border-gray-100 dark:border-gray-700 ml-1">
        {renderItem(items[0])}

        {/* Subgrupo ARCA: son los "Datos del Empleador" del organismo, todos por CUIT. */}
        <div>
          <button
            type="button"
            onClick={() => {
              const next = !arcaOpen;
              setArcaOpen(next);
              localStorage.setItem('empresaArcaOpen', String(next));
            }}
            className="group w-full flex items-center justify-between px-2 py-2 rounded text-left text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-blue-900/30 transition-all"
          >
            <div className="flex items-center space-x-3 flex-1 min-w-0">
              <FontAwesomeIcon icon={faLandmark} className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <span className="text-sm font-medium truncate">ARCA</span>
            </div>
            <FontAwesomeIcon icon={arcaOpen ? faChevronDown : faChevronRight} className="h-3 w-3 shrink-0" />
          </button>
          {arcaOpen && <nav className="space-y-1 mt-1 ml-4 pl-2 border-l-2 border-gray-100 dark:border-gray-700">{arcaChildren.map((c) => renderItem(c, false))}</nav>}
        </div>

        {items.slice(1).map((i) => renderItem(i))}
      </nav>
    </div>
  );
};
