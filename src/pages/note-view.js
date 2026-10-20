import { createEditorSession } from '../editor/session.js';
import { h } from '../util.js';

/**
 * Shared layout for a document: a vertical header column on the left,
 * the block editor (its own horizontal scroller) filling the rest.
 */
export function mountNoteView(container, { head, documentId, focusBlockId = null } = {}) {
  const editorHost = h('div', { class: 'note-view__editor' });
  const view = h('section', { class: 'note-view' },
    h('header', { class: 'note-view__head' }, head),
    editorHost);
  container.replaceChildren(view);

  const session = createEditorSession(editorHost, documentId, { focusBlockId });
  const scroller = editorHost.querySelector('.editor-content');
  let reading = false;

  // mgl-common-ui leaves editable surfaces alone, so map the vertical wheel here.
  const onWheel = (e) => {
    if (e.ctrlKey || e.shiftKey || !scroller) return;
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) || !e.deltaY) return;
    if (e.target.closest && e.target.closest('.mgl-cell, [data-mn-scroll-y]')) return;
    const delta = e.deltaMode === 1 ? e.deltaY * 24 : e.deltaY;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if ((delta < 0 && scroller.scrollLeft <= 0) || (delta > 0 && scroller.scrollLeft >= max - 1)) return;
    scroller.scrollLeft += delta;
    e.preventDefault();
  };
  scroller?.addEventListener('wheel', onWheel, { passive: false });

  const onKey = (e) => {
    if (e.key === 'Escape' && reading) {
      setReading(false);
    }
  };
  window.addEventListener('keydown', onKey);

  function setReading(on) {
    reading = Boolean(on);
    view.classList.toggle('is-reading', reading);
    session.setReadOnly(reading);
  }

  return {
    session,
    setReading,
    isReading: () => reading,
    async destroy() {
      window.removeEventListener('keydown', onKey);
      scroller?.removeEventListener('wheel', onWheel);
      await session.destroy();
    },
  };
}
