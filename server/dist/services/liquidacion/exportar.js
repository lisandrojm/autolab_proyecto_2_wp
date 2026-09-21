import ExcelJS from "exceljs";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS TRES ARCHIVOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Memosoft no tiene API: el XLSX ES el contrato de integración. Todo lo que este módulo hace es
 * escribir exactamente lo que ese importador espera, sin una celda de más.
 *
 *   1. IMPORT — lo que se le da de comer a Memosoft. Seis columnas, una hoja por empresa × centro
 *      de costo × régimen. Formato rígido.
 *   2. PLANILLA DE CONTROL — un renglón por día × persona × turno, para cruzar contra el reloj y
 *      para que alguien pueda revisar de dónde salió cada número del import.
 *   3. ANEXO DE EXCEPCIONES — lo que la corrida no pudo resolver sola.
 *
 * ── Las reglas duras del import, y por qué cada una ──
 *
 * · `d8lega` y `d8conc` van como TEXTO. Son "00001" y "0017": si Excel los toma como número pierde
 *   los ceros de la izquierda y Memosoft rechaza el archivo sin decir por qué.
 * · El parámetro que no se usa va en CERO, nunca vacío. Es requisito del importador.
 * · Nada más en la hoja: ni totales, ni formato condicional, ni una columna extra. Cualquier cosa
 *   de más corre las columnas y el importador lee mal.
 */
/** Seis columnas, en este orden, con estos nombres. No se toca. */
const COLUMNAS_IMPORT = ["d8lega", "d1nape", "d8conc", "d8desc", "d8par1", "d8par2"];
/**
 * Excel no acepta ciertos caracteres en el nombre de una hoja, ni más de 31.
 *
 * Se recorta por el final y no por el principio: lo que identifica la hoja —empresa y centro de
 * costo— está adelante, y lo que se pierde es la descripción larga.
 */
function nombreDeHojaValido(nombre, usados) {
    const limpio = String(nombre || "Hoja")
        .split("")
        .filter((c) => !"[]:*?/\\".includes(c))
        .join("")
        .trim()
        .slice(0, 31);
    let candidato = limpio || "Hoja";
    let n = 2;
    // Dos hojas no pueden llamarse igual; si el recorte las hizo colisionar, se numera.
    while (usados.has(candidato.toLowerCase())) {
        const sufijo = ` ${n++}`;
        candidato = `${limpio.slice(0, 31 - sufijo.length)}${sufijo}`;
    }
    usados.add(candidato.toLowerCase());
    return candidato;
}
/**
 * EL ARCHIVO QUE VA A MEMOSOFT.
 *
 * Una hoja por cada `hoja` distinta de la corrida, y dentro, una fila por (legajo, concepto).
 */
export async function generarImportMemosoft(corrida) {
    const libro = new ExcelJS.Workbook();
    libro.creator = "WeProdu";
    libro.created = new Date();
    const porHoja = new Map();
    for (const l of corrida.lineas || []) {
        const clave = l.hoja || "SIN HOJA";
        porHoja.set(clave, [...(porHoja.get(clave) || []), l]);
    }
    const usados = new Set();
    for (const [nombre, lineas] of [...porHoja.entries()].sort()) {
        const hoja = libro.addWorksheet(nombreDeHojaValido(nombre, usados));
        hoja.addRow(COLUMNAS_IMPORT);
        for (const l of lineas) {
            const fila = hoja.addRow([
                String(l.legajo ?? ""),
                l.apellidoYNombre || "",
                String(l.conceptoCodigo ?? ""),
                l.conceptoDescripcion || "",
                // El que no se usa va en cero, NUNCA vacío.
                Number(l.par1 || 0),
                Number(l.par2 || 0),
            ]);
            /*
              Las dos primeras celdas se fuerzan a texto. Sin esto Excel guarda 00001 como el número 1,
              y al abrir el archivo ya perdió los ceros: el importador lo rechaza y nadie sabe por qué.
            */
            fila.getCell(1).numFmt = "@";
            fila.getCell(3).numFmt = "@";
        }
    }
    // Un libro sin hojas no se puede guardar, y una corrida vacía es un resultado legítimo.
    if (porHoja.size === 0)
        libro.addWorksheet("Sin datos").addRow(COLUMNAS_IMPORT);
    return Buffer.from(await libro.xlsx.writeBuffer());
}
const COLUMNAS_PLANILLA = [
    { encabezado: "Legajo", ancho: 10, de: (f) => f.legajo || "" },
    { encabezado: "Apellido y nombre", ancho: 32, de: (f) => f.apellidoYNombre },
    { encabezado: "Empresa", ancho: 16, de: (f) => f.empresaNombre || "" },
    { encabezado: "CC", ancho: 8, de: (f) => f.ccCodigo || "" },
    { encabezado: "Régimen", ancho: 12, de: (f) => f.regimen || "" },
    { encabezado: "Fecha", ancho: 12, de: (f) => f.fecha },
    { encabezado: "Día", ancho: 10, de: (f) => diaDeLaSemana(f.fecha) },
    { encabezado: "Turno", ancho: 16, de: (f) => f.turnoNombre || "" },
    { encabezado: "Proyecto", ancho: 22, de: (f) => f.proyecto || f.proyectoNombre || "" },
    { encabezado: "Área", ancho: 18, de: (f) => f.areaNombre || "" },
    { encabezado: "Horario desde", ancho: 13, de: (f) => f.horarioDesde || "" },
    { encabezado: "Horario hasta", ancho: 13, de: (f) => f.horarioHasta || "" },
    { encabezado: "Horas de jornada", ancho: 15, de: (f) => f.horasDeJornada || 0 },
    { encabezado: "Estado", ancho: 12, de: (f) => f.estado },
    { encabezado: "Motivo", ancho: 20, de: (f) => f.motivoNombre || "" },
    { encabezado: "Reemplaza a", ancho: 30, de: (f) => f.reemplazaA || "" },
    { encabezado: "HE 50%", ancho: 9, de: (f) => f.he50 || 0 },
    { encabezado: "HE 100%", ancho: 9, de: (f) => f.he100 || 0 },
    /*
      LAS HORAS EXTRA SIN CLASIFICAR TIENEN SU PROPIA COLUMNA.
  
      Son el 98% de las que existen. Si se las sumara a una de las otras dos se estaría inventando el
      dato; si no se mostraran, quien revisa la planilla no vería que están ahí sin liquidar.
    */
    { encabezado: "HE sin clasificar", ancho: 16, de: (f) => f.heSinDiscriminar || 0 },
    { encabezado: "Conceptos generados", ancho: 40, de: (f) => f.conceptos.join(" · ") },
    { encabezado: "Nº de parte", ancho: 18, de: (f) => f.reportNumber || "" },
    { encabezado: "Observaciones", ancho: 30, de: (f) => f.notas || "" },
];
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
/** El día de la semana de un "AAAA-MM-DD", sin que la zona horaria lo corra uno para atrás. */
function diaDeLaSemana(fecha) {
    const [a, m, d] = String(fecha).split("-").map(Number);
    if (!a || !m || !d)
        return "";
    return DIAS[new Date(a, m - 1, d).getDay()] || "";
}
/**
 * LA PLANILLA DE CONTROL.
 *
 * Es el archivo que se mira cuando un número del import no cierra, y el que se cruza contra el
 * reloj. Por eso tiene el grano más fino que existe —un día de una persona— y no está agregada.
 */
