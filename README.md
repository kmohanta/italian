# Italian Learning Lab

An open-source, offline-first website for learning Italian from absolute
beginner (A0) through the complete verb system (roughly B1–B2) — built as an
**interactive grammar textbook**, **vocabulary trainer**, **graded reader** and
**song laboratory** rather than a phrasebook or a game.

**Teaching principle.** Accurate standard Italian from the first lesson.
Difficulty is controlled through vocabulary, sentence length and the choice of
reading material — not by leaving out grammatical distinctions or teaching
rules that later have to be unlearned. Exceptions, alternatives, register and
regional variation are stated where they occur, and every rule is labelled as
a *rule*, a *tendency* or an *exception*.

- 20 modules, **49 lessons** — pronunciation to the congiuntivo, the
  periodo ipotetico, the sequence of tenses, indirect speech, the passive and
  impersonal *si* — each with objectives, explanations, paradigms, worked
  examples, exercises with immediate feedback and a summary.
- The **whole verb system**: all 8 indicative tenses, 4 congiuntivo tenses,
  2 condizionale tenses, the imperativo, infinito/gerundio/participio,
  auxiliary selection and participle agreement. Every verb in the vocabulary
  is conjugated in every tense by the engine (about 7,000 indexed forms).
- A **grammar reference** you can use on its own: searchable topics, verb
  tables with stems, endings and irregular forms highlighted, side-by-side
  comparisons, an article/plural finder, and a **sentence analyser** with
  transformations (negate, pluralise, change gender, add/remove the subject
  pronoun, present → passato prossimo / imperfetto / passato remoto / futuro /
  condizionale), a *Tenses & moods* overview, and full conjugation sets.
- **503 vocabulary entries** with stable IDs: nouns always with their article
  and plural, verbs with full present and imperfetto paradigms, participle and
  auxiliary, adjectives with their four agreement forms.
- **Leitner spaced repetition** (1, 2, 4, 7, 14, 30 days) with Again / Hard /
  Good / Easy and a documented policy.
- **10 original graded stories** (four A0–A1, three A1, one A1–A2 and two
  A2–B1 narratives that use the passato remoto, trapassato, futuro,
  condizionale, congiuntivo, periodo ipotetico and reported speech). Every
  word can be clicked; every verb form shows lemma, meaning, mood, tense,
  person, auxiliary, participle and use, with a link to the lesson — whether
  or not you have studied it yet. Each story lists the verb forms it uses.
- A **verification register** (`src/data/verification.json`, shown on the
  Sources page and at the end of every lesson) records which topics were
  checked against which reference. **Nothing has been reviewed by a native
  speaker** — see *Verification status* below.
- **4 original rhymes** with literal and natural translations, plus a
  workspace for lyrics you paste yourself (stored only in your browser), line-
  by-line study, verb analysis and optional local audio.
- Progress, statistics and revision suggestions; JSON export/import; light
  and dark themes; keyboard and screen-reader friendly.

No backend, no accounts, no API keys, no tracking. All content is bundled.

## Curriculum

