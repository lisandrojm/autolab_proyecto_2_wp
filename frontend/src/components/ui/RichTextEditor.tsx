import React, { useEffect } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faBold, faItalic, faUnderline, faListUl, faListOl, faAlignLeft, faAlignCenter, faAlignRight, faAlignJustify, faTable, faHeading, faRotateLeft, faRotateRight, faMinus } from "@fortawesome/free-solid-svg-icons";

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

      <div className="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-2 py-1.5">
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
          className="bg-white dark:bg-gray-900 px-4 py-3 overflow-y-auto cursor-text text-sm text-gray-900 dark:text-gray-100
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
    </div>
  );
};
