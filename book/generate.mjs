/**
 * Generates the LaTeX book (book/italian-learning-lab.tex) from the same data
 * and grammar engine that drive the website, so the two never diverge.
 *
 *   npm run book        # generate the .tex and compile the PDF (XeLaTeX)
 *
 * Everything in the website is included except listening and speaking
 * (read-aloud, audio) and the interactive tools, which are replaced by
 * printed tables: verb analyses for every story sentence, full conjugation
 * sets, principal parts of every verb, and a complete answer key.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LESSONS, MODULES, STORIES, RHYMES, DIAGNOSTIC, PRACTICE_SETS, SOURCES, VERIFICATION, getLesson, getModule } from '../src/core/data-loader.js';
import { BUILT_IN, getWord, displayLemma, lookupForm, categories } from '../src/vocabulary/dictionary.js';
import { PERSONS, splitInfinitive, articulatedTable, ARTICLE_ORDER, isIrregular } from '../src/grammar/grammar-engine.js';
import {
  TENSES,
  MOODS,
  IMPERATIVE_PERSONS,
  FUTURE_ENDINGS,
  CONDITIONAL_ENDINGS,
  conjugate,
  tenseInfo,
  fullTenseLabel,
  normaliseTenseKey,
  irregularCells,
  displayCell,
  futureStem,
  passatoRemotoNote,
  imperativoNegativoTu,
  nonFinite
} from '../src/grammar/verb-system.js';
import { englishPresent } from '../src/components/tables.js';
import { verbContexts, verbFormsUsed } from '../src/reading/reading-engine.js';
import { analyseSentence } from '../src/grammar/sentence-analysis.js';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, '../package.json'), 'utf8'));

/* ------------------------------------------------------------------ */
/* Text conversion                                                     */
/* ------------------------------------------------------------------ */

/** Website-specific phrases rewritten for print. */
const PRINT_SUBSTITUTIONS = [
  ['The word panels in this course list every possible analysis when a form is ambiguous.', 'The conjugation tables in Part IV let you check every possible analysis of an ambiguous form.'],
  ['and a link to the lesson.', 'and the lesson where it is taught.'],
  ['and the word panels explain any form you click.', 'and the conjugation tables in Part IV let you identify any form you meet.'],
  ['the word panel always shows it.', 'the vocabulary list in Appendix B always shows it.']
];

function esc(s) {
  return String(s)
    .replace(/\\/g, '\u0000')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\u0000/g, '\\textbackslash{}');
}

/** Course text: *italian* → italics, **bold**, [[lesson|label]] → cross-reference, ___ → blank. */
function tx(s, { blanks = true } = {}) {
  if (s === null || s === undefined) return '';
  let t = String(s);
  for (const [a, b] of PRINT_SUBSTITUTIONS) t = t.split(a).join(b);
  if (blanks) t = t.replace(/_{2,}/g, '\u0001');
  t = esc(t);
  t = t
    .replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
    .replace(/\*([^*]+)\*/g, '\\textit{$1}')
    .replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (m, id, label) => `\\lessonref{${id}}{${label}}`)
    .replace(/\u0001/g, '\\blank{}');
  return t;
}

/** Italian text shown as such (no markup conversion). */
const it = (s) => `\\textit{${esc(s)}}`;
/** Index entry sorted without accents (makeindex sorts by bytes). */
const idx = (lemma) => `\\index{${String(lemma).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[@!|"]/g, '')}@${esc(lemma)}}`;
const lbl = (s) => String(s).replace(/[^A-Za-z0-9:-]/g, '-');

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */

function dataTable(block) {
  const cols = block.headers.length;
  const len = (c) => String(c).replace(/\*/g, '').length;
  const maxLen = block.headers.map((h, i) => Math.max(len(h), ...block.rows.map((r) => len(r[i] ?? ''))));
  let spec = maxLen.map((m) => (m > 24 ? 'L' : 'l'));
  if (!spec.includes('L') && maxLen.reduce((a, b) => a + b, 0) > 80) spec[maxLen.indexOf(Math.max(...maxLen))] = 'L';
  const tabular = spec.includes('L') ? 'xltabular' : 'longtable';
  const head = block.headers.map((h) => `\\textbf{${tx(h)}}`).join(' & ');
  const rows = block.rows.map((r) => r.map((c, i) => (i === 0 ? tx(String(c)) : tx(String(c)))).join(' & ') + ' \\\\').join('\n');
  const open = tabular === 'xltabular' ? `\\begin{xltabular}{\\linewidth}{${spec.join('')}}` : `\\begin{longtable}{${spec.join('')}}`;
  return `\n{\\small\\setlength{\\LTpre}{2pt}\\setlength{\\LTpost}{6pt}
${block.caption ? `\\tablecaption{${tx(block.caption)}}` : ''}
${open}
\\toprule
${head} \\\\
\\midrule
${rows}
\\bottomrule
\\end{${tabular}}}\n`;
  // cols kept for readability
}

function formsFor(word, key, gender) {
  if (key === 'presente' && word.present) return word.present;
  if (key === 'imperfetto' && word.imperfect) return word.imperfect;
  return conjugate(word.lemma, key, { gender: gender || 'm', record: word, isc: word.isc ? true : undefined });
}

function splitForm(form, stem) {
  const m = /^((?:(?:mi|ti|si|ci|vi) )?)(.*)$/.exec(form);
  const pre = m[1];
  const body = m[2];
  if (stem && body.startsWith(stem) && body.length > stem.length) return [pre, stem, body.slice(stem.length)];
  if (stem && body.startsWith(`${stem}h`)) return [pre, stem, body.slice(stem.length)];
  if (stem && stem.endsWith('i') && body.startsWith(stem.slice(0, -1))) return [pre, stem.slice(0, -1), body.slice(stem.length - 1)];
  return [pre, body, ''];
}

function paradigmCaption(word, key, opts) {
  const info = tenseInfo(key);
  const label = info ? fullTenseLabel(info) : key;
  const aux = word.reflexive ? 'essere' : word.auxiliary;
  let extra = '';
  if (info && info.aux) extra = ` (with ${aux}${aux === 'essere' ? (opts.gender === 'f' ? ', feminine subject' : ', masculine subject') : ''})`;
  return opts.compact ? `${label}${extra}` : `${word.lemma} --- ${esc(word.meaning)} \\textperiodcentered{} ${label}${extra}`;
}

