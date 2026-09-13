import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faToggleOn, faMobileAlt, faUserShield, faBriefcase, faShieldHalved, faSearch, faLock } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { useAuthStore } from "../stores/authStore";
import { rolesAPI } from "../api/roles";
import { sweetAlert } from "../utils/sweetAlert";
import { AVAILABLE_PERMISSIONS, MODULE_LABELS, SUPERADMIN_ONLY_PERMISSIONS } from "./RolesPage";
import { MOBILE_GRUPOS, MOBILE_ITEMS } from "../utils/permisosMobile";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PERMISOS: CUÁLES SE PUEDEN ASIGNAR, PARA TODA LA PLATAFORMA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Un permiso INACTIVO está en desarrollo: se sigue viendo en el editor de cada rol, pero con el check
 * bloqueado y el rótulo «En desarrollo», así nadie habilita algo sin terminar. Es una sola lista para
 * toda la plataforma —lo que no está terminado no lo está para nadie—, y por eso se maneja acá, de una
 * vez, y no rol por rol. Sólo el SuperAdmin la cambia; el server rechaza cualquier otro intento y,
 * al guardar un rol, cualquier cambio sobre un permiso inactivo.
 *
 * Los grupos y los nombres son los MISMOS del editor de roles (se importan de ahí): si esta pantalla
 * los tuviera propios, se desfasarían y no se sabría qué se está apagando.
 */

interface ItemPermiso {
  permiso: string;
  label: string;
  ayuda?: string;
}

interface GrupoPermisos {
  clave: string;
  titulo: string;
  descripcion?: string;
  items: ItemPermiso[];
}