export async function generarPlanillaDeControl(filas, periodo) {
    const libro = new ExcelJS.Workbook();
    libro.creator = "WeProdu";
    libro.created = new Date();
    const hoja = libro.addWorksheet(`Control ${periodo}`);
    hoja.addRow(COLUMNAS_PLANILLA.map((c) => c.encabezado));
    hoja.getRow(1).font = { bold: true };
    hoja.columns = COLUMNAS_PLANILLA.map((c) => ({ width: c.ancho }));
    // Se congela el encabezado: son miles de filas y sin esto hay que adivinar qué columna es cuál.
    hoja.views = [{ state: "frozen", ySplit: 1 }];
    const ordenadas = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.legajo).localeCompare(String(b.legajo)) || a.aplicaA.localeCompare(b.aplicaA));
    ordenadas.forEach((f) => hoja.addRow(COLUMNAS_PLANILLA.map((c) => c.de(f))));
    if (ordenadas.length > 0)
        hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS_PLANILLA.length } };
    return Buffer.from(await libro.xlsx.writeBuffer());
}
/**
 * EL ANEXO DE EXCEPCIONES.
 *
 * Lo que la corrida no pudo resolver sola, con las bloqueantes primero: son las que impiden bajar
 * el import, así que son las que hay que trabajar.
 */
export async function generarAnexoDeExcepciones(corrida) {
    const libro = new ExcelJS.Workbook();
    libro.creator = "WeProdu";
    libro.created = new Date();
    const hoja = libro.addWorksheet(`Excepciones ${corrida.periodo}`);
    hoja.addRow(["¿Bloquea?", "Motivo", "Legajo/Persona", "Fecha", "Detalle", "Evento"]);
    hoja.getRow(1).font = { bold: true };
    hoja.columns = [{ width: 11 }, { width: 26 }, { width: 34 }, { width: 12 }, { width: 70 }, { width: 46 }];
    hoja.views = [{ state: "frozen", ySplit: 1 }];
    const ordenadas = [...(corrida.excepciones || [])].sort((a, b) => Number(b.bloqueante) - Number(a.bloqueante) || a.motivo.localeCompare(b.motivo) || String(a.apellidoYNombre).localeCompare(String(b.apellidoYNombre)));
    for (const e of ordenadas) {
        const fila = hoja.addRow([e.bloqueante ? "BLOQUEA" : "avisa", e.motivo, e.apellidoYNombre || String(e.userId || ""), e.fecha || "", e.detalle, e.eventoId || ""]);
        if (e.bloqueante)
            fila.getCell(1).font = { bold: true, color: { argb: "FFB00020" } };
    }
    if (ordenadas.length > 0)
        hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
    return Buffer.from(await libro.xlsx.writeBuffer());
}