/** One paradigm as a box of fixed width. */
function paradigm(word, tense, opts = {}) {
  const key = normaliseTenseKey(tense || 'presente');
  const info = tenseInfo(key);
  const forms = formsFor(word, key, opts.gender);
  const split = splitInfinitive(word.lemma);
  const stem = split ? split.stem : '';
  const irregular = info && !info.aux ? irregularCells(word.lemma, key) : forms.map(() => false);
  const persons = key === 'imperativo' ? IMPERATIVE_PERSONS : PERSONS;
  const showEnglish = key === 'presente' && !opts.compact;
  const highlight = opts.highlightEndings && ['presente', 'imperfetto', 'futuro', 'condizionale', 'passatoRemoto', 'congiuntivoPresente', 'congiuntivoImperfetto'].includes(key);
  const cell = (form, i) => {
    if (!form) return '---';
    if (irregular[i]) return `\\irr{${esc(displayCell(form))}}`;
    if (highlight && ['futuro', 'condizionale'].includes(key)) {
      const e = (key === 'futuro' ? FUTURE_ENDINGS : CONDITIONAL_ENDINGS)[i];
      return form
        .split('/')
        .map((f) => {
          const m = /^((?:(?:mi|ti|si|ci|vi) )?)(.*)$/.exec(f);
          return `${esc(m[1])}${esc(m[2].slice(0, -e.length))}\\hlending{${esc(e)}}`;
        })
        .join(' / ');
    }
    if (highlight) {
      return form
        .split('/')
        .map((f) => {
          const [pre, st, end] = splitForm(f, stem);
          return `${esc(pre)}${esc(st)}${end ? `\\hlending{${esc(end)}}` : ''}`;
        })
        .join(' / ');
    }
    return esc(displayCell(form));
  };
  const rows = forms
    .map((form, i) => {
      if (key === 'imperativo' && i === 0) return null;
      const en = showEnglish ? ` & {\\color{muted}${esc((form && englishPresent(word, i)) || '')}}` : '';
      return `\\textit{${esc(persons[i])}} & ${cell(form, i)}${en} \\\\`;
    })
    .filter(Boolean)
    .join('\n');
  const notes = [];
  if (highlight && split && !isIrregular(word.lemma) && !irregular.some(Boolean)) notes.push(`Stem ${it(key === 'futuro' || key === 'condizionale' ? `${futureStem(word.lemma)}-` : `${stem}-`)} + \\hlending{ending}.`);
  if (irregular.some(Boolean)) notes.push('\\irr{Highlighted} forms differ from the regular pattern of the verb\'s family.');
  if (forms.some((f) => f && f.includes('/'))) notes.push('Where two forms are given, both are standard.');
  if (key === 'passatoRemoto' && passatoRemotoNote(word.lemma)) notes.push(tx(passatoRemotoNote(word.lemma)));
  if (key === 'imperativo') {
    const neg = imperativoNegativoTu(word.lemma);
    notes.push(neg ? `Negative \\textit{tu}: ${it(displayCell(neg))}. \\textit{Lei} and \\textit{Loro} are the congiuntivo forms.` : 'This verb has no imperative in normal use.');
  }
  const spec = showEnglish ? '@{}l l l@{}' : '@{}l l@{}';
  return `\\paradigmbox{${paradigmCaption(word, key, opts)}}{%
\\begin{tabular}{${spec}}
${rows}
\\end{tabular}}{${notes.join(' ')}}`;
}

function paradigmGroup(items, perRow = 2) {
  const width = perRow === 3 ? '0.32\\linewidth' : '0.48\\linewidth';
  let out = '\n\\par\\noindent';
  items.forEach((p, i) => {
    out += `\\begin{minipage}[t]{${width}}\\raggedright\n${p}\n\\end{minipage}`;
    if ((i + 1) % perRow === 0 && i < items.length - 1) out += '\\par\\medskip\\noindent';
    else if (i < items.length - 1) out += perRow === 3 ? '\\hspace{0.02\\linewidth}' : '\\hfill';
  });
  return `${out}\\par\\medskip\n`;
}

function comparison(words, tense) {
  const key = normaliseTenseKey(tense || 'presente');
  const info = tenseInfo(key);
  const persons = key === 'imperativo' ? IMPERATIVE_PERSONS : PERSONS;
  const forms = words.map((w) => formsFor(w, key));
  const masks = words.map((w) => (info && !info.aux ? irregularCells(w.lemma, key) : [false, false, false, false, false, false]));
  const rows = persons
    .map((p, i) => (p === null ? null : `\\textit{${esc(p)}} & ${words.map((w, k) => (masks[k][i] ? `\\irr{${esc(displayCell(forms[k][i]))}}` : esc(displayCell(forms[k][i])))).join(' & ')} \\\\`))
    .filter(Boolean)
    .join('\n');
  return `\n\\tablecaption{${words.map((w) => w.lemma).join(' \\textperiodcentered{} ')} --- ${info ? fullTenseLabel(info) : key}}
{\\small\\begin{tabular}{@{}l ${words.map(() => 'l').join(' ')}@{}}
\\toprule
\\textbf{Person} & ${words.map((w) => `\\textbf{\\textit{${w.lemma}}}`).join(' & ')} \\\\
\\midrule
${rows}
\\bottomrule
\\end{tabular}}\\par\\medskip\n`;
}

function articulatedTableTeX() {
  const rows = articulatedTable();
  return `\n\\tablecaption{Preposition + definite article}
{\\small\\begin{tabular}{@{}l ${ARTICLE_ORDER.map(() => 'l').join(' ')}@{}}
\\toprule
 & ${ARTICLE_ORDER.map((a) => `\\textbf{\\textit{${esc(a)}}}`).join(' & ')} \\\\
\\midrule
${rows.map((r) => `\\textbf{\\textit{${esc(r.prep)}}} & ${r.forms.map((f) => it(f)).join(' & ')} \\\\`).join('\n')}
\\bottomrule
\\end{tabular}}\\par\\medskip\n`;
}

