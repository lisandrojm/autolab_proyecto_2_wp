import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMinus, faPen, faPlus, faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import { InfoItem } from "../../../../../api/info";
import { EstadoBadge } from "../../../../../components/EstadoSelect";
import { TipoImpositivo, estadoImpositivoPorTipo } from "../../../../../utils/tramiteImpositivo";
import { fuzzyMatch } from "../../../../../utils/searchHelpers";
import { OpcionAreaTurno } from "./useCatalogosContratacion";
import { HojaModal } from "./HojaModal";
import { CLASE_CAMPO } from "./comun";

/*
  LAS PIEZAS DE «NUEVO EQUIPO», COMPARTIDAS POR SUS TRES PASOS.

  Vivían adentro de NuevoEquipo.tsx, que era una sola pantalla. Al partirse en pasos, cada uno
  necesita las mismas: el rótulo de un campo, las pastillas de lo elegido, el badge del trámite y la
  hoja de roles. Copiarlas en cada paso era garantizar que se despeguen.

  Son todas de presentación: no saben del borrador ni de la API. Lo que decide vive en NuevoEquipo.
*/

/** Los botones de acción de un renglón: chicos, porque son acciones SOBRE el renglón y no el renglón. */
export const CHICO = "flex h-7 w-7 items-center justify-center rounded-full border border-slate-400 text-slate-600 hover:bg-slate-200 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-700";

/** Rótulo de campo, igual al de la solicitud individual. */
export function Rotulo({ icono, children, obligatorio }: { icono: any; children: React.ReactNode; obligatorio?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
      <FontAwesomeIcon icon={icono} className="text-[10px] text-blue-500" />
      {children}
      {obligatorio && <span className="text-red-500">*</span>}
    </label>
  );
}

/**
 * A QUÉ TRÁMITE VA ESE TIPO DE CONTRATO: ARCA o Servicios.
 *
 * El estado sale del ABM (`estadoImpositivoPorTipo`) y se dibuja con `EstadoBadge`, el mismo
 * componente que usa desk, así que el color es idéntico en las dos pantallas. Sólo se acorta el
 * texto: «PEDIDO DE ARCA» repetido en catorce renglones no entra en un teléfono.
 *
 * Sin estado configurado no se dibuja nada. Inventar un badge gris sería afirmar que el trámite es
 * uno de los dos cuando lo que pasa es que todavía nadie lo configuró.
 */
export function BadgeTramite({ estados, tramite }: { estados: InfoItem[]; tramite: TipoImpositivo | null | undefined }) {
  const estado = estadoImpositivoPorTipo(estados, tramite || "");
  if (!estado) return null;
  return <EstadoBadge name={estado.name} etiqueta={tramite === "constancia_cuit" ? "Servicios" : "ARCA"} className="shrink-0" />;
}

/** «2 Camarógrafo · 1 Director», en orden de aparición. */
export function resumenRoles(ids: string[], nombre: (id: string) => string) {
  const cuenta = new Map<string, number>();
  for (const id of ids) cuenta.set(id, (cuenta.get(id) || 0) + 1);
  return [...cuenta.entries()].map(([id, c]) => `${c} ${nombre(id)}`).join(" · ");
}

/** Un rol elegido: su nombre, cuántos (− y +) y ✕ para sacarlo. */
/**
 * LA FORMA DE UNA COSA ELEGIDA, para los dos campos que eligen de a varias.
 *
 * Rol/es empresa y Área y turno se habían ido cada uno para su lado: uno con pastillas y sus
 * botones, el otro con tarjetas de borde gris, íconos sueltos a la derecha y un rojo que competía
 * con el botón de crear. Dos formas para lo mismo, en la misma pantalla, una debajo de la otra.
 *
 * Ahora las dos son DOS PASTILLAS: a la izquierda la acción —la cantidad o los turnos—, a la
 * derecha el nombre con su cruz.
 *
 * EL COLOR ES DEL DATO, NO DEL CONTROL. La pastilla del nombre va en AZUL —el mismo de la selección
 * de a una persona, para que una cosa elegida se vea igual en toda la app— y la de la izquierda va
 * NEUTRA, porque «− 1 +» y el lápiz son controles y no cambian de significado según el campo.
 * Pintándolos del color del dato competían con él y el renglón terminaba siendo dos manchas.
 *
 * El verde quedó definido y sin usar a propósito: sirve para lo que de verdad signifique algo
 * distinto, no para separar dos campos que ya se distinguen por su rótulo.
 */
