# Combler les failles — `derive`, 23 août 2026

Cinq défauts signalés, tous vérifiés avant d'y toucher, tous fermés. Deux de plus
trouvés en chemin, dans la couche partagée — donc dans les douze dépôts à la fois.

## Ce qui a été vérifié avant d'être cru

**1 · Les marqueurs sans générateur — confirmé.** `README.md` portait
`<!-- figures:regimes -->` et `<!-- figures:provenance -->`. `src/figures.ts`
existait, avec exactement le mécanisme attendu (`figures(chemin, blocs, "write" | "check")`).
Il n'était importé **par personne**. `npm test` ne l'appelait pas, `npm run pages` non
plus. Les chiffres publiés rouillaient sans qu'une ligne rougisse.

**2 · Le bloc de provenance divergeait — confirmé.** `INVENTAIRE` déclare dans cet
ordre : *measured* `faussesAlertesParAn`, *measured* `delaiMedian`, **chosen `seuil`**,
*assumed* `fenetre`, *assumed* `deplacement`. Le README plaçait `seuil` en dernier.

**3 · La table `regimes` — confirmé, et plus précis que « fausse ».** Calculée depuis le
code à 60, 120, 200 et 300 tirages, **une seule cellule sur seize ne se reproduit à aucun
nombre de tirages** : le 5ᵉ centile sous dérive à 100 observations. Le README disait
**0,067** ; le code donne **0,079 à 0,088**. Toutes les autres cellules tombent dans la
dispersion d'échantillonnage. Et c'était bien la cellule qui portait la phrase-titre.

**4 · Le seuil du README ≠ celui de la démo — confirmé, et c'était le plus grave.** La
démo appelait `rubans(reglage, 60)` ; le README annonçait un seuil calculé ailleurs. Le
lecteur lisait **0,057** puis cliquait et voyait **0,059**.

**5 · La garde des figures — confirmé.** `npm run pages` attendait 2 figures là où la page
en rend 3 : une figure entière pouvait disparaître sans faire rougir la commande. Et
`figures.ts` comme `interval.ts` n'étaient exécutés par rien ; `liaison.test.ts:92`
n'en vérifiait que la **présence**.

## Ce qui a été fait

**Le document s'engendre.** `src/dossier.ts` produit **quatre** blocs — dont le **chapeau**,
qui était de la prose libre et portait les chiffres les plus lus de la page. `npm run figures`
réécrit ; `npm test` lance `node src/dossier.ts --check` et **tombe en code 1** sur un
document périmé. Prouvé en replantant l'ancien 0,057 : le contrôle sort en 1 et nomme le
bloc `lede`. Une note de bas de page aurait été un vœu ; un code de sortie est un fait.

**Trois chiffres publiés étaient faux, pas un :**

| ce que le README disait | ce que le code dit |
|---|---|
| indice du déplacement : **0,090** | **0,087** |
| seuil séparant : **0,057** | **0,059** |
| 5ᵉ centile sous dérive à 100 obs : **0,067** | **0,079 – 0,088** |

**Le point 4 est fermé par construction, pas par correction.** `TIRAGES_PUBLIES = 60` est
exporté par `derive.ts` et consommé par `pages.ts` **et** par `dossier.ts`. Les deux entrées
ne peuvent plus donner deux réponses : il faudrait supprimer la constante pour qu'elles
divergent à nouveau.

**Vérifié en natif**, navigateur ouvert sur la page servie en local — pas en capture.
L'écran affiche « moves the index to **0.087** » et « the line belongs near **0.059** — not
0.2 », et la légende de la figure dit « over **60** draws ». C'est ce que le README annonce.

**La garde des figures passe de 2 à 3.** Et `interval.ts` sert pour de bon : un intervalle de
Wilson sur la proportion d'années sans fausse alerte — **100 % [95,4 – 100,0]** sur 80 tirages.
Un taux imprimé sans son intervalle réclame une précision que les tirages ne portent pas.

## Deux défauts de plus, dans la couche partagée

Trouvés en passant la page **rendue** de `derive` dans l'outil de contrôle — pas déduits de
la feuille de style. Ils étaient donc latents dans les douze dépôts.

- `--encre-tres-pale` valait `#8b8578` : **3,51:1** sur le papier. Ce jeton habille
  trente-cinq règles dont une bonne moitié porte du texte. Porté à `#767166`, **4,65:1**,
  teinte conservée, avec une marge plutôt que la limite.
- `.b` avait `min-height: 38px` là où le contrat impose **44 px** de cible tactile. Six
  pixels sous le gabarit, sur tous les boutons de toutes les pages.

Après correction, la page publiée de `derive` passe **52 contrôles au vert, zéro échec**.

## `.pathname` sur une URL de fichier

**20 conversions dans 12 fichiers d'`identite`, 4 dans `derive`.** `new URL(…).pathname`
garde l'encodage pour-cent : un dossier accentué ou espacé rend un chemin qui n'existe pas,
et le `catch` qui suit rend une valeur de repli — la panne est silencieuse.

**La garde vit désormais dans `identite/gardiens.test.mjs`, donc elle voyage.** C'est le
point le plus juste qu'on m'ait signalé aujourd'hui : les modules partagés voyageaient à
l'octet près, les gardes qui les protègent ne voyageaient pas. Un module partagé sans sa
garde partagée, c'est la moitié du dispositif qui se recopie.

Le témoin n'a pas eu besoin d'être planté : la règle a tiré sur dix-neuf lignes existantes
dès sa première exécution.

## Trois choses que j'ai cassées en corrigeant, et qui valent d'être écrites

**L'appel posé sans son import.** Ma conversion automatique a écrit `fileURLToPath(...)` dans
des fichiers qui ne l'importaient pas : erreur de types dans chacun. C'est exactement le défaut
que je venais de signaler dans `banc/src/store.ts` — reproduit dix minutes plus tard par mon
propre balayage.

**L'import posé DANS un gabarit.** Mon heuristique « après le dernier `import` » a trouvé la
ligne `import` qui vit **à l'intérieur du script de la page**, dans un littéral de gabarit. Le
module restait sans import et la page en recevait un dont elle n'avait que faire.

**La correction qui corrige aussi sa propre documentation.** Le balayage a réécrit l'exemple
`.pathname` **dans le commentaire qui explique le défaut** : la note s'est mise à affirmer que
la bonne API était la cassée. Une note qui cite le défaut qu'elle explique se fait corriger
avec lui — elle doit le décrire, pas le citer.

## Ce qui reste ouvert

**`banc` est en chantier chez une autre session** et son arbre mêle deux mains : mon diffusion
de la couche partagée et son remplacement de `.pathname`. Je n'y ai rien commité. Ses cinq
fichiers partagés sont à l'octet ceux d'`identite` ; son `store.ts` et son `chemins.test.ts`
sont à elle.

**Le compte de tests du portfolio** (`vitrine/chiffres.json` et le README de `profil`) doit
être refait : `derive` passe de 30 à 31 cas et `identite` de 77 à 78.
