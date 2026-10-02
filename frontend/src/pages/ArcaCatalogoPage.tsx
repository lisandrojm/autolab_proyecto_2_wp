import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBook, faRotate, faSpinner, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { arcaCatalogoAPI, EmpleadoraCatalogo, LecturaCatalogoArca, DIAS_CATALOGO_VIEJO } from "../api/arcaCatalogo";
import { sweetAlert } from "../utils/sweetAlert";

/**
 * ARCA → CATÁLOGO: el espejo de lo que ARCA publica, y cómo se mantiene al día.
 *
 * Se lee desde ARCA con el Chromium del servidor, por empleadora (cada CUIT ve sus convenios y
 * domicilios), y NO se aplica solo: queda un diff pendiente con tres listas —nuevos, dejaron de
 * publicarse, descripción cambiada— y qué categorías y contratos toca cada cambio. Se aplica o se
 * descarta acá, con confirmación.
 */
const fecha = (s?: string | null) => (s ? new Date(s).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "nunca");
const diasDesde = (s?: string | null) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 86_400_000) : null);

const ListaFilas: React.FC<{ titulo: string; filas: LecturaCatalogoArca["diff"]["nuevos"]; tono: string }> = ({ titulo, filas, tono }) =>
  filas.length === 0 ? null : (
    <div>
      <p className={`text-xs font-bold uppercase tracking-wider mb-1 ${tono}`}>
        {titulo} ({filas.length})
      </p>
      <div className="max-h-56 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 text-xs">
        {filas.map((f) => (
          <div key={`${f.tabla}|${f.filtroPadre}|${f.codigo}`} className="px-2 py-1 flex gap-2">
            <span className="font-mono text-gray-500 shrink-0">{f.tabla}</span>
            {f.filtroPadre && <span className="font-mono text-gray-500 shrink-0">{f.filtroPadre}</span>}
            <span className="font-mono shrink-0">{f.codigo}</span>
            <span className="flex-1">
              {f.descripcionAnterior ? (
                <>
                  <span className="line-through text-gray-400">{f.descripcionAnterior}</span> → {f.descripcion}
                </>
              ) : (
                f.descripcion
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

export const ArcaCatalogoPage: React.FC = () => {
  const [empleadoras, setEmpleadoras] = useState<EmpleadoraCatalogo[]>([]);
  const [lecturas, setLecturas] = useState<LecturaCatalogoArca[]>([]);
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [eventos, setEventos] = useState<any[]>([]);
  const intervalo = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    const [e, l] = await Promise.all([arcaCatalogoAPI.empleadoras().catch(() => []), arcaCatalogoAPI.lecturas().catch(() => [])]);
    setEmpleadoras(e);
    setLecturas(l);
  }, []);
  useEffect(() => {
    void cargar();
    return () => {
      if (intervalo.current) window.clearInterval(intervalo.current);
    };
  }, [cargar]);

  const leer = async (e: EmpleadoraCatalogo) => {
    try {
      await arcaCatalogoAPI.sincronizar(e._id);
      setLeyendo(e.razonSocial);
      setEventos([]);
      intervalo.current = window.setInterval(async () => {
        const r = await arcaCatalogoAPI.estadoSincronizacion().catch(() => null);
        if (!r) return;
        setEventos(r.eventos || []);
        if (!r.corriendo) {
          if (intervalo.current) window.clearInterval(intervalo.current);
          setLeyendo(null);
          if (r.error) sweetAlert.error("No se pudo leer el catálogo", r.error);
          await cargar();
        }
      }, 2000);
    } catch (err: any) {
      sweetAlert.error("No se pudo arrancar", err?.response?.data?.error || err?.message || "");
    }
  };

  const aplicar = async (l: LecturaCatalogoArca) => {
    const ok = await sweetAlert.confirm("¿Aplicar esta lectura al catálogo?", `${l.diff.nuevos.length} nuevos, ${l.diff.dejaronDePublicarse.length} dejan de ser vigentes, ${l.diff.descripcionCambiada.length} con descripción cambiada. Las categorías afectadas pasan a revisión.`, "Aplicar", "Cancelar");
    if (!ok.isConfirmed) return;
    try {
      await arcaCatalogoAPI.aplicar(l._id);
      sweetAlert.success("Catálogo actualizado", "Los cambios se aplicaron al espejo de ARCA.");
      await cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo aplicar", err?.response?.data?.error || "");
    }
  };
  const descartar = async (l: LecturaCatalogoArca) => {
    await arcaCatalogoAPI.descartar(l._id).catch(() => {});
    await cargar();
  };

  const pendientes = lecturas.filter((l) => l.estado === "pendiente");

  return (
    <PageLayout
      title="Catálogo de ARCA"
      subtitle="Lo que ARCA publica, tal cual: contra esto se validan los códigos de las categorías y de cada alta. No se edita a mano."
      faIcon={{ icon: faBook }}
      searchAndFilters={
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Empleadora</th>
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-500 uppercase">Última lectura desde ARCA</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                {empleadoras.map((e) => {
                  const d = diasDesde(e.ultimaLectura);
                  const vieja = d === null || d > DIAS_CATALOGO_VIEJO;
                  return (
                    <tr key={e._id}>
                      <td className="px-4 py-2">
                        {e.razonSocial} <span className="font-mono text-xs text-gray-500">{e.cuit}</span>
                      </td>
                      <td className={`px-4 py-2 text-xs ${vieja ? "text-amber-700 dark:text-amber-400 font-semibold" : "text-gray-600 dark:text-gray-300"}`}>
                        {fecha(e.ultimaLectura)}
                        {d !== null ? ` · hace ${d} día(s)` : ""}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" onClick={() => leer(e)} disabled={!!leyendo} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                          <FontAwesomeIcon icon={leyendo === e.razonSocial ? faSpinner : faRotate} spin={leyendo === e.razonSocial} className="h-3 w-3" />
                          Leer de ARCA
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {leyendo && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Leyendo el catálogo con {leyendo}… {eventos.length ? `(${eventos[eventos.length - 1]?.tipo})` : ""}
            </p>
          )}

          {pendientes.map((l) => (
            <div key={l._id} className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold">
                  Lectura pendiente · {l.empresaRazonSocial || l.empresaCuit} · {fecha(l.fecha)}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => descartar(l)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-semibold">
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" /> Descartar
                  </button>
                  <button type="button" onClick={() => aplicar(l)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-blue-700">
                    <FontAwesomeIcon icon={faCheck} className="h-3 w-3" /> Aplicar
                  </button>
                </div>
              </div>
              {l.error && <p className="text-xs text-amber-800 dark:text-amber-300">{l.error}</p>}
              {(l.impacto || []).length > 0 && (
                <div className="rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-2 text-xs text-red-800 dark:text-red-300">
                  <p className="font-semibold mb-1">Cambios que tocan categorías en uso:</p>
                  {(l.impacto || []).map((i) => (
                    <p key={`${i.convenio}|${i.codigo}`}>
                      {i.convenio} {i.codigo} ({i.tipo === "descripcion_cambiada" ? "descripción cambiada" : "ya no se publica"}): {i.categorias.join(", ")} · {i.contratos} contrato(s)
                    </p>
                  ))}
                </div>
              )}
              <ListaFilas titulo="Nuevos" filas={l.diff.nuevos} tono="text-green-700 dark:text-green-400" />
              <ListaFilas titulo="Dejaron de publicarse" filas={l.diff.dejaronDePublicarse} tono="text-red-700 dark:text-red-400" />
              <ListaFilas titulo="Descripción cambiada" filas={l.diff.descripcionCambiada} tono="text-amber-700 dark:text-amber-400" />
            </div>
          ))}

          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Últimas lecturas</p>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 text-xs bg-white dark:bg-gray-800">
              {lecturas.map((l) => (
                <div key={l._id} className="px-3 py-2 flex gap-3 flex-wrap">
                  <span className="text-gray-500">{fecha(l.fecha)}</span>
                  <span>{l.origen === "csv" ? "Semilla (CSV del repo)" : l.empresaRazonSocial || l.empresaCuit}</span>
                  <span className="text-gray-500">
                    +{l.diff?.nuevos?.length || 0} · −{l.diff?.dejaronDePublicarse?.length || 0} · ~{l.diff?.descripcionCambiada?.length || 0}
                  </span>
                  <span className="font-semibold">{l.estado}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      }
      children={null}
    />
  );
};

export default ArcaCatalogoPage;