| # | Module | Level | Lessons |
| --- | --- | --- | --- |
| 1 | Pronunciation and orthography | A0 | alphabet & vowels (7-vowel system), c/g, stress/doubles/accents |
| 2 | Nouns and articles | A0 | gender & number, definite, indefinite + partitive, irregular nouns |
| 3 | Adjectives | A0–A1 | agreement, demonstratives & possessives, bello/buono, comparison (di/che, di quanto) |
| 4 | Regular verbs in the present | A0–A1 | **map of the verb system**, infinitives (incl. -rre) & pronouns, -are, -ere/-ire |
| 5 | Essential irregular verbs | A0–A1 | essere/avere, andare/fare/stare/dire, others (with piacere explained) |
| 6 | Building sentences | A1 | word order, negation, questions; question words & conjunctions |
| 7 | Prepositions | A1 | simple, articulated |
| 8 | Modal verbs | A1 | potere, volere, dovere, sapere |
| 9 | Reflexive verbs | A1 | |
| 10 | Imperativo | A2 | tu/noi/voi, Lei/Loro, negative, pronouns, va'/vai … |
| 11 | Passato prossimo and auxiliaries | A2 | avere, essere, **auxiliary choice & full participle agreement** |
| 12 | Imperfetto and trapassato prossimo | A2 | imperfetto (incl. polite, counterfactual, reported uses), imperfetto vs passato prossimo, **trapassato prossimo** |
| 13 | Pronouns and complex sentences | A2 | direct (+ **ne**), indirect (+ **combined pronouns**), relatives (che, cui, il quale) |
| 14 | Futuro | A2–B1 | futuro semplice, futuro anteriore |
| 15 | Condizionale | A2–B1 | presente, passato (future in the past, reportative use) |
| 16 | Non-finite forms | A2–B1 | infinito & gerundio (presente/passato), participio (incl. participio assoluto) |
| 17 | Passato remoto | B1 | forms (incl. -ei/-etti), use and regional variation; trapassato remoto |
| 18 | Congiuntivo | B1 | presente, passato, imperfetto & trapassato |
| 19 | Complex sentences | B1–B2 | periodo ipotetico, concordanza dei tempi, discorso indiretto |
| 20 | Passive and impersonal | B1 | essere/venire/andare passive, si passivante & si impersonale |

Module IDs (`m01`…`m20`) are stable identifiers and no longer match the
display number: the imperativo (`m15`) is taught as module 10, before the
past tenses. Lesson IDs never changed, so saved progress keeps working.

## What changed in the verb-system expansion (October 2026)

**Audit of the original 12-module course.**

| Topic | Before | Now |
| --- | --- | --- |
| presente | taught | taught; -rre infinitives added |
| passato prossimo | taught (agreement deferred) | taught; new lesson on auxiliary choice and complete agreement rules |
| imperfetto | taught (core uses) | + polite, intentional, colloquial-counterfactual and reported uses |
| trapassato prossimo | missing | new lesson |
| passato remoto / trapassato remoto | missing ("not covered"; fairy-tale line "recognise only") | new module |
| futuro semplice / anteriore | missing | new module |
| condizionale presente / passato | only *vorrei* as a chunk | new module |
| congiuntivo (4 tenses) | missing | new module |
| imperativo | missing (explained only in a rhyme note) | new module |
| infinito / gerundio / participio | infinitive only after modals | new module |
| passive, si impersonale / passivante | missing | new module |
| periodo ipotetico, concordanza, discorso indiretto | missing | new module |
| ne, combined pronouns | missing | added to the pronoun lessons |

**Simplifications removed.** "Beginners can safely use one sound" for open
and closed e/o (now: seven stressed vowels, regional variation stated);
"for now, recognise them" for the partitive; "at A1 you will mostly need
*di*" (now the full *di*/*che* rule); "every infinitive ends in -are, -ere or
-ire" (now with -rre verbs); *mi piace* "as a chunk" (now explained);
"the one exception … is in Module 12" and "the passato remoto, which this
course does not cover" (now linked to the full lessons); *il quale*
"recognise only"; a definite-article exercise built on the non-standard
*il mio zio*. Lessons now link to each other with `[[lesson-id|label]]`.

