import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faSpinner, faEdit, faTrash, faCheck, faTriangleExclamation, faLock, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Modal } from "../components/ui/Modal";
import { InfoModal } from "../components/ui/InfoModal";
import { ModalVariables } from "../components/ui/RichTextEditor";
import { ViewToggle, ViewMode } from "../components/ui/ViewToggle";
import { sweetAlert } from "../utils/sweetAlert";
import { nomenclaturasAPI, Nomenclatura, ErrorPatron, ETIQUETA_TIPO, LargoNomenclatura } from "../api/nomenclaturas";

/**
 * ABM de la nomenclatura de archivos.
 *
 * Un patrón con `{{variables}}` por tipo de documento — misma mecánica que las Plantillas de PDF,
 * con las variables en un botón de la barra y click para copiarlas— pero para el NOMBRE del archivo.
 *
 * La pantalla sigue la forma del ABM de Contratos: una card por tipo, con sus acciones en el pie, y
 * la edición en un modal. El editor NO va inline a propósito: entre el patrón, las diez variables y
 * la previsualización, cada fila ocupaba media pantalla y los siete tipos se leían como un formulario
 * infinito en vez de como una lista de siete cosas.
 *
 * ⚠ POR QUÉ ESTA PANTALLA TIENE FRENOS QUE OTRAS NO
 *
 * El nombre del archivo se PARSEA DE VUELTA. Cuando un documento firmado regresa de Dropbox Sign, el
 * sistema lee su nombre para saber de quién es (`_CUIL-…`, `_DNI-…`) y a qué contrato corresponde
 * (las fechas en YYYYMMDD). Un patrón sin esos bloques hace que los documentos vuelvan y no se puedan
 * asociar a nadie — sin ningún error a la vista, hasta que alguien busca un contrato que "se perdió".
 *
 * Por eso las variables obligatorias se marcan con candado y el guardado se BLOQUEA sin ellas. El
 * servidor valida lo mismo: esta pantalla no es la única defensa, es la que lo explica a tiempo.
 */