interface Seccion {
  titulo: string;
  icono: any;
  grupos: GrupoPermisos[];
}

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const Interruptor: React.FC<{ activo: boolean; onClick: () => void; disabled?: boolean; titulo: string }> = ({ activo, onClick, disabled, titulo }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-pressed={activo} title={titulo} className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold disabled:opacity-50">
    <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${activo ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${activo ? "translate-x-4" : "translate-x-0.5"}`} />
    </span>
    <span className={`w-14 text-left ${activo ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>{activo ? "Activo" : "Inactivo"}</span>
  </button>
);

export const PermisosPage: React.FC = () => {
  const { user } = useAuthStore();
  const esSuperAdmin = user?.primaryRole?.toLowerCase() === "superadmin" || (user?.roles || []).some((r: any) => String(typeof r === "string" ? r : r?.name || "").toLowerCase() === "superadmin");

  /** Los permisos INACTIVOS (en desarrollo). `null` mientras carga. */
  const [inactivos, setInactivos] = useState<Set<string> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    rolesAPI
      .getPermisosEnDesarrollo()
      .then((ps) => setInactivos(new Set(ps)))
      .catch((error: any) => {
        setInactivos(new Set());
        sweetAlert.error("No se pudo cargar", error?.response?.data?.error || "Probá de nuevo en un momento.");
      });
  }, []);

  const secciones: Seccion[] = useMemo(
    () => [
      {
        titulo: "Plataforma",
        icono: faUserShield,
        grupos: Object.entries(AVAILABLE_PERMISSIONS)
          .filter(([clave]) => clave !== "mobile" && clave !== "proyectos")
          .map(([clave, m]) => ({ clave, titulo: m.label, descripcion: m.description, items: m.permissions.map((p) => ({ permiso: p, label: MODULE_LABELS[p] || p })) })),
      },
      {
        titulo: "SuperAdmin",
        icono: faShieldHalved,
        grupos: Object.entries(SUPERADMIN_ONLY_PERMISSIONS).map(([clave, m]) => ({ clave: `superadmin-${clave}`, titulo: m.label, descripcion: m.description, items: m.permissions.map((p) => ({ permiso: p, label: MODULE_LABELS[p] || (p === "*" ? "Acceso Total" : p) })) })),
      },
      {
        titulo: "App Mobile",
        icono: faMobileAlt,
        grupos: MOBILE_GRUPOS.map((grupo) => ({ clave: `mobile-${grupo}`, titulo: grupo, items: MOBILE_ITEMS.filter((i) => i.grupo === grupo).map((i) => ({ permiso: i.permiso, label: i.label, ayuda: i.ayuda })) })),
      },
      {
        titulo: "Proyectos",
        icono: faBriefcase,
        grupos: AVAILABLE_PERMISSIONS.proyectos
          ? [{ clave: "proyectos", titulo: AVAILABLE_PERMISSIONS.proyectos.label, descripcion: AVAILABLE_PERMISSIONS.proyectos.description, items: AVAILABLE_PERMISSIONS.proyectos.permissions.map((p) => ({ permiso: p, label: MODULE_LABELS[p] || p })) }]
          : [],
      },
    ],
    [],
  );

  const todos = useMemo(() => [...new Set(secciones.flatMap((s) => s.grupos.flatMap((g) => g.items.map((i) => i.permiso))))], [secciones]);

  /** Lo que coincide con la búsqueda, sin grupos ni secciones vacías. */
  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return secciones;
    return secciones
      .map((s) => ({ ...s, grupos: s.grupos.map((g) => ({ ...g, items: g.items.filter((i) => normalizar(`${i.label} ${i.permiso} ${g.titulo}`).includes(q)) })).filter((g) => g.items.length > 0) }))
      .filter((s) => s.grupos.length > 0);
  }, [secciones, busqueda]);

  /** Se guarda al instante, la lista entera. Si falla, vuelve a como estaba. */
  const guardar = async (siguiente: Set<string>) => {
    if (!inactivos) return;
    const anterior = inactivos;
    setInactivos(siguiente);
    setGuardando(true);
    try {
      setInactivos(new Set(await rolesAPI.setPermisosEnDesarrollo([...siguiente])));
    } catch (error: any) {
      setInactivos(anterior);
      sweetAlert.error("No se pudo guardar", error?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setGuardando(false);
    }
  };

  const alternar = (permiso: string) => {
    if (!inactivos) return;
    const siguiente = new Set(inactivos);
    if (siguiente.has(permiso)) siguiente.delete(permiso);
    else siguiente.add(permiso);
    guardar(siguiente);
  };

  const ponerGrupo = (permisos: string[], activos: boolean) => {
    if (!inactivos) return;
    const siguiente = new Set(inactivos);
    permisos.forEach((p) => (activos ? siguiente.delete(p) : siguiente.add(p)));
    guardar(siguiente);
  };

  return (
    <PageLayout title="Permisos" subtitle="Cuáles se pueden asignar en los roles. Inactivo = en desarrollo: se ve, pero nadie lo asigna." faIcon={{ icon: faToggleOn }}>
      {!esSuperAdmin ? (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-6 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
          <FontAwesomeIcon icon={faLock} className="text-gray-400" />
          Sólo el SuperAdmin puede cambiar qué permisos están activos.
        </div>
      ) : inactivos === null ? (
        <div className="py-12">
          <LoadingSpinner message="Cargando permisos..." />
        </div>
      ) : (
        <div className="space-y-6">
          {/* RESUMEN Y BÚSQUEDA */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <strong className={inactivos.size > 0 ? "text-amber-600 dark:text-amber-400" : ""}>{inactivos.size}</strong> inactivo{inactivos.size === 1 ? "" : "s"} de {todos.length} permisos
              {guardando && <span className="ml-2 text-xs text-gray-400">Guardando…</span>}
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-600 sm:w-72">
              <FontAwesomeIcon icon={faSearch} className="h-3.5 w-3.5 text-gray-400" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar permiso…" className="w-full bg-transparent text-sm text-gray-900 outline-none dark:text-gray-100" />
            </div>
          </div>

          {visibles.length === 0 && <p className="py-8 text-center text-sm text-gray-500">Ningún permiso coincide con «{busqueda}».</p>}

          {visibles.map((seccion) => (
            <section key={seccion.titulo} className="space-y-3">
              <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">
                <FontAwesomeIcon icon={seccion.icono} className="text-blue-600 dark:text-blue-400" />
                {seccion.titulo}
              </h2>

              {seccion.grupos.map((grupo) => {
                const permisos = grupo.items.map((i) => i.permiso);
                const inactivosDelGrupo = permisos.filter((p) => inactivos.has(p)).length;
                return (
                  <div key={grupo.clave} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="flex flex-wrap items-center gap-2 font-semibold text-gray-900 dark:text-white">
                          {grupo.titulo}
                          {inactivosDelGrupo > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{inactivosDelGrupo} inactivo{inactivosDelGrupo === 1 ? "" : "s"}</span>}
                        </h3>
                        {grupo.descripcion && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{grupo.descripcion}</p>}
                      </div>
                      {permisos.length > 1 && (
                        <div className="flex shrink-0 items-center gap-3 text-xs font-semibold">
                          <button type="button" onClick={() => ponerGrupo(permisos, true)} disabled={guardando || inactivosDelGrupo === 0} className="text-green-700 hover:underline disabled:opacity-40 dark:text-green-400">
                            Activar todos
                          </button>
                          <button type="button" onClick={() => ponerGrupo(permisos, false)} disabled={guardando || inactivosDelGrupo === permisos.length} className="text-amber-700 hover:underline disabled:opacity-40 dark:text-amber-400">
                            Desactivar todos
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
                      {grupo.items.map((item) => {
                        const activo = !inactivos.has(item.permiso);
                        return (
                          <div key={item.permiso} className="flex items-center justify-between gap-3 py-2">
                            <div className="min-w-0">
                              <p className={`text-sm ${activo ? "text-gray-800 dark:text-gray-200" : "text-gray-500 dark:text-gray-400"}`}>{item.label}</p>
                              {item.ayuda && <p className="text-xs text-gray-500 dark:text-gray-400">{item.ayuda}</p>}
                              <p className="font-mono text-[10px] text-gray-400">{item.permiso}</p>
                            </div>
                            <Interruptor activo={activo} disabled={guardando} onClick={() => alternar(item.permiso)} titulo={activo ? "Desactivar: queda visible en los roles pero nadie lo puede asignar" : "Activar: se va a poder asignar en los roles"} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </PageLayout>
  );
};
