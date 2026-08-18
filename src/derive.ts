/**
 * LE MONITEUR DE DÉRIVE, ET LE SEUIL QUE PERSONNE NE CHIFFRE.
 *
 * Un modèle en production reçoit une population qui bouge. La pratique universelle est de
 * calculer un indice de stabilité — le PSI — sur une fenêtre récente contre une référence,
 * et de lever une alerte au-delà de 0,2. Ce 0,2 se transmet de note interne en note
 * interne comme une constante de la nature. Ce n'en est pas une.
 *
 * ─── Ce que le seuil coûte quand rien ne bouge ───
 *
 * Le PSI d'une fenêtre est une variable aléatoire : sur une population parfaitement stable,
 * il vaut rarement zéro. Sa distribution dépend de la taille de la fenêtre et du nombre de
 * bandes, pas de la qualité du modèle. Un seuil trop bas crie au loup toutes les six
 * semaines sur des données qui n'ont pas bougé, et une équipe qui a crié trois fois pour
 * rien cesse d'être crue la quatrième.
 *
 * ─── Ce que le même seuil ne voit pas ───
 *
 * Le miroir est aussi vrai : le seuil qui ne crie jamais met onze semaines à remarquer un
 * déplacement réel. On ne peut pas régler l'un sans l'autre, et c'est exactement ce que ce
 * dépôt met sous la main — pas un chiffre à retenir, un arbitrage à faire.
 *
 * Rien n'est mesuré ici sur des données réelles : la population est synthétique et l'écran
 * le dit. Ce qui est mesuré, et qui est le résultat, c'est le comportement du seuil sur
 * cette population — par simulation, à graine fixe.
 */

import type { Inventory } from "./provenance.ts";

/** Un générateur reproductible : un test qui clignote ne prouve rien. */
export function graine(depart: number): () => number {
  let g = depart >>> 0;
  return () => {
    g = (g * 1664525 + 1013904223) >>> 0;
    return g / 4294967296;
  };
}

