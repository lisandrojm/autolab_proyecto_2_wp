import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faSpinner, faCheck, faRotateLeft, faTriangleExclamation, faCircleCheck, faLock } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { nomenclaturasAPI, Nomenclatura, ErrorPatron, ETIQUETA_TIPO } from "../api/nomenclaturas";

/**
 * ABM de la nomenclatura de archivos.
 *
 * Un patrón con `{{variables}}` por tipo de documento — misma mecánica que las Plantillas de PDF,
 * con la lista de variables al lado y click para insertar— pero para el NOMBRE del archivo.
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

/** Una fila del ABM: su editor, su preview y sus errores. */
const FilaNomenclatura: React.FC<{ fila: Nomenclatura; onGuardado: (n: Nomenclatura) => void }> = ({ fila, onGuardado }) => {
  const [patron, setPatron] = useState(fila.patron);
  const [ejemplo, setEjemplo] = useState(fila.ejemplo);
  const [errores, setErrores] = useState<ErrorPatron[]>([]);
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setErrores([]);
      return;
    }
    const id = window.setTimeout(async () => {
      try {
        const r = await nomenclaturasAPI.previsualizar(fila.tipo, patron);
        setEjemplo(r.ejemplo);
        setErrores(r.errores);
      } catch {
        /* Si el preview no llega, el guardado igual valida del otro lado. */
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [patron, sucio, fila.tipo, fila.ejemplo]);

  /** Inserta la variable donde está el cursor, como en las Plantillas. */
  const insertar = (variable: string) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? patron.length;
    setPatron(patron.slice(0, pos) + variable + patron.slice(el?.selectionEnd ?? pos));
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(pos + variable.length, pos + variable.length);
    }, 0);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await nomenclaturasAPI.guardar(fila.tipo, patron);
      onGuardado({ ...fila, ...r, variables: fila.variables, vuelveDeLaFirma: fila.vuelveDeLaFirma, patronPorDefecto: fila.patronPorDefecto });
      sweetAlert.success("Listo", `Los próximos archivos de ${ETIQUETA_TIPO[fila.tipo] || fila.tipo} van a usar este nombre.`);
    } catch (e: any) {
      sweetAlert.error("No se guardó", e?.response?.data?.error || "No se pudo guardar el patrón.");
    } finally {
      setGuardando(false);
    }
  };

  const restaurar = async () => {
    const c = await sweetAlert.confirm(
      "¿Volver al nombre de fábrica?",
      "Los archivos que ya se generaron NO se renombran: esto solo afecta a los próximos.",
      "Sí, restaurar",
    );
    if (!c.isConfirmed) return;
    setGuardando(true);
    try {
      const r = await nomenclaturasAPI.restaurar(fila.tipo);
      setPatron(r.patron);
      onGuardado({ ...fila, ...r, variables: fila.variables, vuelveDeLaFirma: fila.vuelveDeLaFirma, patronPorDefecto: fila.patronPorDefecto });
    } finally {
      setGuardando(false);
    }
  };

  const usadas = new Set((patron.match(/\{\{\s*\w+\s*\}\}/g) || []).map((v) => v.replace(/\s/g, "")));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{ETIQUETA_TIPO[fila.tipo] || fila.tipo}</p>
          {fila.vuelveDeLaFirma && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Se manda a firmar y vuelve: su nombre tiene que poder leerse al regresar.</p>
          )}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${fila.personalizado ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
          {fila.personalizado ? "Personalizado" : "De fábrica"}
        </span>
      </div>

      <input
        ref={inputRef}
        value={patron}
        onChange={(e) => setPatron(e.target.value)}
        spellCheck={false}
        className="input-field w-full text-xs font-mono"
        placeholder={fila.patronPorDefecto}
      />

      {/* Las variables, para insertar con un click. Las obligatorias van con candado y no se pueden
          sacar: el ABM no deja guardar sin ellas (ver el encabezado del archivo). */}
      <div className="flex flex-wrap gap-1.5">
        {fila.variables.map((v) => {
          const puesta = usadas.has(v.variable);
          return (
            <button
              key={v.variable}
              type="button"
              onClick={() => insertar(v.variable)}
              title={v.requerida ? `${v.descripcion} — OBLIGATORIA: sin esto el archivo no se puede reencontrar` : v.descripcion}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-mono border transition-colors ${
                v.requerida
                  ? "border-amber-300 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300"
                  : puesta
                    ? "border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              }`}
            >
              {v.requerida && <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5" />}
              {v.variable}
            </button>
          );
        })}
      </div>

      {/* El resultado con datos de ejemplo. Es lo único que se lee de verdad al decidir si el patrón
          sirve: el patrón en sí es difícil de imaginar renderizado. */}
      <div className="rounded-md bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-3 py-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Así se va a llamar</p>
        <p className="text-[11px] font-mono text-gray-800 dark:text-gray-200 break-all mt-0.5">{ejemplo || <span className="text-gray-400">—</span>}.pdf</p>
      </div>

      {errores.map((e, i) => (
        <p key={i} className="text-[11px] text-red-600 dark:text-red-400 flex items-start gap-1.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{e.motivo}</span>
        </p>
      ))}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={!sucio || errores.length > 0 || guardando}
          title={errores.length > 0 ? "Hay que resolver lo de arriba antes de guardar" : !sucio ? "No hay cambios" : "Guardar este patrón"}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FontAwesomeIcon icon={guardando ? faSpinner : faCheck} spin={guardando} className="h-3 w-3" />
          Guardar
        </button>
        {fila.personalizado && (
          <button type="button" onClick={restaurar} disabled={guardando} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50">
            <FontAwesomeIcon icon={faRotateLeft} className="h-3 w-3" />
            Volver al de fábrica
          </button>
        )}
        {!sucio && errores.length === 0 && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-green-700 dark:text-green-400">
            <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
            Guardado
          </span>
        )}
      </div>
    </div>
  );
};

export const NomenclaturaArchivosPage: React.FC = () => {
  const [filas, setFilas] = useState<Nomenclatura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [infoAbierto, setInfoAbierto] = useState(false);

  useEffect(() => {
    nomenclaturasAPI
      .getAll()
      .then(setFilas)
      .catch(() => setFilas([]))
      .finally(() => setCargando(false));
  }, []);

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
                El nombre del archivo no es solo una etiqueta: <strong>se lee de vuelta</strong>. Cuando un documento firmado regresa de Dropbox Sign, el sistema saca del nombre el{" "}
                <strong>CUIL y el documento</strong> para saber de quién es, y las <strong>fechas</strong> para saber a qué contrato corresponde.
              </p>
              <p className="mt-1">
                Un patrón sin esos datos genera archivos que <strong>vuelven de la firma y no se pueden asociar a nadie</strong>. Y no falla ruidosamente: el archivo se crea, se firma, y el problema
                aparece meses después cuando alguien busca un contrato que «se perdió». Por eso no se puede guardar sin ellas.
              </p>
            </div>
            <p className="text-[12px] text-gray-500 dark:text-gray-400">
              Pedidos y Vacaciones no se mandan a firmar, así que solo se les pide el CUIL: es lo que permite encontrar el PDF de una persona en la carpeta sin abrirlo.
            </p>
          </div>
        ),
      }}
    >
      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando la nomenclatura..." />
        </div>
      ) : (
        <div className="max-w-3xl space-y-4">
          {filas.map((f) => (
            <FilaNomenclatura key={f.tipo} fila={f} onGuardado={(n) => setFilas((prev) => prev.map((x) => (x.tipo === n.tipo ? n : x)))} />
          ))}
        </div>
      )}
    </PageLayout>
  );
};
