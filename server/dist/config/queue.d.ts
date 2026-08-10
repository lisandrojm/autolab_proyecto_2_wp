import { Queue } from "bullmq";
/** 🔒 Si FEATURE_JOBS !== "true" → jobs deshabilitados SIEMPRE */
export declare const JOBS_ENABLED = false;
export declare let redis: any | null;
export declare const assetsQueue: Queue<any, any, string, any, any, string>;
export declare const ragQueue: Queue<any, any, string, any, any, string>;
export interface AssetDeriveJob {
    assetId: string;
    tenantId: string;
    kind: string;
    originalPath: string;
    mimeType: string;
}
export interface RagIngestJob {
    docId: string;
    tenantId: string;
    assetId?: string;
    text?: string;
    title: string;
    language: string;
    labels: string[];
    meta?: Record<string, any>;
}