/** Une normale par Box-Muller, à partir d'un uniforme reproductible. */
export function normale(u: () => number): number {
  const a = Math.max(u(), 1e-12), b = u();
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

export type Reglage = {
  /** Observations par fenêtre de contrôle. */
  fenetre: number;
  /** Bandes du découpage, fixées sur la référence. */
  bandes: number;
  /** Seuil d'alerte sur l'indice de stabilité. */
  seuil: number;
  /** Contrôles par an : une fenêtre par semaine, par quinzaine, par mois. */
  controlesParAn: number;
  /** Déplacement réel à détecter, en écarts-types de la référence. */
  deplacement: number;
};

export const REGLAGE: Reglage = {
  fenetre: 500,
  bandes: 10,
  seuil: 0.2,
  controlesParAn: 52,
  deplacement: 0.3,
};

export const BORNES: Record<keyof Reglage, [number, number]> = {
  fenetre: [100, 20_000],
  bandes: [4, 40],
  seuil: [0.01, 1],
  controlesParAn: [4, 365],
  deplacement: [0.05, 2],
};

/**
 * Les bornes des bandes, prises sur la référence.
 *
 * Des quantiles de la référence, pas des coupes régulières : c'est ce que fait un modèle de
 * risque, et ça change la distribution du PSI — chaque bande porte alors la même masse au
 * départ, donc le bruit y est comparable.
 */
export function bornesDeBandes(reference: number[], bandes: number): number[] {
  const tri = [...reference].sort((a, b) => a - b);
  const bornes: number[] = [];
  for (let i = 1; i < bandes; i++) {
    bornes.push(tri[Math.floor((i / bandes) * tri.length)]!);
  }
  return bornes;
}

/** Dans quelle bande tombe une valeur. Par comparaison, jamais par division. */
export function bande(v: number, bornes: number[]): number {
  for (let i = 0; i < bornes.length; i++) if (v < bornes[i]!) return i;
  return bornes.length;
}

/**
 * L'indice de stabilité entre une référence et une fenêtre.
 *
 * La formule usuelle, avec la précaution qui n'est jamais écrite : une bande vide donne un
 * logarithme infini. On y substitue une demi-observation — la correction de continuité
 * habituelle — plutôt que de laisser l'indice partir à l'infini sur un échantillon petit,
 * ce qui ferait crier au loup exactement là où l'on a le moins d'information.
 */
export function psi(partsRef: number[], partsFenetre: number[]): number {
  let s = 0;
  for (let i = 0; i < partsRef.length; i++) {
    const a = Math.max(partsRef[i]!, 1e-6);
    const b = Math.max(partsFenetre[i]!, 1e-6);
    s += (b - a) * Math.log(b / a);
  }
  return s;
}

/** Les parts par bande d'un échantillon, avec une demi-observation par bande vide. */
export function parts(echantillon: number[], bornes: number[]): number[] {
  const n = bornes.length + 1;
  const comptes = new Array(n).fill(0);
  for (const v of echantillon) comptes[bande(v, bornes)]++;
  const total = echantillon.length;
  return comptes.map((c) => (c === 0 ? 0.5 : c) / total);
}

export type Journal = {
  /** L'indice mesuré à chaque contrôle de l'année. */
  indices: number[];
  /** Contrôle où le déplacement commence ; -1 quand il n'y en a pas. */
  debutDerive: number;
  /** Contrôles au-dessus du seuil. */
  alertes: number[];
};

/**
 * Une année de contrôles, telle qu'un moniteur la produirait.
 *
 * Une seule année : c'est un tirage, et c'est assumé — la figure montre ce qu'une équipe
 * verrait vraiment, avec ses hasards. Les nombres qui décident, eux, ne viennent pas de ce
 * tirage-là mais de la simulation répétée en dessous.
 */
export function annee(r: Reglage, avecDerive: boolean, depart = 20260818): Journal {
  const u = graine(depart);
  const reference = Array.from({ length: 20_000 }, () => normale(u));
  const bornes = bornesDeBandes(reference, r.bandes);
  const partsRef = parts(reference, bornes);

  const debutDerive = avecDerive ? Math.floor(r.controlesParAn / 2) : -1;
  const indices: number[] = [];
  for (let t = 0; t < r.controlesParAn; t++) {
    const decale = avecDerive && t >= debutDerive ? r.deplacement : 0;
    const fenetre = Array.from({ length: r.fenetre }, () => normale(u) + decale);
    indices.push(psi(partsRef, parts(fenetre, bornes)));
  }
  return { indices, debutDerive, alertes: indices.map((v, i) => (v >= r.seuil ? i : -1)).filter((i) => i >= 0) };
}

export type Comportement = {
  /** Fausses alertes par an, sur une population qui n'a pas bougé. */
  faussesAlertesParAn: number;
  /** Part des années sans aucune fausse alerte. */
  anneesTranquilles: number;
  /** Contrôles avant de voir un déplacement réel, médiane. */
  delaiMedian: number | null;
  /** Part des dérives réelles jamais vues dans l'année. */
  jamaisVues: number;
  /** Répétitions de la simulation. */
  tirages: number;
};

/**
 * Ce que le réglage produit vraiment, mesuré et non déduit.
 *
 * Il existe des approximations analytiques de la loi du PSI. Elles supposent des bandes de
 * masse égale et un échantillon grand, c'est-à-dire précisément ce qu'on n'a pas quand la
 * question se pose. On simule donc, à graine fixe : c'est plus lent et c'est vrai.
 */
export function comportement(r: Reglage, tirages = 300): Comportement {
  const u = graine(4242);
  const reference = Array.from({ length: 20_000 }, () => normale(u));
  const bornes = bornesDeBandes(reference, r.bandes);
  const partsRef = parts(reference, bornes);

  const tirerFenetre = (decale: number) =>
    psi(partsRef, parts(Array.from({ length: r.fenetre }, () => normale(u) + decale), bornes));

  let fausses = 0, tranquilles = 0;
  const delais: number[] = [];
  let jamais = 0;

  for (let k = 0; k < tirages; k++) {
    let ici = 0;
    for (let t = 0; t < r.controlesParAn; t++) if (tirerFenetre(0) >= r.seuil) ici++;
    fausses += ici;
    if (ici === 0) tranquilles++;

    /* Le délai : combien de contrôles après le début du déplacement avant la première
     * alerte. Une dérive jamais vue dans l'année est comptée à part — la moyenner à
     * l'horizon donnerait un délai rassurant qui n'existe pas. */
    let vu = -1;
    for (let t = 0; t < r.controlesParAn; t++) {
      if (tirerFenetre(r.deplacement) >= r.seuil) { vu = t; break; }
    }
    if (vu < 0) jamais++;
    else delais.push(vu);
  }

  const tri = delais.sort((a, b) => a - b);
  return {
    faussesAlertesParAn: fausses / tirages,
    anneesTranquilles: tranquilles / tirages,
    delaiMedian: tri.length ? tri[Math.floor(tri.length / 2)]! : null,
    jamaisVues: jamais / tirages,
    tirages,
  };
}

/** Le seuil qui tient un budget de fausses alertes, cherché par bissection. */
export function seuilPourBudget(r: Reglage, faussesParAn: number, tirages = 200): number {
  let bas = 0.01, haut = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (bas + haut) / 2;
    const c = comportement({ ...r, seuil: mid }, tirages);
    if (c.faussesAlertesParAn > faussesParAn) bas = mid; else haut = mid;
  }
  return (bas + haut) / 2;
}

