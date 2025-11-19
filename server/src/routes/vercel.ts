import { Router } from "express";

const router = Router();

const TOKEN = process.env.VERCEL_API_TOKEN || "";
const PROJECT_ID = process.env.VERCEL_PROJECT_ID || ""; // prj_xxx (recomendado)
const APP = process.env.VERCEL_APP || ""; // nombre del proyecto (fallback)
const TEAM_ID = process.env.VERCEL_TEAM_ID || "";
const DEPLOY_HOOK_ID = process.env.VERCEL_DEPLOY_HOOK_ID || ""; // último segmento del deploy hook (meta-deployHookId)

function withTeam(url: string) {
  return TEAM_ID ? (url.includes("?") ? `${url}&teamId=${encodeURIComponent(TEAM_ID)}` : `${url}?teamId=${encodeURIComponent(TEAM_ID)}`) : url;
}

async function fetchJson(url: string) {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const text = await resp.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* deja text para debug */
  }
  return { ok: resp.ok, status: resp.status, json, text };
}

router.get("/vercel/last-deploy", async (_req, res) => {
  try {
    if (!TOKEN) {
      return res.status(500).json({ error: "Falta VERCEL_API_TOKEN" });
    }

    if (!PROJECT_ID && !APP && !DEPLOY_HOOK_ID) {
      return res.status(500).json({
        error: "Configurar al menos uno: VERCEL_PROJECT_ID (prj_***), VERCEL_APP o VERCEL_DEPLOY_HOOK_ID",
      });
    }

    let r1: { ok: boolean; status: number; json: any; text: string | null };

    // 1) Si tenemos DEPLOY_HOOK_ID, priorizar deployments generados por ese hook
    if (DEPLOY_HOOK_ID) {
      let byHookUrl = `https://api.vercel.com/v6/deployments?limit=1&meta-deployHookId=${encodeURIComponent(DEPLOY_HOOK_ID)}`;
      if (PROJECT_ID) {
        byHookUrl += `&projectId=${encodeURIComponent(PROJECT_ID)}`;
      } else if (APP) {
        byHookUrl += `&app=${encodeURIComponent(APP)}`;
      }
      byHookUrl = withTeam(byHookUrl);

      const byHookResp = await fetchJson(byHookUrl);
      if (byHookResp.ok && byHookResp.json?.deployments?.length) {
        r1 = byHookResp;
      } else {
        // si por hook no hay nada, caemos al comportamiento anterior por proyecto/app
        let listUrl = `https://api.vercel.com/v6/deployments?limit=1`;
        if (PROJECT_ID) {
          listUrl += `&projectId=${encodeURIComponent(PROJECT_ID)}`;
        } else if (APP) {
          listUrl += `&app=${encodeURIComponent(APP)}`;
        }
        listUrl += `&target=production&state=READY`;
        listUrl = withTeam(listUrl);
        r1 = await fetchJson(listUrl);

        if (!r1.ok || !r1.json?.deployments?.length) {
          let relaxedUrl = `https://api.vercel.com/v6/deployments?limit=1`;
          if (PROJECT_ID) {
            relaxedUrl += `&projectId=${encodeURIComponent(PROJECT_ID)}`;
          } else if (APP) {
            relaxedUrl += `&app=${encodeURIComponent(APP)}`;
          }
          relaxedUrl = withTeam(relaxedUrl);
          const r2 = await fetchJson(relaxedUrl);

          if (!r2.ok) {
            return res.status(502).json({
              error: "Vercel list deployments fallo",
              status: r2.status,
              details: r2.json || r2.text,
              hint: "Verificá VERCEL_PROJECT_ID / VERCEL_APP / VERCEL_DEPLOY_HOOK_ID y permisos del token",
            });
          }
          if (!r2.json?.deployments?.length) {
            return res.status(404).json({
              error: "No hay deployments para este proyecto / hook",
              hint: "Hacé al menos un deploy con este hook, o revisá filtros",
            });
          }
          r1 = r2;
        }
      }
    } else {
      // 2) Sin DEPLOY_HOOK_ID: comportamiento original (por proyecto/app)
      let listUrl = `https://api.vercel.com/v6/deployments?limit=1`;
      if (PROJECT_ID) {
        listUrl += `&projectId=${encodeURIComponent(PROJECT_ID)}`;
      } else if (APP) {
        listUrl += `&app=${encodeURIComponent(APP)}`;
      }
      listUrl += `&target=production&state=READY`;
      listUrl = withTeam(listUrl);

      r1 = await fetchJson(listUrl);

      if (!r1.ok || !r1.json?.deployments?.length) {
        let relaxedUrl = `https://api.vercel.com/v6/deployments?limit=1`;
        if (PROJECT_ID) {
          relaxedUrl += `&projectId=${encodeURIComponent(PROJECT_ID)}`;
        } else if (APP) {
          relaxedUrl += `&app=${encodeURIComponent(APP)}`;
        }
        relaxedUrl = withTeam(relaxedUrl);
        const r2 = await fetchJson(relaxedUrl);

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
        r1 = r2;
      }
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
      return res.status(200).json({
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
    const sha: string | undefined = full?.gitSource?.sha;
    const branch: string | undefined = full?.gitSource?.ref;
    const createdAt: number | undefined = full?.createdAt ?? dpl?.createdAt ?? dpl?.created;
    const commitMessage: string | undefined = full?.meta?.githubCommitMessage || full?.meta?.gitlabCommitMessage || full?.meta?.bitbucketCommitMessage || full?.meta?.commitMessage;

    return res.json({
      sha,
      shortSha: sha ? sha.slice(0, 7) : undefined,
      createdAt,
      url: full?.url || dpl?.url,
      branch,
      commitMessage,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Error consultando Vercel" });
  }
});

export { router as vercelRoutes };
