/*
 * Extracción del nomenclador de Convenios Colectivos de Trabajo desde la tabla informativa de
 * Simplificación Registral (AFIP/ARCA).
 *
 *   https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/miSimplificacion/app/
 *   contribuyente/RelacionLaboral/CargaMasiva_tablasInformativas.aspx?tab=10
 *
 * Se corre en la consola del navegador YA LOGUEADO con clave fiscal. Hacerlo desde un cliente HTTP
 * externo obligaría a manejar la cookie de sesión, __VIEWSTATE y __EVENTVALIDATION a mano.
 *
 * Va en DOS PASOS a propósito: la página es ASP.NET WebForms y el botón de buscar puede disparar un
 * postback completo. Si así fuera, el documento se reemplaza y cualquier script que estuviera
 * esperando la respuesta muere en el medio. El paso 2 es idempotente: si la tabla todavía no cargó,
 * avisa en lugar de bajar un archivo vacío.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PASO 1 — pedir todas las filas (búsqueda vacía = sin filtro) y esperar la recarga.
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById("txt_buscar").value = "";
document.getElementById("buscar_button").click();

// ─────────────────────────────────────────────────────────────────────────────
// PASO 2 — cuando la tabla ya se ve en pantalla, pegar esto. Descarga convenios.json.
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  /**
   * La tabla viene en ISO-8859-1 mal interpretada: las vocales acentuadas en MAYÚSCULA llegan con
   * circunflejo (ALGODÔN → ALGODÓN, MECÂNICOS → MECÁNICOS). El circunflejo no existe en español, así
   * que el reemplazo no puede romper texto legítimo.
   */
  const fix = (s) => s.replace(/Â/g, "Á").replace(/Ê/g, "É").replace(/Î/g, "Í").replace(/Ô/g, "Ó").replace(/Û/g, "Ú");

  const tabla = [...document.querySelectorAll("table")].find((x) => x.rows.length > 3 && [...x.rows[0].cells].map((c) => c.innerText).join("|").toUpperCase().includes("CÓDIGO"));

  if (!tabla) {
    console.error('No se encontró la tabla de convenios. ¿Ya se ejecutó el PASO 1 y terminó de cargar? Debería verse la grilla con "CÓDIGO | DESCRIPCIÓN ACTIVIDAD | DESCRIPCIÓN SIGNATARIO".');
    return;
  }

  const data = [...tabla.rows]
    .slice(1)
    .map((r) => [...r.cells].slice(0, 3).map((c) => c.innerText.trim()))
    .filter((r) => r[0] || r[1] || r[2])
    .map(([codigo, actividad, signatario]) => ({ codigo, actividad: fix(actividad), signatario: fix(signatario) }));

  if (data.length === 0) {
    console.error("La tabla está pero no tiene filas de datos.");
    return;
  }

  // Control de calidad antes de bajar el archivo: si quedó mojibake que el fix no cubre, conviene
  // verlo ahora y no cuando el XLSX ya esté importado.
  const PERMITIDOS = /[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ\s/.,\-()&'"°ºª+:;%$#*_[\]|]/;
  const raros = new Set();
  for (const fila of data) {
    for (const ch of `${fila.codigo}${fila.actividad}${fila.signatario}`) {
      if (!PERMITIDOS.test(ch)) raros.add(ch);
    }
  }

  console.log(`Filas: ${data.length}`);
  console.table(data.slice(0, 5));
  if (raros.size) console.warn("Caracteres sin normalizar (revisar antes de importar):", [...raros].join(" "));
  else console.log("Codificación OK: no quedaron caracteres raros.");

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "convenios.json";
  a.click();
  URL.revokeObjectURL(a.href);
  console.log('Descargado "convenios.json". Ahora: npm run convenios -- ~/Downloads/convenios.json');
})();
