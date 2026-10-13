import React from "react";
import type { RelacionLaboral } from "../../api/arcaRelaciones";

/*
  EL DETALLE DE LAS RELACIONES LABORALES DE UNA PERSONA SEGÚN ARCA, de la más nueva a la más vieja (así
  las devuelve el server). Lo usan Documentos → «Antigüedad ARCA» (al desplegar una persona) y la
  columna «Contratos en ARCA» de Contratación → Contratos (al abrir el detalle).
*/

export const fechaCortaArca = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const importe = (n: number | null) => (n === null || n === undefined ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";

export const TablaRelacionesArca: React.FC<{ relaciones: RelacionLaboral[]; razonSocialDe: (cuit: string) => string }> = ({ relaciones, razonSocialDe }) => (
  <table className="min-w-full text-xs">
    <thead>
      <tr>
        <th className={th}>Empleadora</th>
        <th className={th}>Inicio</th>
        <th className={th}>Fin</th>
        <th className={th}>Modalidad</th>
        <th className={th}>Puesto / Categoría</th>
        <th className={th}>Obra social</th>
        <th className={th}>Retribución</th>
        <th className={th}>Baja</th>
      </tr>
    </thead>
    <tbody>
      {relaciones.map((r) => (
        <tr key={r._id} className="border-t border-gray-100 dark:border-gray-800 align-top">
          <td className="px-4 py-2 whitespace-nowrap">{razonSocialDe(r.empleadoraCuit)}</td>
          <td className="px-4 py-2 whitespace-nowrap">{fechaCortaArca(r.fechaInicio)}</td>
          <td className="px-4 py-2 whitespace-nowrap">{r.fechaFin ? fechaCortaArca(r.fechaFin) : <span className="text-green-600 font-semibold">abierta</span>}</td>
          <td className="px-4 py-2 max-w-[220px]">{r.modalidadContrato}</td>
          <td className="px-4 py-2 max-w-[260px]">
            {r.puestoDesempenado}
            {r.categoria && <span className="block text-gray-500">{r.categoria}</span>}
          </td>
          <td className="px-4 py-2 max-w-[220px]">{r.obraSocial}</td>
          <td className="px-4 py-2 whitespace-nowrap text-right">
            {importe(r.retribucionPactada)} <span className="text-gray-400">{r.modLiquidacion}</span>
          </td>
          <td className="px-4 py-2 max-w-[220px]">{r.situacionBaja}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