**Engine and tools.** `src/grammar/verb-system.js` conjugates every tense
and mood (irregular stems and passato remoto patterns live in
`conjugations.json`, including alternatives such as *credei/credetti*,
*vendei/vendetti*, *va'/vai*). The form index, word inspector, story
annotations, grammar reference (*Tenses & moods* tab, conjugation sets,
comparisons in any tense), search and analyser all use it. The analyser
splits sentences into clauses, chooses a reading of each verb from context,
reports the alternatives, and names the relation between clauses
(sequence of tenses, type of periodo ipotetico, passive, si).

**Compatibility.** Storage is unchanged (schema v2, same key). No lesson,
exercise or vocabulary ID was removed (checked against the previous release);
custom verbs saved before the change are conjugated in all the new tenses
and their forms are indexed. Because three new lessons were inserted into
existing modules (map of the verb system, auxiliaries and agreement,
trapassato prossimo), a learner who had completed modules 4, 11 or 12 sees
those modules as not quite complete. The ID `definite-articles.5` now holds a
corrected question, so a previous answer to it refers to the old version.

---

## Quick start

Requirements: [Node.js](https://nodejs.org) 18 or newer (20+ recommended) and npm.

```bash
npm install          # install the development tools (Vite, Vitest, jsdom) and Lucide
npm run dev          # start the development server at http://localhost:5173
npm test             # run the test suite (unit, content validation, page smoke tests)
npm run build        # build the static site into dist/
npm run preview      # serve the built site at http://localhost:4173
npm run check        # tests + build, as CI does
```

## Deploying to GitHub Pages

1. Create a repository on GitHub and push this project to its `main` branch:

   ```bash
   git remote add origin https://github.com/<you>/<repository>.git
   git push -u origin main
   ```

2. In the repository, open **Settings → Pages → Build and deployment** and set
   **Source** to **GitHub Actions**.

3. The workflow in `.github/workflows/deploy.yml` runs the tests, builds the
   site and publishes `dist/` on every push to `main`. The address appears in
   the workflow summary and under Settings → Pages:
   - project site: `https://<you>.github.io/<repository>/`
   - user/organisation site (repository named `<you>.github.io`): `https://<you>.github.io/`

**Base path.** Every page lives at the site root and every internal link is
relative (`lesson.html?id=…`), so the build uses a relative base (`./`) that
works unchanged for both kinds of site — no configuration needed. If you ever
need an absolute base, set it at build time:

```bash
BASE_PATH=/my-repository/ npm run build
```

Pull requests and other branches are checked by `.github/workflows/test.yml`.

## Copying the site into an existing website

Upload the **contents of `dist/`** (after `npm run build`), never the repository's own `.html` files. The source pages load `/src/main.js`, which exists only during development; on a server it is a 404 and the page stays on "Loading…". The built pages use relative paths, so the folder can have any name (for example `https://user.github.io/italianasa/`). Keep the `assets/` folder next to the `.html` files. If the host runs Jekyll, add an empty `.nojekyll` file.

## The book (LaTeX / PDF)

`book/` contains a printable companion that covers everything on the website
except listening and speaking: all 49 lessons with their tables and rules,
every exercise (with a complete answer key), the stories and rhymes with
sentence-by-sentence translations and verb analyses, the diagnostic test and
practice sets, model conjugations, the principal parts of every verb, the
vocabulary by topic, the verification register and an index of Italian words.
It is generated from the same data and engine as the site, so it never drifts:

```bash
npm run book       # writes book/italian-learning-lab.tex and compiles it with XeLaTeX
npm run book:tex   # only regenerates the .tex
```

Compiling needs XeLaTeX with the TeX Gyre Pagella and Heros fonts, DejaVu
Serif (for IPA symbols) and the packages listed in `book/preamble.tex`. The
generated `.tex` is a single self-contained file. Edit `book/preamble.tex`,
`book/frontmatter.tex` or `book/generate.mjs`, not the generated file.

## Where your progress is stored

GitHub Pages serves static files only; there is no database. Everything the
learner does — lesson progress, exercise results, review schedules, notes,
custom words and songs — is saved in the **browser's localStorage** on that
device, under the key `italian-learning-lab`.

- It is **not synchronised** between browsers or devices.
- Clearing site data deletes it; private windows start empty.
- **Settings → Back up and transfer** exports a JSON file and imports it on
  another device, with a preview and confirmation before anything is replaced.
- Settings can reset progress (keeping custom content) or delete everything.

The stored state is versioned (`schemaVersion`), sanitised on load, migrated
from older versions, and a damaged value is kept in a backup key instead of
being silently discarded.

## Project structure

```
*.html                    one entry file per page (all in the root)
src/main.js               shared entry: mounts the page module named by <body data-page>
src/core/                 storage, dates, validation, search, progress, import/export, routing, page registry
src/grammar/              grammar-engine.js (morphology) and sentence-analysis.js (analyser + transformations)
src/vocabulary/           dictionary (form index, search), spaced repetition, vocabulary manager
src/reading/              reading engine (tokens, reading records)
src/songs/                song manager, speech synthesis and local audio
src/components/           layout, navigation, tables, exercise renderer, word inspector, modal, toasts
src/pages/                one module per page: context() + render(main, ctx)
src/data/                 all course content (JSON)
src/styles/               CSS (tokens and themes in main.css)
tests/                    Vitest suites
```

Pages: Dashboard (`index.html`), Learning path, Grammar, Lesson, Vocabulary,
Reading, Story, Songs, Song, Review, Progress, Settings, Sources & licences,
and a Diagnostic test. Individual items use query parameters
(`lesson.html?id=present-are`, `story.html?id=nel-bosco`,
`review.html?lesson=imperfetto`, `vocabulary.html?word=noun_gatto`); grammar
sub-views use the hash (`grammar.html#analyser`). Unknown IDs show a friendly
message with a link back.

## Editing and adding content

All content is plain JSON in `src/data/`. The test suite validates every file,
so `npm test` tells you precisely what is wrong.

| File | Contents |
| --- | --- |
| `curriculum.json` | Modules in order, each listing its lesson IDs |
| `lessons/mNN-*.json` | Lessons, one file per module |
| `vocabulary.json` | Vocabulary records |
| `conjugations.json` | Irregular verb tables (all tenses), future stems, strong passato remoto stems and alternatives, -isc- verbs, irregular participles, essere verbs |
| `function-words.json` | Articles, pronouns, possessives, demonstratives, elided forms |
| `stories.json` | Graded stories |
| `rhymes.json` | Original rhymes and song texts |
| `exercises.json` | Diagnostic test and mixed practice sets |
| `sources.json` | Provenance and licences |
| `verification.json` | What was checked, against which reference, and what is still open |

**A lesson** has `id`, `title`, `level`, `description`, `objectives`, `tags`
(`pos`, `topics`, `tenses`, `families` — used by the grammar reference
filters), `sections` (each with `blocks`), `examples` (`it`, `en`, `note`),
`exercises`, `summary`, `relatedVocabulary`, `relatedStories`, `relatedSongs`.
Block types: `p`, `list`, `rule` (`kind`: `rule` | `tendency` | `exception` |
`tip`), `table` (`caption`, `headers`, `rows`), `paradigm` (`verb` ID, `tense`:
any key from `TENSES` in `src/grammar/verb-system.js`, e.g. `presente`,
`passatoProssimo`, `passatoRemoto`, `congiuntivoImperfetto`, `condizionale`,
`imperativo`; the old `present` | `imperfect` | `passato` still work; optional
`gender`), `compare` (`verbs`, `tense`), `conjugation-set` (`verb`: every
tense of one verb), `tense-overview` (the whole verb system) and
`articulated-table`. In text, `*parola*` marks an Italian word (italic),
`**text**` is bold and `[[lesson-id|label]]` links to a lesson (the tests
check that the lesson exists). Add the lesson's ID to `curriculum.json` and
to a topic in `verification.json`.

**An exercise** has `id`, `type` (its label, e.g. `article`, `conjugation`,
`translate-en-it`), `kind` (how it is answered), `prompt`, `explanation`,
optional `ruleRef` (a section ID) and `vocabRef`, and kind-specific fields:

| kind | fields |
| --- | --- |
| `choice` | `options`, `answer` |
| `text` | `answer`, `accept` (alternatives), `lang` (`it` or `en`) |
| `cloze` | `text` with `{0}`, `{1}` … placeholders, `blanks: [{ answer, accept }]` |
| `table` | `rows: [{ label, answer, accept }]` |
| `match` | `pairs: [[left, right], …]` |
| `order` | `tokens`, `answer` (array), `accept` |

Any exercise may list `mistakes: [{ answer, message }]` for tailored feedback
on anticipated errors. Answers are compared as whole normalised strings:
case, spacing, typographic apostrophes and final punctuation are ignored;
accents, articles, endings and double consonants are not. English answers
also accept standard contractions.

**A vocabulary entry** needs `id`, `lemma`, `partOfSpeech`, `meaning`,
`category`, `level`, `exampleItalian`, `exampleEnglish`, `sourceId`, plus:
nouns `article`, `gender`, `plural`, `pluralArticle`; verbs `present`,
`imperfect` (6 forms each), `participle`, `auxiliary`, `conjugationGroup`,
`regularity`; adjectives `forms` (`ms`, `fs`, `mp`, `fp`). The tests check
that stored verb paradigms and noun articles agree with the grammar engine, so
the simplest way to add a verb is to generate its forms with
`paradigm()` from `src/grammar/grammar-engine.js` (irregular verbs: add their
table to `conjugations.json` first).

**A story** has `paragraphs` of sentences `{ it, en, note }`, `names` (proper
names), `vocabulary`, `grammarNotes` and `questions`. Every other word must be
known to the dictionary — the tests list any that are not.

## How the grammar tools work (and their limits)

- `verb-system.js` builds every tense and mood from the stored present,
  imperfetto and participle plus the irregular data: future/conditional stems,
  passato remoto (regular, strong "1-3-3" verbs, full irregulars, -ei/-etti
  alternatives), congiuntivo, imperativo (with reflexive enclitics and the
  negative tu form), gerund, compound tenses with the right auxiliary and
  agreement, and impersonal verbs (3rd person only). Alternative forms share a
  cell, separated by "/".
- `grammar-engine.js` implements the core morphology: regular
  conjugation with the -care/-gare and -iare spelling rules, -isc- verbs,
  irregular tables, imperfetto, participles, auxiliaries and agreement,
  articles (including lo/gli/l'), articulated prepositions, plurals and
  adjective agreement. Where Italian is not predictable (stress-dependent
  plurals such as *amico → amici*), results are labelled *tendency* or come
  from curated data.
- The **form index** maps every inflected form the course knows (about 7,000
  forms, all tenses) to its analyses, each with lemma, mood, tense, person,
  auxiliary and the lesson that teaches it. Unknown words are reported as unknown — nothing is
  guessed from suffixes. Ambiguous forms (*la* = article or pronoun; *sono* =
  io or loro) list all readings, and context decides where it can.
- The **sentence analyser** splits a sentence into clauses with one verb group
  each (at subordinators, coordinators, relative pronouns and commas; embedded
  relatives are extracted), assigns roles inside each clause (subject, verb,
  direct object, predicate, agent, prepositional phrases, negation, pronouns,
  compound tenses, passive, modal + infinitive, stare + gerundio), chooses a
  reading for each ambiguous verb from simple cues (the conjunction or
  governing verb, the subject's person, a preceding clitic) and lists the
  other readings. It names tense relations between clauses (future in the
  past, anteriority, type of periodo ipotetico, including the colloquial
  double imperfetto and the non-standard conditional after *se*) and the
  possible readings of *si*. Unknown words, or clauses with two finite verbs
  and no connector, produce a clear "not supported" message instead of a
  guess. Its choice of reading is a heuristic and can be wrong; the
  alternatives are always shown. It does not machine-translate: it shows a
  translation only for sentences the course itself contains.

## Testing

`npm test` runs:

- `verb-system.test.js` — every tense and mood: futures and their stems,
  conditional, passato remoto (regular, strong, irregular, alternatives),
  congiuntivo, imperativo, non-finite forms, compound tenses and impersonal
  verbs; conjugates every vocabulary verb in every tense.
- `analyser.test.js` — ambiguous forms (*parli, sono, sia, canta, prese*),
  context-based choice, hypotheticals of each type, future in the past,
  relatives, passives, *si*, and unsupported input.
- `compatibility.test.js` — a saved state from the previous release (lessons,
  exercises, cards, notes, a custom verb without the new fields, and a v1
  state) loads unchanged and the custom verb works in every new tense.
- `grammar.test.js` — conjugation, participles, auxiliaries, articles,
  plurals, agreement, the analyser and transformations; checks that the
  vocabulary data agrees with the engine.
- `spaced-repetition.test.js` — date arithmetic (month/year/leap-year and
  daylight-saving boundaries), the scheduling policy, queues and statistics.
- `storage.test.js` — persistence, sanitising, migration, damaged data, reset.
- `import-export.test.js` — export format, validation, upgrades, damaged cards.
- `vocabulary.test.js` — form lookup, search, custom words, session limits and
  answer validation (accents, articles, endings, alternatives).
- `content-validation.test.js` — counts and completeness of all content, that
  every answer key accepts its own answer and rejects listed mistakes, that
  every story and rhyme word is in the dictionary, that lesson links and
  verb-system lesson references resolve, that the A2–B1 stories use the new
  tenses, that the verification register covers every lesson and never claims
  a native-speaker review, and that every page exists.
- `pages.test.js` — mounts every page, lesson, story and song in jsdom,
  checks for errors and broken internal links, and runs key interactions.

## Accessibility

Semantic landmarks and headings, a skip link, visible focus styles, labelled
form controls, `aria-current` navigation, keyboard-operable exercises (word
order uses buttons; accent buttons insert à è é ì ò ù), flashcard shortcuts
(Space to reveal, 1–4 to grade), `lang="it"` on Italian text so screen
readers and speech engines pronounce it correctly, native `<dialog>` modals,
`prefers-reduced-motion` and `prefers-color-scheme` support.

## Known limitations

- Progress lives in one browser; use export/import to move it.
- Read-aloud depends on the voices installed in the browser or operating
  system. Some browsers use online voices; quality varies.
- The analyser and transformations cover the constructions taught in the
  course, not arbitrary Italian. They only know the ~500 words of the course
  dictionary (plus your own words); verb + enclitic pronoun forms other than
  reflexive infinitives and imperatives (*dammelo, accenderlo*) are not
  indexed. Transformations work on one-clause sentences only. The plural of
  *un/uno/una* and numerals are not changed automatically.
- The word inspector lists every analysis of a form, but the analyser's
  choice between them uses simple heuristics; it can be wrong, and forms that
  stay ambiguous are flagged as such.
- Passato remoto alternatives are recorded for the verbs in the vocabulary;
  rarer alternative forms of other verbs are not.
- Levels (A0 to about B2) are approximate and not an official CEFR
  certification. The course covers the verb system completely, but not
  everything a B1–B2 learner needs (vocabulary range, word formation, many
  idioms).

## Verification status

**No native speaker, Italian teacher or linguist has reviewed this course.**
The register in `src/data/verification.json` records, per topic:

- *reference-checked* — specific claims compared with a named reference:
  passato remoto and regional use, participle agreement, auxiliary choice with
  modal verbs, the periodo ipotetico, congiuntivo vs indicativo (Treccani,
  *Enciclopedia dell'Italiano*; Accademia della Crusca; DICO);
- *engine-tested* — forms generated by code and compared with hand-written
  expected forms in the tests;
- *author-written* — written from standard grammar but not checked line by
  line against a source.

Still needing independent verification: the naturalness of all example
sentences and stories; the usage notes for the futuro and condizionale; the
sequence-of-tenses tables and indirect-speech transformations; the passive and
*si* lessons; agreement with *ne*; regional statements beyond those in the
cited articles; and any passato remoto or congiuntivo alternative not listed
in the tests.
- User-added songs and words are only checked by the rules; irregular forms
  you add may need correcting by hand.

## Licences

- Code: MIT (`LICENSE`).
- Educational content in `src/data/`: CC BY 4.0 (`LICENSE-CONTENT.md`).
- Icons: Lucide, ISC (some icons MIT via Feather) — see `THIRD_PARTY_NOTICES.md`.
- No third-party lyrics, text, audio or fonts are bundled.
