import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faChevronRight, faSearch, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";
import { CategoriaSatItem } from "../../../../../api/categoriasSat";
import { ChipSinValorar, ChipValoracion } from "../../../../../components/proyectos/ChipValoracion";
import { fuzzyMatch } from "../../../../../utils/searchHelpers";

/*
  LA CATEGORÍA, COMO SE ELIGE EN EL ALTA INDIVIDUAL: el campo, la ventana con buscador y el detalle
  de la escala.

  Vivían adentro de `UserRegistrationModal`. Las plantillas de equipo la piden por puesto y por
  persona, y la dibujaban con un <select> pelado: sin el nivel al lado, sin buscador, sin la escala.
  Es la misma decisión —qué categoría del convenio le corresponde a esta persona en este proyecto—,
  así que es el mismo componente.

  Quien lo usa le pasa LA OFERTA ya calculada (`categoriasOfrecidas`, la misma función del escritorio):
  qué categorías se ofrecen, el nivel de cada una, y por qué quedaron afuera las que quedaron. Acá
  sólo se dibuja y se elige.
*/

export interface Nivel {
  nombre: string;
  color: string;
}

/** Lo que la ventana necesita saber de las categorías que se ofrecen. */
export interface OfertaDeCategorias {
  documentos: CategoriaSatItem[];
  nivelDe: (cat: CategoriaSatItem) => Nivel | null;
  /** La función FRAME tiene categorías, pero ninguna de este convenio: se muestran todas y se avisa. */
  rolNoTieneCategoriasDelConvenio: boolean;
  /** La función tiene categorías valoradas, pero ninguna de la valoración del proyecto. */
  rolNoTieneCategoriasDeLaValoracion: boolean;
  /** Las que dejó afuera la valoración del proyecto. */
  ocultasPorValoracion: number;
}

const pesos = (n?: number): string => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }) : "—");
const fechaDeEscala = (v?: string | Date): string => {
  if (!v) return "—";
  const d = new Date(v as any);
  return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("es-AR");
};
/** Una fila etiqueta/importe del detalle de la escala. */
const FilaEscala: React.FC<{ label: string; valor: string; destacado?: boolean }> = ({ label, valor, destacado }) => (
  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-0 dark:border-slate-800">
    <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    <span className={`text-right text-sm ${destacado ? "font-black text-emerald-600 dark:text-emerald-400" : "font-semibold text-slate-900 dark:text-slate-100"}`}>{valor}</span>
  </div>
);

/** El campo: la categoría elegida con su nivel, o «Elegí la categoría…». Toca y abre la ventana. */
export function CampoCategoria({ categoria, nivel, onAbrir, deshabilitado, motivoDeshabilitado, obligatorio = true, marca, aviso }: { categoria: CategoriaSatItem | null; nivel: Nivel | null; onAbrir: () => void; deshabilitado?: boolean; motivoDeshabilitado?: string; obligatorio?: boolean; marca?: React.ReactNode; /** Algo que la cascada limpió sola, para que no parezca un error de la pantalla. */ aviso?: string }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <FontAwesomeIcon icon={faBriefcase} className="text-[10px] text-blue-500" />
        Categoría{obligatorio ? "*" : ""}
        {marca}
      </label>
      <button
        type="button"
        onClick={() => !deshabilitado && onAbrir()}
        disabled={deshabilitado}
        title={deshabilitado ? motivoDeshabilitado : undefined}
        className="flex h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
      >
        {categoria ? (
          <>
            {/* Sin el código de ARCA: acá tapaba el nombre. */}
            <span className="truncate text-sm text-slate-900 dark:text-white">{categoria.name}</span>
            {/* Siempre se dice el nivel, también cuando no lo tiene: es lo que se compara contra el del proyecto. */}
            {nivel ? <ChipValoracion nombre={nivel.nombre} color={nivel.color} className="shrink-0" /> : <ChipSinValorar className="shrink-0" title="Esta categoría no tiene valoración cargada en la función." />}
          </>
        ) : (
          <>
            <FontAwesomeIcon icon={faSearch} className="shrink-0 text-sm text-slate-400" />
            <span className="text-slate-400">{deshabilitado && motivoDeshabilitado ? motivoDeshabilitado : "Elegí la categoría…"}</span>
          </>
        )}
      </button>
      {aviso && <p className="text-[11px] text-amber-600 dark:text-amber-400">{aviso}</p>}
    </div>
  );
}

