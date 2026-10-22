import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
const { window } = dom;
after(() => dom.window.close());
globalThis.window = window;
globalThis.document = window.document;
globalThis.Event = window.Event;
globalThis.Node = window.Node;

const { attachMarkdownShortcuts } = await import('../src/editor/markdown-shortcuts.js');

function mount(text) {
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="toolbar">
      <button type="button" data-block="heading-1">H1</button>
      <button type="button" data-block="heading-2">H2</button>
      <button type="button" data-block="heading-3">H3</button>
      <button type="button" data-block="list-item">List</button>
      <button type="button" data-block="ordered-list-item">1.</button>
      <button type="button" data-block="task">Task</button>
      <button type="button" data-block="blockquote">Quote</button>
      <button type="button" data-block="divider">Divider</button>
    </div>
    <div class="block-wrapper" data-block-type="paragraph">
      <p class="block-content" contenteditable="true"></p>
    </div>
  `;
  const content = host.querySelector('.block-content');
  const wrapper = host.querySelector('.block-wrapper');
  content.textContent = text;
  document.body.replaceChildren(host);

  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const clicked = [];
  host.querySelectorAll('.toolbar button[data-block]').forEach((btn) => {
    btn.addEventListener('click', () => {
      clicked.push(btn.dataset.block);
      wrapper.dataset.blockType = btn.dataset.block;
      if (btn.dataset.block === 'task') {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        wrapper.prepend(checkbox);
      }
    });
  });

  const md = attachMarkdownShortcuts(host, {});
  content.dispatchEvent(new Event('input', { bubbles: true }));
  return { host, wrapper, content, clicked, md };
}

test('markdown shortcuts convert paragraph prefixes via toolbar buttons', () => {
  const cases = [
    ['# ', 'heading-1'],
    ['## ', 'heading-2'],
    ['### ', 'heading-3'],
    ['- ', 'list-item'],
    ['* ', 'list-item'],
    ['• ', 'list-item'],
    ['1. ', 'ordered-list-item'],
    ['[ ] ', 'task'],
    ['[] ', 'task'],
    ['> ', 'blockquote'],
    ['---', 'divider'],
  ];
  for (const [prefix, type] of cases) {
    const { clicked, content, wrapper, md } = mount(prefix);
    assert.deepEqual(clicked, [type], prefix);
    assert.equal(content.textContent, '');
    assert.equal(wrapper.dataset.blockType, type);
    md.destroy();
  }
});

test('markdown shortcut [x] converts to a checked task', () => {
  const { clicked, wrapper, md } = mount('[x] ');
  assert.deepEqual(clicked, ['task']);
  const checkbox = wrapper.querySelector('input[type="checkbox"]');
  assert.equal(checkbox?.checked, true);
  md.destroy();
});

test('plain paragraph text is left alone', () => {
  const { clicked, wrapper, content, md } = mount('hello');
  assert.deepEqual(clicked, []);
  assert.equal(wrapper.dataset.blockType, 'paragraph');
  assert.equal(content.textContent, 'hello');
  md.destroy();
});
