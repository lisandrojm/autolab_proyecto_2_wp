// Mapeo mínimo de MIME por extensión
const MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function guessMime(filename) {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return MIME[ext] || "application/octet-stream";
}

function looksLikeHTML(ct) {
  return (ct || "").toLowerCase().includes("text/html");
}

export default async function handler(req, res) {
  try {
    const { tenantId, clientId, file } = req.query || {};
    if (!tenantId || !clientId || !file) {
      return res.status(400).send("Bad path");
    }

    const mime = guessMime(String(file));

    // Orígenes candidatos (primero tu backend https, luego el IP http)
    const urlA = `https://autolab.fun:7001/storage/${tenantId}/client/${clientId}/brandkit/${encodeURIComponent(file)}`;
    const urlB = `http://72.60.9.42/api/archivos/modo/${encodeURIComponent(file)}`;
    const candidates = [urlA, urlB];

    for (const url of candidates) {
      try {
        const r = await fetch(url);
        const ct = r.headers.get("content-type") || "";

        if (!r.ok || looksLikeHTML(ct)) continue;

        const ab = await r.arrayBuffer();
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "public, max-age=31200000, immutable");
        return res.status(200).send(Buffer.from(ab));
      } catch (_) {
        // probar siguiente
      }
    }

    return res.status(404).send("Asset not found on any origin");
  } catch (err) {
    return res.status(500).send("proxy error");
  }
}
