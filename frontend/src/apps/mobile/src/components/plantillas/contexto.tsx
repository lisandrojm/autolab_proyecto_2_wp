import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Plantilla, plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { projectsAPI } from "../../../../../api/projects";
import { CatalogosContratacion, OpcionAreaTurno, opcionAreaTurno, useCatalogosContratacion } from "./useCatalogosContratacion";
import { sweetAlert } from "../../utils/sweetAlert";

/*
  LO QUE COMPARTEN LAS PANTALLAS DE PLANTILLAS: los catálogos (una vez), las plantillas ya cargadas
  (volver atrás no vuelve a pedir ni parpadea), las áreas y turnos de cada proyecto y el estado del
  GUARDADO AUTOMÁTICO: cada cambio se guarda solo y la cabecera dice «Guardando…» / «Guardado».
*/

export type EstadoGuardado = "quieto" | "guardando" | "guardado" | "error";

interface Contexto {
  catalogos: CatalogosContratacion;
  plantillas: Record<string, Plantilla>;
  cargar: (id: string) => Promise<Plantilla | null>;
  /** Corre un cambio y deja la plantilla que devuelve el server. `null` si falló (ya avisado). */
  guardar: (fn: () => Promise<Plantilla>) => Promise<Plantilla | null>;
  estado: EstadoGuardado;
  areasDe: (projectId: string | null | undefined) => OpcionAreaTurno[] | null;
}

const Ctx = createContext<Contexto | null>(null);

export function ProveedorPlantillas({ children }: { children: React.ReactNode }) {
  const catalogos = useCatalogosContratacion();
  const [plantillas, setPlantillas] = useState<Record<string, Plantilla>>({});
  const [estado, setEstado] = useState<EstadoGuardado>("quieto");
  // Las áreas de cada proyecto tardan (el proyecto entero): se guardan en la sesión para que volver o
  // recargar las muestre enseguida, y se piden igual por detrás.
  const [areas, setAreas] = useState<Record<string, OpcionAreaTurno[] | null>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem("plantillas:areas") || "{}");
    } catch {
      return {};
    }
  });
  const pidiendoAreas = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const poner = (p: Plantilla) => setPlantillas((x) => ({ ...x, [p._id]: p }));

  const cargar = useCallback(async (id: string) => {
    try {
      const p = await plantillasEquipoAPI.obtener(id);
      poner(p);
      return p;
    } catch {
      return null;
    }
  }, []);

  const guardar = useCallback(async (fn: () => Promise<Plantilla>) => {
    clearTimeout(timer.current);
    setEstado("guardando");
    try {
      const p = await fn();
      poner(p);
      setEstado("guardado");
      timer.current = setTimeout(() => setEstado("quieto"), 2000);
      return p;
    } catch (e: any) {
      setEstado("error");
      // Un aviso corto arriba, que no tapa la pantalla (la cabecera también dice «No se guardó»).
      void sweetAlert.warning("No se guardó", e?.response?.data?.error || "Probá de nuevo.");
      return null;
    }
  }, []);

  const areasDe = useCallback(
    (projectId: string | null | undefined) => {
      if (!projectId) return null;
      if (!pidiendoAreas.current.has(projectId)) {
        pidiendoAreas.current.add(projectId);
        projectsAPI
          .getProject(projectId, { team: "ids" })
          .then((p) =>
            setAreas((a) => {
              const nuevas = { ...a, [projectId]: ((p.areasConfig || []) as any[]).flatMap((ac) => (ac.shiftIds || []).map((s: any) => opcionAreaTurno(ac.areaId, s))).sort((x, y) => `${x.areaNombre}${x.orden}`.localeCompare(`${y.areaNombre}${y.orden}`)) };
              try {
                sessionStorage.setItem("plantillas:areas", JSON.stringify(nuevas));
              } catch {
                /* sin storage: se piden cada vez */
              }
              return nuevas;
            }),
          )
          .catch(() => setAreas((a) => ({ ...a, [projectId]: a[projectId] ?? [] })));
      }
      return areas[projectId] ?? null;
    },
    [areas],
  );

  return <Ctx.Provider value={{ catalogos, plantillas, cargar, guardar, estado, areasDe }}>{children}</Ctx.Provider>;
}

export function usePlantillas() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlantillas fuera de ProveedorPlantillas");
  return c;
}

/**
 * Una plantilla: la cargada si ya está (sin parpadeo) y, al entrar a la pantalla, la del server
 * (puede haber cambiado: una contratación, otro teléfono).
 */
export function usePlantilla(id: string | undefined) {
  const { plantillas, cargar } = usePlantillas();
  const [noEsta, setNoEsta] = useState(false);
  useEffect(() => {
    if (!id) return;
    setNoEsta(false);
    void cargar(id).then((p) => !p && setNoEsta(true));
  }, [id, cargar]);
  return { plantilla: id ? plantillas[id] || null : null, noEsta };
}