export const TONOS = {
  azul: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  verde: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  /*
    EL GRIS TIENE QUE VERSE. El primer intento fue `slate-800` sobre un fondo `slate-900`: a simple
    vista era la misma mancha oscura que la pastilla azul, y el cambio no se notaba. Va un escalón
    MÁS CLARO que el fondo —al revés de lo que uno haría en claro, donde va más oscuro que el papel—,
    que es lo que lo separa tanto del fondo como del color del dato.
  */
  neutro: "border-slate-400 bg-slate-200 text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100",
};
const HOVER = {
  azul: "hover:bg-blue-200 dark:hover:bg-blue-800/60",
  verde: "hover:bg-emerald-200 dark:hover:bg-emerald-800/60",
  neutro: "hover:bg-slate-300 dark:hover:bg-slate-600",
};
export const pastillaDe = (tono: keyof typeof TONOS) => `inline-flex items-center rounded-full border text-xs font-semibold ${TONOS[tono]}`;
export const redondoDe = (tono: keyof typeof TONOS) => `flex h-8 w-8 items-center justify-center rounded-full ${HOVER[tono]}`;

/*
  EL AIRE DE LAS PASTILLAS, EN UN SOLO LUGAR.

  Estaban apretadas —el texto casi tocando el borde, y cinco renglones pegados uno al otro— porque se
  dibujaban en una pantalla que no daba abasto: cada milímetro ahorrado era una sección más que
  entraba. Partido el alta en pasos, el problema se dio vuelta: sobra media pantalla y lo que falta
  es que cinco áreas no se lean como un bloque.

  Tres medidas y no una, porque no todas las pastillas tienen la misma forma:

    · AIRE          las que son sólo texto (una persona, un área de un puesto, un chip del encabezado).
    · AIRE_CON_CRUZ las que terminan en un botón redondo: menos aire de ese lado, que el botón ya lo trae.
    · AIRE_CONTROL  las que son SÓLO botones (el «− 1 +», el lápiz): el aire es el marco alrededor.

  EL AIRE DE ARRIBA Y ABAJO ES EL MÍNIMO. Se probó con más y las pastillas salían gordas: quien manda
  en el alto es el botón redondo de adentro (32 px), así que cada paso de padding vertical se suma
  entero a un alto que ya alcanza, y catorce roles se volvían una columna de ladrillos. A lo ancho sí
  hace falta —ahí el texto toca el borde—, y por eso las medidas no son simétricas.

  `SEPARACION` es lo que va entre una pastilla y la de al lado; `ENTRE` lo que va entre badges, que es
  más, porque ahí el salto es de una cosa elegida a otra y no de una mitad a su otra mitad. Y sobre
  eso, `MARGEN`: 1 px en cada badge, el pelo que despega dos bordes redondos que casi se tocan.
*/
export const AIRE = "px-3 py-0.5";
export const AIRE_CON_CRUZ = "py-0.5 pl-4 pr-1";
export const AIRE_CONTROL = "px-1 py-0.5";
export const SEPARACION = "gap-2";
export const ENTRE = "gap-2.5";
export const MARGEN = "m-px";

/**
 * UN ÁREA ELEGIDA: el lápiz a la izquierda, el área con sus turnos y la cruz a la derecha.
 *
 * Misma forma que un rol; en el lugar del «− 1 +» va el lápiz, porque lo que se ajusta acá no es una
 * cantidad sino cuáles turnos. Abre los turnos de ESA área, sin pasar por la lista: ya se sabe cuál.
 *
 * La cruz saca el área entera. Destildar cinco casillas de a una para sacar un área de cinco turnos
 * era el trabajo que hacía falta ahorrar.
 */
