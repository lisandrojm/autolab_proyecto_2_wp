import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faTriangleExclamation, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { asistenteAPI, tokenAsistente } from '../api/asistente';

/**
 * Emparejar el Asistente sin que nadie copie nada.
 *
 * Acá aterriza el navegador que el Asistente abre al arrancar:
 *
 *     /asistente/emparejar#token=XXXX
 *
 * EL TOKEN VIENE EN EL FRAGMENTO, no en la query. El fragmento no se manda al servidor: se queda en
 * el navegador. Con `?token=` el código —el mismo que autoriza a manejar la sesión de ARCA de una
 * empresa— quedaría en los logs de Vercel, en el `Referer` de todo lo que la página cargue después y
 * en cualquier proxy del camino.
 *
 * ES UNA RUTA PÚBLICA a propósito. Emparejar no necesita sesión de WeProdu: lo único que hace es
 * guardar un token en el `localStorage` de ESTE navegador. Y si estuviera protegida, el redirect al
 * login se comería el fragmento —los redirects no lo conservan— y el token se perdería justo en el
 * caso que más importa: la primera vez, que es cuando es más probable que la sesión esté vencida.
 */

type Estado =
  | { fase: 'leyendo' }
  | { fase: 'sin-codigo' }
  | { fase: 'listo'; version: string; yaEstaba: boolean }
  | { fase: 'guardado-sin-respuesta' };

export const EmparejarAsistentePage: React.FC = () => {
  const [estado, setEstado] = useState<Estado>({ fase: 'leyendo' });

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')?.trim() || '';

    /*
      La URL se limpia SIEMPRE y antes que nada, haya token o no.

      Sin esto el código queda en el historial, en la barra de direcciones a la vista de quien pase
      por atrás, y en la sugerencia de autocompletado del navegador para siempre. `replaceState`
      reemplaza la entrada en vez de agregar una, así que el «atrás» tampoco lo recupera.
    */
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);

    if (!token) return setEstado({ fase: 'sin-codigo' });

    const yaEstaba = tokenAsistente.leer() === token;
    tokenAsistente.guardar(token);

    /*
      Se confirma contra el Asistente antes de decir «conectado».
      Decirlo sin preguntar sería el mismo error que esta pantalla vino a arreglar: una interfaz que
      afirma que algo funciona sin haberlo comprobado. Si no contesta, el token igual quedó guardado
      —la pantalla de validación lo va a encontrar— y se dice exactamente eso.
    */
    asistenteAPI
      .estado()
      .then((e) => setEstado({ fase: 'listo', version: e.version, yaEstaba }))
      .catch(() => setEstado({ fase: 'guardado-sin-respuesta' }));
  }, []);

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center">
        {estado.fase === 'leyendo' && (
          <p className="text-[13px] text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2">
            <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />
            Emparejando…
          </p>
        )}

        {estado.fase === 'listo' && (
          <>
            <FontAwesomeIcon icon={faCircleCheck} className="h-8 w-8 text-green-500" />
            <h1 className="mt-3 text-[15px] font-semibold text-gray-900 dark:text-gray-100">
              {estado.yaEstaba ? 'Este navegador ya estaba emparejado' : 'Asistente conectado'}
            </h1>
            <p className="mt-1 text-[12.5px] text-gray-600 dark:text-gray-400">
              Versión {estado.version}. No hay nada más que hacer: el emparejamiento es de una sola vez por navegador.
            </p>
          </>
        )}

        {estado.fase === 'guardado-sin-respuesta' && (
          <>
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-8 w-8 text-amber-500" />
            <h1 className="mt-3 text-[15px] font-semibold text-gray-900 dark:text-gray-100">Código guardado, pero el Asistente no contesta</h1>
            <p className="mt-1 text-[12.5px] text-gray-600 dark:text-gray-400">
              Puede que se haya cerrado la ventana donde estaba corriendo. Volvé a ejecutarlo y esta pantalla ya no va a hacer falta: el código quedó guardado en este navegador.
            </p>
          </>
        )}

        {estado.fase === 'sin-codigo' && (
          <>
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-8 w-8 text-amber-500" />
            <h1 className="mt-3 text-[15px] font-semibold text-gray-900 dark:text-gray-100">No vino ningún código</h1>
            <p className="mt-1 text-[12.5px] text-gray-600 dark:text-gray-400">
              Esta pantalla la abre el Asistente sola al arrancar. Si llegaste a mano, el código lo muestra él:{' '}
              <a href="http://127.0.0.1:47653/emparejar" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                127.0.0.1:47653/emparejar
              </a>
              .
            </p>
          </>
        )}

        <Link to="/contratos" className="mt-6 inline-block px-4 py-2 rounded-lg text-[12.5px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
          Ir a WeProdu
        </Link>
      </div>
    </div>
  );
};

export default EmparejarAsistentePage;
