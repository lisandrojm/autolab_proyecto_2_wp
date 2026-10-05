import { Queue } from "bullmq";
// import { env } from "./env.js";
// Log de diagnóstico (te ayuda a ver qué valen las envs en runtime)
// console.log("[queue] FEATURE_JOBS =", env.FEATURE_JOBS, "REDIS_URL =", env.REDIS_URL ?? "(empty)");
/** 🔒 Si FEATURE_JOBS !== "true" → jobs deshabilitados SIEMPRE */
export const JOBS_ENABLED = false; // String(env.FEATURE_JOBS) === "true";
export let redis = null;
// Early-return: NO crear conexión aunque haya REDIS_URL
if (!JOBS_ENABLED) {
    console.warn("[queue] Jobs DESHABILITADOS (FEATURE_JOBS != 'true'). No se conectará a Redis.");
}
else {
    console.warn("[queue] Jobs deshabilitados temporalmente");
}
/** Helper seguro: crea cola sólo si hay redis */
function makeQueue(name) {
    return redis
        ? new Queue(name, {
            connection: redis,
            defaultJobOptions: {
                removeOnComplete: 10,
                removeOnFail: 50,
                attempts: 3,
                backoff: { type: "exponential", delay: 2000 },
            },
        })
        : null;
}
export const assetsQueue = makeQueue("assets-derive");
export const ragQueue = makeQueue("rag-ingest");