function tenseOverview() {
  const s1 = { lemma: 'parlare', meaning: 'to speak', auxiliary: 'avere' };
  const s2 = { lemma: 'andare', meaning: 'to go', auxiliary: 'essere' };
  const rows = TENSES.map((t) => {
    const p = t.key === 'imperativo' ? 1 : 0;
    const f1 = conjugate(s1.lemma, t.key, { record: s1 })[p];
    const f2 = conjugate(s2.lemma, t.key, { record: s2 })[p];
    const suffix = t.key === 'imperativo' ? ' (tu)' : '';
    return `${t.mood} & \\textbf{${t.label}}${t.aux ? ' {\\color{muted}(compound)}' : ''} & ${it(displayCell(f1) + suffix)} & ${it(displayCell(f2) + suffix)} & ${tx(t.summary)} & ${t.level} & \\S\\ref{les:${t.lesson}} \\\\`;
  }).join('\n');
  return `\n{\\footnotesize\\setlength{\\LTpre}{2pt}
\\tablecaption{The Italian verb system}
\\begin{xltabular}{\\linewidth}{@{}>{\\raggedright\\arraybackslash}p{1.6cm} >{\\raggedright\\arraybackslash}p{2.1cm} l l L l l@{}}
\\toprule
\\textbf{Mood} & \\textbf{Tense} & \\textbf{\\textit{parlare}} (io) & \\textbf{\\textit{andare}} (io) & \\textbf{Main use} & \\textbf{Level} & \\textbf{Lesson} \\\\
\\midrule
\\endhead
${rows}
\\bottomrule
\\end{xltabular}}\n`;
}

function conjugationSet(word, opts = {}) {
  let out = '';
  for (const mood of MOODS) {
    const tenses = TENSES.filter((t) => t.mood === mood);
    out += `\n\\moodheading{${mood}}\n`;
    out += paradigmGroup(tenses.map((t) => paradigm(word, t.key, { compact: true, gender: opts.gender })), 3);
  }
  const nf = nonFinite(word.lemma, { gender: opts.gender, record: word });
  out += `\n\\moodheading{forme non finite}\n{\\small\\begin{tabular}{@{}l l@{}}
infinito presente & ${it(displayCell(nf.infinito))} \\\\
infinito passato & ${it(displayCell(nf.infinitoPassato))} \\\\
gerundio presente & ${it(displayCell(nf.gerundio))} \\\\
gerundio passato & ${it(displayCell(nf.gerundioPassato))} \\\\
participio passato & ${it(displayCell(nf.participioPassato))} \\\\
\\end{tabular}}\\par\n`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Lesson blocks                                                       */
/* ------------------------------------------------------------------ */

const RULE_LABEL = { rule: 'Rule', tendency: 'Tendency', exception: 'Exception', tip: 'Tip' };
const RULE_COLOUR = { rule: 'rulecol', tendency: 'tendcol', exception: 'exccol', tip: 'tipcol' };

function renderBlocks(blocks) {
  let out = '';
  let group = [];
  const flush = () => {
    if (group.length) out += paradigmGroup(group, 2);
    group = [];
  };
  for (const b of blocks) {
    if (b.type === 'paradigm') {
      const w = getWord(b.verb);
      if (w) group.push(paradigm(w, b.tense, { highlightEndings: b.highlightEndings, gender: b.gender }));
      continue;
    }
    flush();
    switch (b.type) {
      case 'p':
        out += `\n${tx(b.text)}\\par\n`;
        break;
      case 'list':
        out += `\n\\begin{itemize}\n${b.items.map((x) => `\\item\\relax ${tx(x)}`).join('\n')}\n\\end{itemize}\n`;
        break;
      case 'rule':
        out += `\n\\begin{notebox}{${RULE_COLOUR[b.kind] || 'rulecol'}}\\notelabel{${RULE_COLOUR[b.kind] || 'rulecol'}}{${RULE_LABEL[b.kind] || 'Note'}}{${b.title ? tx(b.title) : ''}}\n${tx(b.text)}\n\\end{notebox}\n`;
        break;
      case 'table':
        out += dataTable(b);
        break;
      case 'compare': {
        const ws = b.verbs.map((v) => getWord(v)).filter(Boolean);
        out += comparison(ws, b.tense);
        break;
      }
      case 'articulated-table':
        out += articulatedTableTeX();
        break;
      case 'tense-overview':
        out += tenseOverview();
        break;
      case 'conjugation-set': {
        const w = getWord(b.verb);
        if (w) out += conjugationSet(w, { gender: b.gender });
        break;
      }
      default:
        throw new Error(`Unknown block type ${b.type}`);
    }
  }
  flush();
  return out;
}

/* ------------------------------------------------------------------ */
/* Exercises and answers                                               */
/* ------------------------------------------------------------------ */

const letter = (i) => String.fromCharCode(97 + i);

/** Deterministic shuffle seeded by the exercise ID, so the book is reproducible. */
function seededShuffle(list, seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Options in print order: shuffled like on the website (unless the exercise forbids it). */
function printedOptions(ex) {
  return ex.shuffle === false ? ex.options : seededShuffle(ex.options, ex.id);
}

function shuffledRight(pairs) {
  const right = pairs.map((p) => p[1]);
  const shuffled = seededShuffle(right, right.join('|'));
  if (shuffled.every((x, i) => x === right[i]) && shuffled.length > 1) shuffled.push(shuffled.shift());
  return shuffled;
}

function shuffledTokens(ex) {
  const sorted = [...ex.tokens].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'it') || a.localeCompare(b));
  if (sorted.join(' ') === ex.answer.join(' ') && sorted.length > 1) sorted.push(sorted.shift());
  return sorted;
}

function clozeText(text) {
  return text
    .split(/(\{\d+\})/)
    .map((part) => {
      const m = /^\{(\d+)\}$/.exec(part);
      return m ? `\\clozeblank{${Number(m[1]) + 1}}` : tx(part);
    })
    .join('');
}

function exerciseBody(ex) {
  const prompt = tx(ex.prompt);
  switch (ex.kind) {
    case 'choice':
      return `${prompt}\\par\\nopagebreak\\begin{options}\n${printedOptions(ex).map((o) => `\\item\\relax ${tx(o)}`).join('\n')}\n\\end{options}`;
    case 'text':
      return /\\blank\{\}/.test(prompt) ? prompt : `${prompt}\\par\\answerline`;
    case 'cloze':
      return `${prompt}\\par\\smallskip\\begingroup\\setlength{\\parindent}{0pt}${clozeText(ex.text)}\\par\\endgroup`;
    case 'table':
      return `${prompt}\\par\\smallskip{\\begin{tabular}{@{}l l@{}}\n${ex.rows.map((r) => `${tx(r.label)} & \\blankcell \\\\`).join('\n')}\n\\end{tabular}}`;
    case 'match': {
      const right = shuffledRight(ex.pairs);
      const n = Math.max(ex.pairs.length, right.length);
      const rows = [];
      for (let i = 0; i < n; i++) rows.push(`${i + 1}.\\ ${tx(ex.pairs[i][0])} & (${letter(i)})\\ ${tx(right[i])} \\\\`);
      return `${prompt}\\par\\smallskip\\begin{tabularx}{\\linewidth}{@{}L L@{}}\n${rows.join('\n')}\n\\end{tabularx}`;
    }
    case 'order':
      return `${prompt}\\par\\smallskip ${shuffledTokens(ex).map((t) => `\\token{${esc(t)}}`).join(' ')}\\par\\answerline`;
    default:
      throw new Error(ex.kind);
  }
}

