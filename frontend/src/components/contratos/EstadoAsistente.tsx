import React, { useCallback, useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faCircleQuestion, faDownload, faTriangleExclamation, faArrowUpRightFromSquare, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { faWindows as faWin, faApple as faApl } from '@fortawesome/free-brands-svg-icons';
import { asistenteAPI, asistentePuede, tokenAsistente, ErrorAsistente, EstadoAsistente as Estado, DESCARGAS_ASISTENTE, descargaDisponible, versionPublicada, esPosterior } from '../../api/asistente';
import { sweetAlert } from '../../utils/sweetAlert';
import { detectarSistema, Sistema } from '../../utils/sistemaOperativo';
import { PasosInstalacion, NotaSinFirma } from '../asistente/PasosInstalacion';

/**
 * El estado del Asistente WeProdu, arriba de la pantalla de validación.
 *
 * Reemplaza al bloque que mostraba un comando de terminal. Quien usa esta pantalla es administrativo:
 * no tiene por qué saber qué es `npm`, ni pegar un hash de 24 caracteres, ni distinguir un error de
 * sesión de uno de sintaxis. Lo que ve es si el Asistente está o no, y qué hacer en cada caso.
 *
 * El EMPAREJAMIENTO YA NO SE PIDE: al arrancar, el Asistente abre el navegador en
 * `/asistente/emparejar#token=…` y el token queda guardado solo. El estado `sin-emparejar` quedó como
 * respaldo —otro navegador, un `localStorage` limpiado— y por eso apunta a la página local del
 * Asistente, que es de donde de verdad se saca el código. Antes decía «la ventana del Asistente
 * muestra un código» y no había ninguna ventana: el Asistente es un ejecutable de consola.
 *
 * Los cuatro estados posibles, en el orden en que se resuelven:
 *
 *   no-detectado   → descargar y ejecutar. Se hace una vez.
 *   sin-emparejar  → raro: el Asistente empareja solo al arrancar. Queda el respaldo manual.
 *   sin Chrome     → «Abrir ARCA». Lanza el navegador con el perfil dedicado.
 *   Chrome abierto,
 *   sin sesión     → «Ir a esa ventana». La sesión la inicia la persona.
 *   conectado      → listo, el botón de validar se habilita.
 *
 * Cada uno tiene UNA acción. Mostrar los cuatro juntos, o describirlos en un párrafo, sería volver a
 * poner las instrucciones delante de la acción.
 *
 * `chromeAbierto` Y `sesionArca` SON DOS EJES DISTINTOS, y esta pantalla los colapsaba en uno.
 * Con el navegador ya abierto decía «falta abrir ARCA» y ofrecía un botón que decía «Ya está
 * abierto» — una respuesta a una pregunta que nadie hizo, sobre un dato que el servidor ya tenía.
 * La persona sabía que algo faltaba y no tenía forma de saber qué, porque el estado que se le
 * mostraba era falso. Los estados de abajo están separados justamente por eso.
 */

/** Cada cuánto se le vuelve a preguntar mientras la pantalla está abierta. */
const SONDEO_MS = 3000;

/**
 * Cada cuánto se pregunta cuando el Asistente NO contesta.
 *
 * Un `fetch` que falla deja una línea roja en la consola del navegador aunque esté atrapado en un
 * `catch` — eso no se puede silenciar desde el código. A 3 segundos, un Asistente apagado escribía
 * veinte errores por minuto y tapaba cualquier otra cosa que hubiera que mirar ahí.
 *
 * Se separa del sondeo normal porque los dos casos son distintos: cuando está conectado, la pantalla
 * tiene que reaccionar rápido a que la sesión de ARCA aparezca; cuando no está, lo que se espera es
 * que alguien vaya a ejecutar un programa, y eso no pasa en tres segundos.
 */
const SONDEO_CAIDO_MS = 15000;

export interface UsoAsistente {
  estado: Estado | null;
  fallo: 'no-detectado' | 'sin-emparejar' | null;
  cargando: boolean;
  /** Versión publicada, si es POSTERIOR a la instalada. Vacío = no hay nada que avisar. */
  versionNueva: string;
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
  /**
   * La versión publicada. Se pide UNA vez por montaje y no en cada sondeo: cambia cuando alguien
   * publica un build, no cada tres segundos, y el sondeo es cada 3 s.
   */
  const [publicada, setPublicada] = useState('');
  useEffect(() => {
    void versionPublicada().then(setPublicada);
  }, []);

  const refrescar = useCallback(async () => {
    try {
      setEstado(await asistenteAPI.estado());
      setFallo(null);
    } catch (e) {
      setEstado(null);
      // `/estado` no puede dar 404 —existe desde siempre—, así que cualquier motivo que no sea
      // «falta emparejar» significa que no lo tenemos: sin Asistente no hay nada más que averiguar.
      setFallo(e instanceof ErrorAsistente && e.motivo === 'sin-emparejar' ? 'sin-emparejar' : 'no-detectado');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    refrescar();
    // El intervalo se re-arma con el ritmo que corresponde al estado actual: rápido mientras
    // responde, lento mientras no. Ver `SONDEO_CAIDO_MS`.
    const id = window.setInterval(refrescar, fallo === 'no-detectado' ? SONDEO_CAIDO_MS : SONDEO_MS);
    return () => window.clearInterval(id);
  }, [refrescar, fallo]);

  /*
    Solo se avisa si la publicada es POSTERIOR a la que está corriendo.

    Y solo con el Asistente conectado: si no está detectado, la pantalla ya le está pidiendo que lo
    instale — decirle además que hay una versión nueva de algo que no tiene es ruido.
  */
  const versionNueva = estado?.version && publicada && esPosterior(publicada, estado.version) ? publicada : '';

  return { estado, fallo, cargando, versionNueva, refrescar };
}

const Punto: React.FC<{ color: string }> = ({ color }) => <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;

const RUTA_AYUDA = '/arca/guia-obras-sociales';

/**
 * La forma de TODOS los estados: punto, qué pasa, qué hacer, un botón.
 *
 * Está factorizada porque los cuatro estados tienen que verse iguales. Cuando cada uno se maquetaba
 * por su cuenta, uno terminó con el botón a la izquierda y otro con el detalle en otro tamaño, y esa
 * diferencia visual se lee como si fueran cosas de distinta naturaleza — cuando son el mismo eje.
 */
const Barra: React.FC<{ punto: string; titulo: React.ReactNode; detalle: React.ReactNode; accion: React.ReactNode }> = ({ punto, titulo, detalle, accion }) => (
  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-950/20 flex items-center gap-3 flex-wrap">
    <div className="min-w-0 flex-1">
      <p className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
        <Punto color={punto} />
        {titulo}
      </p>
      <p className="text-[11.5px] text-gray-600 dark:text-gray-400 mt-0.5">{detalle}</p>
    </div>
    <div className="ml-auto shrink-0">{accion}</div>
  </div>
);

/**
 * Los ejecutables, con el sistema al que pertenece cada uno.
 *
 * El `sistema` es lo que permite mostrar UNO —el que corresponde— y guardar el resto detrás de
 * «otras descargas». Antes se mostraban los tres siempre, y uno de ellos exigía saber si la Mac es
 * Apple Silicon o Intel: una pregunta que casi nadie puede contestar y que, contestada mal, da «bad
 * CPU type in executable» en vez de un error entendible.
 */
const DESCARGAS = [
  { so: 'windows' as Sistema, url: DESCARGAS_ASISTENTE.windows, icono: faWin, etiqueta: 'Windows' },
  { so: 'mac' as Sistema, url: DESCARGAS_ASISTENTE.macAppleSilicon, icono: faApl, etiqueta: 'Mac (Apple Silicon)' },
  { so: 'mac' as Sistema, url: DESCARGAS_ASISTENTE.macIntel, icono: faApl, etiqueta: 'Mac (Intel)' },
];

/**
 * Un botón de descarga que primero comprueba que el archivo exista.
 *
 * Mientras chequea no muestra nada: aparecer y desaparecer sería peor que tardar un instante en
 * aparecer, y el HEAD contra un archivo del mismo origen es inmediato.
 *
 * Si no está publicado NO se muestra un botón roto: se dice cuál es el problema. Un botón que se
 * clickea y no pasa nada —o que baja un HTML disfrazado de .exe— manda a la persona a buscar el error
 * en su antivirus, en su navegador o en su carpeta de descargas, cuando el problema es que el archivo
 * nunca se subió. Esa búsqueda la puede terminar acá una línea de texto.
 *
 * `download` va porque sin él el navegador puede decidir NAVEGAR al archivo en vez de bajarlo, según
 * qué content-type mande el servidor. Con `download` la intención es explícita y el nombre del
 * archivo guardado es el del `href`.
 */
const BotonDescarga: React.FC<{ url: string; icono: typeof faWin; etiqueta: string; principal?: boolean }> = ({ url, icono, etiqueta, principal }) => {
  const [disponible, setDisponible] = useState<boolean | null>(null);
  const [verificando, setVerificando] = useState(false);

  /**
   * Comprueba, y REINTENTA una vez antes de dar por no publicado.
   *
   * El "no" de este chequeo apaga un botón que la persona necesita, así que no puede salir de un
   * solo intento. Ya pasó: la pantalla estaba abierta mientras se republicaba el archivo —hay una
   * ventana de un segundo entre que se borra el zip viejo y se escribe el nuevo— y el HEAD cayó
   * justo ahí. La descarga quedó marcada como inexistente en una máquina donde el archivo existía, y
   * sin manera de volver atrás salvo recargando la página. Un corte de red de un segundo hace lo
   * mismo en producción.
   */
  const verificar = useCallback(async () => {
    setVerificando(true);
    let ok = await descargaDisponible(url);
    if (!ok) {
      await new Promise((r) => window.setTimeout(r, 1500));
      ok = await descargaDisponible(url);
    }
    setDisponible(ok);
    setVerificando(false);
  }, [url]);

  useEffect(() => {
    void verificar();
    /*
      Y de nuevo al volver a la pestaña.

      Es cuándo cambia el mundo: la persona se fue a mirar otra cosa, o el archivo se publicó
      mientras tanto. Un estado negativo que solo se puede corregir recargando la página es un
      callejón sin salida escondido adentro de la comprobación que existía para evitar callejones.
    */
    window.addEventListener('focus', verificar);
    return () => window.removeEventListener('focus', verificar);
  }, [verificar]);

  if (disponible === null) return null;

  if (!disponible) {
    return (
      <button
        type="button"
        onClick={verificar}
        disabled={verificando}
        title={`No encontré ${url}. Click para volver a comprobar.`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-60"
      >
        <FontAwesomeIcon icon={verificando ? faSpinner : faTriangleExclamation} spin={verificando} className="h-3 w-3" />
        {verificando ? `Comprobando ${etiqueta}…` : `Todavía no está publicado para ${etiqueta} — reintentar`}
      </button>
    );
  }

  return (
    <a
      href={url}
      download
      className={
        principal
          ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700'
          : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500'
      }
    >
      <FontAwesomeIcon icon={icono} className="h-3 w-3" />
      Descargar para {etiqueta}
      <FontAwesomeIcon icon={faDownload} className="h-2.5 w-2.5 opacity-60" />
    </a>
  );
};

export const BloqueAsistente: React.FC<{ uso: UsoAsistente; empleadora?: string }> = ({ uso, empleadora }) => {
  const { estado, fallo, cargando, versionNueva, refrescar } = uso;
  const [abriendo, setAbriendo] = useState(false);

  /** Pide el código y lo guarda. Se hace una vez por navegador. */
  const emparejar = async () => {
    const r = await sweetAlert.prompt('Emparejar el Asistente', {
      html: 'El Asistente lo muestra en <a href="http://127.0.0.1:47653/emparejar" target="_blank" rel="noreferrer" style="font-weight:600;color:#2563eb">127.0.0.1:47653/emparejar</a> y también en la consola donde lo ejecutaste.',
      placeholder: '64 caracteres',
      confirmText: 'Emparejar',
      // Se valida acá el formato para no mandar un pegado a medias y recibir un 401 que se lee como
      // «el código está mal» cuando en realidad se copió de menos.
      validar: (v) => (/^[0-9a-f]{64}$/i.test(v.trim()) ? null : 'El código son 64 caracteres. Copialo entero desde 127.0.0.1:47653/emparejar.'),
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

  /**
   * Trae al frente la ventana de ARCA que ya está abierta.
   *
   * Si el sistema no la pudo levantar se dice, en vez de no hacer nada: un botón que parece
   * funcionar y no mueve nada es peor que uno que explica por qué. La ventana existe igual.
   */
  const irAEsaVentana = async () => {
    setAbriendo(true);
    try {
      const r = await asistenteAPI.enfocarChrome();
      if (!r.enfocada) // 6 s y no el default: es una instrucción para ejecutar, no un acuse. Con 1,8 s desaparece
        // antes de que alguien alcance a leer dónde tiene que buscar.
        sweetAlert.info('No pude traerla al frente', 'Buscá la ventana de Chrome en tu barra de tareas: está abierta, con la sesión de ARCA.', 6000);
      await refrescar();
    } catch (e: any) {
      sweetAlert.error('No pude enfocar la ventana', e?.message || 'Probá buscándola en la barra de tareas.');
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
    /*
      Se ofrece UN botón —el del sistema que se está usando— y las instrucciones de ESE sistema.

      Antes esto era: tres botones, dos párrafos de advertencias y un link, todo junto. La persona
      tenía que leer las seis cosas para saber cuál le tocaba, y una de las decisiones que se le
      pedía —Apple Silicon o Intel— no la puede tomar casi nadie.

      Si el sistema no se puede afirmar (Linux, una tablet, un navegador raro), NO se elige uno: se
      muestran todos al mismo nivel. Un botón primario es una afirmación, y una afirmación que no se
      puede sostener no se muestra. Es el mismo criterio que `pantallaAltas === false` más abajo.
    */
    const sistema = detectarSistema();
    const suyas = DESCARGAS.filter((d) => d.so === sistema);
    const otras = DESCARGAS.filter((d) => !suyas.includes(d));
    const principales = suyas.length > 0 ? suyas : DESCARGAS;

    return (
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-amber-50/60 dark:bg-amber-950/20">
        <p className="text-[12.5px] font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <Punto color="bg-gray-400" />
          Falta instalar el Asistente
        </p>
        <p className="text-[11.5px] text-gray-600 dark:text-gray-400 mt-0.5">Se hace una vez. Se empareja solo: no hay ningún código que copiar.</p>

        <div className="flex items-center gap-2 flex-wrap mt-2">
          {principales.map((d, i) => (
            <BotonDescarga key={d.url} url={d.url} icono={d.icono} etiqueta={d.etiqueta} principal={i === 0} />
          ))}
          <a href={DESCARGAS_ASISTENTE.guia} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            <FontAwesomeIcon icon={faCircleQuestion} className="h-3 w-3" />
            ¿Cómo se instala?
          </a>
        </div>

        {sistema !== 'otro' && <PasosInstalacion sistema={sistema} compacto />}
        <NotaSinFirma />

        {/* El escape cuando la detección se equivoca, o cuando alguien baja el archivo para otra
            máquina. Plegado: es el caso raro y no tiene que competir con el camino normal. */}
        {otras.length > 0 && (
          <details className="mt-2">
            <summary className="text-[11.5px] text-gray-500 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">Otras descargas</summary>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {otras.map((d) => (
                <BotonDescarga key={d.url} url={d.url} icono={d.icono} etiqueta={d.etiqueta} />
              ))}
            </div>
          </details>
        )}
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
          <p className="text-[11.5px] text-gray-600 dark:text-gray-400 mt-0.5">
            El Asistente empareja solo al arrancar. Si no lo hizo, cerralo y volvé a ejecutarlo — o abrí{' '}
            <a href="http://127.0.0.1:47653/emparejar" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              127.0.0.1:47653/emparejar
            </a>{' '}
            y pegá el código a mano.
          </p>
        </div>
        <button type="button" onClick={emparejar} className="ml-auto px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700">
          Pegar el código
        </button>
      </div>
    );
  }

  // ── Conectado, pero Chrome NO está abierto: hay que lanzarlo. ──────────────
  if (estado && !estado.chromeAbierto && estado.chromeEncontrado) {
    return (
      <Barra
        punto="bg-amber-500"
        titulo={`Falta abrir el Chrome de ARCA (Asistente v${estado.version})`}
        detalle="Se abre un Chrome aparte, con su propio perfil. No hace falta cerrar el que estás usando."
        accion={
          <button type="button" onClick={abrirArca} disabled={abriendo} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {abriendo && <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />}
            Abrir ARCA
          </button>
        }
      />
    );
  }

  /*
    Ni Chrome hay. Es el único estado que esta pantalla no puede resolver sola.

    Se separa de «falta abrirlo» porque la acción es otra: ahí hay algo que lanzar, acá hay que
    decirle al Asistente dónde está el ejecutable. Ofrecer «Abrir ARCA» sobre un Chrome que no existe
    devuelve un error que no explica nada.
  */
  if (estado && !estado.chromeAbierto && !estado.chromeEncontrado) {
    return (
      <Barra
        punto="bg-red-500"
        titulo="No encuentro Chrome en esta computadora"
        detalle="El Asistente lo busca en las rutas habituales. Si lo tenés instalado en otro lado, indicale dónde está y lo recuerda."
        accion={
          <a href={RUTA_AYUDA} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500">
            <FontAwesomeIcon icon={faFolderOpen} className="h-3 w-3" />
            Cómo indicar la ruta
          </a>
        }
      />
    );
  }

  /*
    Chrome ABIERTO y sesión SIN INICIAR. Es donde se traba casi todo el mundo.

    El texto dice el camino completo y nombra la empleadora concreta porque el paso de ELEGIR EL CUIT
    es el que más se saltea, y saltearlo rompe todo lo que sigue: ARCA rechaza la pantalla de altas
    aunque la persona esté perfectamente logueada. Decir «iniciá sesión» a secas deja ese paso afuera.
  */
  if (estado && estado.sesionArca !== 'viva') {
    return (
      <Barra
        punto="bg-amber-500"
        titulo="El Chrome de ARCA está abierto, pero falta iniciar sesión"
        detalle={
          <>
            En esa ventana: entrá con tu clave fiscal → <strong>Simplificación Registral - Empleadores</strong> → elegí <strong>{empleadora || 'la empleadora'}</strong> → <strong>Relaciones Laborales</strong> →{' '}
            <strong>Registrar Nuevas Altas</strong>. Esta pantalla se actualiza sola cuando termines.
            {!asistentePuede(estado, '/chrome/focus') && <> Buscá esa ventana en tu barra de tareas: es un Chrome aparte, solo para ARCA.</>}
          </>
        }
        /*
          El botón solo aparece si ESTE Asistente sabe enfocar.

          `/chrome/focus` se agregó después, y los Asistentes instalados antes no la tienen: ofrecerla
          igual daba 404 y un cartel rojo que decía «No existe esa operación». La persona no puede
          hacer nada con eso — pero sí puede con «descargá el Asistente de nuevo», que es lo que se
          ofrece en su lugar. Ver `asistentePuede`.
        */
        accion={
          asistentePuede(estado, '/chrome/focus') ? (
            <button type="button" onClick={irAEsaVentana} disabled={abriendo} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {abriendo ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />}
              Ir a esa ventana
            </button>
          ) : (
            <a href={DESCARGAS_ASISTENTE.guia} target="_blank" rel="noreferrer" title={`Tu Asistente es la v${estado.version} y no sabe traer la ventana al frente.`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500">
              <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
              Actualizar el Asistente
            </a>
          )
        }
      />
    );
  }

  /*
    Sesión viva pero en OTRA pantalla de ARCA.

    Es informativo y no bloquea: `pantallaAltas` sale de mirar la URL de las pestañas, y una
    heurística de URL equivocada no puede dejar a nadie sin poder validar. El que decide de verdad es
    el motor, que busca el campo de CUIL en la página real.

    Pero decirlo ANTES vale, porque la alternativa ya pasó: con ARCA en «Registrar Datos Iniciales»,
    la pantalla decía «Listo para validar», la corrida arrancaba y el motor se quedaba hasta cinco
    minutos esperando en silencio a que apareciera la pantalla correcta.

    `pantallaAltas === false` y no `!pantallaAltas`: en un Asistente anterior a la v1.1.0 el campo no
    viene, y de `undefined` no se puede afirmar nada. Una ayuda que no se puede sostener no se muestra.
  */
  if (estado && estado.pantallaAltas === false) {
    return (
      <Barra
        punto="bg-amber-500"
        titulo="Estás en ARCA, pero no en «Registrar Nuevas Altas»"
        detalle={
          <>
            En esa ventana: <strong>Relaciones Laborales</strong> → <strong>Registrar Nuevas Altas</strong>. Podés validar igual —el Asistente espera a que la abras— pero hasta entonces no va a avanzar
            ninguna fila.
          </>
        }
        accion={
          asistentePuede(estado, '/chrome/focus') ? (
            <button type="button" onClick={irAEsaVentana} disabled={abriendo} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {abriendo ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />}
              Ir a esa ventana
            </button>
          ) : null
        }
      />
    );
  }

  // ── Todo listo. Una línea, sin ruido. ──────────────────────────────────────
  return (
    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-[12px] text-gray-600 dark:text-gray-400 flex items-center gap-2 flex-wrap">
      <Punto color="bg-green-500" />
      Listo para validar · Asistente v{estado?.version}
      {/*
        Hay una versión nueva. Va acá, DISCRETO y sin bloquear nada.

        El Asistente viejo sigue funcionando, así que interrumpir el trabajo con un modal por una
        actualización opcional sería exactamente la clase de molestia que se está tratando de sacar.
        Pero tampoco puede quedar invisible: hasta ahora el desfasaje se descubría cuando un botón
        devolvía 404 — o sea por un error, y sin ninguna pista de que había que actualizar.
      */}
      {versionNueva && (
        <a
          href={DESCARGAS_ASISTENTE.guia}
          target="_blank"
          rel="noreferrer"
          title={`Tenés la v${estado?.version} y está publicada la v${versionNueva}. Podés seguir usando esta.`}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
        >
          <FontAwesomeIcon icon={faDownload} className="h-2.5 w-2.5" />
          Hay una versión nueva (v{versionNueva})
        </a>
      )}
    </div>
  );
};
