import { useEffect } from "react";
import { Project } from "../../../../../api/projects";
import { CatalogosContratacion } from "./useCatalogosContratacion";
import { CLASE_CAMPO, Rotulo } from "./comun";

/*
  EL CONVENIO DE LA PLANTILLA: sale de la empresa que contrata.

  Lo normal es que la empresa tenga UN convenio con categorías cargadas (2030 y FZERO: el 0634/11), y
  entonces se MUESTRA directamente —no un desplegable deshabilitado con «Elegí…» adentro— y queda
  guardado en la plantilla. Si tiene varios, se elige. Mientras llegan las categorías (son más de mil)
  dice que está cargando, en vez de decir que no hay ninguno.
*/
interface Props {
  proyecto: Project | null;
  empresaId: string;
  convenioId: string;
  catalogos: CatalogosContratacion;
  onChange: (convenioId: string) => void;
  /** Sin su rótulo (quien lo usa pone el suyo, con el estilo de su formulario). */
  sinRotulo?: boolean;
}

export default function CampoConvenio({ proyecto, empresaId, convenioId, catalogos, onChange, sinRotulo }: Props) {
  const unico = catalogos.convenioUnico(proyecto, empresaId);
  const opciones = catalogos.conveniosDisponibles(proyecto, empresaId, convenioId);

  // Con uno solo, queda elegido: es el que va a usar la plantilla.
  useEffect(() => {
    if (unico && unico._id !== convenioId) onChange(unico._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unico?._id, convenioId]);

  let contenido;
  if (!empresaId) contenido = <p className={`${CLASE_CAMPO} flex items-center text-slate-400`}>Elegí primero la empresa</p>;
  else if (!catalogos.categoriasCargadas || !catalogos.conveniosCargados) contenido = <p className={`${CLASE_CAMPO} flex animate-pulse items-center text-slate-400`}>Cargando convenios…</p>;
  else if (unico)
    contenido = (
      <p className={`${CLASE_CAMPO} flex items-center gap-2`} title={unico.nombre}>
        <span className="font-bold">{unico.cct}</span>
        <span className="truncate text-slate-500 dark:text-slate-400">{unico.nombre}</span>
      </p>
    );
  else if (opciones.length === 0) contenido = <p className={`${CLASE_CAMPO} flex items-center text-amber-600 dark:text-amber-400`}>La empresa no tiene convenios con categorías</p>;
  else
    contenido = (
      <select value={convenioId} onChange={(e) => onChange(e.target.value)} className={CLASE_CAMPO}>
        <option value="">Elegí el convenio…</option>
        {opciones.map((x) => {
          const doc = catalogos.convenioPorCct(x.externalId);
          return doc ? (
            <option key={doc._id} value={doc._id}>
              {x.externalId} {doc.name ? `· ${doc.name}` : ""}
            </option>
          ) : null;
        })}
      </select>
    );

  return (
    <div>
      {!sinRotulo && <Rotulo>Convenio</Rotulo>}
      {contenido}
    </div>
  );
}
