import mongoose, { Document } from "mongoose";
export interface ITenant extends Document {
    name: string;
    slug: string;
    domain?: string;
    userIds: mongoose.Types.ObjectId[];
    isSystem: boolean;
    company: {
        legalName: string;
        taxId?: string;
        industry?: string;
        address?: {
            street: string;
            city: string;
            state?: string;
            postalCode: string;
            country: string;
        };
        website?: string;
        description?: string;
        logoUrl?: string;
        firmaRRHHUrl?: string;
    };
    contact: {
        firstName: string;
        lastName: string;
        email: string;
        phone?: string;
        position?: string;
        department?: string;
    };
    settings: {
        timezone: string;
        currency: string;
        language: string;
        features: string[];
    };
    integrations?: {
        dropbox?: {
            appKey?: string;
            appSecretEnc?: string;
            refreshTokenEnc?: string;
            rootPath?: string;
            accountEmail?: string;
            /**
             * El id de cuenta de Dropbox (dbid:...). NO es decorativo: es lo unico que trae el webhook.
             *
             * La notificacion de Dropbox dice «algo cambio para estas cuentas» y nada mas — ni carpeta ni
             * archivo. Sin este id no hay forma de saber a que tenant escanear, y habria que escanearlos a
             * todos por cada aviso. Se completa al conectar, y para los ya conectados lo rellena solo el
             * primer escaneo que corra (ver `estadoDropboxCronService.ts`), sin pedirle nada a nadie.
             */
            accountId?: string;
            connectedAt?: Date;
            /** Cada cuántos minutos se revisan las carpetas vigiladas por transición automática. Default 20. */
            scanIntervalMinutes?: number;
        };
        afip?: {
            /** CUIT representada (el CUIT propio del tenant, dado de alta en AFIP como titular del certificado). */
            cuitRepresentada?: string;
            /** Certificado X.509 en formato PEM — no es secreto, se guarda tal cual. */
            certificadoPem?: string;
            /** Clave privada del certificado — cifrada en reposo. */
            clavePrivadaEnc?: string;
            ambiente?: "homologacion" | "produccion";
            connectedAt?: Date;
            /** Resultado de la última autoconsulta de prueba contra Consulta Padrón A13 (no solo el login
             *  WSAA) — ver `verificarServicioPadron` en afipService.ts. "connected" (arriba) no garantiza
             *  que el servicio esté autorizado en AFIP; esto sí lo prueba. */
            servicioPadronOk?: boolean;
            servicioPadronEstado?: "ok" | "no_autorizado" | "error";
            servicioPadronDetalle?: string;
            servicioPadronFaultCode?: string;
            servicioPadronFaultString?: string;
            servicioPadronVerificadoAt?: Date;
        };
        /**
         * Backup automático de la base a Dropbox (ver `services/backupService.ts`).
         *
         * Vive en el tenant y no en una variable de entorno para que se pueda cambiar desde la pantalla
         * —Documentos → DDBB → MongoDB— sin tocar el VPS ni reiniciar el proceso: el scheduler lee esto en
         * cada vuelta.
         */
        backup?: {
            /** Cada cuántas horas se genera una copia. */
            intervaloHoras?: number;
            /** Cuántas copias se conservan; las más viejas se borran al subir una nueva. */
            retener?: number;
            /** Cuándo terminó la última copia. Es lo que decide si toca una nueva, así que sobrevive a un reinicio. */
            ultimoBackupAt?: Date;
            ultimoError?: string;
        };
        /**
         * Usuario de clave fiscal con el que el SERVIDOR opera Simplificación Registral por su cuenta.
         *
         * ES OTRA COSA QUE `afip` DE ARRIBA. Aquel es un certificado X.509 para webservices (Consulta
         * Padrón A13): no tiene clave fiscal y no puede entrar a ninguna pantalla. Este es un login de
         * persona, porque la obra social de un trabajador NO la publica ningún webservice — solo aparece
         * precompletada en la pantalla de altas, adentro de una sesión con clave fiscal.
         *
         * ⚠ TIENE QUE SER UN USUARIO DELEGADO, NO EL DEL APODERADO.
         *
         * Una clave fiscal no está acotada a esta pantalla: abre presentación de DDJJ, VEP y pagos,
         * facturación electrónica, domicilio fiscal electrónico y el Administrador de Relaciones —que
         * permite delegarle servicios a otros CUIT—. Guardar la del apoderado convierte un servidor
         * comprometido en una identidad tributaria comprometida.
         *
         * Lo correcto, y lo que se asumió al construir esto, es un usuario de AFIP aparte al que se le
         * delegó ÚNICAMENTE «Simplificación Registral» desde Administrador de Relaciones. Así lo peor que
         * puede pasar es que alguien llegue a una pantalla de altas.
         *
         * La app no puede verificar qué servicios tiene delegados ese usuario: eso se controla en AFIP.
         * Por eso está escrito acá, donde lo va a leer quien mantenga esto.
         */
        arcaSimplificacion?: {
            /** CUIT del usuario delegado. No es el de la empleadora: es con el que se inicia sesión. */
            cuitUsuario?: string;
            /** Clave fiscal — cifrada en reposo con `secretCrypto`, igual que el resto de las credenciales. */
            claveEnc?: string;
            /**
             * Sesión de AFIP ya iniciada (`storageState` de Playwright), cifrada.
             *
             * Se guarda para no loguearse en cada corrida. Mientras dura es CASI tan poderosa como la
             * clave: quien la tenga entra sin contraseña. Por eso se cifra igual que la clave y no se
             * guarda en claro ni en un archivo suelto.
             */
            sesionEnc?: string;
            sesionGuardadaAt?: Date;
            /** Último login exitoso, para poder decir desde cuándo no entra. */
            ultimoLoginAt?: Date;
            /** Qué pasó la última vez, para que un fallo no haya que ir a buscarlo a los logs. */
            ultimoError?: string;
        };
        /**
         * Casilla de correo que recibe las copias de "documento enviado" de Dropbox Sign (se activa en
         * Dropbox Sign → Configuración → Perfil → Notificaciones). Leyéndola se detecta qué contratos ya
         * se enviaron a firmar, para moverlos de "Outbox" a "Pendbox" sin que nadie toque archivos.
         */
        dropboxSign?: {
            /** Casilla que recibe las notificaciones (ej. rrhh@frame.com.ar). */
            email?: string;
            imapHost?: string;
            imapPort?: number;
            imapSecure?: boolean;
            /** Usuario IMAP: suele ser el mismo email, pero algunos proveedores usan otro. */
            imapUser?: string;
            /** Contraseña IMAP — cifrada en reposo, igual que el resto de las credenciales. */
            imapPasswordEnc?: string;
            /** Mientras esté en false no se lee la casilla ni se mueve ningún archivo. */
            enabled?: boolean;
            configuredAt?: Date;
            /** Última lectura de la casilla y su resultado, para poder diagnosticar desde la UI. */
            lastCheckAt?: Date;
            lastCheckOk?: boolean;
            lastCheckDetalle?: string;
            /**
             * Historial de lecturas, de la más reciente a la más vieja. Solo se guardan las corridas que
             * encontraron algo o que fallaron: el job corre cada 5 minutos y la mayoría no tiene nada que
             * informar. Se conservan las últimas 50.
             */
            lastCheckHistorial?: {
                at: Date;
                ok: boolean;
                detalle?: string;
                logs?: {
                    resultado: "archivado" | "duplicado" | "sin-archivo" | "ignorado" | "error";
                    asunto?: string;
                    archivo?: string;
                    cuit?: string;
                    documento?: string;
                    detalle?: string;
                }[];
            }[];
        };
    };
    subscription: {
        plan: "free" | "basic" | "pro" | "enterprise";
        status: "active" | "suspended" | "cancelled";
        expiresAt?: Date;
    };
    usage: {
        users: {
            current: number;
            limit: number;
        };
        clients: {
            current: number;
            limit: number;
        };
        storage: {
            usedMB: number;
            limitMB: number;
        };
        apiCalls: {
            current: number;
            limit: number;
            resetDate: Date;
        };
        lastUpdated: Date;
    };
    billing: {
        currentPeriod: {
            startDate: Date;
            endDate: Date;
            amount: number;
            currency: string;
        };
        paymentMethod?: {
            type: "card" | "bank" | "paypal";
            last4?: string;
            expiryDate?: string;
        };
        invoices: {
            id: string;
            date: Date;
            amount: number;
            status: "paid" | "pending" | "overdue" | "cancelled";
            downloadUrl?: string;
        }[];
        nextBillingDate?: Date;
        autoRenew: boolean;
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Tenant: mongoose.Model<ITenant, {}, {}, {}, mongoose.Document<unknown, {}, ITenant, {}, {}> & ITenant & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
