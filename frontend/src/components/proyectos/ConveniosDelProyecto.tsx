import React, { useEffect, useMemo, useState } from 'react';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { SeleccionMultiple } from '../ui/SeleccionMultiple';

/**
 * LOS CONVENIOS BAJO LOS QUE CONTRATA ESTE PROYECTO.
 *
 * CUELGAN DE LA EMPRESA DEL CONTRATO, y por eso el selector no ofrece el nomenclador entero: ARCA
 * solo acepta categorías de los CCT que ESE CUIT registró, así que un convenio de otra empleadora
 * produce un alta rechazada. Sin empresa elegida no hay nada que ofrecer, y decirlo es más útil que
 * mostrar 2.669 opciones que después no van a servir.
 *
 * ACOTAR ES OPCIONAL. Vacío significa «todavía no se acotó», no «ninguno»: el alta ofrece entonces
 * todos los convenios de la empresa. Una productora con seis CCT registrados que en este proyecto
 * contrata bajo uno lo marca acá, y el alta deja de ofrecer los otros cinco.
 *
 * Se eligen como Sede y Empresa del Contrato (`SeleccionMultiple`): badges con ✕ y una ventana con
 * buscador para marcar varios.
 */

const conveniosApi = createSimpleCatalogApi('/convenios');

const ROTULO = <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Convenios del proyecto</span>;

interface Props {
  /** Todas las empresas, para resolver qué convenios registró cada una. */
  companies: Array<{ _id: string; razonSocial: string; convenioIds?: string[] }>;
  /** Las empresas del contrato tildadas arriba. */
  empresasContrato: string[];
  value: string[];
  onChange: (ids: string[]) => void;
}

export const ConveniosDelProyecto: React.FC<Props> = ({ companies, empresasContrato, value, onChange }) => {
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);

  useEffect(() => {
    conveniosApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  /** Los convenios que registraron las empresas del contrato elegidas, sin repetir. */
  const disponibles = useMemo(() => {
    const ids = new Set<string>();
    for (const e of companies) {
      if (!empresasContrato.includes(e._id)) continue;
      for (const id of e.convenioIds || []) ids.add(String(id));
    }
    return catalogo.filter((c) => ids.has(c._id)).sort((a, b) => String(a.externalId || '').localeCompare(String(b.externalId || '')));
  }, [companies, empresasContrato, catalogo]);

  /** Por convenio, las empresas del contrato elegidas que lo registraron. */
  const empresasDe = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of companies) {
      if (!empresasContrato.includes(e._id)) continue;
      for (const id of e.convenioIds || []) m.set(String(id), [...(m.get(String(id)) || []), e.razonSocial]);
    }
    return m;
  }, [companies, empresasContrato]);

  /*
    SACAR UNA EMPRESA SE LLEVA SUS CONVENIOS.

    Sin esto, destildar la empleadora dejaba en el proyecto un convenio que ninguna de las que quedan
    tiene registrado: invisible en la lista —ya no se dibuja— y aplicándose igual en el alta, que
    ARCA rechaza. El error aparecería lejos de esta pantalla y sin rastro de dónde se originó.
  */
  useEffect(() => {
    if (catalogo.length === 0) return;
    const validos = new Set(disponibles.map((c) => c._id));
    const limpio = value.filter((id) => validos.has(id));
    if (limpio.length !== value.length) onChange(limpio);
  }, [disponibles, catalogo.length]);

  if (empresasContrato.length === 0) {
    return (
      <div>
        <div className="mb-2">{ROTULO}</div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400">Elegí primero la empresa del contrato: los convenios salen de los que esa empleadora tiene registrados ante ARCA.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SeleccionMultiple
        label={ROTULO}
        titulo="Convenios del proyecto"
        descripcion="los que registró la empresa del contrato"
        placeholder="Sin acotar: todos los de la empresa…"
        placeholderBusqueda="Buscar convenio o CCT..."
        vacio="Esa empleadora no tiene convenios registrados. Se registran en Configuración → ARCA → Convenios."
        // Al lado de cada convenio, de cuál de las empresas elegidas es (puede ser de más de una).
        opciones={disponibles.map((c) => ({ id: c._id, nombre: `${c.externalId ? `${c.externalId} · ` : ''}${c.name}`, etiquetas: empresasDe.get(c._id) || [] }))}
        valor={value}
        onChange={onChange}
      />
      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
        {value.length === 0 ? 'Sin acotar: el alta va a ofrecer todos los convenios de la empresa.' : `${value.length} de ${disponibles.length}. El alta va a ofrecer solo ${value.length === 1 ? 'ése' : 'ésos'}.`}
      </p>
    </div>
  );
};