export const INVENTAIRE: Inventory = [
  { provenance: "measured", name: "faussesAlertesParAn",
    what: "false alarms a year on a population that did not move",
    note: "simulated, fixed seed: no closed form survives small windows and quantile bins" },
  { provenance: "measured", name: "delaiMedian",
    what: "checks before a real shift is seen",
    note: "same simulation; drifts never seen inside the year are counted apart, not averaged in" },
  { provenance: "chosen", name: "seuil", what: "the alarm threshold on the stability index",
    note: "0.2 is the number every note repeats; this repository exists to price it" },
  { provenance: "assumed", name: "fenetre", what: "observations per check",
    note: "what a monthly or weekly monitoring run actually gathers" },
  { provenance: "assumed", name: "deplacement", what: "the real shift worth catching, in standard deviations",
    note: "the smallest move that would change a decision — nobody else can set it for you" },
];

export type Ruban = {
  /** Les tailles de fenêtre balayées. */
  fenetres: number[];
  /** Cinquième et quatre-vingt-quinzième centiles de l'indice, sans dérive. */
  calme: { bas: number[]; haut: number[] };
  /** Les mêmes, avec le déplacement demandé. */
  derive: { bas: number[]; haut: number[] };
  /** L'indice de population du déplacement : ce que l'indice vaut quand l'échantillon est infini. */
  signal: number;
  tirages: number;
};

/**
 * Les deux rubans, et pourquoi ils décident tout.
 *
 * L'indice d'une fenêtre est bruité, et son bruit décroît avec la taille de la fenêtre. Le
 * déplacement réel, lui, ne bouge pas. Il existe donc une taille en dessous de laquelle les
 * deux rubans se recouvrent — et là, aucun seuil ne sépare quoi que ce soit : le contrôle
 * ne peut pas marcher, quel que soit le nombre qu'on écrit dans la note.
 *
 * C'est la seule figure de ce dépôt, et c'est tout le propos.
 */
let cacheRubans: { cle: string; valeur: Ruban } | null = null;

/**
 * Les rubans ne dépendent pas du seuil.
 *
 * Le lecteur passe son temps à bouger le seuil, et les recalculer à chaque mouvement faisait
 * une seconde de calcul pour une figure identique — la page collait sous le doigt et les
 * films de capture sortaient vides, faute de temps. Ils sont donc gardés tant que la
 * fenêtre, les bandes et le déplacement n'ont pas bougé.
 */
export function rubans(r: Reglage, tirages = 120): Ruban {
  const cle = `${r.fenetre}|${r.bandes}|${r.deplacement}|${tirages}`;
  if (cacheRubans?.cle === cle) return cacheRubans.valeur;
  const valeur = calculerRubans(r, tirages);
  cacheRubans = { cle, valeur };
  return valeur;
}

function calculerRubans(r: Reglage, tirages: number): Ruban {
  const u = graine(90210);
  const reference = Array.from({ length: 40_000 }, () => normale(u));
  const bornes = bornesDeBandes(reference, r.bandes);
  const partsRef = parts(reference, bornes);

  const fenetres = [100, 200, 350, 500, 800, 1200, 2000, 3500, 6000, 10_000];
  const centiles = (n: number, decale: number) => {
    const v: number[] = [];
    for (let k = 0; k < tirages; k++) {
      v.push(psi(partsRef, parts(Array.from({ length: n }, () => normale(u) + decale), bornes)));
    }
    v.sort((a, b) => a - b);
    return { bas: v[Math.floor(0.05 * v.length)]!, haut: v[Math.floor(0.95 * v.length)]! };
  };

  const calme = { bas: [] as number[], haut: [] as number[] };
  const derive = { bas: [] as number[], haut: [] as number[] };
  for (const n of fenetres) {
    const a = centiles(n, 0), b = centiles(n, r.deplacement);
    calme.bas.push(a.bas); calme.haut.push(a.haut);
    derive.bas.push(b.bas); derive.haut.push(b.haut);
  }

  /* L'indice de population : un très grand échantillon, une fois, pour dire où le signal
   * se trouve indépendamment du bruit d'échantillonnage. */
  const signal = psi(partsRef, parts(Array.from({ length: 200_000 }, () => normale(u) + r.deplacement), bornes));

  return { fenetres, calme, derive, signal, tirages };
}

/**
 * La plus petite fenêtre où les deux rubans ne se touchent plus.
 *
 * En dessous, le contrôle est un tirage au sort quel que soit le seuil ; au-dessus, un
 * seuil existe. C'est le nombre que personne ne calcule avant d'écrire « PSI > 0,2 ».
 */
export function fenetreSeparante(r: Ruban): { fenetre: number | null; seuil: number | null } {
  for (let i = 0; i < r.fenetres.length; i++) {
    if (r.calme.haut[i]! < r.derive.bas[i]!) {
      return { fenetre: r.fenetres[i]!, seuil: (r.calme.haut[i]! + r.derive.bas[i]!) / 2 };
    }
  }
  return { fenetre: null, seuil: null };
}