function exerciseList(exercises, labelPrefix) {
  if (!exercises.length) return '';
  return `\n\\begin{exercises}\n${exercises.map((ex) => `\\item\\label{ex:${lbl(ex.id)}}\\relax ${exerciseBody(ex)}`).join('\n')}\n\\end{exercises}\n`;
}

function answerText(ex, sectionLabel) {
  const accept = (a) => (a && a.length ? ` {\\color{muted}(also accepted: ${a.map((x) => it(x)).join('; ')})}` : '');
  let ans;
  switch (ex.kind) {
    case 'choice': {
      const i = printedOptions(ex).indexOf(ex.answer);
      ans = `(${letter(i)}) ${tx(ex.answer)}`;
      break;
    }
    case 'text':
      ans = `${it(ex.answer)}${accept(ex.accept)}`;
      break;
    case 'cloze':
      ans = ex.blanks.map((b, i) => `(${i + 1}) ${it(b.answer)}${accept(b.accept)}`).join('; ');
      break;
    case 'table':
      ans = ex.rows.map((r) => `${tx(r.label)}: ${it(r.answer)}${accept(r.accept)}`).join('; ');
      break;
    case 'match': {
      const right = shuffledRight(ex.pairs);
      ans = ex.pairs.map((p, i) => `${i + 1}--${letter(right.indexOf(p[1]))}`).join(', ');
      ans += ` {\\color{muted}(${ex.pairs.map((p) => `${tx(p[0])} = ${tx(p[1])}`).join('; ')})}`;
      break;
    }
    case 'order':
      ans = `${it(ex.answer.join(' '))}${ex.accept && ex.accept.length ? accept(ex.accept.map((a) => (Array.isArray(a) ? a.join(' ') : a))) : ''}`;
      break;
    default:
      ans = '';
  }
  let out = `\\textbf{${ans}}`;
  if (ex.explanation) out += `\\newline ${tx(ex.explanation)}`;
  for (const m of ex.mistakes || []) out += `\\newline {\\color{muted}Common mistake: ${it(Array.isArray(m.answer) ? m.answer.join(' ') : m.answer)} --- ${tx(m.message)}}`;
  if (ex.ruleRef && sectionLabel) out += ` {\\color{muted}(See \\S\\ref{${sectionLabel}:${lbl(ex.ruleRef)}}.)}`;
  return out;
}

function answerList(exercises, sectionLabel) {
  return `\\begin{answers}\n${exercises.map((ex) => `\\item\\relax ${answerText(ex, sectionLabel)}`).join('\n')}\n\\end{answers}\n`;
}

/* ------------------------------------------------------------------ */
/* Lessons                                                             */
/* ------------------------------------------------------------------ */

function wordChip(w) {
  return `${it(displayLemma(w))} ${esc(w.meaning)}`;
}

function lessonTeX(l) {
  const L = `les:${l.id}`;
  let out = `\n\\section{${tx(l.title)}}\\label{${L}}\n`;
  out += `\\lessonmeta{${esc(l.level)}}{${tx(l.description)}}\n`;
  out += `\\begin{objectives}\n${l.objectives.map((o) => `\\item\\relax ${tx(o)}`).join('\n')}\n\\end{objectives}\n`;
  for (const s of l.sections) {
    out += `\n\\subsection{${tx(s.heading)}}\\label{${L}:${lbl(s.id)}}\n`;
    out += renderBlocks(s.blocks);
  }
  out += `\n\\subsection*{Worked examples}\n\\begin{examples}\n${l.examples
    .map((e) => `\\item\\relax ${it(e.it)}\\newline ${esc(e.en)}${e.note ? `\\newline {\\color{muted}\\small ${tx(e.note)}}` : ''}`)
    .join('\n')}\n\\end{examples}\n`;
  out += `\n\\subsection*{Exercises}\\label{${L}:exercises}\n{\\color{muted}\\small Answers: page~\\pageref{ans:${l.id}}.}\n${exerciseList(l.exercises)}`;
  out += `\n\\begin{summarybox}\n\\begin{itemize}\n${l.summary.map((x) => `\\item\\relax ${tx(x)}`).join('\n')}\n\\end{itemize}\n\\end{summarybox}\n`;
  const words = l.relatedVocabulary.map((id) => getWord(id)).filter(Boolean);
  if (words.length) out += `\n\\relatedwords{${words.map(wordChip).join(' \\textperiodcentered{} ')}}\n`;
  const apply = [
    ...l.relatedStories.map((id) => {
      const s = STORIES.find((x) => x.id === id);
      return s ? `Read \\textit{${esc(s.title)}} (${esc(s.level)}), \\S\\ref{story:${id}}.` : null;
    }),
    ...(l.relatedSongs || []).map((id) => {
      const r = RHYMES.find((x) => x.id === id);
      return r ? `Study the rhyme \\textit{${esc(r.title)}}, \\S\\ref{rhyme:${id}}.` : null;
    })
  ].filter(Boolean);
  if (apply.length) out += `\\applyit{${apply.join(' ')}}\n`;
  return out;
}

function moduleTeX(m) {
  const lessons = LESSONS.filter((l) => l.moduleId === m.id);
  let out = `\n\\chapter{${tx(m.title)}}\\label{mod:${m.id}}\n\\moduleintro{${esc(m.level)}}{${tx(m.description)}}{${lessons.map((l) => `${tx(l.title)} (\\S\\ref{les:${l.id}})`).join('; ')}}\n`;
  for (const l of lessons) out += lessonTeX(l);
  return out;
}

/* ------------------------------------------------------------------ */
/* Reader                                                              */
/* ------------------------------------------------------------------ */