/** Búsqueda tolerante a acentos y mayúsculas, como en el resto de los ABM. */
const normalizar = (v: string): string =>
  (v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

/** Las variables que un patrón menciona, sin repetir y en orden de aparición. */
const usadasDe = (patron: string): string[] => [...new Set((patron.match(/\{\{\s*\w+\s*\}\}/g) || []).map((v) => v.replace(/\s/g, "")))];

/**
 * El nombre resultante. UNA sola representación, carácter por carácter.
 *
 * Antes había dos —los campos en chips arriba y el texto crudo abajo— y se leían como si fueran dos
 * resultados distintos. Ahora es una línea sola: exactamente lo que se va a escribir en el disco, con
 * los «_» atenuados para que se vea dónde termina un campo y empieza el otro sin agregar ni sacar un
 * carácter. `split("_")` y volver a intercalar el «_» reproduce el string idéntico.
 *
 * `translate="no"` NO es un detalle. Chrome traduce la página si detecta otro idioma, y con los campos
 * en elementos separados los traducía uno por uno: `EMAIL-` salía como «CORREO ELECTRÓNICO:» y
 * `gonzalez-rotstein` como «González-Rotstein». O sea que la previsualización mostraba un nombre que
 * no era el que se iba a generar, que es lo peor que puede hacer una previsualización.
 */
const Previsualizacion: React.FC<{ ejemplo: string }> = ({ ejemplo }) => (
  <p translate="no" className="font-mono text-[11px] text-gray-700 dark:text-gray-200 break-all select-all leading-relaxed">
    {ejemplo.split("_").map((parte, i) => (
      <React.Fragment key={i}>
        {i > 0 && <span className="text-gray-400 dark:text-gray-600">_</span>}
        {parte}
      </React.Fragment>
    ))}
    <span className="text-gray-400 dark:text-gray-600">.pdf</span>
  </p>
);

/**
 * Cuánto mide el nombre contra el tope de 255.
 *
 * Está acá porque es la única forma de enterarse a tiempo. Ni Dropbox ni el disco del servidor
 * aceptan un nombre más largo: el archivo no se guarda, y como el nombre es la única vía por la que
 * el documento vuelve a entrar al sistema, ese contrato queda afuera del circuito de firma sin que
 * nadie lo note.
 *
 * Se muestra el PEOR CASO y no el del ejemplo: el ejemplo usa datos cómodos y un patrón puede verse
 * holgado ahí y pasarse con la persona de nombre más largo del padrón.
 *
 * El número viene del server medido en BYTES —lo mismo que corta la guarda—, no en caracteres.
 */
const MedidorLargo: React.FC<{ largo: LargoNomenclatura }> = ({ largo }) => {
  const { peorCaso, maximo, recortaria } = largo;
  const [infoAbierto, setInfoAbierto] = useState(false);
  const pct = Math.min(100, Math.round((peorCaso / maximo) * 100));

  /*
   * Tres estados con nombre propio, en vez de un párrafo rojo.
   *
   * El párrafo explicaba bien pero ocupaba cuatro renglones fijos debajo de la barra, y lo que hay
   * que decidir de un vistazo es una sola cosa: si este patrón entra o no. El nombre del estado
   * responde eso; el porqué está a un click, que es donde va lo que se lee una vez.
   *
   * El ámbar arranca ANTES del tope: llegar justo al límite no deja margen para un proyecto nuevo
   * con nombre largo, y esos aparecen todo el tiempo.
   */
  const estado = recortaria
    ? { nombre: "Se va a acortar", barra: "bg-red-500", texto: "text-red-600 dark:text-red-400" }
    : peorCaso > maximo * 0.9
      ? { nombre: "Al límite", barra: "bg-amber-500", texto: "text-amber-600 dark:text-amber-400" }
      : { nombre: "Entra bien", barra: "bg-green-500", texto: "text-gray-500 dark:text-gray-400" };

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className={`h-full rounded-full ${estado.barra} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${estado.texto}`}>
          {peorCaso} / {maximo}
        </span>
        <button type="button" onClick={() => setInfoAbierto(true)} title="Qué significa este número" className={`shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold hover:underline ${estado.texto}`}>
          {estado.nombre}
          <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
        </button>
      </div>

      {infoAbierto && (
        <InfoModal
          isOpen={infoAbierto}
          onClose={() => setInfoAbierto(false)}
          title={recortaria ? "El nombre no entra y se va a acortar" : "Cuánto mide el nombre de archivo"}
          subtitle={`Peor caso: ${peorCaso} de ${maximo}`}
          size="md"
          zIndex={90}
        >
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
            <p>
              El tope son <strong>{maximo}</strong> y no es una preferencia: Dropbox no acepta un nombre más largo y el disco del servidor tampoco lo puede guardar. Como el archivo vuelve a entrar al sistema por su nombre, uno que no se puede guardar deja ese documento afuera del circuito de firma.
            </p>

            {/* La diferencia no es un tecnicismo: reventó en producción con un "Andrés" que sumaba
                255 caracteres pero 256 bytes, y el archivo no se pudo escribir. */}
            <p className="text-gray-600 dark:text-gray-300">
              Se mide en <strong>bytes</strong>, no en letras: una <span className="font-mono text-xs">é</span> o una <span className="font-mono text-xs">ñ</span> cuentan por dos. Un nombre de 255 letras con una sola tilde ya se pasa.
            </p>

            <p>
              El número es el <strong>peor caso real</strong>, no el del ejemplo de arriba: se arma el mismo patrón con los valores más largos que hoy existen en la base —el proyecto, la persona, el tipo de contrato, la plantilla y la empleadora de nombre más largo—. Un patrón puede verse holgado con los datos de ejemplo y pasarse con la persona equivocada.
            </p>

            {recortaria ? (
              <>
                <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 space-y-1.5">
                  <p className="font-semibold text-red-800 dark:text-red-300">Qué va a pasar</p>
                  <p className="text-red-800/90 dark:text-red-300/90">
                    Cuando el nombre no entre, se <strong>acortan los campos descriptivos</strong> —proyecto, tipo de contrato, plantilla, email y razón social— empezando por el más largo, hasta que entre. No desaparece ningún bloque: se pierden caracteres del final de los valores más gordos.
                  </p>
                  <p className="text-red-800/90 dark:text-red-300/90">
                    El bloque <span className="font-mono text-xs">CUIL-…_DNI-…</span> y las fechas <strong>no se tocan nunca</strong>. Son lo que permite reconocer el archivo cuando vuelve firmado, y recortarlos no acortaría el nombre: lo rompería.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="font-semibold text-gray-800 dark:text-gray-100">Cómo ganar lugar, si no querés que se acorte</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 dark:text-gray-300">
                    <li>
                      Sacá <span className="font-mono text-xs">{"{{docName}}"}</span> del patrón. Es el campo que más ocupa y casi repite a <span className="font-mono text-xs">{"{{contrato}}"}</span>.
                    </li>
                    <li>
                      Sacá <span className="font-mono text-xs">{"{{proyectoId}}"}</span> o <span className="font-mono text-xs">{"{{email}}"}</span> si en esta carpeta no los usás para buscar.
                    </li>
                    <li>Acortá los nombres largos en su propio ABM: un tipo de contrato o una plantilla con 49 caracteres se lleva la quinta parte del nombre.</li>
                  </ul>
                </div>
              </>
            ) : (
              <p className="text-gray-600 dark:text-gray-300">Con este patrón entra sin recortar nada, incluso en el peor caso. Si más adelante aparece un proyecto o una plantilla con nombre más largo, este número sube solo.</p>
            )}
          </div>
        </InfoModal>
      )}
    </>
  );
};

