/**
 * El motor que opera la pantalla de Dropbox Sign vive en `frontend/tools/`, como los de ARCA: es
 * JavaScript plano fuera del `rootDir` del server, con su propio test de lista blanca de clicks
 * (`frontend/tools/envio-dropbox-sign.test.mjs`). Se importa en tiempo de ejecución.
 */
export declare const MOTOR_DROPBOX_SIGN: string;
/**
 * EL MOTOR ACTUAL DEL DISCO, NO EL DE LA CACHÉ (26/10/2026). `import()` guarda el módulo mientras el
 * proceso vive: después de un `git pull` sin reinicio efectivo seguía corriendo el motor viejo («el
 * commit tarda una ronda en llegar»). Se importa con la huella del archivo en la URL, así cada corrida
 * usa lo que hay en disco, y se devuelve la huella para anotarla en el log de la corrida.
 */
export declare function cargarMotor(): Promise<{
    motor: any;
    version: string;
}>;