function sentenceVerbs(text, names) {
  const ctx = verbContexts(text, { names });
  const seen = new Set();
  const lines = [];
  for (const c of ctx) if (c && !seen.has(c.text)) { seen.add(c.text); lines.push(`${tx(c.text.replace(/[“”]/g, '*'))}${c.lesson ? ` (\\S\\ref{les:${c.lesson}})` : ''}`); }
  if (lines.length) return lines;
  // Not analysable as clauses: list each verb word with all its readings.
  const a = analyseSentence(text, { names });
  const out = [];
  for (const w of a.words) {
    const verbs = (w.analyses || []).filter((x) => x.pos === 'verb');
    if (!verbs.length) continue;
    const readings = [...new Set(verbs.map((v) => `${v.description} of ${v.lemma}`))];
    out.push(`${it(w.text)}: ${esc(readings.join(' | '))}`);
  }
  return out;
}

function formsPanel(forms) {
  const order = TENSES.map((t) => t.key);
  const rank = (k) => {
    const i = order.indexOf(k.split(':')[0]);
    return i < 0 ? 99 : i;
  };
  return [...forms]
    .sort((a, b) => rank(a.key) - rank(b.key))
    .map((f) => `\\item\\relax \\textbf{${esc(f.label)}}: ${f.examples.map(it).join(', ')}${f.lesson ? ` (\\S\\ref{les:${f.lesson}})` : ''}`)
    .join('\n');
}

function storyTeX(s) {
  let out = `\n\\section{${esc(s.title)}}\\label{story:${s.id}}\n\\storymeta{${esc(s.titleEnglish)}}{${esc(s.level)}}{${esc(s.summary)}}\n`;
  let n = 0;
  out += '\\subsection*{Text}\n\\begin{storytext}\n';
  for (const para of s.paragraphs) {
    out += `${para.map((x) => `\\sentnum{${++n}}${esc(x.it)}`).join(' ')}\\par\n`;
  }
  out += '\\end{storytext}\n';
  out += '\\subsection*{Translation, notes and verb analysis}\n\\begin{sentences}\n';
  for (const x of s.paragraphs.flat()) {
    const verbs = sentenceVerbs(x.it, s.names);
    out += `\\item\\relax ${it(x.it)}\\newline ${esc(x.en)}${x.note ? `\\newline {\\small\\color{muted}${tx(x.note)}}` : ''}${verbs.length ? `\\newline {\\footnotesize Verbs: ${verbs.join('; ')}}` : ''}\n`;
  }
  out += '\\end{sentences}\n';
  if (s.grammarNotes.length) {
    out += `\\subsection*{Grammar in this story}\n\\begin{itemize}\n${s.grammarNotes
      .map((g) => `\\item\\relax \\textbf{${tx(g.title)}.} ${tx(g.text)}${g.lesson ? ` (\\S\\ref{les:${g.lesson}})` : ''}`)
      .join('\n')}\n\\end{itemize}\n`;
  }
  const forms = verbFormsUsed(s.paragraphs.flat().map((x) => x.it), { names: s.names });
  if (forms.length) out += `\\subsection*{Verb forms in this story}\n\\begin{itemize}\n${formsPanel(forms)}\n\\end{itemize}\n`;
  const words = s.vocabulary.map((id) => getWord(id)).filter(Boolean);
  if (words.length) out += `\\relatedwords{${words.map(wordChip).join(' \\textperiodcentered{} ')}}\n`;
  out += `\\subsection*{Questions}\\label{story:${s.id}:questions}\n{\\color{muted}\\small Answers: page~\\pageref{ans:story:${s.id}}.}\n${exerciseList(s.questions)}`;
  return out;
}

