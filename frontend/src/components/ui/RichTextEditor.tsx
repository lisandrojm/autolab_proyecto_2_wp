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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBold, faItalic, faUnderline, faListUl, faListOl, faAlignLeft, faAlignCenter, faAlignRight, faAlignJustify, faTable, faHeading, faRotateLeft, faRotateRight, faMinus, faSearch, faLock } from "@fortawesome/free-solid-svg-icons";

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
}

interface RichTextEditorProps {
  /** HTML del contenido */
  value: string;
  onChange: (html: string) => void;
  /**
   * Variables clickeables (ej: "{nombre}"); al hacer click se insertan en el cursor.
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
 * El panel de arriba sirve mientras el documento es corto. En un contrato de veinte carillas hay que
 * volver hasta el principio para insertar una variable, y al volver ya se perdió dónde se estaba
 * escribiendo. Como la barra queda fija, desde acá se llega siempre sin moverse del lugar.
 *
 * Inserta en el cursor en vez de copiar al portapapeles: pegar a mano es un paso más y se presta a
 * pegar `{{nombre}}` con un espacio de más adentro, que no lo reemplaza nadie.
 */
export const ModalVariables: React.FC<{
  grupos: VariableGroup[];
  titulo: string;
  onElegir: (v: string) => void;
  onCerrar: () => void;
  /** Variables que no se pueden sacar del patrón; se marcan con candado (lo usa Nomenclatura). */
  obligatorias?: string[];
  /** Ayuda por variable, para el tooltip del chip. */
  descripciones?: Record<string, string>;
}> = ({ grupos, titulo, onElegir, onCerrar, obligatorias = [], descripciones = {} }) => {
  const [q, setQ] = useState("");
  const buscarRef = useRef<HTMLInputElement>(null);
  useEffect(() => buscarRef.current?.focus(), []);

  const term = q.trim().toLowerCase();
  const filtrados = grupos.map((g) => ({ ...g, vars: g.vars.filter((v) => !term || v.toLowerCase().includes(term) || g.grupo.toLowerCase().includes(term)) })).filter((g) => g.vars.length > 0);
  const total = filtrados.reduce((n, g) => n + g.vars.length, 0);

  return (
    <Modal isOpen onClose={onCerrar} title={titulo} subtitle="Se inserta donde tenías el cursor" size="lg" zIndex={80}>
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
                {g.grupo && <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">{g.grupo}</p>}
                <div className="flex flex-wrap gap-1.5">
                  {g.vars.map((v) => {
                    const obligatoria = obligatorias.includes(v);
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onElegir(v)}
                        title={obligatoria ? `${descripciones[v] || ""} — OBLIGATORIA: sin esto el archivo no se puede reencontrar al volver`.trim() : descripciones[v]}
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

  const insertVariable = (v: string) => editor?.chain().focus().insertContent(v).run();
  const groups = toGroups(variables);
  const [variablesAbierto, setVariablesAbierto] = useState(false);

  /**
   * Cerrar PRIMERO y recién después insertar.
   *
   * Mientras el modal está montado se lleva el foco, y el `focus()` del editor pelearía con él. Con
   * el modal desmontado, TipTap restituye la selección que había guardada y la variable cae donde
   * estaba el cursor, que es todo el punto de esto.
   */
  const elegirDesdeModal = (v: string) => {
    setVariablesAbierto(false);
    requestAnimationFrame(() => insertVariable(v));
  };

  if (!editor) return null;
  const e = editor as Editor;

  return (
    <div className="space-y-2">
      {groups.length > 0 && (
        <div className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded p-3">
          <h4 className="font-semibold text-xs text-gray-600 dark:text-gray-300 mb-3">{variablesTitle}</h4>
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.grupo}>
                {g.grupo && <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1.5">{g.grupo}</p>}
                <div className="flex flex-wrap gap-1">
                  {g.vars.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      title="Insertar en el cursor"
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-400 px-2 py-1 rounded text-xs font-mono text-gray-700 dark:text-gray-300 transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

          {/* Va al final y separado: no es formato, es insertar contenido. Y va DENTRO de la barra
              justamente porque la barra es lo único que queda a mano en un documento largo. */}
          {groups.length > 0 && (
            <button
              type="button"
              onClick={() => setVariablesAbierto(true)}
              title="Insertar una variable donde está el cursor"
              className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              <span className="font-mono">{"{{ }}"}</span>
              Variables
            </button>
          )}
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

      {variablesAbierto && <ModalVariables grupos={groups} titulo={variablesTitle} onElegir={elegirDesdeModal} onCerrar={() => setVariablesAbierto(false)} />}
    </div>
  );
};
