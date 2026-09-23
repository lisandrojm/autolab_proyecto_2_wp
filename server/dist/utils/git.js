import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
const execAsync = promisify(exec);
/** La raíz del repo, subiendo desde el cwd hasta encontrar `.git`. `null` si no hay. */
const raizDelRepo = () => {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
        if (fs.existsSync(path.join(dir, ".git")))
            return dir;
        const padre = path.dirname(dir);
        if (padre === dir)
            break;
        dir = padre;
    }
    return null;
};
/**
 * Rama y hash leídos de los archivos de `.git`, sin ejecutar git.
 *
 * `.git/HEAD` tiene `ref: refs/heads/main` (o el hash pelado si está en detached). El ref puede estar
 * en su archivo o empaquetado en `packed-refs`, que es como queda después de un `gc`: hay que mirar
 * los dos o un repo recién clonado devuelve vacío.
 */
const desdeArchivos = () => {
    const raiz = raizDelRepo();
    if (!raiz)
        return { branch: null, hash: null };
    try {
        const head = fs.readFileSync(path.join(raiz, ".git", "HEAD"), "utf8").trim();
        if (!head.startsWith("ref:"))
            return { branch: null, hash: head.slice(0, 7) || null };
        const ref = head.replace("ref:", "").trim();
        const branch = ref.split("/").pop() || null;
        const archivoRef = path.join(raiz, ".git", ref);
        if (fs.existsSync(archivoRef)) {
            return { branch, hash: fs.readFileSync(archivoRef, "utf8").trim().slice(0, 7) || null };
        }
        const packed = path.join(raiz, ".git", "packed-refs");
        if (fs.existsSync(packed)) {
            const linea = fs
                .readFileSync(packed, "utf8")
                .split("\n")
                .find((l) => l.endsWith(` ${ref}`));
            if (linea)
                return { branch, hash: linea.split(" ")[0].slice(0, 7) };
        }
        return { branch, hash: null };
    }
    catch {
        return { branch: null, hash: null };
    }
};
/** Cuándo se compiló el archivo que Node está ejecutando. */
const fechaDelBuild = () => {
    try {
        const entrada = process.argv[1];
        if (!entrada)
            return null;
        return fs.statSync(entrada).mtime.toISOString();
    }
    catch {
        return null;
    }
};
export async function getGitInfo() {
    const result = { branch: null, lastCommit: null };
    try {
        const branchResult = await execAsync("git rev-parse --abbrev-ref HEAD", { timeout: 5000 });
        result.branch = branchResult.stdout.trim() || null;
    }
    catch {
        // Sin ruido en el log: que git no esté disponible es esperable en el servidor y hay plan B.
    }
    try {
        const commitResult = await execAsync('git log -1 --pretty=format:"%h|%s|%an"', { timeout: 5000 });
        const commitData = commitResult.stdout.trim().replace(/^"|"$/g, "");
        if (commitData) {
            const [hash, message, author] = commitData.split("|");
            result.lastCommit = { hash: hash || null, message: message || null, author: author || null };
        }
    }
    catch {
        /* plan B abajo */
    }
    if (!result.branch || !result.lastCommit?.hash) {
        const archivos = desdeArchivos();
        result.branch = result.branch || archivos.branch;
        if (!result.lastCommit?.hash && archivos.hash) {
            result.lastCommit = { hash: archivos.hash, message: result.lastCommit?.message ?? null, author: result.lastCommit?.author ?? null };
        }
    }
    const buildEl = fechaDelBuild();
    const iniciadoEl = new Date(Date.now() - process.uptime() * 1000).toISOString();
    result.proceso = {
        buildEl,
        iniciadoEl,
        faltaReiniciar: Boolean(buildEl && buildEl > iniciadoEl),
    };
    return result;
}
