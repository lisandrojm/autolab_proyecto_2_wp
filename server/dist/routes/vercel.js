import { Router } from "express";
const router = Router();
const TOKEN = process.env.VERCEL_API_TOKEN || "";
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || ""; // prj_xxx (recomendado)
const APP = process.env.VERCEL_APP || ""; // nombre del proyecto (fallback)
const TEAM_ID = process.env.VERCEL_TEAM_ID || "";
function withTeam(url) {
    return TEAM_ID ? (url.includes("?") ? `${url}&teamId=${encodeURIComponent(TEAM_ID)}` : `${url}?teamId=${encodeURIComponent(TEAM_ID)}`) : url;
}
async function fetchJson(url) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const text = await resp.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    }
    catch {
        /* deja text para debug */
    }
    return { ok: resp.ok, status: resp.status, json, text };
}
router.get("/vercel/last-deploy", async (_req, res) => {
    try {
        if (!TOKEN)
            return res.status(500).json({ error: "Falta VERCEL_API_TOKEN" });
        if (!PROJECT_ID && !APP) {
            return res.status(500).json({ error: "Configurar VERCEL_PROJECT_ID (prj_***) o VERCEL_APP" });
        }
        // 1) Intento fuerte: por PROJECT_ID + filtros (prod + READY)
        let listUrl = `https://api.vercel.com/v6/deployments?limit=1`;
        if (PROJECT_ID)
            listUrl += `&projectId=${encodeURIComponent(PROJECT_ID)}`;
        else
            listUrl += `&app=${encodeURIComponent(APP)}`;
        listUrl += `&target=production&state=READY`;
        listUrl = withTeam(listUrl);
        let r1 = await fetchJson(listUrl);
        // 2) Si no hay OK o no hay deployments, aflojo filtros (sin target/state)
        if (!r1.ok || !r1.json?.deployments?.length) {
            let relaxedUrl = `https://api.vercel.com/v6/deployments?limit=1`;
            if (PROJECT_ID)
                relaxedUrl += `&projectId=${encodeURIComponent(PROJECT_ID)}`;
            else
                relaxedUrl += `&app=${encodeURIComponent(APP)}`;
            relaxedUrl = withTeam(relaxedUrl);
            const r2 = await fetchJson(relaxedUrl);
            // Si tampoco hay nada, devolvé error diagnosticable (NO 500 ciego)
            if (!r2.ok) {
                return res.status(502).json({
                    error: "Vercel list deployments fallo",
                    status: r2.status,
                    details: r2.json || r2.text,
                    hint: "Verificá VERCEL_PROJECT_ID / VERCEL_APP y permisos del token",
                });
            }
            if (!r2.json?.deployments?.length) {
                return res.status(404).json({
                    error: "No hay deployments para este proyecto",
                    hint: "Hacé al menos un deploy, o revisá filtros",
                });
            }
            r1 = r2; // usar el relajado
        }
        const dpl = r1.json.deployments[0];
        const uid = dpl?.uid;
        if (!uid) {
            return res.status(500).json({ error: "No se encontró UID del deployment", raw: dpl });
        }
        // 3) Detalle (withGitRepoInfo=true) para intentar sha/branch
        let detUrl = `https://api.vercel.com/v13/deployments/${uid}?withGitRepoInfo=true`;
        detUrl = withTeam(detUrl);
        const det = await fetchJson(detUrl);
        if (!det.ok) {
            // A veces el detalle falla por permisos; aún así devolvemos lo básico del listado
            return res.status(200).json({
                // Básico desde listado
                sha: undefined,
                shortSha: undefined,
                createdAt: dpl.createdAt ?? dpl.created,
                url: dpl.url,
                branch: undefined,
                commitMessage: undefined,
                note: "Detalle de deployment no disponible",
                debug: { status: det.status, details: det.json || det.text },
            });
        }
        const full = det.json;
        const sha = full?.gitSource?.sha;
        const branch = full?.gitSource?.ref;
        const createdAt = full?.createdAt ?? dpl?.createdAt ?? dpl?.created;
        const commitMessage = full?.meta?.githubCommitMessage || full?.meta?.gitlabCommitMessage || full?.meta?.bitbucketCommitMessage || full?.meta?.commitMessage;
        return res.json({
            sha,
            shortSha: sha ? sha.slice(0, 7) : undefined,
            createdAt,
            url: full?.url || dpl?.url,
            branch,
            commitMessage,
        });
    }
    catch (err) {
        return res.status(500).json({ error: err?.message || "Error consultando Vercel" });
    }
});
export { router as vercelRoutes };
