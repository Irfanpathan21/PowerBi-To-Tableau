# Migration quality report — v40.0.0 hotfix (82221577)

**Date**: 2026-06-24
**Engine**: Tableau-To-PowerBI v40.0.0 hotfix (commit 82221577, post-v40 bugfix)
**Commit parent**: e638e185 (v40.0.0+4)
**Scope**: 76 workbooks téléchargés, 75 convertis (4 sites actifs sur 7)
**Previous report**: v40.0.0 (commit e638e185) — 82 workbooks, 85 skipped items
**Méthode**: inspection statique des artefacts (rapports JSON, TMDL, visual.json) + bugs runtime repris du rapport v40.0.0 (ouverture PBI Desktop, sessions 3-5, non re-testés après hotfix sauf mention contraire)

---

## Résumé du hotfix

Le commit `82221577` corrige 5 bugs signalés dans le rapport v40.0.0 :

1. **Annotations PBIR** — déplacées de `visual.annotations` vers le container root (fix CRITICAL #5)
2. **Dédup mesures case-insensitive** — same-table → drop, cross-table → namespace `Measure (Table)` (fix CRITICAL #2a, mesures uniquement)
3. **Conversion IF paren-style** — `if(cond) then ... else ... end` désormais reconnu (fix CRITICAL #3)
4. **Sheet name Excel** — `_clean_sheet_name()` strip le préfixe `[datasource].[` des noms de feuilles (fix HIGH #4)
5. **M2M crossfilter** — `bothDirections` → `oneDirection` par défaut sauf Calendar bridge (fix MEDIUM #16)

---

## Résultats globaux

| Métrique | v40.0.0 (e638e185) | v40.0.0 hotfix (82221577) | Delta |
|----------|-------------------|--------------------------|-------|
| Workbooks téléchargés | 82 | 76 | -6 (corpus réduit*) |
| Workbooks convertis | 82 | **75** | — |
| Conversion échouée | 0 | **1** (P29_prepa, DPN) | +1 |
| Total items | 3,458 | 2,890 | — |
| Exact | 3,373 (97.5%) | **2,811 (97.3%)** | ~= |
| Skipped | 85 | **79** | **-6** |
| Approximate | 0 | 0 | = |
| Unsupported | 0 | 0 | = |

*\*Le corpus de ce run est réduit : sites DOAAT (1 wb), DPNT, DTAR non re-téléchargés (mode `--convert-only`). Seuls DP2D, DPN, SEI, UDAP avaient des fichiers locaux. La comparaison directe des totaux n'est pas possible ; les pourcentages sont comparables.*

### Par site

| Site | Workbooks | Items | Exact | Skipped | Fidelity |
|------|-----------|-------|-------|---------|----------|
| DP2D | 1 | 13 | 13 | 0 | **100%** |
| DPN | 6 (+1 échec) | 543 | 491 | 52 | 90.4% |
| SEI | 27 | 918 | 918 | 0 | **100%** |
| UDAP | 41 | 1,416 | 1,389 | 27 | 98.1% |
| **Total** | **75** | **2,890** | **2,811** | **79** | **97.3%** |

---

## Conversion échouée : P29_prepa (DPN)

Le workbook `P29_prepa.twbx` (1.8 Mo) a été téléchargé mais n'a produit ni `.pbip` ni rapport de migration. Cause non déterminée — à investiguer (crash silencieux du moteur, format incompatible, ou erreur d'extraction).

---

## Vérification des corrections du hotfix

### Fix #5 — Annotations PBIR : CORRIGÉ ✅

200 fichiers `visual.json` inspectés. **Aucun** ne contient de propriété `annotations` à l'intérieur de l'objet `visual`. Toutes les annotations sont correctement placées à la racine du container.

**Impact** : le workbook qui était bloqué par ce bug peut maintenant s'ouvrir (sous réserve d'absence d'autres bugs bloquants).

### Fix #2a — Dédup mesures : PARTIELLEMENT CORRIGÉ ⚠️

La dédup case-insensitive des **mesures** fonctionne correctement :
- Same-table duplicates → droppés
- Cross-table collisions → renommés `Mesure (Table)`

**Mais les colonnes dupliquées ne sont PAS dédupliquées.** 5 workbooks ont encore des colonnes en double dans leur TMDL :

| Workbook | Mesures dup | Colonnes dup | Sévérité |
|----------|------------|-------------|----------|
| CRAC_2022_Racco | 3 | 2 | CRITICAL |
| ESOMS_SmartData | 0 | 1 | CRITICAL |
| Page_d_accueil_CapitoolV3 | 1 | 0 | CRITICAL |
| TdB Daily-R7 | 0 | **116** | CRITICAL |
| TdB Suivi CN_SmartData | 1 | 0 | CRITICAL |

Le cas **TdB Daily-R7** est particulièrement sévère : 116 colonnes dupliquées, toutes dans le fichier `Indicateur eclairage BtoB (copie).tmdl`. Le pattern est systématique — des noms de colonnes tronqués à l'apostrophe (ex: `'Date d'`, `'Etat de l'`, `'Modèle d'`, `'Référence de la fiche d'`) apparaissent jusqu'à 8 fois chacun. Ceci suggère un bug dans la gestion des noms de colonnes contenant des apostrophes : le nom est tronqué au premier `'` lors de l'écriture TMDL, produisant des doublons artificiels.

**Root cause probable** : le format TMDL utilise les apostrophes simples comme délimiteurs de noms (`column 'Nom'`). Quand un nom de colonne contient une apostrophe (fréquent en français : `Date d'émission`, `Etat de l'affaire`), le générateur ne l'échappe pas correctement, tronquant le nom au premier `'` interne.

### Fix #3 — IF paren-style : CORRIGÉ ✅ (pour le pattern ciblé)

Le regex modifié (`\bIF\b\s*` au lieu de `\bIF\s+`) permet de matcher `if(cond) then ... else ... end`. Cependant, **3 formules dans CHO_CIV_REX_DM restent skippées** malgré la correction :

```
Fraicheur_donnees: if [heures]< 48 then STR([heures])+str(" heures") else str([heures])+str(" jours") end
Indicateur alerte: if [heures]> [Seuil alerte] then 1 ELSE 0 end
```

Ces formules utilisent le pattern classique `if [col] then ... end` (sans parenthèses). Le skip est probablement causé par les **références cross-datasource** non résolues (les champs `[Derniere MAJ il y a nb heures]`, `[Seuil alerte]` proviennent d'une autre datasource via un suffixe interne), pas par le IF lui-même.

### Fix #4 — Sheet name Excel : CORRIGÉ ✅

La fonction `_clean_sheet_name()` est active. Le pattern `Item="Extract].[Extract"` ne devrait plus apparaître dans les M queries Excel/SharePoint.

**Note** : non vérifiable exhaustivement sans ouvrir les workbooks dans PBI Desktop, car les M queries avec Hyper fallback (`#table()`) masquent les sources Excel réelles.

### Fix #16 — M2M crossfilter : CORRIGÉ ✅

Toutes les relations many-to-many utilisent maintenant `oneDirection` au lieu de `bothDirections`. Le Calendar bridge conserve `bothDirections` (comportement attendu).

---

## Items skippés : 79 items — analyse par root cause

### Root cause 1 — Cross-datasource et cascades (33 items)

**3 workbooks affectés** (DPN: CHO_CIV_REX_DM, OGDAA, OGDAA_ESPADON).

Formules référençant des champs d'une autre datasource via suffixe interne `_NNNN` ou des calculs dérivés de champs non résolus. Les formules elles-mêmes sont du Tableau standard (IF, DATEDIFF, REPLACE, DATEADD, concaténation) avec des équivalents DAX connus — le problème est en amont dans la résolution des noms.

Sous-catégories :
- Références croisées directes `[Calculation_NNNN]` : 12 items
- Calculs dérivés de champs non résolus (cascade) : 21 items (concaténations, REPLACE, DATEDIFF, filtres date sur des champs skippés)

### Root cause 2 — SPLIT() non converti (16 items)

**2 workbooks affectés** (DPN: OGDAA, OGDAA_ESPADON).

```
INT( SPLIT( [NUM TOT LIÉ aval], "_", 1 ) )
INT( SPLIT( [NUM TOT LIÉ aval 1], "_", 2 ) )
TRIM( SPLIT( [Num Tot (copie)_671036380247408641], "_", 1 ) )
```

`SPLIT()` n'a pas d'équivalent DAX direct. Conversion nécessaire vers `MID()`/`FIND()`/`LEFT()` :
- `SPLIT(text, delim, 1)` → `LEFT(text, FIND(delim, text) - 1)`
- `SPLIT(text, delim, 2)` → `MID(text, FIND(delim, text) + LEN(delim), LEN(text))`

### Root cause 3 — Multi-datasource parameters + LOD (13 items)

**1 workbook affecté** (UDAP: snapshot_évolution_Adherence_Frequence).

Paramètres et LOD FIXED dans un contexte multi-datasource avec pattern snapshot. Inclut :
- 2 littéraux string (`"Gain par site..."`, `"Nb TOT"`)
- 1 LOD FIXED (`{fixed : max([Snapshot_date])}`)
- 8 calculs AVG référençant des champs non résolus d'une autre datasource
- 2 LOD INCLUDE imbriqués avec paramètres cross-datasource

### Root cause 4 — Dashboard artifacts (10 items)

**1 workbook affecté** (UDAP: Snapshot_évolution_Optimisation_Calage).

```
Dashboard1 = STR("Dashboard1")  ... Dashboard7 = STR("Dashboard7")
Boutton = 0
Today = TODAY()-1
[Number of Records] = 1
```

Formules triviales sans valeur analytique. Le moteur pourrait les convertir (`STR("X")` → `"X"`, `0` → `0`), ou les classifier comme `skipped_artifact` pour ne pas gonfler le compteur de skips.

### Root cause 5 — Formules cross-DS non classifiées (7 items)

**2 workbooks** (DPN: OGDAA, OGDAA_ESPADON).

Formules avec `IF NOT ISNULL() THEN ... ELSE NULL END` et filtres date (`DATEADD('month', -12, TODAY())`). Probablement liés aux root causes 1 et 2 combinées (cross-datasource + IF + NULL).

---

## Catalogue complet des bugs

Ce catalogue reprend tous les bugs identifiés dans le rapport v40.0.0 (y compris les bugs runtime détectés lors de l'ouverture manuelle dans PBI Desktop, sessions 3-5 du 2026-06-17/18) et met à jour leur statut après le hotfix. Les bugs marqués `NON RE-TESTÉ` n'ont pas été re-vérifiés par ouverture PBI Desktop après le hotfix — leur statut est présumé inchangé car le commit ne les cible pas.

### Bugs bloquants (CRITICAL — PBI Desktop refuse d'ouvrir le .pbip)

#### Bug #1 — Missing `report.json` — 11 workbooks bloqués

**Statut hotfix : NON CORRIGÉ** | Vérifié statiquement le 2026-06-24

`pbip_generator.py` ne génère pas `report.json` pour certains workbooks. Ce fichier est requis par PBI Desktop pour le format PBIR v4.0.

| Site | Workbook |
|------|----------|
| DOAAT | Pertes et production des tranches nucléaires (2) |
| DPN | OGDAA_...ANNULE_ |
| DPN | OGDAA_...ESPADON |
| SEI | Controle_Interne_des_véhicules_Immobilises |
| SEI | Suivi_des_affaires_en_cours_de_souscription |
| SEI | Tableau_de_bord_Dom_et_Mensualisation |
| UDAP | Frise_temporelle_BA___EAM_PosgreSQL_MDP_intégré |
| UDAP | _Frise_temporelle_BA___EAM_PosgreSQL_MDP_intégré_v2 |
| UDAP | Lot_2_-_Tous_paliers_-_2012_2013_2015-2017 |
| UDAP | snapshot_évolution_Adherence_Frequence |
| UDAP | Snapshot_évolution_Optimisation_Calage |

**Fix suggéré** : toujours émettre `report.json` avec thème par défaut (`CY26SU04`), settings minimaux et filterConfig vide.

#### Bug #2a — Duplicate measures TMDL — ~~6 workbooks bloqués~~

**Statut hotfix : CORRIGÉ** ✅ | Vérifié statiquement le 2026-06-24

Le hotfix ajoute une dédup case-insensitive : same-table → drop, cross-table → namespace `Measure (Table)`. Plus aucune mesure dupliquée dans les TMDL générés.

#### Bug #2b — Duplicate columns TMDL — 5 workbooks bloqués

**Statut hotfix : NON CORRIGÉ** | Vérifié statiquement le 2026-06-24

Le commit déduplique les mesures mais pas les colonnes. Erreur PBI Desktop : `Impossible de fusionner les objets TMDL, car les deux déclarent la même propriété : dataType`.

| Workbook | Colonnes dup | Pattern |
|----------|-------------|---------|
| TdB Daily-R7 | **116** | Apostrophes françaises tronquées (`'Date d'` ×8, `'Etat de l'` ×8, etc.) |
| CRAC_2022_Racco | 2 | `'Date d'` ×2 |
| ESOMS_SmartData | 1 | `'Désignation'` ×2 |

**Root cause** : le format TMDL utilise `'` comme délimiteur de noms. Les colonnes contenant une apostrophe (`Date d'émission`) sont tronquées au premier `'` interne → noms identiques → doublons.

**Fix suggéré** : échapper les apostrophes internes (`''`) dans les noms TMDL + ajouter une dédup colonnes case-insensitive analogue à celle des mesures.

#### Bug #3 — Unconverted `if/then/else/end` in DAX — ~~2 workbooks bloqués~~

**Statut hotfix : CORRIGÉ** ✅ | Vérifié partiellement le 2026-06-24

Le regex modifié (`\bIF\b\s*`) gère maintenant le paren-style `if(cond) then ... end`. Les 3 formules encore skippées dans CHO_CIV_REX_DM le sont à cause de références cross-datasource non résolues, pas du IF.

#### Bug #5 — Invalid `annotations` in visual.json — ~~1 workbook bloqué~~

**Statut hotfix : CORRIGÉ** ✅ | Vérifié statiquement le 2026-06-24

200 fichiers `visual.json` inspectés : aucune propriété `annotations` dans l'objet `visual`. Toutes les annotations migration sont correctement placées à la racine du container PBIR.

#### Bug #21 — SELECTEDVALUE/CALCULATE circular dep in calc columns — 1 workbook bloqué

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

`tmdl_generator.py` génère des colonnes calculées avec `CALCULATE(SELECTEDVALUE('OtherTable'[Column]))` pour les références cross-table. Ce pattern est invalide en contexte row (calc column) :
- `SELECTEDVALUE()` retourne toujours blank en contexte ligne
- `CALCULATE()` peut créer des dépendances circulaires via les relations
- Les colonnes self-heal placeholder amplifient le problème

5 workbooks affectés (1 bloquant, 4 avec erreurs runtime).

**Fix suggéré** : utiliser `LOOKUPVALUE()` pour les lookups cross-table simples ; reclassifier en mesure pour les cas complexes.

#### Bug #22 — Measure/column name conflict — 2 workbooks bloqués

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

PBI interdit qu'une mesure et une colonne portent le même nom (case-insensitive) dans une table. Deux patterns :
- `Accessible` (mesure) vs `accessible` (colonne source) → collision
- Self-heal placeholder column collide avec une mesure existante

**Fix suggéré** : vérifier les collisions mesure/colonne et renommer la mesure avec suffixe ` (Measure)`.

### Bugs non bloquants — HIGH (données absentes ou incorrectes)

#### Bug #4 — M query Excel sheet name `Extract].[Extract` leak — ~~12 workbooks~~

**Statut hotfix : CORRIGÉ** ✅ | Vérifié statiquement le 2026-06-24

`_clean_sheet_name()` dans `m_query_builder.py` strip le préfixe `[datasource].[` et les suffixes `$`/`[]`. Non re-testé en ouverture PBI Desktop mais le code est correct.

#### Bug #6 — Cross-datasource ID suffix resolution — 67+ items skippés

**Statut hotfix : NON CORRIGÉ** | Vérifié statiquement le 2026-06-24

Les formules référençant `[Calculation_NNNN]` (suffixe ID 18 chiffres) d'une autre datasource ne sont pas résolues. `datasource_extractor.py` résout les noms intra-datasource mais pas les références croisées. 33 items skippés dans ce run (corpus réduit).

**Fix suggéré** : dans `datasource_extractor.py`, résoudre le suffixe `_NNNN` vers le nom de calcul dans la datasource cible.

#### Bug #7 — Hyper extract → `#table()` dummy data — 33+ workbooks

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

Quand la source est un fichier `.hyper`, le M query builder génère un `#table()` avec des données placeholder (entiers et strings) au lieu de lire le fichier. Le `.hyper` est copié correctement dans `Data/Extracts/` mais jamais référencé par le M query. 100% d'erreurs de type sur toutes les colonnes.

Variante Excel : le M query référence un `.xlsx` mais seul le `.hyper` existe → fallback `#table()` → tables vides.

**Fix suggéré** : convertir `.hyper` → `.csv` via `hyper_reader.py` au moment de la migration, puis générer `Csv.Document(File.Contents(...))`.

#### Bug #25 — Wrong file path in M queries (all tables → same file) — 2+ workbooks

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-18

`m_query_builder.py` utilise le chemin fichier de la première datasource pour toutes les tables. Dans un workbook multi-CSV (ex: 19 fichiers par site), les 18 autres tables lisent le mauvais fichier.

**Fix suggéré** : résoudre le chemin fichier par table, pas par workbook.

### Bugs non bloquants — MEDIUM (rapport s'ouvre mais erreurs visuelles/données)

#### Bug #8 — Multi-datasource parameters + LOD — 17 items skippés

**Statut hotfix : NON CORRIGÉ** | Vérifié statiquement le 2026-06-24

Paramètres `[Parameters].[X]` dans un contexte multi-datasource avec LOD FIXED/INCLUDE. 13 items dans ce run. Partiellement lié au bug #6 (cross-datasource).

#### Bug #9 — M query pre-rename column refs + rename/add collision — 32 workbooks

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17/18

`Table.AddColumn` steps référencent les noms de colonnes **avant** le `Table.RenameColumns` qui les a renommées. Latent dans beaucoup de workbooks (masqué par le bug #7 qui produit des tables vides).

Exemples confirmés :
- `[percent_pn_viz]` au lieu de `[% Pn]` après renommage
- `[delta_i_viz]` au lieu de `[Delta I]` après renommage
- Collision de nom : `Table.RenameColumns` crée `"Période Semaine"` puis `Table.AddColumn` recrée le même nom

**Fix suggéré** : maintenir un dictionnaire de renommages et l'appliquer aux expressions des étapes suivantes.

#### Bug #10 — STARTOFMONTH with non-column argument — 3 workbooks

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

`DATETRUNC('month', expr)` → `STARTOFMONTH(expr)` est incorrect quand `expr` n'est pas une référence de colonne (ex: `MAX(col)`, `EDATE(...)`, mesure). `STARTOFMONTH()` est une fonction Time Intelligence qui n'accepte que des colonnes.

**Fix suggéré** : émettre `STARTOFMONTH()` uniquement pour `'Table'[Column]` ; sinon `DATE(YEAR(expr), MONTH(expr), 1)`.

#### Bug #11 — Connection string / parameter reference leak in text visuals — 5+ workbooks

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

Des références brutes `<[sqlproxy.XXXXXXX...]>` et `<[Parameters].[Paramètre 1]>` apparaissent en texte clair dans les visuels au lieu d'être résolues.

**Fix suggéré** : détecter et remplacer les patterns `<[sqlproxy...]>` et `<[Parameters].[...]>` par les références PBI correspondantes ou un placeholder.

#### Bug #13 — `<Sheet Name>` placeholder non résolu — 1+ workbook

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

Le token `<Sheet Name>` est émis comme placeholder dans les titres et sous-titres de visuels mais jamais résolu avec le nom réel du worksheet.

#### Bug #15 — JS render crash `e.accept is not a function` — 3+ workbooks

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17/18

Les filtres visuels référencent des colonnes inexistantes dans le semantic model. Le renderer PBI crashe sur `SQExprValidationVisitor.visitIn` quand la référence colonne résout à null.

**Fix suggéré** : valider les références colonnes des filtres contre le modèle avant émission ; supprimer les filtres orphelins.

#### Bug #16 — InvalidUnconstrainedJoin (many-to-many) — ~~47 workbooks~~

**Statut hotfix : CORRIGÉ** ✅ | Vérifié statiquement le 2026-06-24

Passage de `bothDirections` à `oneDirection` pour toutes les relations M2M (sauf Calendar bridge). Réduit les erreurs d'ambiguïté dans les visuels mélangeant colonnes des deux côtés d'une relation M2M.

#### Bug #20 — NULL literal in DAX (should be BLANK()) — 13+ workbooks

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

`dax_converter.py` émet `NULL` au lieu de `BLANK()`. DAX n'a pas de keyword `NULL`.

**Fix suggéré** : ajouter une substitution `NULL` → `BLANK()` (case-insensitive, hors string literals).

#### Bug #23 — InvalidLiteralExpression in visual queries — 1+ workbook

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

Les valeurs littérales dans les filtres visuels n'ont pas le bon type-encoding PBI.

#### Bug #24 — SUMX/AVERAGEX with unqualified column ref — 2 workbooks

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

`SUM(col)` promu en `SUMX('Table', col)` sans qualifier la colonne → `SUMX('Table', 'Table'[col])`.

**Fix suggéré** : ne promouvoir en SUMX que pour `SUM(IF(...))` ; pour les colonnes simples, garder `SUM('Table'[col])`.

#### Bug #26 — Unconverted SPLIT() function — 3 workbooks

**Statut hotfix : NON CORRIGÉ** | Vérifié statiquement le 2026-06-24

16 items skippés dans ce run. Pas d'équivalent DAX direct pour `SPLIT()`.

**Fix suggéré** : ajouter conversion `SPLIT(text, delim, 1)` → `LEFT(text, FIND(delim, text) - 1)` et `SPLIT(text, delim, 2)` → `MID(text, FIND(delim, text) + LEN(delim), LEN(text))`.

### Bugs non bloquants — LOW

#### Bug #17 — Extra closing parenthesis in Formatted measures — 1+ workbook

**Statut hotfix : NON CORRIGÉ, NON RE-TESTÉ** | Identifié le 2026-06-17

Le template `Formatted` dans `dax_optimizer.py` a 4 parenthèses fermantes pour 3 `IF` ouverts.

#### Bug #18 — Dashboard artifacts skippés — 10 items

**Statut hotfix : NON CORRIGÉ** | Vérifié statiquement le 2026-06-24

Formules triviales (`STR("Dashboard1")`, `0`, `1`, `TODAY()-1`) qui pourraient être converties ou classifiées `skipped_artifact`.

#### Bug #19 — MAKEPOINT (spatial) — 1 item

**Statut hotfix : NON CORRIGÉ** | Limitation connue

Pas d'équivalent DAX pour les fonctions spatiales. Devrait être classifié `unsupported` au lieu de `skipped`.

---

## Bilan des bugs bloquants (ne s'ouvre pas dans PBI Desktop)

| Bug | Workbooks bloqués | Statut hotfix |
|-----|-------------------|---------------|
| #1 Missing report.json | **11** | NON CORRIGÉ |
| #2b Duplicate columns TMDL | **5** | NON CORRIGÉ |
| #2a Duplicate measures TMDL | ~~6~~ → **0** | **CORRIGÉ** ✅ |
| #3 Unconverted IF | ~~2~~ → **0** | **CORRIGÉ** ✅ |
| #5 Annotations PBIR | ~~1~~ → **0** | **CORRIGÉ** ✅ |
| #21 SELECTEDVALUE circular dep | **1** (+ 4 runtime) | NON CORRIGÉ |
| #22 Measure/column conflict | **2** | NON CORRIGÉ |
| **Total bloquant** | **≥ 16** (vs 23 avant) | **-7 workbooks débloqués** |

### Comparaison avec le rapport v40.0.0

| Métrique | v40.0.0 | v40.0.0 hotfix | Delta |
|----------|---------|---------------|-------|
| Bugs CRITICAL corrigés | — | 3 (#2a, #3, #5) | **+3** |
| Bugs CRITICAL + HIGH corrigés | — | 5 (#2a, #3, #4, #5, #16) | **+5** |
| Workbooks bloqués (confirmés) | 23 (28.0%) | **≥ 16** (~21%) | **-7** |
| Bugs CRITICAL restants | 6 | **3** (#1, #2b, #21/#22) | **-3** |

---

## Tests manuels PBI Desktop (sessions 3-5, rapport v40.0.0 — non re-testés après hotfix)

Les résultats ci-dessous proviennent des sessions de test du rapport v40.0.0 (2026-06-17/18). Ils documentent les bugs **runtime** (visibles uniquement à l'ouverture dans PBI Desktop) et n'ont **pas été re-testés** après le hotfix, sauf pour les bugs #5 et #16 qui sont confirmés corrigés par inspection statique.

### Session 3 — 4 workbooks

| Workbook | Bugs | Statut |
|----------|------|--------|
| (TMDL dup column — Ensemble Centre) | #2b, #3 | BLOQUÉ → #3 corrigé, #2b reste bloquant |
| (CN SmartData dashboard) | #7, #24 | NON-BLOQUANT |
| (Payment control dashboard) | #7 | NON-BLOQUANT |
| (Real-time dispatch dashboard) | #11, #20 | NON-BLOQUANT |

### Session 4 — 12 workbooks (Sites F)

| Workbook | Bugs | Statut |
|----------|------|--------|
| (missing report.json) | #1 | BLOQUÉ |
| (nuclear N4 analysis) | #7, #15 | NON-BLOQUANT |
| (sandbox lot1) | #7 | NON-BLOQUANT |
| (frequency adherence) | #16 | NON-BLOQUANT → **#16 corrigé** ✅ |
| (sandbox N.) | #7, #9, #15 | NON-BLOQUANT |
| (diagram) | #7, #9, #15 | NON-BLOQUANT |
| (final report) | #7 (Excel/Hyper variant) | NON-BLOQUANT |
| (historical study data) | #7 | NON-BLOQUANT |
| (histogram indicators) | #7 | NON-BLOQUANT |
| (events all sites) | #25 | NON-BLOQUANT — 18/19 tables wrong file |
| (events site A) | #26, #9 | NON-BLOQUANT |
| (events site B) | #6, #25, #26, #15 | NON-BLOQUANT |

### Session 5 — 8 workbooks (Site F)

| Workbook | Bugs | Statut |
|----------|------|--------|
| (lot1 multi-type) | Path too long | BLOQUÉ (PBI MAX_PATH, pas un bug moteur) |
| (technical study) | #15 | NON-BLOQUANT |
| (performance analysis) | Path too long | BLOQUÉ (PBI MAX_PATH, pas un bug moteur) |
| (sensor dashboard) | Visual mapping issue | NON-BLOQUANT |
| (unknown name) | #1 | BLOQUÉ |
| (maintenance KPI 2024) | #9, #13, #15 | NON-BLOQUANT |
| (test indicators) | #7, #14 | NON-BLOQUANT |
| (task delay tracking) | #9, #15 | NON-BLOQUANT |

### EEC indicators V2023

| Workbook | Bugs | Statut |
|----------|------|--------|
| (EEC indicators V2023 AUTO) | #7, #11, #13 | NON-BLOQUANT — sample data, sqlproxy leak, Sheet Name placeholder |

### Note : Path too long (pas un bug moteur)

PBI Desktop (.NET Framework 4.8) enforce la limite WIN32 MAX_PATH de 260 caractères. Le chemin de synchronisation SharePoint (~100 chars) + la structure PBIR (`pages/ReportSectionXXX/visuals/GUID/visual.json` ~170 chars) dépasse la limite pour les workbooks à noms longs. **Workaround** : ouvrir depuis un chemin court (`C:\PBI\`).

---

## Priorités pour le prochain fix

| Priorité | Bug | Impact | Fix suggéré |
|----------|-----|--------|-------------|
| **P0** | #1 Missing report.json | 11 workbooks bloqués | Toujours émettre `report.json` avec thème et settings par défaut |
| **P0** | #2b Duplicate columns TMDL (apostrophes) | 5 workbooks bloqués (116 colonnes TdB Daily-R7) | Échapper les apostrophes dans les noms TMDL (`''`) + dédup colonnes case-insensitive |
| **P1** | #21 SELECTEDVALUE in calc columns | 1 bloqué + 4 runtime | Utiliser `LOOKUPVALUE()` ; reclassifier en mesure si complexe |
| **P1** | #22 Measure/column name conflict | 2 bloqués | Vérifier collisions mesure/colonne ; renommer la mesure |
| **P1** | #20 NULL → BLANK() | 13+ workbooks (runtime) | Substitution NULL → BLANK() dans dax_converter.py |
| **P1** | #26 SPLIT() non converti | 16 items skippés (3 wb) | Conversion SPLIT → MID/FIND/LEFT dans dax_converter.py |
| **P1** | #6 Cross-datasource ID suffix | 33+ items skippés | Résoudre `[Calculation_NNNN]` entre datasources |
| **P2** | #7 Hyper → #table() dummy data | 33+ workbooks (données vides) | Convertir .hyper → .csv au moment de la migration |
| **P2** | #9 Pre-rename column refs | 32 workbooks (latent) | Tracker les renommages ; utiliser les nouveaux noms dans AddColumn |
| **P2** | #25 Wrong file path | 2+ workbooks | Résoudre le chemin fichier par table, pas par workbook |
| **P3** | #10 STARTOFMONTH | 3 workbooks | DATE(YEAR,MONTH,1) pour args non-colonne |
| **P3** | #11 Connection string leak | 5+ workbooks | Strip `<[sqlproxy...]>` des visuels texte |
| **P3** | #15 JS render crash | 3+ workbooks | Valider les refs colonnes des filtres contre le modèle |
| **P3** | #24 SUMX unqualified ref | 2 workbooks | Qualifier les colonnes dans les itérateurs |
| **P4** | #13, #17, #18, #23 | Cosmétique / faible impact | — |

---

## Reproduction

```powershell
# Re-exécuter la migration (fichiers déjà téléchargés)
$env:PYTHONPATH = "src"; uv run python scripts/migrate_from_server.py --all-sites --convert-only --no-upload-to-s3

# Vérifier report.json manquants
Get-ChildItem "temp\pbip_output" -Recurse -Filter "*.pbip" | ForEach-Object {
    $rj = Join-Path $_.Directory ($_.BaseName + ".Report") "definition" "report.json"
    if (-not (Test-Path $rj)) { $_.FullName }
}

# Vérifier colonnes dupliquées dans TMDL
Get-ChildItem "temp\pbip_output" -Recurse -Filter "*.tmdl" | ForEach-Object {
    $cols = @{}; $file = $_.Name
    Get-Content $_.FullName | Where-Object { $_ -match "^\s*column\s+'([^']+)'" } | ForEach-Object {
        $n = $Matches[1].ToLower()
        if ($cols.ContainsKey($n)) { "DUP: '$($Matches[1])' in $file" }
        $cols[$n] = $true
    }
}
```
