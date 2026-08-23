/**
 * L'écran, servi depuis les sources.
 *
 * Tout ce que l'écran affiche vient d'une simulation à graine fixe : deux visites donnent
 * les mêmes rubans. C'est ce qui permet de publier la démo — et c'est aussi ce que l'outil
 * exige de lui-même, puisqu'il reproche aux moniteurs de confondre bruit et signal.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { REGLAGE, BORNES, INVENTAIRE, annee, comportement, fenetreSeparante, rubans,
         type Reglage } from "./derive.ts";
import { isMain } from "./cli.ts";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT ?? 4690);

let reglage: Reglage = { ...REGLAGE };

function json(res: ServerResponse, corps: unknown, code = 200): void {
  const load = JSON.stringify(corps);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8",
                        "content-length": Buffer.byteLength(load) });
  res.end(load);
}

function corps(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resoudre, rejeter) => {
    let brut = "";
    req.on("data", (b) => { brut += b; if (brut.length > 50_000) rejeter(new Error("request too large")); });
    req.on("end", () => { try { resoudre(brut ? JSON.parse(brut) : {}); } catch (e) { rejeter(e); } });
    req.on("error", rejeter);
  });
}

export function etat() {
  const r = rubans(reglage, 80);
  return {
    reglage,
    bornes: BORNES,
    inventaire: INVENTAIRE,
    rubans: r,
    separation: fenetreSeparante(r),
    comportement: comportement(reglage, 120),
    calme: annee(reglage, false),
    derive: annee(reglage, true),
  };
}

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(readFileSync(fileURLToPath(new URL("./ui.html", import.meta.url)), "utf8"));
      return;
    }
    for (const [chemin, type] of [["/graphes.js", "text/javascript"], ["/registre.css", "text/css"]] as const) {
      if (url.pathname === chemin) {
        res.writeHead(200, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
        res.end(readFileSync(fileURLToPath(new URL("." + chemin, import.meta.url)), "utf8"));
        return;
      }
    }
    if (url.pathname === "/api/etat") return json(res, etat());
    if (url.pathname === "/api/reglage" && req.method === "POST") {
      const recu = await corps(req);
      if (recu.remise) reglage = { ...REGLAGE };
      else for (const [cle, [bas, haut]] of Object.entries(BORNES)) {
        const v = Number(recu[cle]);
        if (Number.isFinite(v)) (reglage as any)[cle] = Math.min(haut, Math.max(bas, v));
      }
      return json(res, etat());
    }
    res.writeHead(404).end("introuvable");
  } catch (e) {
    json(res, { erreur: String((e as Error).message ?? e) }, 400);
  }
});

if (isMain(import.meta)) {
  serveur.listen(PORT, "127.0.0.1", () => {
    console.log(`The threshold sits above the signal → http://localhost:${PORT}`);
  });
}
