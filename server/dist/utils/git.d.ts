/**
 * QUÉ VERSIÓN ESTÁ CORRIENDO ESTE PROCESO. Lo usa `GET /api/v1/env`.
 *
 * Existía y devolvía `null` en el servidor de producción, que es justo donde hace falta: preguntaba
 * por el `git` del sistema y cualquier cosa lo hacía fallar en silencio —que no esté instalado, que
 * pm2 corra con otro usuario y git rechace el repo por «dubious ownership», o que el cwd del proceso
 * no sea el repositorio—. El resultado era un endpoint de diagnóstico que no diagnosticaba nada.
 *
 * Ahora hay dos caminos: primero el CLI (trae también el mensaje y el autor) y, si falla, la lectura
 * directa de `.git`, que no depende de que git exista ni de permisos.
 *
 * Y SOBRE TODO: `proceso.buildEl` e `iniciadoEl`. El commit dice qué se bajó con el último `git pull`;
 * esos dos dicen qué está EJECUTÁNDOSE. Un pull sin `pm2 restart` deja el código nuevo en el disco y
 * el viejo en memoria, y desde afuera las dos situaciones se ven exactamente igual — es la diferencia
 * que costó media hora encontrar cuando «no guardaba» un campo que en el código estaba.
 */
export interface GitInfo {
    branch: string | null;
    lastCommit: {
        hash: string | null;
        message: string | null;
        author: string | null;
    } | null;
    /** Qué está corriendo, que no es lo mismo que qué está commiteado. */
    proceso?: {
        /** Fecha del archivo que Node tiene cargado: cuándo se compiló ESTO. */
        buildEl: string | null;
        /** Desde cuándo corre el proceso. Anterior a `buildEl` = se buildeó sin reiniciar. */
        iniciadoEl: string;
        /** `true` cuando el build es más nuevo que el arranque: falta reiniciar. */
        faltaReiniciar: boolean;
    };
}
export declare function getGitInfo(): Promise<GitInfo>;
