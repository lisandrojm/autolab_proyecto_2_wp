import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faEdit, faTrash, faEye, faFileSignature, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { RichTextEditor, RichTextViewer } from "../components/ui/RichTextEditor";
import { sweetAlert } from "../utils/sweetAlert";
import { terminosCondicionesAPI, TerminosInput, TerminosItem } from "../api/terminosCondiciones";

/*
  TÉRMINOS Y CONDICIONES DEL REGISTRO.

  Lo que tiene que aceptar quien se registra con un link antes de terminar. Puede haber varios
  cargados, pero uno solo VIGENTE: ése es el que muestra el formulario. Sin ninguno vigente, el
  registro no pide aceptar nada.

  Editar el texto NO reescribe lo que otros aceptaron: el server guarda la versión anterior y sube el
  número. Por eso tampoco se puede borrar uno que alguien aceptó — es la constancia de lo que firmó.
*/

const FORM_VACIO: TerminosInput = { titulo: "", contenido: "", vigente: true };

const normalizar = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const fechaCorta = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

export const TerminosCondicionesPage: React.FC = () => {
  const [items, setItems] = useState<TerminosItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  const [editando, setEditando] = useState<TerminosItem | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState<TerminosInput>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  /** Lo que se está previsualizando: el formulario abierto o una fila de la tabla. */
  const [vistaPrevia, setVistaPrevia] = useState<{ titulo: string; contenido: string } | null>(null);

  const cargar = async () => {
    try {
      setItems(await terminosCondicionesAPI.list());
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudieron cargar los términos y condiciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return q ? items.filter((t) => normalizar(t.titulo).includes(q)) : items;
  }, [items, busqueda]);

  const abrirCrear = () => {
    setEditando(null);
    // El primero que se carga nace vigente; con otro ya vigente, arranca como borrador.
    setForm({ ...FORM_VACIO, vigente: !items.some((t) => t.vigente) });
    setModalAbierto(true);
  };

  const abrirEditar = (t: TerminosItem) => {
    setEditando(t);
    setForm({ titulo: t.titulo, contenido: t.contenido, vigente: t.vigente });
    setModalAbierto(true);
  };

  const guardar = async () => {
    if (!form.titulo.trim()) {
      sweetAlert.error("Falta el título", "Poné un título: es lo que ve la persona arriba del texto.");
      return;
    }
    if (!form.contenido.replace(/<[^>]*>/g, "").trim()) {
      sweetAlert.error("Falta el texto", "Escribí los términos y condiciones.");
      return;
    }
    /*
      Marcar vigente uno nuevo deja de usar el que estaba: se avisa, porque desde ese momento el
      registro pide aceptar otro texto.
    */
    const otroVigente = items.find((t) => t.vigente && t._id !== editando?._id);
    if (form.vigente && otroVigente) {
      const r = await sweetAlert.confirm("¿Reemplazar los vigentes?", `«${otroVigente.titulo}» deja de estar vigente y quien se registre de ahora en más va a tener que aceptar «${form.titulo.trim()}».`, "Sí, reemplazar");
      if (!r.isConfirmed) return;
    }
    try {
      setGuardando(true);
      if (editando) await terminosCondicionesAPI.update(editando._id, { ...form, titulo: form.titulo.trim() });
      else await terminosCondicionesAPI.create({ ...form, titulo: form.titulo.trim() });
      setModalAbierto(false);
      sweetAlert.success(editando ? "Términos actualizados" : "Términos creados", form.vigente ? "Son los que se aceptan al registrarse." : "Quedaron guardados sin estar vigentes.");
      cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudieron guardar los términos y condiciones.");
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (t: TerminosItem) => {
    const r = await sweetAlert.confirm("¿Eliminar términos y condiciones?", `Se eliminará «${t.titulo}».${t.vigente ? " Son los vigentes: el registro va a dejar de pedir que se acepten." : ""} Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!r.isConfirmed) return;
    try {
      await terminosCondicionesAPI.remove(t._id);
      sweetAlert.success("Eliminados", "Los términos y condiciones fueron eliminados.");
      cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo eliminar", e?.response?.data?.error || "Probá de nuevo en un momento.");
    }
  };

  return (
    <PageLayout
      title="Términos y condiciones"
      subtitle="Lo que acepta quien se registra con un link, antes de terminar el registro."
      faIcon={{ icon: faFileSignature }}
      itemCount={items.length}
      infoModal={{
        isOpen: ayudaAbierta,
        onOpen: () => setAyudaAbierta(true),
        onClose: () => setAyudaAbierta(false),
        title: "Términos y condiciones",
        content: (
          <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
            <p>
              Al final del registro con link aparece una casilla <strong>«Leí y acepto los términos y condiciones»</strong>, con el texto a un click. Sin tildarla no se puede terminar el registro.
            </p>
            <p>
              Se muestran los que están <strong>vigentes</strong>, y hay uno solo por vez. Si ninguno está vigente, el registro no pide aceptar nada.
            </p>
            <p>
              <strong>Editar el texto no cambia lo que otros aceptaron.</strong> Cada cambio crea una versión nueva, y la persona queda registrada con la versión que leyó y la fecha en que la aceptó.
            </p>
            <p>Por lo mismo, no se pueden borrar unos términos que alguien ya aceptó: si no se usan más, sacales «Vigente».</p>
          </div>
        ),
      }}
      headerActions={
        <button onClick={abrirCrear} title="Nuevos términos y condiciones" aria-label="Nuevos términos y condiciones" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
          <FontAwesomeIcon icon={faPlus} />
        </button>
      }
      searchAndFilters={<SearchAndFilters searchTerm={busqueda} onSearchChange={setBusqueda} searchPlaceholder="Buscar por título..." />}
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando términos y condiciones..." />
        </div>
      ) : filtrados.length === 0 ? (
        <EmptyState icon={faFileSignature} title={busqueda ? "Sin resultados" : "Todavía no hay términos y condiciones"} description={busqueda ? "Probá con otra búsqueda." : "Cargá los primeros: mientras no haya ninguno vigente, el registro no pide aceptar nada."} />
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Título</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 font-semibold">Versión</th>
                  <th className="px-4 py-3 font-semibold">Aceptaciones</th>
                  <th className="px-4 py-3 font-semibold">Modificado</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtrados.map((t) => (
                  <tr key={t._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100">{t.titulo}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${t.vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>{t.vigente ? "Vigente" : "No vigente"}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">v{t.version}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{t.aceptaciones}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{fechaCorta(t.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setVistaPrevia({ titulo: t.titulo, contenido: t.contenido })} title="Ver cómo se muestra en el registro" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <FontAwesomeIcon icon={faEye} className="h-4 w-4" />
                        </button>
                        <button onClick={() => abrirEditar(t)} title="Editar" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button onClick={() => eliminar(t)} title="Eliminar" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editando ? "Editar términos y condiciones" : "Nuevos términos y condiciones"}
        subtitle={editando ? `Versión ${editando.version}` : undefined}
        size="xl"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <button type="button" onClick={() => setVistaPrevia({ titulo: form.titulo, contenido: form.contenido })} className="btn-secondary flex items-center gap-2">
              <FontAwesomeIcon icon={faEye} />
              Previsualizar
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => setModalAbierto(false)} className="btn-secondary" disabled={guardando}>
                Cancelar
              </button>
              <button onClick={guardar} className="btn-primary" disabled={guardando}>
                {guardando ? "Guardando..." : editando ? "Actualizar" : "Crear"}
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Editar lo que ya aceptó alguien no le cambia lo aceptado: se dice antes de guardar, no después. */}
          {editando && editando.aceptaciones > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {editando.aceptaciones === 1 ? "1 persona ya los aceptó" : `${editando.aceptaciones} personas ya los aceptaron`}. Si cambiás el texto se crea la versión {editando.version + 1}: quien aceptó la {editando.version} queda registrado con la que leyó.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Título *</label>
            <input className="input-field w-full" value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} placeholder="Ej: Términos y condiciones de uso" />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.vigente} onChange={(e) => setForm((p) => ({ ...p, vigente: e.target.checked }))} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
            <span className="text-gray-700 dark:text-gray-300">Vigentes: son los que se aceptan al registrarse</span>
          </label>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Texto *</label>
            <RichTextEditor value={form.contenido} onChange={(html) => setForm((p) => ({ ...p, contenido: html }))} minHeight="280px" />
          </div>
        </div>
      </Modal>

      {/* Tal cual se va a leer en el registro. */}
      <Modal isOpen={!!vistaPrevia} onClose={() => setVistaPrevia(null)} title={vistaPrevia?.titulo || "Términos y condiciones"} subtitle="Así se ve en el registro" size="lg" zIndex={120}>
        {vistaPrevia && <RichTextViewer html={vistaPrevia.contenido} className="text-sm text-gray-800 dark:text-gray-200" />}
      </Modal>
    </PageLayout>
  );
};

export default TerminosCondicionesPage;