/** Mismo pie de card que el ABM de Contratos: ícono chico con su tooltip arriba. */
const CardFooterAction: React.FC<{ icon: typeof faEdit; title: string; onClick: () => void }> = ({ icon, title, onClick }) => (
  <div className="relative group/action flex items-center">
    <button onClick={onClick} className="p-1 rounded transition-colors hover:text-gray-800 dark:hover:text-gray-300 text-gray-600 dark:text-gray-400">
      <FontAwesomeIcon icon={icon} className="h-4 w-4" />
    </button>
    <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/action:opacity-100 dark:bg-gray-700">
      {title}
    </span>
  </div>
);

/** El editor del patrón. Vive en el modal, así que se monta con el patrón vigente y muere al cerrar. */
const EditorPatron: React.FC<{ fila: Nomenclatura; onGuardado: (n: Nomenclatura) => void; onCerrar: () => void }> = ({ fila, onGuardado, onCerrar }) => {
  const [patron, setPatron] = useState(fila.patron);
  const [ejemplo, setEjemplo] = useState(fila.ejemplo);
  const [largo, setLargo] = useState(fila.largo);
  const [errores, setErrores] = useState<ErrorPatron[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [variablesAbierto, setVariablesAbierto] = useState(false);
  const [porQueAbierto, setPorQueAbierto] = useState(false);
  const [ejemploAbierto, setEjemploAbierto] = useState(false);

  const sucio = patron !== fila.patron;

  /*
   * El preview lo calcula el SERVER, con las mismas funciones que el guardado.
   *
   * Podría renderizarse acá y ahorrarse el request, pero un preview que recorre otro camino puede
   * prometer un resultado distinto del que después ocurre — y entonces no sirve para decidir, que es
   * exactamente para lo que existe.
   */
  useEffect(() => {
    if (!sucio) {
      setEjemplo(fila.ejemplo);
      setLargo(fila.largo);
      setErrores([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const r = await nomenclaturasAPI.previsualizar(fila.tipo, patron);
        setEjemplo(r.ejemplo);
        setLargo(r.largo);
        setErrores(r.errores);
      } catch {
        /* Si el preview no llega, el guardado igual valida del otro lado. */
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [patron, sucio, fila.tipo, fila.ejemplo, fila.largo]);

  /**
   * Inserta la variable donde está el cursor, con su separador.
   *
   * El "_" se agrega solo cuando hace falta: sin esto, hacer click en varias variables seguidas las
   * pegaba una atrás de otra —`{{timestamp}}{{email}}{{fecha}}`— y eso NO es un detalle estético, es
   * un nombre con los campos fusionados en uno solo, que después nadie puede volver a separar.
   */

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await nomenclaturasAPI.guardar(fila.tipo, patron);
      onGuardado({ ...fila, ...r });
      sweetAlert.success("Listo", `Los próximos archivos de ${ETIQUETA_TIPO[fila.tipo] || fila.tipo} van a usar este nombre.`);
      onCerrar();
    } catch (e: any) {
      sweetAlert.error("No se guardó", e?.response?.data?.error || "No se pudo guardar el patrón.");
    } finally {
      setGuardando(false);
    }
  };

  const usadasEnOrden = usadasDe(patron);

  // Las variables en la forma que espera el modal compartido con el editor de Contratos. Se arma acá
  // y no en el modal para que las dos pantallas muestren exactamente los mismos grupos.
  const gruposParaModal = (fila.grupos?.length ? fila.grupos : ["Variables"])
    .map((grupo) => ({ grupo, vars: fila.variables.filter((v) => (fila.grupos?.length ? v.grupo === grupo : true)).map((v) => v.variable) }))
    .filter((g) => g.vars.length > 0);

  /*
   * El modal lo arma ESTE componente, no la página.
   *
   * Es lo que permite usar el `footer` del `Modal`, que queda fijo abajo como en el resto de la app.
   * Con los botones adentro del cuerpo se iban con el scroll: en un patrón largo, para guardar había
   * que bajar hasta el final de la tabla de datos de ejemplo.
   *
   * Lo único que necesitaba de la página era el título, y sale de `fila`.
   */
  return (
    <Modal
      isOpen
      onClose={onCerrar}
      title="Editar nomenclatura"
      subtitle={ETIQUETA_TIPO[fila.tipo] || fila.tipo}
      size="lg"
      zIndex={80}
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <button type="button" onClick={onCerrar} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!sucio || errores.length > 0 || guardando}
            title={errores.length > 0 ? "Hay que resolver lo de arriba antes de guardar" : !sucio ? "No hay cambios" : "Guardar este patrón"}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FontAwesomeIcon icon={guardando ? faSpinner : faCheck} spin={guardando} className="h-3.5 w-3.5" />
            Actualizar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {porQueAbierto && (
          <InfoModal isOpen={porQueAbierto} onClose={() => setPorQueAbierto(false)} title="Por qué hay variables que no se pueden sacar" size="sm" zIndex={90}>
            <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
              Este archivo vuelve a entrar al sistema por su nombre —firmado desde Dropbox Sign, o levantado de la carpeta de Dropbox—. Las variables con{" "}
              <FontAwesomeIcon icon={faLock} className="h-3 w-3" /> son las que permiten reconocerlo al volver, y no se pueden sacar.
            </p>
          </InfoModal>
        )}

        {/*
         * Misma caja que el editor de Contratos: recuadro con barra fija arriba y el campo abajo.
         *
         * Lo que NO tiene son los botones de formato, y no es una omisión: el patrón ES el nombre del
         * archivo, y en el disco un nombre es texto plano. No existe un PDF que se llame en negrita.
         * Cuatro botones que no pueden hacer nada confunden más que su ausencia.
         *
         * Sin `overflow-hidden`, por lo mismo que allá: un ancestro con overflow distinto de `visible`
         * pasa a ser el contenedor de scroll de referencia y el `sticky` deja de pegarse a nada.
         */}
        {/*
         * La barra va SUELTA, no adentro de una caja con el campo.
         *
         * Un `sticky` solo viaja dentro de su padre: metida en un recuadro de 100px se despegaba a los
         * dos scrolls y no servía para nada. Como hermana directa del contenedor del editor, queda fija
         * durante todo el scroll del modal — que es cuando hace falta, porque uno se da cuenta de que
         * falta un campo MIRANDO la previsualización de abajo, no mirando el patrón.
         *
         * `-top-4` y no `top-0`: el `sticky` se ancla al PADDING BOX del contenedor de scroll, y el
         * cuerpo del modal tiene `pt-4`. Con `top-0` la barra frena un renglón debajo del título.
         */}
        <div className="sticky -top-4 z-20 flex items-center gap-3 rounded-t-md border border-b-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 shadow-sm">
          {/*
           * Mismo botón y misma posición que la barra del editor de Contratos: a la izquierda y con
           * relleno sólido, porque es una acción y no un interruptor de formato.
           *
           * Botones de formato no hay, y no es una omisión: el patrón ES el nombre del archivo, y en el
           * disco un nombre es texto plano. No existe un PDF que se llame en negrita.
           */}
          <button
            type="button"
            onClick={() => setVariablesAbierto(true)}
            title="Buscar una variable y copiarla al portapapeles"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <span className="font-mono">{"{{ }}"}</span>
            Variables
          </button>
          <span className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
          {/*
           * Acá iba el rótulo «PATRÓN», que no informaba nada: el campo de abajo es lo único que hay.
           * En su lugar va el porqué de los candados, que era un link suelto arriba de todo ocupando
           * su propio renglón. Queda al lado de «Variables», que es donde se ven los candados y por
           * lo tanto donde surge la pregunta.
           */}
          {fila.seLeeDeVuelta && (
            <button
              type="button"
              onClick={() => setPorQueAbierto(true)}
              title="Por qué hay variables que no se pueden sacar"
              aria-label="Por qué hay variables que no se pueden sacar"
              className="shrink-0 flex items-center text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
            >
              <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Textarea y no input: el patrón mide 200 caracteres y en una línea que scrollea no se ve
            dónde estás parado. Envuelto, se lee entero.
            `!mt-0` para anular el `space-y-4` del contenedor: la barra y el campo son una sola caja. */}
        <textarea
          value={patron}
          onChange={(e) => setPatron(e.target.value)}
          spellCheck={false}
          rows={3}
          className="!mt-0 block w-full rounded-b-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2.5 text-xs font-mono leading-relaxed resize-y outline-none focus:ring-1 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-600"
          placeholder={fila.patronPorDefecto}
        />

        {variablesAbierto && (
          <ModalVariables
            titulo="Variables del nombre de archivo"
            grupos={gruposParaModal}
            obligatorias={fila.variables.filter((v) => v.requerida).map((v) => v.variable)}
            descripciones={Object.fromEntries(fila.variables.map((v) => [v.variable, v.descripcion]))}
            onCerrar={() => setVariablesAbierto(false)}
          />
        )}

        {/* El resultado con datos de ejemplo. Es lo único que se lee de verdad al decidir si el patrón
            sirve: el patrón en sí es difícil de imaginar renderizado. */}
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 leading-none">Ejemplo de nomenclatura</p>
            {/*
             * La tabla de "con estos datos de ejemplo" está detrás de este ⓘ.
             *
             * Son trece renglones fijos que responden una pregunta puntual —«¿qué parte del nombre
             * puso cada variable?»— y solo hacen falta cuando algo no cuadra: «748» y «2026» son dos
             * números y no se sabe cuál es cuál. El resto del tiempo empujaban los botones fuera de
             * la vista y obligaban a scrollear el modal entero.
             *
             * Solo el ícono, pegado al rótulo: un «Con qué datos» al otro extremo era una etiqueta más
             * para leer en una pantalla que justamente se está tratando de despejar.
             */}
            {usadasEnOrden.length > 0 && (
              <button
                type="button"
                onClick={() => setEjemploAbierto(true)}
                title="Con qué datos de ejemplo se armó: de dónde sale cada pieza del nombre"
                aria-label="Con qué datos de ejemplo se armó"
                // Del color del rótulo y no azul: es la ayuda DE ese rótulo, no otro elemento. El azul
                // lo levantaba por encima del texto al que acompaña. Se ilumina al pasar por encima.
                className="shrink-0 flex items-center text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              >
                <FontAwesomeIcon icon={faCircleInfo} className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
          {ejemplo ? <Previsualizacion ejemplo={ejemplo} /> : <p className="text-[11px] text-gray-400">—</p>}
          {largo && <MedidorLargo largo={largo} />}
        </div>

        {ejemploAbierto && (
          <InfoModal isOpen={ejemploAbierto} onClose={() => setEjemploAbierto(false)} title="Con estos datos de ejemplo" subtitle="De dónde sale cada pieza del nombre" size="md" zIndex={90}>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[60vh] overflow-y-auto">
              {usadasEnOrden.map((v) => (
                <div key={v} className="flex items-baseline gap-3 px-3 py-1.5">
                  <span className="font-mono text-[11px] text-blue-700 dark:text-blue-400 shrink-0 w-32">{v}</span>
                  {/* `valores` puede no venir si el server todavía no tiene la versión que lo devuelve.
                      En ese caso se muestra "—" y no "vacío": afirmar que un dato está vacío cuando en
                      realidad no se sabe es peor que no decir nada. */}
                  <span className="font-mono text-[11px] text-gray-700 dark:text-gray-300 break-all">
                    {fila.valores ? fila.valores[v] || <span className="text-gray-400 italic">vacío en el ejemplo</span> : <span className="text-gray-400">—</span>}
                  </span>
                </div>
              ))}
            </div>
          </InfoModal>
        )}

        {errores.map((e, i) => (
          <p key={i} className="text-[11px] text-red-600 dark:text-red-400 flex items-start gap-1.5">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{e.motivo}</span>
          </p>
        ))}
      </div>
    </Modal>
  );
};

export const NomenclaturaArchivosPage: React.FC = () => {
  const [filas, setFilas] = useState<Nomenclatura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [infoAbierto, setInfoAbierto] = useState(false);
  const [editando, setEditando] = useState<Nomenclatura | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // Vista Tarjetas/Tabla, igual que Contratos y Releases: se recuerda, y en pantalla chica se fuerza
  // tarjetas porque una tabla de cinco columnas ahí no se lee.
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);
  useEffect(() => {
    const onResize = () => {
      const ahoraGrande = window.innerWidth >= 1024;
      setIsLarge(ahoraGrande);
      if (!ahoraGrande) setViewMode("cards");
    };
    if (window.innerWidth >= 1024) {
      const guardado = localStorage.getItem("nomenclaturaViewMode");
      if (guardado === "table" || guardado === "cards") setViewMode(guardado);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (isLarge) localStorage.setItem("nomenclaturaViewMode", viewMode);
  }, [viewMode, isLarge]);
  const vistaEfectiva: ViewMode = isLarge ? viewMode : "cards";

  useEffect(() => {
    nomenclaturasAPI
      .getAll()
      .then(setFilas)
      .catch(() => setFilas([]))
      .finally(() => setCargando(false));
  }, []);

  const aplicar = (n: Nomenclatura) => setFilas((prev) => prev.map((x) => (x.tipo === n.tipo ? { ...x, ...n } : x)));

  /*
   * "Eliminar" acá es VOLVER AL DE FÁBRICA, no borrar.
   *
   * Los tipos de documento son fijos —los define la plataforma, no el usuario— así que no hay nada
   * que borrar: lo único que se puede quitar es la personalización. La confirmación lo dice con esas
   * palabras, y aclara que los archivos ya generados no se renombran.
   */
  /*
   * Buscador y vista Tarjetas/Tabla, con la misma mecánica que Plantillas | Contratos.
   *
   * Son siete tipos, así que el buscador no es para "encontrar entre muchos": es para no tener que
   * barrer siete cards con la vista cuando ya sabés cuál venís a tocar. Busca por el nombre del tipo
   * y TAMBIÉN dentro del patrón, que es lo que sirve para la pregunta real de esta pantalla —
   * "¿cuáles usan {{docName}}?"— cuando hay que acortar nombres.
   */
  const filtradas = React.useMemo(() => {
    const q = normalizar(busqueda);
    if (!q) return filas;
    return filas.filter((f) => normalizar(ETIQUETA_TIPO[f.tipo] || f.tipo).includes(q) || normalizar(f.patron).includes(q));
  }, [filas, busqueda]);

  const restaurar = async (fila: Nomenclatura) => {
    const c = await sweetAlert.confirm(
      "¿Volver al nombre de fábrica?",
      `Se descarta el patrón personalizado de ${ETIQUETA_TIPO[fila.tipo] || fila.tipo}. Los archivos que ya se generaron NO se renombran: esto solo afecta a los próximos.`,
      "Sí, restaurar",
    );
    if (!c.isConfirmed) return;
    try {
      aplicar(await nomenclaturasAPI.restaurar(fila.tipo));
    } catch (e: any) {
      sweetAlert.error("No se pudo restaurar", e?.response?.data?.error || "Intentá de nuevo.");
    }
  };

  return (
    <PageLayout
      title="Plantillas | Nomenclatura de archivos"
      subtitle="Cómo se llaman los archivos que genera la plataforma: contratos, releases, altas, pedidos y vacaciones"
      faIcon={{ icon: faTag }}
      infoModal={{
        isOpen: infoAbierto,
        onOpen: () => setInfoAbierto(true),
        onClose: () => setInfoAbierto(false),
        title: "Cómo funciona la nomenclatura",
        size: "lg",
        content: (
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            <p>
              Cada tipo de documento tiene un <strong>patrón</strong>: un texto con <code className="font-mono text-[12.5px]">{"{{variables}}"}</code> que se reemplazan por los datos de la persona y del
              contrato al momento de generar el archivo. El <strong>«_»</strong> separa campos; los espacios adentro de un campo se convierten en <strong>«-»</strong>.
            </p>
            <p>
              <strong>Los cambios valen para los archivos nuevos.</strong> Lo que ya se generó no se renombra: los archivos viejos siguen con su nombre y se siguen leyendo bien.
            </p>
            <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3">
              <p className="font-semibold text-gray-900 dark:text-gray-100">Por qué hay variables con candado</p>
              <p className="mt-1">
                El nombre del archivo no es solo una etiqueta: <strong>se lee de vuelta</strong>. Un documento firmado que regresa de Dropbox Sign, o un archivo que se levanta de la carpeta de Dropbox,
                se identifican por su nombre: de ahí sale el <strong>CUIL y el documento</strong> para saber de quién es, y el <strong>ancla</strong> para saber de qué trámite — las{" "}
                <strong>fechas</strong> en los documentos de contrato, el <strong>número</strong> en pedidos y vacaciones.
              </p>
              <p className="mt-1">
                Un patrón sin esos datos genera archivos que <strong>vuelven de la firma y no se pueden asociar a nadie</strong>. Y no falla ruidosamente: el archivo se crea, se firma, y el problema
                aparece meses después cuando alguien busca un contrato que «se perdió». Por eso no se puede guardar sin ellas.
              </p>
            </div>
            <p className="text-[12px] text-gray-500 dark:text-gray-400">
              Aplica a los <strong>siete</strong> tipos. Pedidos y Vacaciones también se firman y vuelven; y la Constancia de CUIT, aunque no se firme, igual hay que poder levantarla de Dropbox y saber
              de quién es.
            </p>
          </div>
        ),
      }}
    >
      <div className="mb-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por tipo o por una variable del patrón..."
          className="w-full max-w-md px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white"
        />
        {isLarge && <ViewToggle value={viewMode} onChange={setViewMode} />}
      </div>

      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando la nomenclatura..." />
        </div>
      ) : filtradas.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-16 text-center">Ningún tipo de documento coincide con «{busqueda}».</p>
      ) : vistaEfectiva === "table" ? (
        /*
         * SIN la columna del patrón, a propósito.
         *
         * Estaba, con la idea de poder comparar los siete patrones uno debajo del otro. En la
         * práctica son 180 caracteres de `{{llaves}}` por fila: tres renglones de ruido que nadie
         * lee y que empujan fuera de la vista lo único que la tabla responde bien — qué tipos hay,
         * cuáles están personalizados y cuáles se van a acortar. El patrón se ve al editar.
         */
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr className="text-left text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 whitespace-nowrap">Tipo</th>
                  <th className="px-4 py-3 whitespace-nowrap">Estado</th>
                  <th className="px-4 py-3 whitespace-nowrap" title="Variables que no se pueden sacar / en cuántas partes queda dividido el nombre">
                    Oblig. · Campos
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap" title="Cuánto mide el nombre contra el tope de 255">
                    Largo
                  </th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {filtradas.map((fila) => (
                  <tr key={fila.tipo} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{ETIQUETA_TIPO[fila.tipo] || fila.tipo}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center w-fit rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap ${
                          fila.personalizado ? "bg-blue-500/10 text-blue-500 border border-blue-500/50" : "bg-orange-500/10 text-orange-500 border border-orange-500/50"
                        }`}
                      >
                        {fila.personalizado ? "Personalizado" : "Sistema"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      <strong>{fila.variables.filter((v) => v.requerida).length}</strong> · <strong>{fila.ejemplo.split("_").filter(Boolean).length}</strong>
                    </td>
                    <td className="px-4 py-3 min-w-[11rem]">{fila.largo && <MedidorLargo largo={fila.largo} />}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <CardFooterAction icon={faEdit} title="Editar la nomenclatura" onClick={() => setEditando(fila)} />
                        {fila.personalizado && <CardFooterAction icon={faTrash} title="Volver al nombre de fábrica" onClick={() => restaurar(fila)} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtradas.map((fila) => (
            <div key={fila.tipo} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 min-w-0">
                {/* Mismos badges que el ABM de Roles: «Sistema» en naranja para lo que trae la
                    plataforma, y el azul de «Por defecto» para lo que alguien cambió. Que dos
                    pantallas de configuración usen colores distintos para la misma idea obliga a
                    reaprender el código de colores en cada una. */}
                <span
                  className={`inline-flex items-center w-fit rounded-md px-2 py-1 text-xs font-medium ${
                    fila.personalizado ? "bg-blue-500/10 text-blue-500 border border-blue-500/50" : "bg-orange-500/10 text-orange-500 border border-orange-500/50"
                  }`}
                >
                  {fila.personalizado ? "Personalizado" : "Sistema"}
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{ETIQUETA_TIPO[fila.tipo] || fila.tipo}</span>
              </div>

              {/*
                Solo dos números, con el formato del ABM de Contratos ("30 jornadas · Multiplicador 0").

                Estaba también "13 de 13 variables", y se sacó: en un patrón de fábrica los dos números
                son siempre iguales, así que no informaba nada y competía por la lectura con los dos que
                sí importan — cuántas piezas tiene el nombre y cuántas de ellas no se pueden tocar.

                El renglón ámbar que explicaba el candado también se fue: decía exactamente lo mismo en
                las siete cards. Lo dice mejor la palabra "obligatorias", y el porqué está en el ⓘ del
                encabezado y en el modal, que es donde alguien está por cambiarlo.
              */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                <span title="Variables que no se pueden sacar: sin ellas el archivo no se puede reconocer al volver">
                  <strong>{fila.variables.filter((v) => v.requerida).length}</strong> obligatorias
                </span>
                <span title="En cuántas partes queda dividido el nombre del archivo">
                  <strong>{fila.ejemplo.split("_").filter(Boolean).length}</strong> campos
                </span>
              </div>

              {/*
                La card NO muestra el patrón ni el ejemplo.

                Los dos son texto largo y monoespaciado —200 caracteres cada uno— y llenaban la card
                entera con algo que solo se lee cuando se está por editar. Con siete cards, la pantalla
                era un muro de código. Acá quedan el nombre, los dos números que permiten comparar tipos
                y las acciones; el patrón y su resultado viven en el modal, que es donde se los usa.
              */}

              {/* Sin el renglón de estado: el badge de arriba ya dice «Sistema» o «Personalizado»,
                  que es lo mismo. Repetirlo abajo con otras palabras —«Sin cambios»— obligaba a
                  descifrar si hablaban de la misma cosa. */}
              <div className="flex items-center justify-end gap-1 pt-2 mt-auto border-t border-gray-100 dark:border-gray-700/60">
                <CardFooterAction icon={faEdit} title="Editar la nomenclatura" onClick={() => setEditando(fila)} />
                {/* Solo si hay algo que descartar: sobre el de fábrica, "restaurar" no significa nada. */}
                {fila.personalizado && <CardFooterAction icon={faTrash} title="Volver al nombre de fábrica" onClick={() => restaurar(fila)} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <EditorPatron fila={editando} onGuardado={aplicar} onCerrar={() => setEditando(null)} />
      )}
    </PageLayout>
  );
};
