/*
 * CE QUE CET OUTIL N'A PAS LE DROIT DE DIRE.
 *
 *  1. **Faire passer un bruit pour un signal.** L'indice d'une fenêtre est bruité ; si le
 *     modèle l'oublie, il annonce une dérive à chaque petite fenêtre et le moniteur devient
 *     un générateur d'alertes.
 *  2. **Annoncer un délai de détection en moyennant les dérives jamais vues.** Compter une
 *     dérive invisible comme « détectée à la fin de l'année » donne un délai rassurant qui
 *     n'existe pas.
 *  3. **Clignoter.** Une figure qui change à chaque visite ne prouve rien : tout ici part
 *     d'une graine fixe.
 *  4. **Laisser l'indice partir à l'infini** sur une bande vide, ce qui ferait crier au loup
 *     exactement là où l'échantillon est le plus faible.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { REGLAGE, annee, bande, bornesDeBandes, comportement, fenetreSeparante, graine,
         normale, parts, psi, rubans } from "./derive.ts";

const ref = (n = 20_000) => { const u = graine(1); return Array.from({ length: n }, () => normale(u)); };

test("l'indice est nul quand rien ne bouge, et croît avec le déplacement", () => {
  const r = ref();
  const b = bornesDeBandes(r, 10);
  const pr = parts(r, b);
  const u = graine(7);
  const valeur = (d: number) =>
    psi(pr, parts(Array.from({ length: 100_000 }, () => normale(u) + d), b));
  const zero = valeur(0);
  assert.ok(zero < 0.005, `sans déplacement l'indice vaut ${zero}`);
  let precedent = zero;
  for (const d of [0.1, 0.2, 0.3, 0.5]) {
    const v = valeur(d);
    assert.ok(v > precedent, `${d}σ ne donne pas plus que ${precedent}`);
    precedent = v;
  }
});

test("une bande vide ne fait pas exploser l'indice", () => {
  /* Le piège classique : un logarithme de zéro. Une fenêtre entièrement dans la queue
   * gauche laisse neuf bandes vides sur dix. */
  const r = ref();
  const b = bornesDeBandes(r, 10);
  const pr = parts(r, b);
  const extreme = Array.from({ length: 50 }, () => -4);
  const v = psi(pr, parts(extreme, b));
  assert.ok(Number.isFinite(v), "l'indice doit rester fini");
  assert.ok(v > 0.5, "et rester grand : cette fenêtre a bel et bien dérivé");
});

test("le bruit décroît avec la fenêtre, le signal non", () => {
  /*
   * La raison d'être de l'outil, en une assertion. Le ruban du calme se resserre quand la
   * fenêtre grandit ; celui de la dérive tend vers l'indice de population. C'est ce qui
   * crée une taille en dessous de laquelle aucun seuil ne sépare.
   */
  const r = rubans(REGLAGE, 60);
  const premier = r.calme.haut[0]!;
  const dernier = r.calme.haut[r.calme.haut.length - 1]!;
  assert.ok(dernier < premier / 5, `le bruit passe de ${premier} à ${dernier} seulement`);
  const derivePremiere = r.derive.haut[0]!;
  const deriveDerniere = r.derive.haut[r.derive.haut.length - 1]!;
  assert.ok(deriveDerniere > derivePremiere / 5, "le signal ne doit pas s'évanouir avec la fenêtre");
  assert.ok(Math.abs(deriveDerniere - r.signal) < 0.05,
    `à grande fenêtre l'indice doit tendre vers celui de la population : ${deriveDerniere} contre ${r.signal}`);
});

test("le seuil de la note est au-dessus du signal qu'il prétend voir", () => {
  /*
   * Le constat que le dépôt publie. 0,2 est le nombre que toutes les notes répètent ; sur
   * un déplacement de trois dixièmes d'écart-type, l'indice de population vaut moins de la
   * moitié. Aucun réglage de fenêtre ne rattrape ça.
   */
  const r = rubans(REGLAGE, 60);
  assert.ok(r.signal < REGLAGE.seuil,
    `l'indice du déplacement vaut ${r.signal}, le seuil ${REGLAGE.seuil} : le constat ne tient plus`);
  assert.ok(r.signal < REGLAGE.seuil / 1.5, "et l'écart doit être franc, pas marginal");
});

test("les rubans se séparent à partir d'une certaine fenêtre, et le seuil n'y est pas 0,2", () => {
  const r = rubans(REGLAGE, 60);
  const s = fenetreSeparante(r);
  assert.ok(s.fenetre !== null, "aucune fenêtre ne sépare : la figure n'aurait rien à montrer");
  assert.ok(s.seuil! < REGLAGE.seuil / 2,
    `le seuil qui sépare vaut ${s.seuil}, contre ${REGLAGE.seuil} dans la note`);
  /* Et en dessous de cette fenêtre, les rubans se touchent bel et bien. */
  const i = r.fenetres.indexOf(s.fenetre!);
  if (i > 0) assert.ok(r.calme.haut[i - 1]! >= r.derive.bas[i - 1]!,
    "la fenêtre annoncée n'est pas la première à séparer");
});

test("une dérive jamais vue n'est pas comptée comme vue à la fin de l'année", () => {
  const c = comportement({ ...REGLAGE, seuil: 0.9, deplacement: 0.1 }, 40);
  assert.ok(c.jamaisVues > 0.5, "à seuil absurde, presque rien ne doit être détecté");
  assert.ok(c.delaiMedian === null || c.delaiMedian < REGLAGE.controlesParAn,
    "le délai médian ne doit pas être l'horizon lui-même");
});

test("deux visites donnent la même figure", () => {
  const a = annee(REGLAGE, true), b = annee(REGLAGE, true);
  assert.deepEqual(a.indices, b.indices, "l'année doit être reproductible");
  const ra = rubans(REGLAGE, 30), rb = rubans(REGLAGE, 30);
  assert.deepEqual(ra.calme.haut, rb.calme.haut, "les rubans doivent être reproductibles");
});

test("la bande se trouve par comparaison, pas par division", () => {
  /* Le piège déjà payé ailleurs : `Math.floor((v - x0) / pas)` range mal une valeur
   * exactement égale à une borne. */
  const bornes = [-1, 0, 1];
  assert.equal(bande(-1, bornes), 1, "une valeur égale à une borne appartient à la bande du dessus");
  assert.equal(bande(-1.0001, bornes), 0);
  assert.equal(bande(5, bornes), 3);
});
