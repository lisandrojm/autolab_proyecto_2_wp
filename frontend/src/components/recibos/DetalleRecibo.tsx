import React from "react";
import type { DatosRecibo } from "../../api/recibosSueldo";
import { TablaConEncabezadoFijo } from "../ui/TablaConEncabezadoFijo";

/* Lo que comparten la pantalla de Recibos de sueldo y su registro de enviados: formatos y el detalle del recibo. */

export const fmtCuil = (c: string) => (c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c || "—");
export const fechaHora = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-AR", {
        timeZone: "America/Argentina/Buenos_Aires",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const periodoTexto = (p: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(p || "");
  if (!m) return p || "—";
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${meses[Number(m[2]) - 1]} ${m[1]}`;
};

/** «1.234.567,89» → 1234567.89, para ordenar. */
export const importeNumero = (s?: string) => (s ? Number(s.replace(/\./g, "").replace(",", ".")) || 0 : 0);
export const pesos = (s?: string) => (s ? `$ ${s}` : "—");

/** Los datos del recibo y sus conceptos, como en el papel. Con OCR casi todo queda vacío y se muestra lo que haya. */
export const DetalleRecibo: React.FC<{ datos: DatosRecibo }> = ({ datos: d }) => {
  const filas: Array<[string, string | undefined]> = [
    ["Empresa", d.empresa ? `${d.empresa}${d.empleadorCuit ? ` · CUIT ${fmtCuil(d.empleadorCuit)}` : ""}` : d.empleadorCuit ? `CUIT ${fmtCuil(d.empleadorCuit)}` : ""],
    ["Apellido y nombres", d.nombre],
    ["Legajo", d.legajo],
    ["CUIL", d.cuil ? fmtCuil(d.cuil) : ""],
    ["Básico", d.basico],
    ["Ingreso", [d.ingreso, d.antiguedad].filter(Boolean).join(" · ")],
    ["Sector", d.sector],
    ["Modalidad", d.modalidad],
    ["Categoría", d.categoria],
    ["Tarea", d.tarea],
    ["Período liquidado", d.periodoTexto || periodoTexto(d.periodo)],
    ["Depósito de aportes", [d.periodoDeposito, d.fechaDeposito, d.bancoDeposito].filter(Boolean).join(" · ")],
    ["Forma de pago", [d.formaPago, d.fechaPago].filter(Boolean).join(" · ")],
    ["Recibo N°", d.numeroRecibo],
  ];
  const totales: Array<[string, string | undefined]> = [
    ["Costo total empleador", d.costoTotal],
    ["Contribuciones empleador", d.contribucionesEmpleador],
    ["Sueldo bruto", d.sueldoBruto],
    ["Remunerativo", d.remunerativo],
    ["No remunerativo", d.noRemunerativo],
    ["Descuentos", d.descuentos],
    ["Sueldo neto", d.sueldoNeto],
    ["Otros", d.otros],
    ["Neto a cobrar", d.neto],
  ];
  const secciones = [...new Set((d.conceptos || []).map((c) => c.seccion))];
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {filas
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-gray-100 dark:border-gray-700 py-1">
              <dt className="text-gray-500">{k}</dt>
              <dd className="text-right font-medium text-gray-800 dark:text-gray-200">{v}</dd>
            </div>
          ))}
      </dl>
      {totales.some(([, v]) => v) && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {totales
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className={`rounded-lg border px-3 py-2 ${k === "Neto a cobrar" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20" : "border-gray-200 dark:border-gray-700"}`}>
                <dt className="text-[11px] text-gray-500">{k}</dt>
                <dd className="font-semibold text-gray-800 dark:text-gray-200">$ {v}</dd>
              </div>
            ))}
        </dl>
      )}
      {secciones.length > 0 && (
        <TablaConEncabezadoFijo className="border border-gray-200 dark:border-gray-700 rounded-lg" tabla="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-900 text-gray-500">
            <tr>
              <th className="px-2 py-1 text-left">Código</th>
              <th className="px-2 py-1 text-left">Concepto</th>
              <th className="px-2 py-1 text-right">Unidad</th>
              <th className="px-2 py-1 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {secciones.map((sec) => (
              <React.Fragment key={sec}>
                <tr>
                  <td colSpan={4} className="px-2 py-1 font-bold text-gray-600 dark:text-gray-300 bg-gray-50/60 dark:bg-gray-800">
                    {sec || "—"}
                  </td>
                </tr>
                {(d.conceptos || [])
                  .filter((c) => c.seccion === sec)
                  .map((c, i) => (
                    <tr key={`${sec}-${c.codigo}-${i}`} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-2 py-1 font-mono text-gray-500">{c.codigo}</td>
                      <td className="px-2 py-1">{c.concepto}</td>
                      <td className="px-2 py-1 text-right">{c.unidad}</td>
                      <td className={`px-2 py-1 text-right font-mono ${c.monto.startsWith("-") ? "text-red-600 dark:text-red-400" : ""}`}>{c.monto}</td>
                    </tr>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </TablaConEncabezadoFijo>
      )}
    </div>
  );
};
