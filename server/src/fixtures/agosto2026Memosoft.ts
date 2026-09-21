/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ARCHIVO REAL DE AGOSTO 2026, como se le entregó a Memosoft
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Es la única fuente de verdad que existe sobre qué tiene que producir el motor. Todo lo demás
 * —la tabla de conceptos, el mapeo, las reglas— son descripciones de esto.
 *
 * ── Qué está transcripto y qué no ──
 *
 * El PDF imprime las hojas con `d8par1` y `d8par2` en páginas SEPARADAS para las dos primeras, así
 * que ahí no se puede aparear fila con valor sin adivinar. Por eso están completas sólo las hojas
 * donde las dos columnas van en la misma línea, que son las de JORNALEROS —las que se comparan
 * directo contra el 0000 que emite el motor— más el censo de conceptos de todo el archivo.
 *
 * Transcribir a mano las 745 filas a ojo sería meter errores de tipeo en el patrón de oro. Lo que
 * está acá es lo que se puede leer sin ambigüedad.
 */

export interface FilaReal {
  legajo: string;
  nombre: string;
  concepto: string;
  /** Días u horas. En los jornaleros el jornal va en par2. */
  par1: number;
  par2: number;
}

/**
 * LAS DOS HOJAS DE JORNALEROS, completas.
 *
 * Cada persona tiene exactamente dos filas: 0000 Jornal con los días en par2, y 0501 S.A.C.
 * Proporcional con EL MISMO número en par1. Esa igualdad se repite en las 72 personas sin una sola
 * excepción, así que el S.A.C. proporcional de un jornalero es derivable de sus días.
 */
export const JORNALEROS_AGOSTO: { legajo: string; nombre: string; dias: number }[] = [
  // Hoja "02029" (página 19 del PDF)
  { legajo: "01059", nombre: "LEAL GODOY, EDGAR YESID", dias: 3 },
  { legajo: "02020", nombre: "DONATO, GUSTAVO GABRIEL", dias: 4 },
  { legajo: "02022", nombre: "LUSA YARA, AYELEN", dias: 6 },
  { legajo: "02023", nombre: "MORENO, MARTINA", dias: 3 },
  { legajo: "02025", nombre: "FARIAS DIAZ, JUSTO SANTIAGO", dias: 2 },
  { legajo: "02026", nombre: "LACHMAN, VALERIA YAEL", dias: 3 },
  { legajo: "02027", nombre: "NUÑEZ, HUGO DAVID", dias: 4 },
  { legajo: "02028", nombre: "GARMENDIA, GUADALUPE", dias: 4 },
  { legajo: "02029", nombre: "CROCE SUERO, LAURA", dias: 2 },

  // Hoja grande de jornaleros (páginas 25 a 27)
  { legajo: "00006", nombre: "Pereda Mariana", dias: 8 },
  { legajo: "00027", nombre: "Targise Nicolás Leandro", dias: 9 },
  { legajo: "00028", nombre: "Aguirre Daniel Alejandro", dias: 10 },
  { legajo: "01017", nombre: "Romero Gabriela Águeda", dias: 4 },
  { legajo: "01158", nombre: "Krust César Isaac", dias: 4 },
  { legajo: "01187", nombre: "Nivia López Nicolas", dias: 7 },
  { legajo: "01195", nombre: "Aquino Cristian Jesus", dias: 1 },
  { legajo: "01201", nombre: "ERREGUERENA CHRISTIAN ARIEL", dias: 1 },
  { legajo: "01481", nombre: "Pafundo Agustín", dias: 1 },
  { legajo: "01500", nombre: "De Santis Damiano", dias: 12 },
  { legajo: "01522", nombre: "Nogueira Ezequiel", dias: 8 },
  { legajo: "01531", nombre: "Freige Lucas", dias: 3 },
  { legajo: "01533", nombre: "Pinasco Cintia Marina", dias: 4 },
  { legajo: "01535", nombre: "Rebora M Laura", dias: 4 },
  { legajo: "01542", nombre: "Ramirez Lucas Gabriel", dias: 11 },
  { legajo: "01568", nombre: "Garavano Tomas", dias: 6 },
  { legajo: "01569", nombre: "García Manuel", dias: 4 },
  { legajo: "01571", nombre: "Garcia Jorge", dias: 5 },
  { legajo: "01577", nombre: "Preti Sofia Serena", dias: 9 },
  { legajo: "01579", nombre: "Aquino Alan Gabriel", dias: 5 },
  { legajo: "01603", nombre: "Blanco Nicolás", dias: 5 },
  { legajo: "01614", nombre: "Schefer Thiebeaud Amalia Margarita", dias: 1 },
  { legajo: "01616", nombre: "Marin Horacio", dias: 13 },
  { legajo: "01629", nombre: "Ojeda Gabriel Fernando", dias: 4 },
  { legajo: "01630", nombre: "RIZZO GUSTAVO", dias: 16 },
  { legajo: "01651", nombre: "Raffa Victoria", dias: 2 },
  { legajo: "01654", nombre: "Stornini Clara Maria", dias: 6 },
  { legajo: "01664", nombre: "arriola matias ezequiel", dias: 4 },
  { legajo: "01666", nombre: "ciejovicz fabio", dias: 23 },
  { legajo: "01700", nombre: "Aquino Leonardo Thomas", dias: 17 },
  { legajo: "01702", nombre: "soria xiara", dias: 17 },
  { legajo: "01725", nombre: "Bevacqua Priscila Soledad", dias: 6 },
  { legajo: "01726", nombre: "Ceraso Facundo", dias: 3 },
  { legajo: "01729", nombre: "Lobretzky Lucas Hugo", dias: 10 },
  { legajo: "01731", nombre: "VELIZ BORCA GUSTAVO EMANUEL", dias: 5 },
  { legajo: "01743", nombre: "Lozano Federico", dias: 6 },
  { legajo: "01745", nombre: "Montoya Carlos Ángel", dias: 12 },
  { legajo: "01759", nombre: "Parrinello Ethel Ines", dias: 15 },
  { legajo: "01842", nombre: "Margiottiello Patricio Nicolas", dias: 7 },
  { legajo: "01844", nombre: "PAIBA MORALES MARIA CLAUDIA", dias: 4 },
  { legajo: "01845", nombre: "Varela Cinthia Anahí", dias: 7 },
  { legajo: "01850", nombre: "Tomasello Iara Bejle", dias: 8 },
  { legajo: "01853", nombre: "amadore eduardo", dias: 5 },
  { legajo: "01856", nombre: "Felitto Olivia", dias: 4 },
  { legajo: "01858", nombre: "Ordoqui Diego", dias: 11 },
  { legajo: "01861", nombre: "Zalazar Lencina Luciano Martin", dias: 24 },
  { legajo: "01866", nombre: "Mariño Naiara", dias: 3 },
  { legajo: "01870", nombre: "barrera minnicelli isaias nahuel", dias: 12 },
  { legajo: "01871", nombre: "Bogado Moscol David Ezequiel", dias: 6 },
  { legajo: "01872", nombre: "Repetti Daniel Jeremias", dias: 3 },
  { legajo: "01873", nombre: "Romero Walter Gustavo", dias: 1 },
  { legajo: "01874", nombre: "Veliz Angel Damian", dias: 3 },
  { legajo: "01880", nombre: "veliz angeles selena", dias: 3 },
  { legajo: "01881", nombre: "BARRAL ALEJO NICOLAS", dias: 6 },
  { legajo: "02017", nombre: "Dominguez Jorge luis", dias: 6 },
  { legajo: "02018", nombre: "Etchavarría Jimena Sabrina", dias: 9 },
  { legajo: "02019", nombre: "Maeda Lucas Takeshi", dias: 7 },
  { legajo: "02030", nombre: "Banegas Laila Sofia", dias: 2 },
  { legajo: "02031", nombre: "Brina Adrian", dias: 13 },
  { legajo: "02032", nombre: "Gallardo Santiago Ezequiel", dias: 6 },
];

