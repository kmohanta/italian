/**
 * Accessible modal dialog using the native <dialog> element (focus trap,
 * Escape to close and background inertness come from the browser). Falls
 * back to a plain open dialog where showModal() is unavailable.
 */
import { h, append } from './dom.js';
import { icon } from './icons.js';

export function openModal({ title, content, actions = [], wide = false, onClose } = {}) {
  const previouslyFocused = document.activeElement;
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  const dialog = h('dialog', { class: ['modal', wide && 'modal--wide'], 'aria-labelledby': titleId });
  const close = () => {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    dialog.remove();
    if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
    if (onClose) onClose();
  };
  const header = h(
    'header',
    { class: 'modal__header' },
    h('h2', { id: titleId, class: 'modal__title' }, title),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('X'))
  );
  const body = h('div', { class: 'modal__body' }, content);
  const footer = actions.length
    ? h(
        'footer',
        { class: 'modal__footer' },
        actions.map((a) =>
          h(
            'button',
            {
              type: 'button',
              class: ['btn', a.primary ? 'btn--primary' : '', a.danger ? 'btn--danger' : ''],
              onclick: async () => {
                const keepOpen = a.onClick ? await a.onClick() : false;
                if (keepOpen !== true) close();
              }
            },
            a.label
          )
        )
      )
    : null;
  append(dialog, header, body, footer || '');
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close(); // click on the backdrop
  });
  append(document.body, dialog);
  if (typeof dialog.showModal === 'function') {
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute('open', '');
    }
  } else dialog.setAttribute('open', '');
  return { close, dialog, body };
}

/** Promise-based confirmation dialog. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      content: typeof message === 'string' ? h('p', {}, message) : message,
      actions: [
        { label: 'Cancel', onClick: () => { answered = true; resolve(false); } },
        { label: confirmLabel, primary: !danger, danger, onClick: () => { answered = true; resolve(true); } }
      ],
      onClose: () => {
        if (!answered) resolve(false);
      }
    });
  });
}
