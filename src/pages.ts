/**
 * LA DÉMO PUBLIÉE.
 *
 * Tout se recalcule dans le navigateur : la simulation est en JavaScript pur et prend une
 * fraction de seconde. Rien n'est mis en conserve, donc rien ne peut vieillir — et la
 * graine fixe garantit que deux visites voient la même chose.
 *
 * Pas d'accent grave dans le shim : il vit dans un gabarit.
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { isMain } from "./cli.ts";

const root = new URL("..", import.meta.url).pathname;

const SHIM = `<script>window.LOCAL_PRET = new Promise((r) => { window.LOCAL_POSE = r; });</` + `script>
<script type="module">
import { REGLAGE, BORNES, INVENTAIRE, annee, comportement, fenetreSeparante, rubans } from "./js/derive.js";

let reglage = { ...REGLAGE };

const etat = () => {
  const r = rubans(reglage, 60);
  return {
    reglage, bornes: BORNES, inventaire: INVENTAIRE,
    rubans: r,
    separation: fenetreSeparante(r),
    comportement: comportement(reglage, 80),
    calme: annee(reglage, false),
    derive: annee(reglage, true),
  };
};

window.LOCAL = async (chemin, corps) => {
  if (chemin === "/api/etat") return etat();
  if (chemin === "/api/reglage") {
    if (corps.remise) reglage = { ...REGLAGE };
    else for (const [cle, bornes] of Object.entries(BORNES)) {
      const v = Number(corps[cle]);
      if (Number.isFinite(v)) reglage = { ...reglage, [cle]: Math.min(bornes[1], Math.max(bornes[0], v)) };
    }
    return etat();
  }
  return {};
};

window.LOCAL_POSE && window.LOCAL_POSE();
` + "</" + "script>\n";

const BANNIERE = `<p class="renvoi" style="margin-bottom:1.5rem">
This runs entirely in your browser — the simulation itself, not a canned result, at a fixed
seed so two visits agree. <b>Take the alarm line</b> and move it: where the two ribbons
overlap, no value of it separates noise from the shift. The population is synthetic.
<a href="https://github.com/ArslaneSempai-ui/drift-monitor">Source and method</a>.
</p>`;

export function construire(): void {
  const docs = root + "docs";
  mkdirSync(docs, { recursive: true });
  let html = readFileSync(root + "src/ui.html", "utf8");
  html = html.replace('href="/registre.css"', 'href="registre.css"');
  html = html.replace('from "/graphes.js"', 'from "./graphes.js"');
  html = html.replace('<script type="module">', SHIM + '<script type="module">');
  html = html.replace("<main>", "<main>\n" + BANNIERE);
  writeFileSync(docs + "/index.html", html);
  cpSync(root + "src/graphes.js", docs + "/graphes.js");
  cpSync(root + "src/registre.css", docs + "/registre.css");
  writeFileSync(docs + "/.nojekyll", "");
  console.log("docs/ built");
}

if (isMain(import.meta)) construire();
