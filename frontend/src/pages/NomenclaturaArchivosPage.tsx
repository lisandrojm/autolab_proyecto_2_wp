import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faSpinner, faEdit, faTrash, faCopy, faCheck, faTriangleExclamation, faLock } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Modal } from "../components/ui/Modal";
import { sweetAlert } from "../utils/sweetAlert";
import { nomenclaturasAPI, Nomenclatura, ErrorPatron, ETIQUETA_TIPO } from "../api/nomenclaturas";

/**
 * ABM de la nomenclatura de archivos.
 *
 * Un patrón con `{{variables}}` por tipo de documento — misma mecánica que las Plantillas de PDF,
 * con la lista de variables al lado y click para insertar— pero para el NOMBRE del archivo.
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

  /**
   * Inserta la variable donde está el cursor, con su separador.
   *
   * El "_" se agrega solo cuando hace falta: sin esto, hacer click en varias variables seguidas las
   * pegaba una atrás de otra —`{{timestamp}}{{email}}{{fecha}}`— y eso NO es un detalle estético, es
   * un nombre con los campos fusionados en uno solo, que después nadie puede volver a separar.
   */
  const insertar = (variable: string) => {
    const el = inputRef.current;
    const inicio = el?.selectionStart ?? patron.length;
    const fin = el?.selectionEnd ?? inicio;
    const antes = patron.slice(0, inicio);
    const despues = patron.slice(fin);
    const sep = antes !== "" && !/[_\-]$/.test(antes) ? "_" : "";
    const texto = sep + variable;
    setPatron(antes + texto + despues);
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(inicio + texto.length, inicio + texto.length);
    }, 0);
  };

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

  const usadas = new Set((patron.match(/\{\{\s*\w+\s*\}\}/g) || []).map((v) => v.replace(/\s/g, "")));

  return (
    <div className="space-y-4">
      {fila.vuelveDeLaFirma && (
        <p className="text-[12px] text-gray-500 dark:text-gray-400">
          Este documento se manda a firmar y vuelve: las variables con <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5" /> son las que permiten reconocerlo al regresar, y no se pueden sacar.
        </p>
      )}

      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Patrón</label>
        <input ref={inputRef} value={patron} onChange={(e) => setPatron(e.target.value)} spellCheck={false} className="input-field w-full text-xs font-mono" placeholder={fila.patronPorDefecto} />
      </div>

      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Variables disponibles (click para insertar)</label>
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

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
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
    </div>
  );
};

export const NomenclaturaArchivosPage: React.FC = () => {
  const [filas, setFilas] = useState<Nomenclatura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [infoAbierto, setInfoAbierto] = useState(false);
  const [editando, setEditando] = useState<Nomenclatura | null>(null);
  const [copiado, setCopiado] = useState("");

  useEffect(() => {
    nomenclaturasAPI
      .getAll()
      .then(setFilas)
      .catch(() => setFilas([]))
      .finally(() => setCargando(false));
  }, []);

  const aplicar = (n: Nomenclatura) => setFilas((prev) => prev.map((x) => (x.tipo === n.tipo ? { ...x, ...n } : x)));

  /** Copiar el patrón: sirve para replicarlo en otro tipo sin volver a armarlo variable por variable. */
  const copiar = async (fila: Nomenclatura) => {
    try {
      await navigator.clipboard.writeText(fila.patron);
      setCopiado(fila.tipo);
      window.setTimeout(() => setCopiado(""), 2000);
    } catch {
      sweetAlert.error("No se pudo copiar", "El navegador bloqueó el portapapeles: copiá el patrón a mano desde la card.");
    }
  };

  /*
   * "Eliminar" acá es VOLVER AL DE FÁBRICA, no borrar.
   *
   * Los tipos de documento son fijos —los define la plataforma, no el usuario— así que no hay nada
   * que borrar: lo único que se puede quitar es la personalización. La confirmación lo dice con esas
   * palabras, y aclara que los archivos ya generados no se renombran.
   */
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filas.map((fila) => (
            <div key={fila.tipo} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1.5 min-w-0">
                <span
                  className={`inline-flex items-center w-fit px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                    fila.personalizado ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {fila.personalizado ? "Personalizado" : "De fábrica"}
                </span>
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{ETIQUETA_TIPO[fila.tipo] || fila.tipo}</span>
              </div>

              {fila.vuelveDeLaFirma && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                  <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5 shrink-0" />
                  Se firma y vuelve: su nombre tiene que poder leerse al regresar
                </div>
              )}

              <div className="flex flex-col gap-1 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Patrón</label>
                <p className="text-[10.5px] font-mono text-gray-600 dark:text-gray-400 break-all line-clamp-3">{fila.patron}</p>
              </div>

              <div className="flex flex-col gap-1 pt-1 border-t border-gray-100 dark:border-gray-700/60">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Así se va a llamar</label>
                <p className="text-[10.5px] font-mono text-gray-800 dark:text-gray-200 break-all line-clamp-3">{fila.ejemplo}.pdf</p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 mt-auto border-t border-gray-100 dark:border-gray-700/60">
                <span className="text-[11px] text-gray-500 dark:text-gray-400">{copiado === fila.tipo ? "Patrón copiado" : `${fila.variables.length} variables`}</span>
                <div className="flex items-center gap-1">
                  <CardFooterAction icon={copiado === fila.tipo ? faCheck : faCopy} title="Copiar el patrón" onClick={() => copiar(fila)} />
                  <CardFooterAction icon={faEdit} title="Editar la nomenclatura" onClick={() => setEditando(fila)} />
                  {/* Solo si hay algo que descartar: sobre el de fábrica, "restaurar" no significa nada. */}
                  {fila.personalizado && <CardFooterAction icon={faTrash} title="Volver al nombre de fábrica" onClick={() => restaurar(fila)} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <Modal isOpen={!!editando} onClose={() => setEditando(null)} title="Editar nomenclatura" subtitle={ETIQUETA_TIPO[editando.tipo] || editando.tipo} size="lg" zIndex={80}>
          <EditorPatron fila={editando} onGuardado={aplicar} onCerrar={() => setEditando(null)} />
        </Modal>
      )}
    </PageLayout>
  );
};
