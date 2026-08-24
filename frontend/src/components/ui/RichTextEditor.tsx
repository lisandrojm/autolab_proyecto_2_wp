import React, { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { Modal } from "./Modal";
import { InfoModal } from "./InfoModal";
import { sweetAlert } from "../../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBold, faItalic, faUnderline, faListUl, faListOl, faAlignLeft, faAlignCenter, faAlignRight, faAlignJustify, faTable, faHeading, faRotateLeft, faRotateRight, faMinus, faSearch, faLock, faPenNib, faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

/**
 * Resalta las variables `{{variable}}` (y `{variable}`) dentro del editor.
 * Usa decoraciones de ProseMirror: es solo visual, no toca el HTML que se guarda,
 * así que no afecta al .docx / PDF generados.
 */
const VARIABLE_PATTERN = /\{\{[^{}\n]+\}\}|\{[^{}\n]+\}/g;

const buildVariableDecorations = (doc: ProseMirrorNode): DecorationSet => {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const regex = new RegExp(VARIABLE_PATTERN.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(node.text)) !== null) {
      decorations.push(Decoration.inline(pos + match.index, pos + match.index + match[0].length, { class: "tiptap-variable" }));
    }
  });
  return DecorationSet.create(doc, decorations);
};

const VariableHighlight = Extension.create({
  name: "variableHighlight",
  addProseMirrorPlugins() {
    const key = new PluginKey("variableHighlight");
    return [
      new Plugin({
        key,
        state: {
          init: (_config, { doc }) => buildVariableDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildVariableDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});

/** Grupo de variables para mostrarlas separadas por título. */
export interface VariableGroup {
  grupo: string;
  vars: string[];
  /**
   * El título del grupo se resalta y le aparece un info al lado.
   *
   * Existe para UNA cosa concreta: `{{firma}}`. Es la variable que decide si el documento se puede
   * firmar, y como chip anónimo entre otros diez se pasaba por alto — peor todavía, en Pedidos y
   * Vacaciones estaba agrupada con los datos de la empresa, donde se leía como un dato de la
   * empleadora. Un grupo se destaca cuando NO ponerlo rompe el circuito, no cuando es útil.
   *
   * Lo que se destaca es el TÍTULO, no el chip: los chips son todos la misma clase de cosa —una
   * variable que se copia— y hacer que uno se vea distinto sugiere que se usa distinto.
   */
  destacado?: boolean;
  /** Lo que la variable muestra en el documento, tal cual. Va adentro del info. */
  ejemplo?: string;
  /** La explicación larga. Va adentro del info, no desplegada: es para leer una vez. */
  nota?: string;
  /** Lo que puede salir mal. Adentro del info, en ámbar: no es lo mismo saber qué hace que saber qué rompe. */
  advertencia?: string;
}

interface RichTextEditorProps {
  /** HTML del contenido */
  value: string;
  onChange: (html: string) => void;
  /**
   * Variables que se ofrecen en el modal del botón «Variables»; al hacer click se copian.
   * Acepta una lista plana o grupos con título.
   */
  variables?: string[] | VariableGroup[];
  variablesTitle?: string;
  minHeight?: string;
}

/** Normaliza el prop `variables` a grupos (la lista plana queda como un único grupo sin título). */
const toGroups = (variables: string[] | VariableGroup[]): VariableGroup[] => {
  if (variables.length === 0) return [];
  return typeof variables[0] === "string" ? [{ grupo: "", vars: variables as string[] }] : (variables as VariableGroup[]);
};

const btnBase =
  "px-2 py-1 rounded text-sm transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed";
const btnActive = "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";

const ToolbarButton: React.FC<{ onClick: () => void; active?: boolean; title: string; icon?: IconDefinition; label?: string }> = ({ onClick, active, title, icon, label }) => (
  <button type="button" onClick={onClick} title={title} className={`${btnBase} ${active ? btnActive : ""}`}>
    {icon ? <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" /> : <span className="font-bold">{label}</span>}
  </button>
);

/**
 * Las variables, en un modal que se abre desde la barra.
 *
 * COPIA al portapapeles, no inserta en el cursor. Se probaron las dos y copiar gana por dos motivos
 * concretos:
 *
 *  - Los contratos son tablas bilingües: la misma variable va en la celda en inglés y en la española.
 *    Copiada se pega dos veces; insertándola hay que abrir el modal dos veces.
 *  - Insertar puede fallar EN SILENCIO. Si el modal se abre sin haber puesto el cursor en el texto,
 *    el editor enfoca al principio del documento y la variable cae arriba de todo, fuera de la vista.
 *    Copiando no se modifica nada hasta que la persona pega.
 *
 * Si el navegador bloquea el portapapeles, el modal NO se cierra: queda abierto para poder
 * seleccionar la variable a mano, que es lo único que queda por hacer.
 */
export const ModalVariables: React.FC<{
  grupos: VariableGroup[];
  titulo: string;
  onCerrar: () => void;
  /** Variables que no se pueden sacar del patrón; se marcan con candado (lo usa Nomenclatura). */
  obligatorias?: string[];
  /** Ayuda por variable, para el tooltip del chip. */
  descripciones?: Record<string, string>;
  /**
   * Insertar en vez de copiar, cuando el destino sabe hacerlo MEJOR que un pegado a mano.
   *
   * El único caso es Nomenclatura: ahí el campo es de una línea, el cursor siempre está donde uno lo
   * dejó, y al insertar se agrega solo el «_» que separa los campos del nombre. Copiando habría que
   * acordarse de escribirlo, y un patrón con dos variables pegadas sin separador sale mal.
   */
  onElegir?: (v: string) => void;
}> = ({ grupos, titulo, onCerrar, obligatorias = [], descripciones = {}, onElegir }) => {
  const [q, setQ] = useState("");
  /** El grupo cuyo info está abierto. Uno por vez: son explicaciones, no un panel de ayuda. */
  const [infoDe, setInfoDe] = useState<VariableGroup | null>(null);
  const buscarRef = useRef<HTMLInputElement>(null);
  useEffect(() => buscarRef.current?.focus(), []);

  const term = q.trim().toLowerCase();
  const filtrados = grupos.map((g) => ({ ...g, vars: g.vars.filter((v) => !term || v.toLowerCase().includes(term) || g.grupo.toLowerCase().includes(term)) })).filter((g) => g.vars.length > 0);
  const total = filtrados.reduce((n, g) => n + g.vars.length, 0);

  const elegir = async (v: string) => {
    if (onElegir) {
      onElegir(v);
      onCerrar();
      return;
    }
    try {
      await navigator.clipboard.writeText(v);
      sweetAlert.success("Variable copiada", `Pegá ${v} donde la necesites`);
      onCerrar();
    } catch {
      // El portapapeles requiere contexto seguro y a veces lo bloquea el navegador. Se avisa y el
      // modal queda abierto: seleccionar el texto a mano es lo único que queda por hacer.
      sweetAlert.error("No se pudo copiar", "El navegador bloqueó el portapapeles: seleccioná la variable y copiala a mano.");
    }
  };

  return (
    <Modal isOpen onClose={onCerrar} title={titulo} subtitle={onElegir ? "Se inserta donde tenías el cursor" : "Click para copiar; después la pegás donde la necesites"} size="lg" zIndex={80}>
      <div className="space-y-3">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input ref={buscarRef} value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Buscar una variable…" className="input-field w-full pl-9" />
        </div>

        {total === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 px-1 py-4">Ninguna variable coincide con «{q}».</p>
        ) : (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto">
            {filtrados.map((g) => (
              <div key={g.grupo}>
                {g.grupo && (
                  <p className={`text-[10px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5 ${g.destacado ? (g.advertencia ? "text-amber-700 dark:text-amber-400" : "text-blue-700 dark:text-blue-400") : "text-gray-400 dark:text-gray-500"}`}>
                    {g.destacado && <FontAwesomeIcon icon={faPenNib} className="h-3 w-3" />}
                    {g.grupo}
                    {/*
                      La explicación va en un INFO al lado del título, no desplegada bajo él.

                      Desplegada ocupaba cinco renglones arriba de un solo chip: el bloque pesaba más
                      que todo el resto del modal junto y empujaba las variables hacia abajo. Es un
                      texto que se lee una vez y después estorba todos los días.
                    */}
                    {/* Con advertencia el ícono es ámbar: desde afuera hay que poder distinguir «acá hay
                        algo que explicar» de «acá hay algo que puede salir mal», sin abrirlo. */}
                    {g.destacado && (g.nota || g.ejemplo || g.advertencia) && (
                      <button
                        type="button"
                        onClick={() => setInfoDe(g)}
                        title={g.advertencia ? `Ojo con ${g.vars[0] || "esta variable"}` : `Qué hace ${g.vars[0] || "esta variable"}`}
                        className={g.advertencia ? "text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300" : "text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"}
                      >
                        <FontAwesomeIcon icon={g.advertencia ? faTriangleExclamation : faCircleInfo} className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {g.vars.map((v) => {
                    const obligatoria = obligatorias.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => elegir(v)}
                        title={obligatoria ? `${descripciones[v] || ""} — OBLIGATORIA: sin esto el archivo no se puede reencontrar al volver`.trim() : descripciones[v] || (onElegir ? "Insertar en el cursor" : "Copiar al portapapeles")}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-colors ${
                          obligatoria
                            ? "border-amber-400/60 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400"
                        }`}
                      >
                        {obligatoria && <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5" />}
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Por encima del modal de variables (80), que sigue abierto detrás. */}
      {infoDe && (
        <InfoModal isOpen onClose={() => setInfoDe(null)} title={infoDe.vars[0] || infoDe.grupo} subtitle={infoDe.grupo} size="md" zIndex={90}>
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            {infoDe.nota && <p className="leading-relaxed">{infoDe.nota}</p>}
            {infoDe.advertencia && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 flex items-start gap-2.5">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mt-1 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="text-[13px] leading-relaxed">{infoDe.advertencia}</span>
              </div>
            )}
            {infoDe.ejemplo && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Se ve así en el documento</p>
                <p className="font-mono text-[12.5px] text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-slate-900/60 border border-gray-200 dark:border-slate-700 rounded px-3 py-2.5">{infoDe.ejemplo}</p>
              </div>
            )}
          </div>
        </InfoModal>
      )}
    </Modal>
  );
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, variables = [], variablesTitle = "Variables disponibles", minHeight = "320px" }) => {
  const editor = useEditor({
    extensions: [StarterKit, TextAlign.configure({ types: ["heading", "paragraph"] }), TableKit.configure({ table: { resizable: true } }), VariableHighlight],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      // El alto mínimo va en el elemento editable (no en el contenedor): si no, el área en blanco
      // de abajo no es clickeable y el primer click no enfoca el editor.
      attributes: { class: "outline-none", style: `min-height: ${minHeight}` },
    },
  });

  // Sincroniza cuando el contenido viene de afuera (ej: abrir el modal en modo edición)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if ((value || "") !== current) editor.commands.setContent(value || "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const groups = toGroups(variables);
  const [variablesAbierto, setVariablesAbierto] = useState(false);

  if (!editor) return null;
  const e = editor as Editor;

  return (
    <div className="space-y-2">
      {/*
       * Acá había un panel con TODAS las variables desplegadas, arriba del editor.
       *
       * Se sacó porque hacía exactamente lo mismo que el botón «Variables» de la barra, y lo hacía
       * peor: en Contratos son más de 40 chips, así que ocupaba media pantalla, empujaba el texto
       * fuera de la vista y alargaba el scroll del modal para siempre. El botón está fijo en la
       * barra, tiene buscador y no le roba alto a nada.
       *
       * El prop `variables` no cambió: sigue alimentando el modal, así que las tres pantallas que
       * usan este editor no tuvieron que tocarse.
       */}

      {/*
       * SIN `overflow-hidden` acá, a propósito.
       *
       * Es lo que rompía el `sticky` de la barra: un ancestro con overflow distinto de `visible` pasa
       * a ser el contenedor de scroll de referencia, y la barra queda pegada a un contenedor que no
       * scrollea — o sea, no se pega a nada. El redondeo, que era para lo que estaba, se resuelve en
       * los hijos (`rounded-t-md` arriba, `rounded-b-md` abajo).
       */}
      <div className="border border-gray-300 dark:border-gray-600 rounded-md">
        {/*
         * La barra acompaña al scroll: en un contrato largo, dar negrita a un párrafo del final
         * obligaba a subir hasta arriba, aplicar y volver a bajar — perdiendo la selección en el
         * camino. Se pega al borde de arriba del cuerpo del modal, o sea justo debajo del título.
         */}
        {/*
         * `-top-4` y no `top-0`: el `sticky` se ancla al PADDING BOX del contenedor de scroll, y el
         * cuerpo del modal tiene `pt-4`. Con `top-0` la barra frenaba un renglón más abajo del
         * título y por ese hueco seguía pasando texto.
         */}
        <div className="sticky -top-4 z-20 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 shadow-sm">
          {/*
           * Va PRIMERO y con relleno sólido, distinto del resto.
           *
           * Los demás son interruptores de formato —se prenden y se apagan—; este abre otra cosa y es
           * la única acción de la barra. Con el mismo aspecto que ellos y al final de la fila se leía
           * como un botón de formato más, y ahí es donde pasaba desapercibido.
           */}
          {groups.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setVariablesAbierto(true)}
                title="Insertar una variable donde está el cursor"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                <span className="font-mono">{"{{ }}"}</span>
                Variables
              </button>
              <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1.5" />
            </>
          )}
          <ToolbarButton onClick={() => e.chain().focus().toggleBold().run()} active={e.isActive("bold")} title="Negrita" icon={faBold} />
          <ToolbarButton onClick={() => e.chain().focus().toggleItalic().run()} active={e.isActive("italic")} title="Cursiva" icon={faItalic} />
          <ToolbarButton onClick={() => e.chain().focus().toggleUnderline().run()} active={e.isActive("underline")} title="Subrayado" icon={faUnderline} />
          <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          <ToolbarButton onClick={() => e.chain().focus().toggleHeading({ level: 1 }).run()} active={e.isActive("heading", { level: 1 })} title="Título 1" label="H1" />
          <ToolbarButton onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} active={e.isActive("heading", { level: 2 })} title="Título 2" label="H2" />
          <ToolbarButton onClick={() => e.chain().focus().setParagraph().run()} active={e.isActive("paragraph")} title="Párrafo" icon={faHeading} />
          <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          <ToolbarButton onClick={() => e.chain().focus().setTextAlign("left").run()} active={e.isActive({ textAlign: "left" })} title="Alinear izquierda" icon={faAlignLeft} />
          <ToolbarButton onClick={() => e.chain().focus().setTextAlign("center").run()} active={e.isActive({ textAlign: "center" })} title="Centrar" icon={faAlignCenter} />
          <ToolbarButton onClick={() => e.chain().focus().setTextAlign("right").run()} active={e.isActive({ textAlign: "right" })} title="Alinear derecha" icon={faAlignRight} />
          <ToolbarButton onClick={() => e.chain().focus().setTextAlign("justify").run()} active={e.isActive({ textAlign: "justify" })} title="Justificar" icon={faAlignJustify} />
          <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          <ToolbarButton onClick={() => e.chain().focus().toggleBulletList().run()} active={e.isActive("bulletList")} title="Lista con viñetas" icon={faListUl} />
          <ToolbarButton onClick={() => e.chain().focus().toggleOrderedList().run()} active={e.isActive("orderedList")} title="Lista numerada" icon={faListOl} />
          <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          <ToolbarButton onClick={() => e.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: false }).run()} title="Insertar tabla" icon={faTable} />
          <ToolbarButton onClick={() => e.chain().focus().setHorizontalRule().run()} title="Línea divisoria" icon={faMinus} />
          <span className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          <ToolbarButton onClick={() => e.chain().focus().undo().run()} title="Deshacer" icon={faRotateLeft} />
          <ToolbarButton onClick={() => e.chain().focus().redo().run()} title="Rehacer" icon={faRotateRight} />
        </div>

        {/* Área de edición. El click en el padding también enfoca (el editable no cubre ese margen). */}
        <div
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget && !e.isFocused) {
              ev.preventDefault();
              e.chain().focus("end").run();
            }
          }}
          className="bg-white dark:bg-gray-900 rounded-b-md px-4 py-3 overflow-y-auto cursor-text text-sm text-gray-900 dark:text-gray-100
            [&_.ProseMirror]:outline-none
            [&_.ProseMirror_p]:mb-2
            [&_.ProseMirror_h1]:text-xl [&_.ProseMirror_h1]:font-bold [&_.ProseMirror_h1]:mb-2
            [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-bold [&_.ProseMirror_h2]:mb-2
            [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ul]:mb-2
            [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_ol]:mb-2
            [&_.ProseMirror_table]:border-collapse [&_.ProseMirror_table]:w-full [&_.ProseMirror_table]:my-2
            [&_.ProseMirror_td]:border [&_.ProseMirror_td]:border-gray-400 [&_.ProseMirror_td]:p-1.5
            [&_.ProseMirror_th]:border [&_.ProseMirror_th]:border-gray-400 [&_.ProseMirror_th]:p-1.5 [&_.ProseMirror_th]:bg-gray-100 dark:[&_.ProseMirror_th]:bg-gray-800
            [&_.ProseMirror_hr]:my-3 [&_.ProseMirror_hr]:border-gray-300
            [&_.tiptap-variable]:text-amber-600 [&_.tiptap-variable]:font-semibold
            [&_.tiptap-variable]:bg-amber-100 [&_.tiptap-variable]:rounded [&_.tiptap-variable]:px-0.5
            dark:[&_.tiptap-variable]:text-amber-300 dark:[&_.tiptap-variable]:bg-amber-400/15"
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      {variablesAbierto && <ModalVariables grupos={groups} titulo={variablesTitle} onCerrar={() => setVariablesAbierto(false)} />}
    </div>
  );
};
