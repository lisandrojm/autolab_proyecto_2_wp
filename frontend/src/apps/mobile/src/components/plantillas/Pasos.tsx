/** «1 Fechas · 2 Revisión»: dónde se está en la contratación. */
export function Pasos({ actual }: { actual: 1 | 2 }) {
  const paso = (n: 1 | 2, texto: string) => (
    <span className={`flex items-center gap-1.5 text-sm font-semibold ${actual === n ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-300"}`} aria-current={actual === n ? "step" : undefined}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${actual === n ? "bg-blue-600 text-white" : actual > n ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-slate-100"}`}>{actual > n ? "✓" : n}</span>
      {texto}
    </span>
  );
  return (
    <nav aria-label="Pasos" className="mb-4 flex items-center gap-3">
      {paso(1, "Fechas")}
      <span className="h-px flex-1 bg-slate-300 dark:bg-slate-600" aria-hidden />
      {paso(2, "Revisión")}
    </nav>
  );
}
