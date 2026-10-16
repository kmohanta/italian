import { h, clear, append } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { pageHeader } from '../components/page-layout.js';
import { renderExercise } from '../components/exercise-renderer.js';
import { getStore } from '../core/storage.js';
import { DIAGNOSTIC, MODULES, lessonsInModule } from '../core/data-loader.js';
import { pageUrl } from '../core/pages.js';
import { recordExerciseResult } from '../core/progress.js';

export function context() {
  return { title: 'Diagnostic test', breadcrumbs: [{ label: 'Learning path', href: 'learning-path.html' }, { label: 'Diagnostic test' }] };
}

/**
 * Recommend a starting module: the first module containing a question
 * answered wrongly (or not answered). Modules before it are suggested as
 * "skim and practise".
 */
export function recommend(results) {
  const order = MODULES.map((m) => m.id);
  const byModule = {};
  for (const q of DIAGNOSTIC.questions) {
    byModule[q.module] = byModule[q.module] || { right: 0, total: 0 };
    byModule[q.module].total++;
    if (results[q.id]) byModule[q.module].right++;
  }
  const firstWeak = order.find((id) => byModule[id] && byModule[id].right < byModule[id].total);
  const module = MODULES.find((m) => m.id === (firstWeak || order[order.length - 1]));
  return { byModule, module, allRight: !firstWeak };
}

export function render(main) {
  const store = getStore();
  const results = {};
  append(main, 
    pageHeader('Diagnostic test', `${DIAGNOSTIC.questions.length} short questions across the course. ${DIAGNOSTIC.description} Answer each one once; it takes about five minutes.`)
  );
  const list = h('div', { class: 'exercise-set__list' });
  const out = h('section', { class: 'panel', 'aria-live': 'polite', hidden: true });
  DIAGNOSTIC.questions.forEach((q, i) => {
    append(list, 
      renderExercise(q, {
        number: i + 1,
        onChecked: (result, response) => {
          if (!(q.id in results)) results[q.id] = result.correct;
          store.update((d) => recordExerciseResult(d, q, response, result));
          if (Object.keys(results).length === DIAGNOSTIC.questions.length) finish();
        }
      })
    );
  });
  function finish() {
    const r = recommend(results);
    const score = Object.values(results).filter(Boolean).length;
    const first = lessonsInModule(r.module.id)[0];
    const recommendation = r.allRight ? 'Every answer was right: review the later modules and focus on reading.' : `Start with Module ${r.module.number}: ${r.module.title}.`;
    store.update((d) => {
      d.diagnostic = { takenAt: new Date().toISOString(), score, total: DIAGNOSTIC.questions.length, recommendation, module: r.module.id };
      store.logActivity(d, 'diagnostic', 'diagnostic', `score ${score}/${DIAGNOSTIC.questions.length}`);
    });
    clear(out);
    out.hidden = false;
    append(out, 
      h('h2', {}, `Result: ${score} of ${DIAGNOSTIC.questions.length}`),
      h('p', {}, recommendation, ' Earlier lessons remain open — skim them and try their exercises to confirm.'),
      h('ul', { class: 'list' }, MODULES.filter((m) => r.byModule[m.id]).map((m) => h('li', {}, `Module ${m.number} (${m.title}): ${r.byModule[m.id].right}/${r.byModule[m.id].total}`))),
      h('div', { class: 'button-row' }, first ? h('a', { class: 'btn btn--primary', href: pageUrl('lesson', { id: first.id }) }, icon('GraduationCap'), `Go to “${first.title}”`) : null, h('a', { class: 'btn', href: 'learning-path.html' }, 'Learning path'))
    );
    out.scrollIntoView?.({ behavior: 'smooth' });
  }
  append(main, list, out);
}