export function BadgeArea({ nombre, turnos, onEditar, onQuitar }: { nombre: string; turnos: string[]; onEditar: () => void; onQuitar: () => void }) {
  return (
    <span className={`inline-flex items-center ${SEPARACION} ${MARGEN}`}>
      <span className={`${pastillaDe("neutro")} ${AIRE_CONTROL}`}>
        <button type="button" onClick={onEditar} aria-label={`Editar los turnos de ${nombre}`} className={redondoDe("neutro")}>
          <FontAwesomeIcon icon={faPen} className="h-2.5 w-2.5" />
        </button>
      </span>
      <span className={`${pastillaDe("azul")} ${AIRE_CON_CRUZ}`}>
        <span className="min-w-0">
          <span className="block truncate uppercase tracking-wide">{nombre}</span>
          <span className="block truncate text-[10px] font-normal opacity-80">{turnos.join(" · ")}</span>
        </span>
        <button type="button" onClick={onQuitar} aria-label={`Sacar ${nombre} del equipo`} className={`ml-1 ${redondoDe("azul")}`}>
          <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
        </button>
      </span>
    </span>
  );
}

/** Lo elegido en Área y turno, agrupado por área: un badge por área, con sus turnos adentro. */
export function ResumenTurnos({ elegidos, onEditar, onQuitarArea }: { elegidos: OpcionAreaTurno[]; onEditar: (areaId: string) => void; onQuitarArea: (areaId: string) => void }) {
  const porArea: { areaId: string; nombre: string; turnos: OpcionAreaTurno[] }[] = [];
  for (const o of elegidos) {
    const g = porArea.find((x) => x.areaId === o.areaId);
    if (g) g.turnos.push(o);
    else porArea.push({ areaId: o.areaId, nombre: o.areaNombre, turnos: [o] });
  }
  return (
    <div className={`flex flex-wrap items-center ${ENTRE}`}>
      {porArea.map((a) => (
        <BadgeArea key={a.areaId} nombre={a.nombre} turnos={a.turnos.map((t) => t.turnoNombre)} onEditar={() => onEditar(a.areaId)} onQuitar={() => onQuitarArea(a.areaId)} />
      ))}
    </div>
  );
}

/**
 * UN ROL DEL GRUPO: DOS PASTILLAS SEPARADAS, la cantidad y el nombre.
 *
 * Eran una sola con cinco controles pegados —menos, número, más, nombre, quitar— y en un teléfono
 * eso es una fila de blancos de siete milímetros donde el dedo no acierta: querías sumar uno y
 * borrabas el rol. Separadas, cada grupo se lee por lo que hace y hay aire entre el «+» y la «×»,
 * que son las dos que no conviene confundir.
 *
 * BORRAR ES SÓLO LA «×». Con uno, el «−» queda apagado: restar de uno sacaba el rol de la lista, así
 * que el mismo botón bajaba la cantidad ocho veces y a la novena borraba todo — y en un teléfono eso
 * pasa de más, tocando rápido sin mirar el número.
 */
