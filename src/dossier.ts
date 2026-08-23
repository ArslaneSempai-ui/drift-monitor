/**
 * The README, generated from the code that measures.
 *
 * Every published number in this repository was typed by hand. Three of them had rusted
 * without a single line going red:
 *
 *   - the population index of the shift was printed as 0.090; the code says 0.087;
 *   - the separating threshold was printed as 0.057; the code says 0.059 — and the demo
 *     the same paragraph invites the reader to click showed 0.059, so the reader read one
 *     number and saw another;
 *   - one cell of the window table, the 5th percentile under drift at 100 observations,
 *     reproduced at no draw count whatsoever — and it was the cell the headline sentence
 *     rested on.
 *
 * The markers already existed in the README. No generator ever reached them, so they
 * promised freshness and delivered nothing: worse than no marker at all, because a reader
 * who sees one stops checking.
 *
 * `npm run figures` rewrites the blocks; `npm test` runs the same computation with
 * `--check` and fails when the document disagrees with the code. A note in the margin
 * would have been a wish; an exit code is a fact.
 */
import { REGLAGE, INVENTAIRE, TIRAGES_PUBLIES, comportement, fenetreSeparante, rubans } from "./derive.ts";
import { run, table } from "./figures.ts";
import { wilson } from "./interval.ts";
import { fileURLToPath } from "node:url";

const n3 = (x: number) => x.toFixed(3);
const milliers = (x: number) => x.toLocaleString("en-US");

const ruban = rubans(REGLAGE, TIRAGES_PUBLIES);
const separation = fenetreSeparante(ruban);
const conduite = comportement(REGLAGE, 80);

/* The four windows the prose talks about, and only those: a table nobody reads in full
   teaches nothing, and a table that grows with the sweep would change under every edit. */
const MONTREES = [100, 200, 350, 2_000];

const lignesRegimes = MONTREES.map((fenetre) => {
  const i = ruban.fenetres.indexOf(fenetre);
  if (i === -1) throw new Error(`the sweep no longer visits ${fenetre} observations`);
  const calme = ruban.calme.haut[i]!;
  const derive = ruban.derive.bas[i]!;
  const separe = calme < derive;
  const verdict = !separe
    ? (calme > derive * 1.5 ? "no — noise swamps the shift" : "no")
    : (separation.fenetre === fenetre
        ? `yes, and the line belongs at ${n3(separation.seuil!)}`
        : "yes, comfortably");
  return [milliers(fenetre), n3(calme), n3(derive), verdict];
});

/* The alarm probability is a proportion — a count of quiet years over draws — so it gets an
   interval rather than a bare percentage. `interval.ts` sat in this repository imported by
   nobody, and the test that watched it only checked that the file existed. */
const tranquilles = Math.round(conduite.anneesTranquilles * conduite.tirages);
const [bas, haut] = wilson(tranquilles, conduite.tirages);
const pct = (x: number) => `${(x * 100).toFixed(0)} %`;

const bruit100 = ruban.calme.haut[ruban.fenetres.indexOf(100)]!;

run(fileURLToPath(new URL("../README.md", import.meta.url)), {
  lede: [
    `**The finding.** A shift of ${REGLAGE.deplacement} standard deviations — enough to matter`,
    `on a risk model — moves the index to **${n3(ruban.signal)}** on this population. The alarm is`,
    `set at **${n3(REGLAGE.seuil)}**. It is above the signal it exists to see: it cannot fire on that`,
    `shift at any window size, and the times it does fire on small windows are noise, not`,
    `detection. Below **${milliers(separation.fenetre ?? 0)} observations per check** the two ribbons overlap and no`,
    `threshold separates them at all. Where one exists, it belongs near **${n3(separation.seuil ?? 0)}**.`,
  ].join("\n"),

  regimes: table(
    ["Observations per check", "Index with no drift, 95th",
     `Index under a ${REGLAGE.deplacement}σ shift, 5th`, "Do they separate?"],
    lignesRegimes,
  ) + `\n\nAt a hundred observations a check, pure noise reaches `
    + `**${(bruit100 / ruban.signal).toFixed(1)} times** the size of the shift you are hunting. `
    + `A threshold there is a coin toss dressed as a control — and the coin lands "alarm" often `
    + `enough that the team learns to ignore it.`,

  conduite: table(
    ["Measured on an unmoved population", "Value", "95 % interval"],
    [
      ["False alarms a year", conduite.faussesAlertesParAn.toFixed(2), "—"],
      ["Years with no false alarm", pct(conduite.anneesTranquilles),
       `${pct(bas)} – ${pct(haut)}`],
      ["Checks before a real shift is seen", String(conduite.delaiMedian ?? "never"), "—"],
      ["Shifts never seen inside a year", pct(conduite.jamaisVues), "—"],
    ],
  ) + `\n\nOn ${conduite.tirages} simulated years at a fixed seed. The interval is the one the `
    + `sample supports; a rate printed without it claims a precision the draws do not carry.`,

  provenance: table(
    ["", "Input", "What it is", "Why it is that kind"],
    INVENTAIRE.map((e) => [e.provenance, `\`${e.name}\``, e.what, e.note ?? "—"]),
  ) + `\n\n**measured** — run and recorded here  \n`
    + `**assumed** — a figure a reader substitutes their own for  \n`
    + `**chosen** — a figure I picked, and the verdict moves with it`,
});
