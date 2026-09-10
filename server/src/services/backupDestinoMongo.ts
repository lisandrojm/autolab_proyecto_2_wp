import mongoose from "mongoose";
import { Readable } from "stream";
import type { ArchivoBackup } from "./backupService.js";

/**
 * SEGUNDO DESTINO DE LOS BACKUPS: OTRA BASE DE MONGO.
 *
 * La copia se sube a Dropbox (destino principal) y además se guarda acá. La gracia está en el «OTRA»:
 * si se guardara en la misma base que se respalda no sería un backup, sería una segunda copia que se
 * muere junto con la primera —y encima el próximo dump se respaldaría a sí mismo, porque
 * `generarArchivos()` recorre TODAS las colecciones—.
 *
 * Por eso este módulo:
 *  - Usa una conexión aparte (`MONGO_URI_BACKUP`), que apunta a otro cluster o a otra base.
 *  - Se NIEGA a correr si esa URI es la misma que la de la aplicación.
 *  - Si la variable no está configurada, no hace nada y lo informa. No rompe el backup: Dropbox alcanza.
 *
 * GRIDFS Y NO UNA COLECCIÓN COMÚN: un documento de Mongo no puede pasar los 16 MB, y el `.json` de una
 * colección grande los pasa sin esfuerzo. GridFS parte el archivo en chunks y es parte del driver que
 * ya está instalado, así que no suma dependencias.
 *
 * RETENCIÓN: se conserva SOLO LA ÚLTIMA copia. El histórico vive en Dropbox, que guarda las que diga
 * la pantalla. Acá se borra la anterior DESPUÉS de escribir la nueva completa, nunca antes: si la
 * escritura falla, la copia vieja sigue estando.
 */

const BUCKET = "backups";

export interface ResultadoDestinoMongo {
  /** `false` cuando no hay `MONGO_URI_BACKUP`: no es un error, es que no está configurado. */
  configurado: boolean;
  archivos: number;
  bytes: number;
  borrados: number;
  /** Base y cluster donde quedó, para poder mostrarlo sin exponer la URI entera. */
  destino?: string;
}

/** La URI del destino, o `null` si no está configurado. Lanza si apunta a la base de la aplicación. */
export function uriDeBackup(): string | null {
  const uri = String(process.env.MONGO_URI_BACKUP || "").trim();
  if (!uri) return null;
  if (uri === String(process.env.MONGO_URI || "").trim()) {
    throw new Error("MONGO_URI_BACKUP apunta a la MISMA base que usa la aplicación: eso no es un backup y además haría que cada copia se respalde a sí misma.");
  }
  return uri;
}

/** El nombre de la base destino, si la URI lo trae. Solo para mostrarlo; nunca se loguea la URI. */
export function nombreDeBaseDestino(uri: string): string {
  const explicito = String(process.env.MONGO_DB_NAME_BACKUP || "").trim();
  if (explicito) return explicito;
  const m = /\/([^/?]+)(\?|$)/.exec(uri.replace(/^mongodb(\+srv)?:\/\//, ""));
  return m?.[1] || "(la de la URI)";
}

/**
 * Guarda una copia en el Mongo de backup y borra la anterior.
 *
 * `carpeta` es el mismo nombre que la carpeta de Dropbox, así que las dos copias son reconocibles como
 * la misma corrida.
 */
export async function guardarEnMongo(carpeta: string, archivos: ArchivoBackup[]): Promise<ResultadoDestinoMongo> {
  const uri = uriDeBackup();
  if (!uri) return { configurado: false, archivos: 0, bytes: 0, borrados: 0 };

  const dbName = String(process.env.MONGO_DB_NAME_BACKUP || "").trim();
  // Conexión propia y efímera: esto corre dos veces por día, no justifica sostener un pool abierto.
  const conexion = await mongoose.createConnection(uri, dbName ? { dbName } : {}).asPromise();

  try {
    const bucket = new mongoose.mongo.GridFSBucket(conexion.db!, { bucketName: BUCKET });

    let bytes = 0;
    for (const archivo of archivos) {
      await new Promise<void>((resolve, reject) => {
        const subida = bucket.openUploadStream(`${carpeta}/${archivo.nombre}`, {
          metadata: { carpeta, coleccion: archivo.nombre.replace(/\.json$/, ""), documentos: archivo.documentos, generadoEn: new Date() },
        });
        Readable.from(archivo.contenido).pipe(subida).on("error", reject).on("finish", () => resolve());
      });
      bytes += archivo.contenido.length;
    }

    /*
      Recién ahora se borra lo viejo: si algo de lo de arriba falló, esta línea no se alcanza y la copia
      anterior sigue intacta. Un backup nuevo a medias no puede costar el backup que ya estaba.
    */
    const viejos = await conexion
      .db!.collection(`${BUCKET}.files`)
      .find({ "metadata.carpeta": { $ne: carpeta } })
      .project({ _id: 1 })
      .toArray();
    for (const f of viejos) await bucket.delete(f._id as any);

    return { configurado: true, archivos: archivos.length, bytes, borrados: viejos.length, destino: nombreDeBaseDestino(uri) };
  } finally {
    await conexion.close();
  }
}
