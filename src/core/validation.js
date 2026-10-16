/**
 * Answer validation for exercises.
 *
 * Principles
 *  - Answers are compared as whole normalised strings against a structured
 *    answer key (the answer plus listed alternatives). There is no substring
 *    matching: "il gatto" is not accepted for "gatto", nor vice versa.
 *  - Only harmless differences are normalised away: letter case, extra
 *    spaces, typographic apostrophes and quotation marks, and sentence-final
 *    punctuation. English answers additionally accept standard contractions
 *    ("he's" = "he is").
 *  - Meaningful Italian distinctions are kept: accents (è ≠ e), articles,
 *    endings and double consonants. When an answer differs from a correct
 *    one only by such a feature, the learner is told precisely what is wrong,
 *    but the answer is still marked incorrect.
 */

const APOSTROPHES = /[‘’ʼ`´]/g; // ‘ ’ ʼ ` ´
const QUOTES = /[“”«»"]/g; // “ ” « » "
const EDGE_PUNCT = /^[\s.,;:!?¡¿…\-–—()]+|[\s.,;:!?¡¿…\-–—()]+$/g;

export function normalise(text) {
  return String(text ?? '')
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '')
    .replace(/\s*'\s*/g, "'") // "l' acqua" -> "l'acqua"
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(EDGE_PUNCT, '')
    .toLowerCase()
    .trim();
}

const CONTRACTIONS = [
  [/\bi'm\b/g, 'i am'],
  [/\byou're\b/g, 'you are'],
  [/\bwe're\b/g, 'we are'],
  [/\bthey're\b/g, 'they are'],
  [/\b(he|she|it|that|there|what|who|where)'s\b/g, '$1 is'],
  [/\bisn't\b/g, 'is not'],
  [/\baren't\b/g, 'are not'],
  [/\bwasn't\b/g, 'was not'],
  [/\bweren't\b/g, 'were not'],
  [/\bdon't\b/g, 'do not'],
  [/\bdoesn't\b/g, 'does not'],
  [/\bdidn't\b/g, 'did not'],
  [/\bcan't\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\b(i|you|we|they)'ve\b/g, '$1 have'],
  [/\b(i|you|he|she|we|they)'ll\b/g, '$1 will'],
  [/\b(i|you|he|she|we|they)'d\b/g, '$1 would'],
  [/\bhasn't\b/g, 'has not'],
  [/\bhaven't\b/g, 'have not']
];

/** Normalisation used for English answers. */
export function normaliseEnglish(text) {
  let s = normalise(text).replace(/[.,;:!?]/g, '');
  for (const [re, rep] of CONTRACTIONS) s = s.replace(re, rep);
  return s.replace(/\s+/g, ' ').trim();
}

/** Remove diacritics: used only to *diagnose* accent errors, never to accept. */
export function stripAccents(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

function normaliseFor(lang, text) {
  return lang === 'en' ? normaliseEnglish(text) : normalise(text);
}

/** All acceptable answers for a key ({ answer, accept }) in normalised form. */
export function acceptedAnswers(key, lang = 'it') {
  const list = [key.answer, ...(key.accept || [])].filter((x) => x !== undefined && x !== null);
  return [...new Set(list.map((a) => normaliseFor(lang, a)))];
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const row = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[n];
}

const ARTICLES = new Set(['il', 'lo', 'la', "l'", 'i', 'gli', 'le', 'un', 'uno', 'una', "un'"]);

function splitArticle(s) {
  const elided = /^(l'|un'|dell'|all'|dall'|nell'|sull')(.*)$/.exec(s);
  if (elided) return [elided[1], elided[2]];
  const i = s.indexOf(' ');
  if (i < 0) return [null, s];
  const first = s.slice(0, i);
  return ARTICLES.has(first) ? [first, s.slice(i + 1)] : [null, s];
}

/**
 * Explain the most likely problem with a wrong Italian answer, comparing
 * against one specific correct form.
 */
export function diagnose(response, expected) {
  const r = normalise(response);
  const e = normalise(expected);
  if (!r) return 'No answer was given.';
  if (stripAccents(r) === stripAccents(e)) {
    return 'Check the accents: the letters are right, but an accent is missing, extra, or written the wrong way (for example è versus e).';
  }
  if (r.replace(/'/g, "' ").replace(/\s+/g, ' ') === e.replace(/'/g, "' ").replace(/\s+/g, ' ') || r.replace(/[' ]/g, '') === e.replace(/[' ]/g, '')) {
    return "Check the apostrophe and spacing: elision joins the words (l'albero, un'amica).";
  }
  const [ra, rn] = splitArticle(r);
  const [ea, en] = splitArticle(e);
  if (ea && ra !== ea && rn === en) {
    return ra
      ? `The article is wrong: this noun takes “${ea}”, not “${ra}”.`
      : `The article is missing: write “${ea}” before the noun.`;
  }
  if (ea && !ra && r === en) return `The article is missing: write “${ea}” before the noun.`;
  const words = r.split(' ');
  const target = e.split(' ');
  if (words.length === target.length) {
    const wrong = words.map((w, i) => [w, target[i]]).filter(([w, t]) => w !== t);
    if (wrong.length === 1) {
      const [w, t] = wrong[0];
      if (stripAccents(w) === stripAccents(t)) return `Check the accent on “${w}”.`;
      if (/(.)\1/.test(t) && w === t.replace(/(.)\1/, '$1')) return `Check the double consonant: “${t}”, not “${w}”.`;
      if (/(.)\1/.test(w) && t === w.replace(/(.)\1/, '$1')) return `Check the consonant: “${t}” has a single consonant, not a double one.`;
      const common = commonPrefix(w, t);
      if (common.length >= Math.max(2, t.length - 4) && w !== t) {
        return `Check the ending of “${w}”: the expected form ends in “-${t.slice(common.length) || '∅'}”.`;
      }
      return `One word is different: “${w}” should be “${t}”.`;
    }
  }
  if (target.length > 1 && [...words].sort().join(' ') === [...target].sort().join(' ')) {
    return 'The words are right but the word order is not.';
  }
  if (levenshtein(r, e) <= 2) return 'Very close — check the spelling carefully.';
  return null;
}

function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(0, i);
}

/**
 * Check a free-text answer against a key.
 * key = { answer, accept?: string[], lang?: 'it'|'en', mistakes?: [{answer, message}] }
 * Returns { correct, expected, message }.
 */
export function checkText(response, key) {
  const lang = key.lang || 'it';
  const r = normaliseFor(lang, response);
  const accepted = acceptedAnswers(key, lang);
  if (r && accepted.includes(r)) return { correct: true, expected: key.answer, message: null };
  // Known, anticipated mistakes with tailored feedback.
  for (const m of key.mistakes || []) {
    if (normaliseFor(lang, m.answer) === r) return { correct: false, expected: key.answer, message: m.message };
  }
  let message = null;
  if (lang === 'it') {
    // Diagnose against the closest acceptable form.
    const candidates = [key.answer, ...(key.accept || [])];
    let best = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
      const d = levenshtein(r, normalise(c));
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    message = diagnose(response, best);
  } else if (!r) {
    message = 'No answer was given.';
  }
  return { correct: false, expected: key.answer, message };
}

/**
 * Check any exercise. `response` shape depends on the exercise kind:
 *   choice: string (selected option)
 *   text:   string
 *   cloze:  string[] (one per blank)
 *   table:  string[] (one per row)
 *   match:  { [left]: right }
 *   order:  string[] (tokens in chosen order)
 * Returns { correct, score (0..1), parts?: [...], message, expected }.
 */
export function checkExercise(ex, response) {
  switch (ex.kind) {
    case 'choice': {
      const correct = response === ex.answer;
      const mistake = (ex.mistakes || []).find((m) => m.answer === response);
      return {
        correct,
        score: correct ? 1 : 0,
        expected: ex.answer,
        message: correct ? null : mistake ? mistake.message : response == null ? 'Choose an option first.' : null
      };
    }
    case 'text': {
      const res = checkText(response, { answer: ex.answer, accept: ex.accept, lang: ex.lang, mistakes: ex.mistakes });
      return { ...res, score: res.correct ? 1 : 0 };
    }
    case 'cloze':
    case 'table': {
      const items = ex.kind === 'cloze' ? ex.blanks : ex.rows;
      const parts = items.map((item, i) =>
        checkText((response || [])[i] ?? '', { answer: item.answer, accept: item.accept, lang: item.lang || ex.lang, mistakes: item.mistakes })
      );
      const right = parts.filter((p) => p.correct).length;
      return {
        correct: right === items.length,
        score: right / items.length,
        parts,
        expected: items.map((it) => it.answer),
        message: right === items.length ? null : `${right} of ${items.length} correct.`
      };
    }
    case 'match': {
      const parts = ex.pairs.map(([left, right]) => ({ left, correct: (response || {})[left] === right, expected: right }));
      const right = parts.filter((p) => p.correct).length;
      return {
        correct: right === parts.length,
        score: right / parts.length,
        parts,
        expected: ex.pairs.map(([l, r]) => `${l} → ${r}`),
        message: right === parts.length ? null : `${right} of ${parts.length} pairs correct.`
      };
    }
    case 'order': {
      const given = normalise((response || []).join(' '));
      const options = [ex.answer, ...(ex.accept || [])].map((t) => normalise(Array.isArray(t) ? t.join(' ') : t));
      const correct = options.includes(given);
      return {
        correct,
        score: correct ? 1 : 0,
        expected: Array.isArray(ex.answer) ? ex.answer.join(' ') : ex.answer,
        message: correct ? null : 'The word order is not right yet.'
      };
    }
    default:
      throw new Error(`Unknown exercise kind: ${ex.kind}`);
  }
}

/** Fisher–Yates shuffle with an optional seeded random source. */
export function shuffle(list, random = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Small deterministic PRNG (mulberry32) for reproducible shuffles. */
export function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
