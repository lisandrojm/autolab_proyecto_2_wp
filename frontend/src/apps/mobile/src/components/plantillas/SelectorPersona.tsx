import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, User } from "../../../../../api/users";
import { HojaInferior } from "./HojaInferior";
import { Pill } from "./comun";

/*
  ELEGIR A UNA PERSONA (panel inferior). Tocar a alguien lo elige y cierra: no abre nada más.

  - Arranca filtrado por el ROL del puesto; «Ver todos los roles» lo saca.
  - Primero, quienes tienen CONTRATO VIGENTE EN EL PROYECTO; después, el resto.
  - Se busca 300 ms después de dejar de escribir, y cada búsqueda tiene su número: una respuesta vieja
    que llega tarde se descarta. Mientras busca NO se muestra la lista anterior (eso era el «lag»).
  - `marcas`: avisos por persona (ej. «Ya está en «Sábado noche», mismo turno»).
*/

export interface PersonaElegida {
  _id: string;
  nombre: string;
}

interface Props {
  abierta: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  projectId: string | null | undefined;
  /** El rol del puesto (nombre): filtro inicial. */
  rol?: string;
  /** Sólo gente del proyecto (para elegir a quién se reemplaza). */
  soloProyecto?: boolean;
  marcas?: Map<string, string>;
  onElegir: (p: PersonaElegida) => void;
}

const nombreDe = (u: any) => (u?.metadata?.fullName || `${u?.firstName || ""} ${u?.lastName || ""}`).trim() || u?.email || "Sin nombre";
const POR_PAGINA = 40;

export function SelectorPersona({ abierta, onCerrar, titulo, subtitulo, projectId, rol, soloProyecto, marcas, onElegir }: Props) {
  const [texto, setTexto] = useState("");
  const [todosLosRoles, setTodosLosRoles] = useState(false);
  const [resultado, setResultado] = useState<{ delProyecto: User[]; otros: User[]; totalOtros: number } | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    if (!abierta) return;
    setTexto("");
    setTodosLosRoles(!rol);
  }, [abierta, rol]);

  useEffect(() => {
    if (!abierta) return;
    const id = ++pedido.current;
    setResultado(null); // nada viejo en pantalla mientras busca
    const t = setTimeout(() => {
      const comunes = { page: 1, limit: POR_PAGINA, metadataActivo: "true", picker: true, email: texto.trim() || undefined, rolFrame: !todosLosRoles && rol ? rol : undefined } as any;
      Promise.all([
        projectId ? usersAPI.list({ ...comunes, projectId, ...(soloProyecto ? {} : { vigencia: "vigente" }) }) : Promise.resolve({ users: [] }),
        soloProyecto ? Promise.resolve({ users: [], pagination: { total: 0 } }) : usersAPI.list(comunes),
      ])
        .then(([a, b]: any[]) => {
          if (id !== pedido.current) return;
          const delProyecto: User[] = a.users || [];
          const ya = new Set(delProyecto.map((u) => u._id));
          const otros: User[] = (b.users || []).filter((u: User) => !ya.has(u._id));
          setResultado({ delProyecto, otros, totalOtros: b.pagination?.total ?? otros.length });
        })
        .catch(() => id === pedido.current && setResultado({ delProyecto: [], otros: [], totalOtros: 0 }));
    }, 300);
    return () => clearTimeout(t);
  }, [abierta, texto, todosLosRoles, rol, projectId, soloProyecto]);

  const fila = (u: User) => {
    const marca = marcas?.get(u._id);
    return (
      <button
        key={u._id}
        type="button"
        onClick={() => {
          onElegir({ _id: u._id, nombre: nombreDe(u) });
          onCerrar();
        }}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800/60"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{nombreDe(u)}</p>
          {marca ? (
            <p className="flex items-center gap-1 truncate text-xs font-semibold text-amber-800 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} />
              {marca}
            </p>
          ) : (
            <p className="truncate text-xs text-slate-600 dark:text-slate-300">{(u as any).externalInfo?.rolFrames?.join(", ") || u.email}</p>
          )}
        </div>
      </button>
    );
  };

  const nada = resultado && resultado.delProyecto.length === 0 && resultado.otros.length === 0;
  return (
    <HojaInferior abierta={abierta} onCerrar={onCerrar} titulo={titulo} subtitulo={subtitulo}>
      <div className="sticky -top-3 z-10 -mx-4 -mt-3 space-y-2 bg-white px-4 pb-2 pt-3 dark:bg-slate-900">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por nombre o email" aria-label="Buscar persona" className="h-11 w-full rounded-xl border border-slate-300 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
        </div>
        {rol && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setTodosLosRoles(false)} className={`min-h-[36px] rounded-full px-3 text-xs font-semibold ${!todosLosRoles ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"}`}>
              {rol}
            </button>
            <button type="button" onClick={() => setTodosLosRoles(true)} className={`min-h-[36px] rounded-full px-3 text-xs font-semibold ${todosLosRoles ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"}`}>
              Ver todos los roles
            </button>
          </div>
        )}
      </div>

      {!resultado ? (
        <div className="space-y-2 pt-1" aria-busy="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[52px] animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : nada ? (
        <p className="py-8 text-center text-sm text-slate-700 dark:text-slate-200">{todosLosRoles || !rol ? "Nadie coincide con la búsqueda." : `Nadie con rol ${rol} coincide.`}</p>
      ) : (
        <div className="space-y-4 pt-1">
          {resultado.delProyecto.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">{soloProyecto ? "Equipo del proyecto" : "Con contrato vigente en el proyecto"}</p>
              {resultado.delProyecto.map(fila)}
            </div>
          )}
          {resultado.otros.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Otras personas</p>
              {resultado.otros.map(fila)}
              {resultado.totalOtros > resultado.otros.length && (
                <p className="py-2 text-center text-xs text-slate-600 dark:text-slate-300">
                  <Pill>Hay más: escribí para acotar</Pill>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </HojaInferior>
  );
}
