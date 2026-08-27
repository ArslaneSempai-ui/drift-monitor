import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BORNES, REGLAGE } from "./derive.ts";

/*
 * LE GESTIONNAIRE DU NAVIGATEUR EST UNE SECONDE COPIE, ET ELLE N'AVAIT PAS LA CORRECTION.
 *
 * `/api/reglage` existe deux fois : dans le serveur et dans le script engendré pour la page.
 * Le serveur avait appris que `Number("")` vaut 0 — donc qu'un champ vidé traverse
 * `Number.isFinite` puis se fait ramener par le clamp sur la borne basse. Son commentaire le
 * dit : « le clamp n'était pas la parade, il était le masque ».
 *
 * La copie du navigateur faisait encore exactement ça. Vider un champ posait silencieusement le
 * réglage au bout de son domaine, et le seuil publié — le sujet même de ce dépôt — suivait sans
 * un mot. Sur la page que les visiteurs exécutent.
 *
 * ─── POURQUOI CE CAS REJOUE LE CODE ÉMIS PLUTÔT QUE DE LE LIRE ───
 *
 * Un cas qui chercherait `typeof v === "number"` dans le texte passerait au vert sur un
 * gestionnaire qui contient la phrase sans l'appliquer. On extrait le gestionnaire de la source
 * qui l'ÉMET et on l'exécute : c'est la règle qui est éprouvée, pas sa présence.
 */

const SRC = fileURLToPath(new URL(".", import.meta.url));

function gestionnaireDuNavigateur(): (chemin: string, corps: Record<string, unknown>) => Promise<unknown> {
  const src = readFileSync(SRC + "pages.ts", "utf8");
  const debut = src.indexOf("window.LOCAL = async (chemin, corps) => {");
  assert.notEqual(debut, -1, "le gestionnaire n'est plus émis sous cette forme : ce cas ne lit rien.");
  const fin = src.indexOf("\nwindow.LOCAL_POSE", debut);
  assert.ok(fin > debut, "la fin du gestionnaire est introuvable.");

  const fabrique = new Function("BORNES", "REGLAGE", "etat", `
    let reglage = { ...REGLAGE };
    let window = {};
    ${src.slice(debut, fin)}
    return window.LOCAL;
  `);
  return fabrique(BORNES, REGLAGE, () => ({ marque: "état" })) as never;
}

test("le navigateur REFUSE un champ vide au lieu de le poser sur la borne basse", async () => {
  const local = gestionnaireDuNavigateur();
  const cle = Object.keys(BORNES)[0]!;
  const r = await local("/api/reglage", { [cle]: "" }) as { refuses: string[] };
  assert.deepEqual(r.refuses, [`${cle}=""`],
    `un champ vide doit être refusé ET nommé — un refus muet est le même défaut d'un étage plus `
    + `haut. Reçu : ${JSON.stringify(r.refuses)}`);
});

test("un vrai nombre passe, et il est borné", async () => {
  /*
   * LE CONTRÔLE POSITIF, obligatoire : le cas ci-dessus passerait aussi si le gestionnaire
   * refusait TOUT, ce qui est la façon la plus simple de rendre un cas vert sans rien garder.
   */
  const local = gestionnaireDuNavigateur();
  const cle = Object.keys(BORNES)[0]! as keyof typeof BORNES;
  const [bas, haut] = BORNES[cle];
  const milieu = (bas + haut) / 2;

  const dedans = await local("/api/reglage", { [cle]: milieu }) as { refuses: string[] };
  assert.deepEqual(dedans.refuses, [], "un nombre valide ne doit pas être refusé.");

  const trop = await local("/api/reglage", { [cle]: haut * 1000 + 1 }) as { refuses: string[] };
  assert.deepEqual(trop.refuses, [],
    "un nombre hors bornes est BORNÉ, pas refusé — c'est une valeur, pas une absence de valeur.");
});

test("la remise à zéro reste possible et ne passe pas par les bornes", async () => {
  /*
   * La branche `remise` rend le réglage par défaut sans lire de champ. En la sortant de la
   * chaîne `else`, on aurait pu la casser sans que rien ne le dise.
   */
  const local = gestionnaireDuNavigateur();
  const r = await local("/api/reglage", { remise: true }) as { refuses?: string[] };
  assert.equal(r.refuses, undefined, "la remise ne refuse rien : elle ne lit aucun champ.");
});