/**
 * QUÉ CONCEPTOS APARECEN EN EL ARCHIVO REAL, contados sobre las 745 filas.
 *
 * Es el censo, no el detalle: sirve para ver de una qué emite el archivo y qué no, que es la
 * pregunta que más rápido muestra dónde está parado el motor.
 */
export const CENSO_DE_CONCEPTOS: { codigo: string; descripcion: string; nota: string }[] = [
  { codigo: "0000", descripcion: "Jornal", nota: "Sólo jornaleros. Los días van en par2." },
  { codigo: "0001", descripcion: "Sueldo Básico", nota: "TODOS los mensualizados, par2 = días del período (30, 28, 25, 21, 14…)." },
  { codigo: "0011", descripcion: "Inasistencia Injustificada", nota: "7 personas, par1 = 2, 3 o 6 días." },
  { codigo: "0015", descripcion: "Horas Extras al 50%", nota: "Casi exclusivo de una hoja, con valores grandes (45 a 63)." },
  { codigo: "0016", descripcion: "Horas Extras al 100%", nota: "Repartido, valores de 1 a 33." },
  { codigo: "0017", descripcion: "Feriado", nota: "Horas de la jornada: 6, 6.5, 7, 8." },
  { codigo: "0018", descripcion: "Dia del gremio", nota: "CASI UNIVERSAL entre mensualizados, también horas de jornada." },
  { codigo: "0019", descripcion: "Adicional F", nota: "1 o 2 según la hoja. Ver el análisis." },
  { codigo: "0090", descripcion: "Licencia Sin Goce de Sueldo", nota: "UNA sola persona (Prestes)." },
  { codigo: "0099", descripcion: "Adelanto de Sueldos", nota: "Importes: 100.000, 200.000, 250.000, 430.000." },
  { codigo: "0501", descripcion: "S.A.C. Proporcional", nota: "Casi universal. En jornaleros, par1 = los mismos días del 0000." },
  { codigo: "0601", descripcion: "Plus Vacacional", nota: "Palmieri 7, Zuccarello 7, Mania 14." },
];

/**
 * LOS CONCEPTOS QUE EL ARCHIVO REAL **NO** TIENE, y que conviene tener presentes:
 * 0012 Licencia por Enfermedad, 0010 Inasistencia, 0013, 0020, 0029, 0030, 0040, 0041, 0042,
 * 0043, 0080, 0081, 0500, 0604, 0701, 0008, 0009.
 */
export const CONCEPTOS_AUSENTES = ["0008", "0009", "0010", "0012", "0013", "0020", "0029", "0030", "0040", "0041", "0042", "0043", "0080", "0081", "0500", "0604", "0701"];
