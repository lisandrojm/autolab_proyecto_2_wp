/*
  EL CÓDIGO DEL CENTRO DE COSTO EN UN BADGE VIOLETA, adelante del nombre del proyecto (01/11/2026): el
  centro se usa mucho para nombrar a los proyectos («el 426»), así que va pegado al nombre y no sólo en
  su fila de la ficha. Mismos colores que el badge de «Centro de Costo» de la tarjeta y la ficha.
  Sin código no se dibuja nada.
*/
export function BadgeCentroCosto({ codigo, className = "" }: { codigo?: string | null; className?: string }) {
  if (!codigo) return null;
  return (
    <span title="Centro de costo" className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none align-middle whitespace-nowrap bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50 ${className}`}>
      {codigo}
    </span>
  );
}
