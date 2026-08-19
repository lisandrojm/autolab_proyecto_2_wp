import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCircleCheck, faTriangleExclamation, faPuzzlePiece } from '@fortawesome/free-solid-svg-icons';

/**
 * Aviso de instalación de la extensión que valida las obras sociales contra ARCA.
 *
 * Sin ella no hay puente entre WeProdu y ARCA: la app no puede leer lo que el organismo precompleta
 * en su pantalla de altas, así que la validación automática simplemente no ocurre. Decirlo donde se
 * usa evita la conclusión razonable pero equivocada de que la función está rota.
 *
 * NO bloquea nada: sin la extensión igual se pueden copiar los CUIL y trabajar a mano. El aviso
 * informa, no traba.
 */

export const TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';
/** Se sirve desde la propia app: abrirlo con Tampermonkey instalado ofrece instalarlo en un click. */
export const USERSCRIPT_URL = '/scripts/weprodu-obra-social.user.js';

/**
 * ¿Está instalada la extensión?
 *
 * El userscript también corre en WeProdu —sin hacer nada más— y deja `data-weprodu-os` en el <html>.
 * Se busca el atributo y no `window.__weproduOS` porque Tampermonkey puede ejecutar el script en un
 * sandbox donde el `window` no se comparte con la página; el DOM siempre sí.
 *
 * Se consulta con reintentos y no una sola vez: el script corre en `document-idle` y React puede
 * montar antes. Un chequeo único diría "no detectada" a quien la tiene, que es peor que no avisar.
 */
export function useExtensionInstalada(): string | null {
  const [version, setVersion] = useState<string | null>(() => document.documentElement.getAttribute('data-weprodu-os'));

  useEffect(() => {
    if (version) return;
    let intentos = 0;
    const id = window.setInterval(() => {
      const v = document.documentElement.getAttribute('data-weprodu-os');
      if (v || ++intentos > 12) {
        if (v) setVersion(v);
        window.clearInterval(id);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [version]);

  return version;
}

export const RequisitoExtension: React.FC<{ compacto?: boolean }> = ({ compacto }) => {
  const version = useExtensionInstalada();

  // Instalada: una línea y nada más. Quien ya la tiene no necesita volver a leer las instrucciones,
  // y dejarlas puestas convierte el aviso en ruido que se aprende a ignorar.
  if (version) {
    return (
      <p className="text-[11px] text-green-700 dark:text-green-400 flex items-center gap-1.5">
        <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
        Extensión de validación detectada (v{version}).
      </p>
    );
  }

  return (
    <div className={`rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 ${compacto ? 'px-3 py-2.5' : 'p-3'} space-y-2`}>
      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
        <FontAwesomeIcon icon={faPuzzlePiece} className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        Requisito: extensión de validación
      </p>
      <p className="text-[11px] text-gray-700 dark:text-gray-300">
        Para traer las obras sociales desde ARCA automáticamente necesitás <strong>Tampermonkey</strong> con nuestro script. Se instala una vez.
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={TAMPERMONKEY_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          1. Instalar Tampermonkey
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
        </a>
        <a href={USERSCRIPT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
          2. Instalar el script
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
        </a>
        <span className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
          No detectada
        </span>
      </div>
      {/* La pregunta de seguridad aparece sola en cuanto se menciona "extensión" y "clave fiscal" en
          la misma pantalla. Se contesta acá, antes de que haya que ir a preguntar. */}
      <p className="text-[10.5px] text-gray-500 dark:text-gray-400">
        La extensión corre en tu navegador y solo lee la obra social que ARCA ya muestra en Registrar Nuevas Altas. No guarda tu clave fiscal ni registra ninguna alta.
      </p>
    </div>
  );
};
