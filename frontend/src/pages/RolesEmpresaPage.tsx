import React, { useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { PageLayout } from '../components/ui/PageLayout';
import { getHelp, hasHelp } from '../data/help/helpContent';
import { faUserShield, faPlus } from '@fortawesome/free-solid-svg-icons';
import { RolesEmpresaAbm, RolesEmpresaAbmHandle } from '../components/rolesEmpresa/RolesEmpresaAbm';

/**
 * Usuarios → Roles Empresa.
 *
 * QUÉ SON, Y POR QUÉ NO SON "Roles". En WeProdu conviven dos cosas que se llamaban igual:
 *
 *   · Usuarios → Roles          permisos de la plataforma (Admin, Mobile-Coordinador, User). Deciden
 *                               qué pantallas ve una persona. Son cinco y casi no cambian.
 *   · Usuarios → Roles Empresa  el oficio con el que alguien trabaja en una producción: Actor,
 *                               Animador 2D, Asistente de Cámara. Son cientos, y cada uno mapea a las
 *                               categorías de ARCA con las que se liquida un contrato.
 *
 * Tenerlos con el mismo nombre hacía que "cambiale el rol" fuera ambiguo entre dar permisos y cambiar
 * el oficio de un contrato. La colección en la base SIGUE siendo `roles_frame` y el campo del usuario
 * sigue siendo `roles_frame`: esto es cómo se llama en pantalla, no un rename de datos.
 *
 * Antes vivía como un tab dentro de ARCA → Categorías. Se movió acá porque es un atributo de la
 * persona, como Áreas o Turnos; lo que lo ataba a ARCA es el mapeo a categorías, que sigue estando
 * adentro de este mismo ABM.
 */
export const RolesEmpresaPage: React.FC = () => {
  const [showInfo, setShowInfo] = useState(false);
  const helpEntry = getHelp('funcionesFrame');
  /** El alta la abre el ABM, que es donde vive el formulario; el botón vive en el encabezado. */
  const abm = useRef<RolesEmpresaAbmHandle>(null);

  return (
    <PageLayout
      title="Roles Empresa"
      subtitle="El oficio con el que cada persona trabaja en una producción, y las categorías de ARCA con las que se liquida."
      faIcon={{ icon: faUserShield }}
      shouldShowInfo={hasHelp('funcionesFrame')}
      infoModal={{
        isOpen: showInfo,
        onOpen: () => setShowInfo(true),
        onClose: () => setShowInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      headerActions={
        <button onClick={() => abm.current?.abrirNuevo()} aria-label="Nuevo rol empresa" title="Nuevo rol empresa" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
      searchAndFilters={
        <div className="mx-auto w-full">
          <RolesEmpresaAbm ref={abm} />
        </div>
      }
      children={null}
    />
  );
};

export default RolesEmpresaPage;
