import React from "react";
import { SeleccionMultiple } from "../ui/SeleccionMultiple";
import { favoritasDeEmpresas, opcionesDeSede, ordenarSedes, sedesDelForm } from "../../utils/sedesProyecto";

interface Props {
  /** El catálogo de sedes (Info type:sede), en el orden general. */
  sedes: Array<{ name?: string; data?: any }>;
  companies: Array<{ _id: string; sedeIds?: number[]; sedeFavoritaId?: number | null }>;
  /** Las Empresas del Contrato elegidas en el proyecto. */
  empresasContrato: string[];
  /** `metadata` del proyecto: de ahí salen las sedes elegidas (`sedeIds`, o la `sedeId` de antes). */
  metadata: any;
  onChange: (sedes: { sedeIds: number[]; sedeId: number | undefined }) => void;
}

const ROTULO = <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Sede *</span>;

/**
 * LAS SEDES DEL PROYECTO, que dependen de la Empresa del Contrato.
 *
 * Se ofrecen solo las sedes asociadas a esas empresas (Empresas → ficha → Sedes). Al elegir la
 * empresa se preselecciona su ★ (ver `sedesParaElForm`, que corre en el cambio de empresa). Las
 * elegidas quedan en el orden general de Sedes, con la ★ primero: la primera es la principal, la que
 * precarga el alta de contratos.
 *
 * Sin empresa elegida no hay nada que ofrecer: se avisa, igual que Convenios del proyecto.
 */
export const SedesDelProyecto: React.FC<Props> = ({ sedes, companies, empresasContrato, metadata, onChange }) => {
  const elegidas = sedesDelForm(metadata);

  // Un proyecto de antes puede tener sede sin empresa: se sigue mostrando para poder quitarla.
  if (empresasContrato.length === 0 && elegidas.length === 0) {
    return (
      <div>
        <div className="mb-2">{ROTULO}</div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400">Elegí primero la empresa del contrato: las sedes salen de las que esa empresa tiene asociadas, y se preselecciona su sede por defecto.</p>
        </div>
      </div>
    );
  }

  const opciones = opcionesDeSede(sedes, empresasContrato, companies, elegidas).filter((s) => s.data?.id != null);
  return (
    <SeleccionMultiple
      label={ROTULO}
      titulo="Sedes"
      descripcion="las de la Empresa del Contrato · la primera es la principal"
      principal="Principal"
      placeholder="Elegí una o más sedes…"
      placeholderBusqueda="Buscar sede..."
      vacio="La Empresa del Contrato no tiene sedes asociadas. Asignáselas en Empresas → ficha de la empresa → Sedes."
      opciones={opciones.map((s) => ({ id: String(s.data.id), nombre: s.name || s.data?.nombre || `Sede ${s.data.id}` }))}
      valor={elegidas.map(String)}
      onChange={(ids) => {
        // Sin importar en qué orden se eligieron: primero la ★ de la empresa, después el orden general.
        const orden = ordenarSedes(ids.map(Number), sedes, favoritasDeEmpresas(empresasContrato, companies));
        onChange({ sedeIds: orden, sedeId: orden[0] });
      }}
    />
  );
};