function rhymeTeX(r) {
  let out = `\n\\section{${esc(r.title)}}\\label{rhyme:${r.id}}\n\\storymeta{${esc(r.titleEnglish)}}{${esc(r.level)}}{${esc(r.summary)}${r.form ? ` Form: ${esc(r.form)}.` : ''}}\n`;
  const stanzas = [];
  for (let i = 0; i < r.lines.length; i += 4) stanzas.push(r.lines.slice(i, i + 4).map((l) => esc(l.it)).join('\\\\\n'));
  out += `\\begin{verse}\n${stanzas.join('\n\n')}\n\\end{verse}\n`;
  out += '\\subsection*{Line by line}\n\\begin{sentences}\n';
  for (const l of r.lines) {
    const verbs = sentenceVerbs(l.it, r.names || []);
    out += `\\item\\relax ${it(l.it)}\\newline Literal: ${esc(l.literal)}\\newline Natural: ${esc(l.natural)}${l.note ? `\\newline {\\small\\color{muted}${tx(l.note)}}` : ''}${verbs.length ? `\\newline {\\footnotesize Verbs: ${verbs.join('; ')}}` : ''}\n`;
  }
  out += '\\end{sentences}\n';
  if (r.grammarNotes && r.grammarNotes.length) {
    out += `\\subsection*{Grammar in this rhyme}\n\\begin{itemize}\n${r.grammarNotes
      .map((g) => `\\item\\relax \\textbf{${tx(g.title)}.} ${tx(g.text)}${g.lesson ? ` (\\S\\ref{les:${g.lesson}})` : ''}`)
      .join('\n')}\n\\end{itemize}\n`;
  }
  const words = r.vocabulary.map((id) => getWord(id)).filter(Boolean);
  if (words.length) out += `\\relatedwords{${words.map(wordChip).join(' \\textperiodcentered{} ')}}\n`;
  out += `\\subsection*{Exercises}\n{\\color{muted}\\small Answers: page~\\pageref{ans:rhyme:${r.id}}.}\n${exerciseList(r.exercises)}`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Reference                                                           */
/* ------------------------------------------------------------------ */

const SEQUENCE_ROWS = [
  ['present / future / imperative', 'congiuntivo presente', 'congiuntivo passato', 'congiuntivo presente or futuro', 'Penso che parta / sia partito / partirà.'],
  ['past (passato prossimo, imperfetto, passato remoto, trapassato)', 'congiuntivo imperfetto', 'congiuntivo trapassato', 'condizionale passato', 'Pensavo che partisse / fosse partito / sarebbe partito.'],
  ['condizionale (vorrei, preferirei …)', 'congiuntivo imperfetto', 'congiuntivo trapassato', 'congiuntivo imperfetto', 'Vorrei che tu venissi. Avrei voluto che tu fossi venuto.']
];
const HYPOTHETICAL_ROWS = [
  ['realtà', 'se + indicativo', 'indicativo / imperativo', 'Se piove, resto a casa.'],
  ['possibilità', 'se + congiuntivo imperfetto', 'condizionale presente', 'Se avessi tempo, leggerei di più.'],
  ['irrealtà (passato)', 'se + congiuntivo trapassato', 'condizionale passato', 'Se fossi partito prima, sarei arrivato in tempo.'],
  ['irrealtà (mista)', 'se + congiuntivo trapassato', 'condizionale presente', 'Se avessi studiato, ora sarei più tranquillo.'],
  ['colloquiale (informal)', 'se + imperfetto', 'imperfetto', 'Se lo sapevo, venivo. (speech; not used in formal writing)']
];

const MODEL_VERBS = [
  ['Auxiliaries', ['essere', 'avere']],
  ['Regular models', ['parlare', 'credere', 'dormire', 'finire', 'lavarsi']],
  ['Irregular verbs', ['andare', 'fare', 'stare', 'dare', 'dire', 'venire', 'tenere', 'uscire', 'bere', 'potere', 'volere', 'dovere', 'sapere', 'rimanere', 'salire', 'piacere', 'sedersi', 'scegliere', 'raccogliere', 'riuscire', 'morire', 'spegnere']],
  ['Impersonal verbs', ['piovere', 'nevicare', 'bisognare']]
];

function referenceTeX() {
  let out = '\n\\part{Grammar reference}\\label{part:reference}\n';
  out += '\n\\chapter{The verb system at a glance}\\label{ref:system}\n';
  out += 'Italian has four finite moods (indicativo, congiuntivo, condizionale, imperativo) and three non-finite forms (infinito, gerundio, participio). Every compound tense is the corresponding simple tense of \\textit{avere} or \\textit{essere} followed by the past participle. The level column gives an approximate teaching order, not a statement about frequency.\\par\n';
  out += tenseOverview();
  out += '\n\\section{Sequence of tenses (concordanza dei tempi)}\\label{ref:concordanza}\nIn a subordinate clause that requires the congiuntivo, the tense depends on the main verb and on whether the subordinate action is simultaneous, earlier or later. Full treatment: \\S\\ref{les:concordanza-dei-tempi}.\\par\n';
  out += dataTable({ caption: 'Choosing the subordinate tense', headers: ['Main verb', 'Simultaneous', 'Earlier', 'Later', 'Example'], rows: SEQUENCE_ROWS.map((r) => [...r.slice(0, 4), `*${r[4]}*`]) });
  out += '\n\\section{Hypothetical sentences (periodo ipotetico)}\\label{ref:ipotetico}\nFull treatment: \\S\\ref{les:periodo-ipotetico}.\\par\n';
  out += dataTable({ caption: 'Types of hypothetical sentence', headers: ['Type', 'se-clause (protasi)', 'Main clause (apodosi)', 'Example'], rows: HYPOTHETICAL_ROWS.map((r) => [...r.slice(0, 3), `*${r[3]}*`]) });
  out += '\\begin{notebox}{tendcol}\\notelabel{tendcol}{Register}{}The conditional is not used in the \\textit{se}-clause in standard Italian (\\textit{se avrei} is non-standard). The double imperfetto is common in conversation and attested in literature, but belongs to an informal register.\\end{notebox}\n';
  out += '\n\\section{Articulated prepositions}\\label{ref:articulated}\n' + articulatedTableTeX();

  out += '\n\\chapter{Model conjugations}\\label{ref:conjugations}\n';
  out += 'Each verb below is given in every tense and mood, as generated by the same grammar engine that drives the website. Forms printed in \\irr{colour} differ from the regular pattern of the verb\'s family. Compound tenses of verbs with \\textit{essere} are shown for a masculine subject; for a feminine subject change the participle ending (\\textit{sono andata, siamo andate}). Where two forms are separated by a slash, both are standard.\\par\n';
  for (const [title, lemmas] of MODEL_VERBS) {
    out += `\n\\section{${title}}\n`;
    for (const lemma of lemmas) {
      const w = BUILT_IN.find((x) => x.partOfSpeech === 'verb' && x.lemma === lemma);
      if (!w) continue;
      out += `\n\\subsection{${esc(w.lemma)} --- ${esc(w.meaning)}}\\label{conj:${lbl(lemma)}}${idx(w.lemma)}\n`;
      out += `{\\small Auxiliary: \\textit{${w.reflexive ? 'essere' : w.auxiliary}}. ${w.usage ? tx(w.usage) : ''}}\\par\n`;
      out += conjugationSet(w);
      out += '\\clearpage\n';
    }
  }

  out += '\n\\chapter{Principal parts of every verb in the course}\\label{ref:principal}\n';
  out += 'For each verb: auxiliary, the \\textit{io} and \\textit{noi} forms of the presente, the \\textit{io} and \\textit{lui/lei} forms of the passato remoto, the \\textit{io} form of the futuro and of the congiuntivo presente, and the past participle. Every other form can be built from these (see Chapter~\\ref{ref:system}). Irregular forms are printed in \\irr{colour}.\\par\n';
  const verbs = BUILT_IN.filter((w) => w.partOfSpeech === 'verb').sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'));
  const cellOf = (w, key, i) => {
    const f = formsFor(w, key)[i];
    const irr = irregularCells(w.lemma, key)[i];
    return f ? (irr ? `\\irr{${esc(displayCell(f))}}` : esc(displayCell(f))) : '---';
  };
  const rows = verbs.map((w) => {
    const pres = `${cellOf(w, 'presente', 0)}, ${cellOf(w, 'presente', 3)}`;
    const rem = `${cellOf(w, 'passatoRemoto', 0)}, ${cellOf(w, 'passatoRemoto', 2)}`;
    const imp = w.impersonal;
    return `\\textbf{${esc(w.lemma)}}${idx(w.lemma)}\\newline {\\color{muted}${esc(w.meaning)}} & ${w.reflexive ? 'essere' : w.auxiliary} & \\textit{${imp ? `${cellOf(w, 'presente', 2)}` : pres}} & \\textit{${imp ? cellOf(w, 'passatoRemoto', 2) : rem}} & \\textit{${cellOf(w, 'futuro', imp ? 2 : 0)}} & \\textit{${cellOf(w, 'congiuntivoPresente', imp ? 2 : 0)}} & \\textit{${esc(w.participle)}} \\\\`;
  });
  out += `\n{\\footnotesize\\setlength{\\tabcolsep}{3pt}
\\begin{xltabular}{\\linewidth}{@{}>{\\raggedright\\arraybackslash}p{2.7cm} l L L l >{\\raggedright\\arraybackslash}p{1.9cm} l@{}}
\\toprule
\\textbf{Infinitive} & \\textbf{Auxiliary} & \\textbf{Presente} & \\textbf{Passato remoto} & \\textbf{Futuro} & \\textbf{Congiuntivo presente} & \\textbf{Participle} \\\\
\\midrule
\\endhead
${rows.join('\n')}
\\bottomrule
\\end{xltabular}}
{\\footnotesize\\color{muted}Impersonal verbs (\\textit{piovere, nevicare, bisognare}) are given in the third person singular only.}\\par\n`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Practice                                                            */
/* ------------------------------------------------------------------ */

function practiceTeX() {
  let out = '\n\\part{Practice}\\label{part:practice}\n';
  out += '\n\\chapter{Diagnostic test}\\label{diag}\n';
  out += `${tx(DIAGNOSTIC.description)}\\par\n\\begin{notebox}{tipcol}\\notelabel{tipcol}{How to read the result}{}Each question tests one module; the answer key names it. Mark your answers, then find the \\emph{first} module (in course order) in which you got a question wrong: start there, and skim the modules before it. If every answer is right, review the later modules and concentrate on the Reader.\\end{notebox}\n`;
  out += `{\\color{muted}\\small Answers: page~\\pageref{ans:diag}.}\n${exerciseList(DIAGNOSTIC.questions)}`;
  out += '\n\\chapter{Mixed practice}\\label{mixed}\nThese sets mix several lessons, so that you must first recognise which rule applies.\\par\n';
  for (const set of PRACTICE_SETS) {
    out += `\n\\section{${tx(set.title)}}\\label{set:${set.id}}\n{\\small Lessons: ${set.lessons.map((id) => `${tx(getLesson(id).title)} (\\S\\ref{les:${id}})`).join('; ')}.}\\par\n{\\color{muted}\\small Answers: page~\\pageref{ans:set:${set.id}}.}\n${exerciseList(set.exercises)}`;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Appendices                                                          */
/* ------------------------------------------------------------------ */

function answerKeyTeX() {
  let out = '\n\\chapter{Answer key}\\label{answers}\nAnswers are given with the explanation shown on the website. Where the website accepts several answers, all of them are listed. Answers are compared as whole words: accents, articles, endings and double consonants count; capitalisation and final punctuation do not.\\par\n';
  for (const m of MODULES) {
    out += `\n\\section*{Chapter \\ref{mod:${m.id}}: ${tx(m.title)}}\n`;
    for (const l of LESSONS.filter((x) => x.moduleId === m.id)) {
      out += `\n\\answerheading{\\S\\ref{les:${l.id}} ${tx(l.title)}}\\label{ans:${l.id}}\n${answerList(l.exercises, `les:${l.id}`)}`;
    }
  }
  out += '\n\\section*{Stories}\n';
  for (const s of STORIES) out += `\n\\answerheading{\\S\\ref{story:${s.id}} ${esc(s.title)}}\\label{ans:story:${s.id}}\n${answerList(s.questions)}`;
  out += '\n\\section*{Rhymes}\n';
  for (const r of RHYMES) out += `\n\\answerheading{\\S\\ref{rhyme:${r.id}} ${esc(r.title)}}\\label{ans:rhyme:${r.id}}\n${answerList(r.exercises)}`;
  out += '\n\\section*{Diagnostic test}\\label{ans:diag}\n';
  out += `\\begin{answers}\n${DIAGNOSTIC.questions
    .map((q) => {
      const m = getModule(q.module);
      return `\\item\\relax ${answerText(q)} {\\color{muted}(Chapter~\\ref{mod:${q.module}}: ${tx(m.title)})}`;
    })
    .join('\n')}\n\\end{answers}\n`;
  out += '\n\\section*{Mixed practice}\n';
  for (const set of PRACTICE_SETS) out += `\n\\answerheading{\\S\\ref{set:${set.id}} ${tx(set.title)}}\\label{ans:set:${set.id}}\n${answerList(set.exercises)}`;
  return out;
}

function glossaryEntry(w) {
  const lemma = esc(w.lemma);
  let head = `\\textbf{${esc(displayLemma(w))}}${idx(w.lemma)}`;
  const bits = [];
  if (w.partOfSpeech === 'noun') {
    bits.push(w.gender);
    if (w.plural) bits.push(`plural ${it(`${w.pluralArticle === "l'" ? "l'" : `${w.pluralArticle} `}${w.plural}`.replace("l' ", "l'"))}${w.pluralGender ? ` (${w.pluralGender})` : ''}`);
    else bits.push('no plural');
  } else if (w.partOfSpeech === 'verb') {
    bits.push(`verb, ${w.conjugationGroup}, auxiliary \\textit{${w.reflexive ? 'essere' : w.auxiliary}}, participle ${it(w.participle)}`);
    const irr = (w.irregularForms || []).filter((f) => !f.startsWith('participle'));
    if (irr.length) bits.push(`irregular: ${it(irr.join(', '))}`);
  } else if (w.partOfSpeech === 'adjective') {
    bits.push(`adjective: ${it([w.forms.ms, w.forms.fs, w.forms.mp, w.forms.fp].join(', '))}`);
  } else bits.push(esc(w.partOfSpeech));
  let out = `\\glossentry{${head}}{${bits.join('; ')}}{${esc(w.meaning)}}{${esc(w.exampleItalian)}}{${esc(w.exampleEnglish)}}`;
  const extra = [];
  if (w.constructions && w.constructions.length) extra.push(`Constructions: ${w.constructions.map((c) => tx(c)).join('; ')}.`);
  if (w.usage) extra.push(tx(w.usage));
  if (extra.length) out += `\\glossnote{${extra.join(' ')}}`;
  return out;
}

function glossaryTeX() {
  let out = '\n\\chapter{Vocabulary by topic}\\label{glossary}\n';
  out += `All ${BUILT_IN.length} words of the course, grouped by topic and then alphabetically. Nouns are given with their article and plural, verbs with their auxiliary and participle (full forms: Chapter~\\ref{ref:principal}), adjectives with their four forms. The level is the approximate stage at which the word is introduced. The index at the end of the book lists every Italian word alphabetically.\\par\n`;
  for (const cat of categories()) {
    const words = BUILT_IN.filter((w) => w.category === cat).sort((a, b) => a.lemma.localeCompare(b.lemma, 'it'));
    out += `\n\\section{${esc(cat.charAt(0).toUpperCase() + cat.slice(1))}}\n\\begin{glosslist}\n${words.map(glossaryEntry).join('\n')}\n\\end{glosslist}\n`;
  }
  return out;
}

const STATUS = {
  'reference-checked': 'Checked against references',
  'engine-tested': 'Forms tested automatically',
  'author-written': 'Author-written, not checked against a reference',
  'needs-review': 'Needs review'
};

function sourcesTeX() {
  const V = VERIFICATION;
  let out = '\n\\chapter{Sources and verification}\\label{sources}\n';
  out += `\\begin{notebox}{exccol}\\notelabel{exccol}{Not reviewed by a native speaker}{}${esc(V.statement)}\\end{notebox}\n`;
  out += '\\section{Verification register}\n';
  out += 'Status values: \\emph{checked against references} --- the specific claims listed below were compared with the named reference; \\emph{forms tested automatically} --- the forms are generated by code and compared with hand-written expected forms in the website\'s test suite; \\emph{author-written} --- written from standard grammar but not compared line by line with a cited source.\\par\n';
  out += `\n{\\small\\begin{xltabular}{\\linewidth}{@{}p{3.6cm} p{2.6cm} L@{}}
\\toprule
\\textbf{Topic} & \\textbf{Status} & \\textbf{Lessons and open points} \\\\
\\midrule
\\endhead
${V.topics
    .map((t) => `${esc(t.topic)} & ${STATUS[t.status] || esc(t.status)} & ${t.lessons.length ? `\\S${t.lessons.map((id) => `\\ref{les:${id}}`).join(', ')}. ` : ''}${esc(t.notes || '')}${(t.sources || []).length ? ` References: ${t.sources.map((id) => esc(V.references.find((r) => r.id === id).title)).join('; ')}.` : ''} \\\\`)
    .join('\n')}
\\bottomrule
\\end{xltabular}}\n`;
  out += '\\section{References and what was checked against them}\n\\begin{itemize}\n';
  for (const r of V.references) out += `\\item\\relax \\textbf{${esc(r.title)}} --- ${esc(r.author)}, \\textit{${esc(r.work)}}.${r.url ? ` \\url{${r.url.replace(/([%#])/g, '\\$1')}}` : ''}\\newline ${esc(r.checked)}\n`;
  out += '\\end{itemize}\n';
  out += '\\section{Further references}\n\\begin{itemize}\n';
  for (const r of SOURCES.references.filter((x) => !V.references.some((v) => v.url === x.url))) out += `\\item\\relax \\textbf{${esc(r.title)}}: \\url{${r.url.replace(/([%#])/g, '\\$1')}}\\newline ${esc(r.note)}\n`;
  out += '\\end{itemize}\n';
  out += '\\section{Provenance and licences}\n\\begin{itemize}\n';
  for (const s of SOURCES.sources) out += `\\item\\relax \\textbf{${esc(s.title)}} (${esc(s.kind)}): ${esc(s.covers)} Licence: ${esc(s.licence)}. ${s.author ? `Author: ${esc(s.author)}.` : ''} ${s.note ? esc(s.note) : ''}\n`;
  out += `\\end{itemize}\n${esc(SOURCES.lyricsPolicy)}\\par\n`;
  return out;
}

/* ------------------------------------------------------------------ */
/* Assemble                                                            */
/* ------------------------------------------------------------------ */

// The fallback-font file is inlined so that the generated .tex is a single self-contained file.
const preamble = readFileSync(resolve(here, 'preamble.tex'), 'utf8').replace('\\input{unicode-fallback.tex}', readFileSync(resolve(here, 'unicode-fallback.tex'), 'utf8'));
const front = readFileSync(resolve(here, 'frontmatter.tex'), 'utf8');

const stats = {
  modules: MODULES.length,
  lessons: LESSONS.length,
  exercises: LESSONS.reduce((a, l) => a + l.exercises.length, 0) + STORIES.reduce((a, s) => a + s.questions.length, 0) + RHYMES.reduce((a, r) => a + r.exercises.length, 0) + DIAGNOSTIC.questions.length + PRACTICE_SETS.reduce((a, p) => a + p.exercises.length, 0),
  words: BUILT_IN.length,
  verbs: BUILT_IN.filter((w) => w.partOfSpeech === 'verb').length,
  stories: STORIES.length,
  rhymes: RHYMES.length,
  version: pkg.version
};

let body = '';
body += '\n\\part{Course}\\label{part:course}\n';
for (const m of MODULES) body += moduleTeX(m);
body += '\n\\part{Reader}\\label{part:reader}\n\\chapter{Stories}\\label{stories}\nThe stories are graded. Read the text first without help; then use the sentence-by-sentence translation, notes and verb analysis. The verb analysis gives, for each verb group, the tense, mood, person and the lesson that explains it --- including tenses you have not studied yet. Where a sentence cannot be analysed clause by clause, every possible reading of each verb form is listed instead.\\par\n';
for (const s of STORIES) body += storyTeX(s);
body += '\n\\chapter{Rhymes}\\label{rhymes}\nOriginal rhymes written for this course, each with a literal and a natural translation.\\par\n';
for (const r of RHYMES) body += rhymeTeX(r);
body += practiceTeX();
body += referenceTeX();
body += '\n\\appendix\n\\addtocontents{toc}{\\protect\\addvspace{6pt}}\n';
body += answerKeyTeX();
body += glossaryTeX();
body += sourcesTeX();

let frontFilled = front;
for (const [k, v] of Object.entries(stats)) frontFilled = frontFilled.split(`@@${k}@@`).join(String(v));

const doc = `${preamble}
\\begin{document}
${frontFilled}
\\mainmatter
${body}
\\backmatter
\\printindex
\\end{document}
`;

writeFileSync(resolve(here, 'italian-learning-lab.tex'), doc);
console.log(`Wrote book/italian-learning-lab.tex (${(doc.length / 1024).toFixed(0)} kB): ${JSON.stringify(stats)}`);
