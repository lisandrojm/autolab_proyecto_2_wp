/**
 * Locks en memoria por clave: las tareas con la misma clave corren de a una, en orden. Sirve
 * mientras el connector sea una sola instancia (PM2 en fork); con varias, hace falta un lock
 * compartido (ADR 0004).
 */
export class Locks {
  private readonly colas = new Map<string, Promise<unknown>>();

  async con<T>(clave: string, tarea: () => Promise<T>): Promise<T> {
    const anterior = this.colas.get(clave) ?? Promise.resolve();
    const actual = anterior.catch(() => undefined).then(tarea);
    this.colas.set(clave, actual);
    try {
      return await actual;
    } finally {
      if (this.colas.get(clave) === actual) this.colas.delete(clave);
    }
  }
}
