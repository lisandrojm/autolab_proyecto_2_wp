import { test } from "node:test";
import assert from "node:assert/strict";
import { ARGS_CHROMIUM, dirPerfil, identidad, msSesionTibia } from "./perfil.js";
test("la identidad dice el SO real y la versión real del binario, todo coherente", () => {
    const id = identidad("151.0.7922.34", "linux", "x64", "5.15.0-105-generic");
    assert.equal(id.userAgent, "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36");
    assert.equal(id.platform, "Linux x86_64");
    assert.equal(id.userAgentMetadata.platform, "Linux");
    assert.equal(id.userAgentMetadata.platformVersion, "5.15.0");
    assert.deepEqual(id.userAgentMetadata.brands.map((b) => b.brand), ["Chromium", "Not=A?Brand"]);
    assert.equal(id.userAgentMetadata.brands[0].version, "151");
    assert.doesNotMatch(JSON.stringify(id), /Headless|Macintosh|Mac OS/);
    assert.match(identidad("151.0.1", "linux", "arm64").userAgent, /Linux aarch64/);
    assert.match(identidad("151.0.1", "darwin").userAgent, /Macintosh/);
});
test("sin marcas de automatización y el perfil fuera de /tmp y del repo", () => {
    assert.ok(ARGS_CHROMIUM.includes("--disable-blink-features=AutomationControlled"));
    const prev = process.env.DROPBOX_SIGN_PERFILES_DIR;
    delete process.env.DROPBOX_SIGN_PERFILES_DIR;
    const d = dirPerfil("65a1b2c3d4e5f60718293a4b");
    if (prev !== undefined)
        process.env.DROPBOX_SIGN_PERFILES_DIR = prev;
    assert.match(d, /\.weprodu\/dropbox-sign-perfiles\/65a1b2c3d4e5f60718293a4b$/);
    assert.doesNotMatch(d, /^\/tmp|autolab_proyecto/);
    assert.doesNotMatch(dirPerfil("../../etc"), /\.\./);
});
test("la sesión tibia: 30 min por defecto, 0 la apaga, basura cae al default", () => {
    assert.equal(msSesionTibia(undefined), 30 * 60_000);
    assert.equal(msSesionTibia("0"), 0);
    assert.equal(msSesionTibia("90"), 90 * 60_000);
    assert.equal(msSesionTibia("abc"), 30 * 60_000);
});