interface ModalProps {
  abierto: boolean;
  onCerrar: () => void;
  /** «Del convenio 0634/11». */
  subtitulo?: string;
  oferta: OfertaDeCategorias;
  verTodasDelConvenio: boolean;
  onVerTodasDelConvenio: () => void;
  categoriaId: string;
  onElegir: (categoriaId: string) => void;
  zIndex?: number;
}

/**
 * La ventana: buscador (por nombre y por código de ARCA), una fila por categoría con su radio y su
 * nivel, y el grupo («G4 ›») que abre la escala sin elegir. Tocar la fila elige y cierra.
 */
export function ModalCategoria({ abierto, onCerrar, subtitulo, oferta, verTodasDelConvenio, onVerTodasDelConvenio, categoriaId, onElegir, zIndex = 80 }: ModalProps) {
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<CategoriaSatItem | null>(null);
  useEffect(() => {
    if (!abierto) {
      setBusqueda("");
      setDetalle(null);
    }
  }, [abierto]);
  const q = busqueda.trim();
  // El buscador SIGUE encontrando por código aunque el código no se muestre: quien lo tenga a mano lo puede pegar.
  const lista = q ? oferta.documentos.filter((c) => fuzzyMatch(c.name, busqueda) || String(c.data?.codigoArca || "").includes(q)) : oferta.documentos;
  const elegir = (id: string) => {
    onElegir(id);
    setDetalle(null);
    onCerrar();
  };

  return (
    <>
      <Modal
        isOpen={abierto}
        onClose={onCerrar}
        title="Categoría"
        subtitle={subtitulo}
        size="md"
        zIndex={zIndex}
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <button type="button" onClick={onCerrar} className="rounded-lg bg-blue-500 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
              Listo
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {oferta.rolNoTieneCategoriasDelConvenio && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">El rol empresa de esta persona no tiene categorías de este convenio, así que se muestran todas las del convenio.</p>}
          {/* La valoración va DESPUÉS del convenio, que es el orden en que se aplican: primero lo que ARCA no acepta, después lo que no corresponde a este proyecto. */}
          {oferta.rolNoTieneCategoriasDeLaValoracion && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">El rol empresa no tiene categorías de la valoración de este proyecto, así que se muestran todas.</p>}
          {oferta.ocultasPorValoracion > 0 && <p className="px-1 text-[11px] text-slate-500 dark:text-slate-400">Se ocultaron {oferta.ocultasPorValoracion} de otra valoración: no corresponden al nivel de este proyecto.</p>}

          {!verTodasDelConvenio && !oferta.rolNoTieneCategoriasDelConvenio && (
            <button type="button" onClick={onVerTodasDelConvenio} className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400">
              ¿No está la que buscás? Ver todas las de este convenio
            </button>
          )}

          <input type="text" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar categoría…" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium outline-none dark:border-slate-700 dark:bg-slate-900" />

          <div className="grid max-h-[45vh] grid-cols-1 gap-2 overflow-y-auto pr-1">
            {lista.length === 0 ? (
              <p className="py-8 text-center text-xs italic text-slate-400">{q ? `No hay categorías que coincidan con "${busqueda}"` : "No hay categorías para este convenio."}</p>
            ) : (
              lista.map((cat) => {
                const elegida = cat._id === categoriaId;
                const grupo = cat.data?.numeroCategoria;
                const n = oferta.nivelDe(cat);
                return (
                  <div key={cat._id} className={`flex items-center gap-2 rounded-lg border p-3 transition-all ${elegida ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-400" : "border-slate-100 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"}`}>
                    {/* Tocar la fila ELIGE, que es a lo que se viene. Ver la escala es el otro botón. */}
                    <button type="button" onClick={() => elegir(cat._id)} aria-pressed={elegida} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${elegida ? "border-blue-600" : "border-slate-300 dark:border-slate-600"}`}>{elegida && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{cat.name}</span>
                      {n ? <ChipValoracion nombre={n.nombre} color={n.color} className="shrink-0" /> : <ChipSinValorar className="shrink-0" title="Sin valoración cargada en esta función: se ofrece en cualquier proyecto." />}
                    </button>
                    {/* El grupo. Tocarlo abre la escala; NO elige la categoría, para eso es la fila. */}
                    <button type="button" onClick={() => setDetalle(cat)} aria-label={`Ver la escala de ${cat.name}`} className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-500 transition-colors active:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:active:bg-slate-800">
                      <span className="text-[10px] font-bold uppercase tracking-wide">{grupo ? `G${grupo}` : "Sin grupo"}</span>
                      <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Modal>

      {/*
        LA ESCALA DE LA CATEGORÍA: a qué grupo pertenece y cuánto se paga. Los importes son del GRUPO
        y no de la categoría (salvo en los convenios sin grupos): se dice cuál de los dos casos es.
      */}
      <Modal
        isOpen={!!detalle}
        onClose={() => setDetalle(null)}
        title={detalle?.name || "Categoría"}
        subtitle={detalle?.data?.codigoArca ? `Código ARCA ${detalle.data.codigoArca}` : undefined}
        size="md"
        zIndex={zIndex + 10}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <button type="button" onClick={() => setDetalle(null)} className="px-4 py-2.5 text-sm font-bold text-slate-500 transition-colors hover:text-slate-700 dark:hover:text-slate-300">
              Volver
            </button>
            <button type="button" onClick={() => detalle && elegir(detalle._id)} className="rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
              {detalle && detalle._id === categoriaId ? "Seguir con esta" : "Elegir esta categoría"}
            </button>
          </div>
        }
      >
        {detalle &&
          (() => {
            const d: any = detalle.data || {};
            const vencida = d.vigenciaHasta ? new Date(d.vigenciaHasta).getTime() < Date.now() : false;
            return (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Grupo</p>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{d.numeroCategoria ? `Grupo ${d.numeroCategoria}${d.grupoNombre ? ` — ${d.grupoNombre}` : ""}` : "Sin grupo"}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {d.escalaOrigen === "grupo" ? "Los importes son los del grupo: los comparten todas sus categorías." : d.escalaOrigen === "categoria" ? "Este convenio no publica grupos, así que la escala es de esta categoría." : "No tiene escala cargada. El alta ante ARCA necesita la retribución, así que hay que cargarla desde Configuración → ARCA → Categorías."}
                  </p>
                </div>
                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                  <FilaEscala label="Sueldo básico" valor={pesos(d.sueldoBasico)} />
                  <FilaEscala label="Adicional" valor={pesos(d.sueldoAdicional)} />
                  <FilaEscala label="Sueldo bruto" valor={pesos(d.sueldoBruto)} destacado />
                  <FilaEscala label="Presentismo" valor={pesos(d.presentismo)} />
                  <FilaEscala label="Neto" valor={pesos(d.neto)} />
                  <FilaEscala label="Actualización" valor={fechaDeEscala(d.fechaActualizacion)} />
                  {d.vigenciaHasta && <FilaEscala label="Vigencia hasta" valor={fechaDeEscala(d.vigenciaHasta)} />}
                </div>
                {vencida && (
                  <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3 w-3 shrink-0" />
                    La escala venció el {fechaDeEscala(d.vigenciaHasta)}: la solicitud se manda igual, con el último importe pactado.
                  </p>
                )}
              </div>
            );
          })()}
      </Modal>
    </>
  );
}
