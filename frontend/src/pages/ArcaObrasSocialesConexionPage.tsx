import React, { useState } from 'react';
import { faShieldHeart } from '@fortawesome/free-solid-svg-icons';
import { PageLayout } from '../components/ui/PageLayout';
import { UsuarioSimplificacion } from '../components/arca/UsuarioSimplificacion';

/**
 * La conexión con ARCA que sirve para VALIDAR OBRAS SOCIALES.
 *
 * Vive en su propia pantalla y no junto al certificado, aunque las dos sean «conexiones de ARCA».
 * Estaban en la misma tarjeta y no se entendía cuál hacía qué: son dos credenciales distintas, con
 * dos mecanismos distintos, para dos datos distintos, y hasta se pueden autorizar a nombre de
 * personas distintas. Una tarjeta con las dos adentro obligaba a leer todo para saber cuál tocar.
 *
 * Lo que las separa, y por qué no se pueden unificar:
 *
 *   Constancia de CUIT   certificado X.509 → webservice SOAP → datos del CONTRIBUYENTE.
 *   Obras sociales       clave fiscal → un navegador que opera la web → obra social de un TRABAJADOR.
 *
 * El segundo dato no lo publica ningún webservice de ARCA. Si alguna vez lo publica, esta pantalla
 * entera desaparece y el certificado alcanza para todo.
 */

const COMPARACION = (
  <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
    <p>
      ARCA tiene <strong>dos conexiones distintas</strong> en WeProdu, y hacen cosas que no se parecen. Es fácil confundirlas porque las dos se configuran en el Administrador de Relaciones de AFIP.
    </p>
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 pr-3 font-bold"> </th>
            <th className="py-2 pr-3 font-bold">Constancia de CUIT</th>
            <th className="py-2 font-bold">Obras sociales</th>
          </tr>
        </thead>
        <tbody className="align-top">
          <tr className="border-b border-gray-100 dark:border-gray-700/60">
            <td className="py-2 pr-3 font-semibold">Qué se carga</td>
            <td className="py-2 pr-3">Un certificado digital y su clave privada</td>
            <td className="py-2">Un CUIT y una clave fiscal</td>
          </tr>
          <tr className="border-b border-gray-100 dark:border-gray-700/60">
            <td className="py-2 pr-3 font-semibold">Cómo lo hace</td>
            <td className="py-2 pr-3">Le pregunta a un webservice de ARCA. No abre ninguna pantalla.</td>
            <td className="py-2">Abre un navegador en el servidor y opera la web de ARCA como lo haría una persona.</td>
          </tr>
          <tr className="border-b border-gray-100 dark:border-gray-700/60">
            <td className="py-2 pr-3 font-semibold">Qué dato trae</td>
            <td className="py-2 pr-3">Datos del contribuyente: estado del CUIT, denominación</td>
            <td className="py-2">La obra social que ARCA tiene registrada para un trabajador</td>
          </tr>
          <tr>
            <td className="py-2 pr-3 font-semibold">Por qué no una sola</td>
            <td className="py-2 pr-3" colSpan={2}>
              Porque la obra social de un trabajador <strong>no la publica ningún webservice</strong>: solo aparece precompletada en la pantalla de altas de Simplificación Registral, adentro de una
              sesión con clave fiscal. Si ARCA algún día la publica, esta segunda conexión deja de hacer falta.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      <strong>Se pueden usar credenciales de personas distintas</strong>, y conviene: el certificado lo suele tener el apoderado, y para esta pantalla lo correcto es un usuario creado aparte con
      «Simplificación Registral» como único servicio delegado.
    </p>
    <p className="text-gray-500 dark:text-gray-400">El certificado se administra en «Conexión → Constancia de CUIT», el ítem de al lado.</p>
  </div>
);

export const ArcaObrasSocialesConexionPage: React.FC = () => {
  const [info, setInfo] = useState(false);

  return (
    <PageLayout
      title="ARCA | Conexión · Obras sociales"
      subtitle="El usuario de clave fiscal con el que el servidor valida las obras sociales solo"
      faIcon={{ icon: faShieldHeart }}
      infoModal={{
        isOpen: info,
        onOpen: () => setInfo(true),
        onClose: () => setInfo(false),
        title: 'Las dos conexiones de ARCA, y en qué se diferencian',
        content: COMPARACION,
      }}
    >
      <UsuarioSimplificacion />
    </PageLayout>
  );
};

export default ArcaObrasSocialesConexionPage;
