import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { faWindows as faWin, faApple as faApl } from '@fortawesome/free-brands-svg-icons';
import { asistenteAPI, tokenAsistente, ErrorAsistente, EstadoAsistente as Estado, DESCARGAS_ASISTENTE } from '../../api/asistente';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * El estado del Asistente WeProdu, arriba de la pantalla de validación.
 *
 * Reemplaza al bloque que mostraba un comando de terminal. Quien usa esta pantalla es administrativo:
 * no tiene por qué saber qué es `npm`, ni pegar un hash de 24 caracteres, ni distinguir un error de
 * sesión de uno de sintaxis. Lo que ve es si el Asistente está o no, y qué hacer en cada caso.
 *
 * Los cuatro estados posibles, en el orden en que se resuelven:
 *
 *   no-detectado   → descargar y ejecutar. Se hace una vez.
 *   sin-emparejar  → pegar el código que el Asistente muestra en su ventana.
 *   sin sesión     → botón que abre el Chrome de ARCA. El login lo hace la persona.
 *   conectado      → listo, el botón de validar se habilita.
 *
 * Cada uno tiene UNA acción. Mostrar los cuatro juntos, o describirlos en un párrafo, sería volver a
 * poner las instrucciones delante de la acción.
 */

/** Cada cuánto se le vuelve a preguntar mientras la pantalla está abierta. */
const SONDEO_MS = 4000;

export interface UsoAsistente {
  estado: Estado | null;
  fallo: 'no-detectado' | 'sin-emparejar' | null;
  cargando: boolean;
  refrescar: () => Promise<void>;
}

/**
 * Sondea al Asistente mientras la pantalla esté montada.
 *
 * Se sondea y no se pregunta una sola vez porque el Asistente se arranca DESPUÉS de abrir la
 * pantalla —ese es justamente el camino de la primera vez— y quedarse en «no detectado» hasta un
 * refresh manual haría pensar que no funcionó.
 */
export function useAsistente(): UsoAsistente {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [fallo, setFallo] = useState<'no-detectado' | 'sin-emparejar' | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      setEstado(await asistenteAPI.estado());
      setFallo(null);
    } catch (e) {
      setEstado(null);
      setFallo(e instanceof ErrorAsistente ? e.motivo : 'no-detectado');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    refrescar();
    const id = window.setInterval(refrescar, SONDEO_MS);
    return () => window.clearInterval(id);
  }, [refrescar]);

  return { estado, fallo, cargando, refrescar };
}

const Punto: React.FC<{ color: string }> = ({ color }) => <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;

export const BloqueAsistente: React.FC<{ uso: UsoAsistente; empleadora?: string }> = ({ uso, empleadora }) => {
  const { estado, fallo, cargando, refrescar } = uso;
  const [abriendo, setAbriendo] = useState(false);

  /** Pide el código y lo guarda. Se hace una vez por navegador. */
  const emparejar = async () => {
    const r = await sweetAlert.prompt('Emparejar el Asistente', {
      text: 'Pegá el código que muestra la ventana del Asistente WeProdu.',
      placeholder: '64 caracteres',
      confirmText: 'Emparejar',
      // Se valida acá el formato para no mandar un pegado a medias y recibir un 401 que se lee como
      // «el código está mal» cuando en realidad se copió de menos.
      validar: (v) => (/^[0-9a-f]{64}$/i.test(v.trim()) ? null : 'El código son 64 caracteres. Copialo entero de la ventana del Asistente.'),
    });
    if (!r.isConfirmed || !r.value) return;
    tokenAsistente.guardar(String(r.value));
    await refrescar();
  };

  const abrirArca = async () => {
    setAbriendo(true);
    try {
      await asistenteAPI.abrirChrome();
      await refrescar();
    } catch (e: any) {
      sweetAlert.error('No pude abrir Chrome', e?.message || 'Revisá que Chrome esté instalado.');
    } finally {
      setAbriendo(false);
    }
  };

  if (cargando) {
    return (
      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 text-[12px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
        Buscando el Asistente…
      </div>
    );
  }

  // ── No está: descargarlo. Es el único estado que pide salir de la app. ──────
  if (fallo === 'no-detectado') {
    return (
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-amber-50/60 dark:bg-amber-950/20">
        <p className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Punto color="bg-gray-400" />
          Asistente no detectado
        </p>
        <p className="text-[11.5px] text-gray-600 dark:text-gray-400 mt-0.5">Descargalo y ejecutalo. Se hace una vez: después queda funcionando y esta pantalla lo encuentra sola.</p>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <a href={DESCARGAS_ASISTENTE.windows} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
            <FontAwesomeIcon icon={faWin} className="h-3 w-3" />
            Descargar para Windows
          </a>
          <a href={DESCARGAS_ASISTENTE.mac} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500">
            <FontAwesomeIcon icon={faApl} className="h-3 w-3" />
            Descargar para Mac
          </a>
          <a href={DESCARGAS_ASISTENTE.guia} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            <FontAwesomeIcon icon={faCircleQuestion} className="h-3 w-3" />
            ¿Cómo se instala?
          </a>
        </div>
        {/* Windows va a decir «editor desconocido» la primera vez: sin certificado de firma no hay
            forma de evitarlo, y encontrárselo sin aviso hace abandonar la instalación ahí mismo. */}
        <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-2">
          La primera vez Windows va a avisar que el editor es desconocido: <strong>Más información → Ejecutar de todas formas</strong>. Es normal y está explicado en la guía.
        </p>
      </div>
    );
  }

  // ── Está, pero este navegador no lo conoce. ─────────────────────────────────
  if (fallo === 'sin-emparejar') {
    return (
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-950/20 flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Punto color="bg-amber-500" />
            Falta emparejar este navegador
          </p>
          <p className="text-[11.5px] text-gray-600 dark:text-gray-400 mt-0.5">La ventana del Asistente muestra un código. Pegalo una vez y no se vuelve a pedir.</p>
        </div>
        <button type="button" onClick={emparejar} className="ml-auto px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
          Pegar el código
        </button>
      </div>
    );
  }

  // ── Conectado, pero sin sesión de ARCA: un botón lo resuelve. ───────────────
  if (estado && estado.sesionArca !== 'viva') {
    return (
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-950/20 flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Punto color="bg-blue-500" />
            Asistente conectado (v{estado.version}) · falta abrir ARCA
          </p>
          <p className="text-[11.5px] text-gray-600 dark:text-gray-400 mt-0.5">
            Se abre un Chrome aparte, solo para ARCA. Entrá con tu clave fiscal y <strong>elegí {empleadora || 'la empleadora'}</strong>; esa sesión queda guardada por días.
          </p>
        </div>
        <button type="button" onClick={abrirArca} disabled={abriendo} className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {abriendo && <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />}
          {estado.chromeAbierto ? 'Ya está abierto' : 'Abrir ARCA'}
        </button>
      </div>
    );
  }

  // ── Todo listo. Una línea, sin ruido. ──────────────────────────────────────
  return (
    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-2">
      <Punto color="bg-green-500" />
      Asistente conectado (v{estado?.version}) · sesión de ARCA lista
    </div>
  );
};