export function BadgeRol({ nombre, cantidad, onCantidad }: { nombre: string; cantidad: number; onCantidad: (n: number) => void }) {
  // Las dos pastillas viajan juntas: `inline-flex` acá adentro evita que una quede sola al final de un renglón.
  const pastilla = pastillaDe("azul");
  const redondo = redondoDe("azul");
  // La de la cantidad, neutra: es un control, no el dato (ver TONOS).
  const control = pastillaDe("neutro");
  const redondoControl = redondoDe("neutro");
  return (
    <span className={`inline-flex items-center ${SEPARACION} ${MARGEN}`}>
      <span className={`${control} ${AIRE_CONTROL}`}>
        <button
          type="button"
          onClick={() => onCantidad(cantidad - 1)}
          disabled={cantidad <= 1}
          aria-label={cantidad <= 1 ? `${nombre}: para sacarlo, la cruz` : `Un ${nombre} menos`}
          title={cantidad <= 1 ? "Para sacar el rol, la cruz" : undefined}
          className={`${redondoControl} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
        >
          <FontAwesomeIcon icon={faMinus} className="h-2.5 w-2.5" />
        </button>
        <span className="min-w-[1.25rem] text-center tabular-nums">{cantidad}</span>
        <button type="button" onClick={() => onCantidad(cantidad + 1)} aria-label={`Un ${nombre} más`} className={redondoControl}>
          <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
        </button>
      </span>
      <span className={`${pastilla} ${AIRE_CON_CRUZ}`}>
        {nombre}
        <button type="button" onClick={() => onCantidad(0)} aria-label={`Quitar ${nombre}`} className={`ml-1 ${redondo}`}>
          <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
        </button>
      </span>
    </span>
  );
}

/**
 * ELEGIR LOS ROLES DEL GRUPO, como Rol/es Empresa del alta individual: arriba los elegidos (badges, con
 * cuántos de cada uno), el buscador y todos los roles con su casilla. Tildar suma uno; los badges ajustan
 * la cantidad («2 × Camarógrafo»).
 */
export function HojaRoles({ abierta, onCerrar, roles, roleFrames, onCambio }: { abierta: boolean; onCerrar: () => void; roles: { rolId: string; cantidad: number }[]; roleFrames: { _id: string; name: string }[]; onCambio: (r: { rolId: string; cantidad: number }[]) => void }) {
  const [busca, setBusca] = useState("");
  useEffect(() => {
    if (abierta) setBusca("");
  }, [abierta]);
  const nombre = (id: string) => roleFrames.find((r) => r._id === id)?.name || "Rol";
  const poner = (id: string, n: number) => {
    if (n <= 0) onCambio(roles.filter((r) => r.rolId !== id));
    else if (roles.some((r) => r.rolId === id)) onCambio(roles.map((r) => (r.rolId === id ? { ...r, cantidad: n } : r)));
    else onCambio([...roles, { rolId: id, cantidad: n }]);
  };
  // Sin tildes ni mayúsculas, como los demás buscadores: «camarografo» encuentra «Camarógrafo».
  const lista = [...roleFrames].filter((r) => fuzzyMatch(r.name, busca)).sort((a, b) => a.name.localeCompare(b.name));
  const total = roles.reduce((s, r) => s + r.cantidad, 0);
  return (
    <HojaModal
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="Rol/es empresa"
      // Con ninguno, la instrucción; con alguno, el recuento. Lo que hace falta saber cambia según en cuál de los dos estás.
      subtitulo={total === 0 ? "Elegí uno o más roles…" : `${total} ${total === 1 ? "puesto" : "puestos"} · el oficio de cada puesto`}
      pie={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => onCambio([])} disabled={roles.length === 0} className="min-h-[44px] px-2 text-sm font-bold text-red-600 disabled:opacity-40 dark:text-red-400">
            Limpiar
          </button>
          <button type="button" onClick={onCerrar} className="min-h-[44px] rounded-xl bg-blue-600 px-8 text-sm font-bold text-white">
            Listo
          </button>
        </div>
      }
    >
      {roles.length > 0 && (
        <div className={`mb-3 flex flex-wrap ${ENTRE}`}>
          {roles.map((r) => (
            <BadgeRol key={r.rolId} nombre={nombre(r.rolId)} cantidad={r.cantidad} onCantidad={(n) => poner(r.rolId, n)} />
          ))}
        </div>
      )}
      <div className="relative mb-3">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar especialidad…" aria-label="Buscar rol" className={`${CLASE_CAMPO} pl-9`} />
      </div>
      {roleFrames.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-700 dark:text-slate-200">Cargando los roles…</p>
      ) : lista.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-700 dark:text-slate-200">Ningún rol coincide.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {lista.map((r) => {
            const n = roles.find((x) => x.rolId === r._id)?.cantidad || 0;
            return (
              <label key={r._id} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 ${n ? "border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>
                <input type="checkbox" checked={n > 0} onChange={() => poner(r._id, n ? 0 : 1)} className="h-4 w-4 shrink-0 rounded" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={r.name}>
                  {r.name}
                </span>
                {n > 1 && <span className="shrink-0 rounded bg-blue-600 px-1.5 text-xs font-bold text-white">×{n}</span>}
              </label>
            );
          })}
        </div>
      )}
    </HojaModal>
  );
}
