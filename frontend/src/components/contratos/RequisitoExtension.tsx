import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUpRightFromSquare, faCircleCheck, faTriangleExclamation, faPuzzlePiece, faCopy, faCheck, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useExtensionArca } from './puenteArca';

/**
 * Aviso de instalación de la extensión que valida las obras sociales contra ARCA.
 *
 * Sin ella no hay puente entre WeProdu y ARCA: la app no puede leer lo que el organismo precompleta
 * en su pantalla de altas, así que la validación automática simplemente no ocurre. Decirlo donde se
 * usa evita la conclusión razonable pero equivocada de que la función está rota.
 *
 * NO bloquea nada: sin la extensión igual se pueden copiar los CUIL y trabajar a mano.
 */

export const TAMPERMONKEY_URL = 'https://www.tampermonkey.net/';
export const USERSCRIPT_URL = '/scripts/weprodu-obra-social.user.js';

/* La detección vive en `puenteArca.ts`, junto al resto del contrato con el script: repartirla en
   dos archivos es cómo terminan usando marcas distintas y una dice que está y la otra que no. */

export const RequisitoExtension: React.FC<{ compacto?: boolean }> = ({ compacto }) => {
  const version = useExtensionArca();
  const [copiando, setCopiando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState('');

  /**
   * Copiar el código para pegarlo en Tampermonkey.
   *
   * Es la vía PRINCIPAL, no un plan B. Chrome intercepta la navegación a cualquier `.user.js` y la
   * bloquea con "No es posible añadir aplicaciones, extensiones ni secuencias de comandos de usuario
   * desde este sitio web": la instalación con un click desde la app no es posible, y el link solo
   * lleva a ese cartel. Pegando el código en el editor de Tampermonkey no interviene Chrome.
   */
  const copiarScript = async () => {
    setCopiando(true);
    setError('');
    try {
      const res = await fetch(USERSCRIPT_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      await navigator.clipboard.writeText(await res.text());
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 4000);
    } catch {
      setError('No se pudo copiar. Abrí el archivo con el link de al lado y copiá el contenido a mano.');
    } finally {
      setCopiando(false);
    }
  };

  // Instalada: una línea y nada más. Quien ya la tiene no necesita volver a leer las instrucciones,
  // y dejarlas puestas convierte el aviso en ruido que se aprende a ignorar.
  if (version) {
    return (
      <p className="text-[11px] text-green-700 dark:text-green-400 flex items-center gap-1.5">
        <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
        Extensión de validación detectada (v{version}) — la validación corre sola.
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
        Para traer las obras sociales desde ARCA automáticamente necesitás <strong>Tampermonkey</strong> con nuestro script. Se instala una vez. Sin él la validación es manual: copiar los CUIL, correrlos en
        ARCA y pegar el resultado.
      </p>

      {/* Los pasos van numerados y explícitos porque el camino natural —abrir el .user.js— NO
          funciona en Chrome, y sin decirlo el operador se queda golpeando contra ese cartel. */}
      <ol className="text-[11px] text-gray-700 dark:text-gray-300 space-y-1.5 list-decimal pl-4">
        <li>
          Instalá <strong>Tampermonkey</strong> desde{' '}
          <a href={TAMPERMONKEY_URL} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 dark:text-blue-400 hover:underline">
            tampermonkey.net
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5 ml-1" />
          </a>
          .
        </li>
        <li>
          En Chrome, entrá a <code className="font-mono text-[10.5px]">chrome://extensions</code> y activá el <strong>Modo de desarrollador</strong> (arriba a la derecha). Chrome lo exige para que
          Tampermonkey pueda ejecutar scripts; sin eso queda instalado pero no corre.
        </li>
        <li>
          Copiá el script con el botón de acá abajo, abrí el panel de Tampermonkey → <strong>Crear un nuevo script</strong>, pegá reemplazando todo y guardá (Ctrl/Cmd+S).
        </li>
        <li>Volvé a esta pantalla y recargá: debería decir «Extensión detectada».</li>
      </ol>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={copiarScript}
          disabled={copiando}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <FontAwesomeIcon icon={copiando ? faSpinner : copiado ? faCheck : faCopy} spin={copiando} className="h-3 w-3" />
          {copiado ? 'Copiado — pegalo en Tampermonkey' : 'Copiar el script'}
        </button>
        <a
          href={USERSCRIPT_URL}
          target="_blank"
          rel="noreferrer"
          title="Abre el archivo para copiarlo a mano. Chrome no permite instalarlo directamente desde acá."
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Ver el archivo
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
        </a>
        <span className="text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
          No detectada
        </span>
      </div>
      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      {/* La pregunta de seguridad aparece sola en cuanto se menciona "extensión" y "clave fiscal" en
          la misma pantalla. Se contesta acá, antes de que haya que ir a preguntar. */}
      <p className="text-[10.5px] text-gray-500 dark:text-gray-400">
        La extensión corre en tu navegador y solo lee la obra social que ARCA ya muestra en Registrar Nuevas Altas. No guarda tu clave fiscal ni registra ninguna alta.
      </p>
    </div>
  );
};
