/**
 * Live Markdown block-prefix shortcuts inside paragraph blocks:
 *   "# " -> heading-1, "## " -> heading-2, "### " -> heading-3
 *   "- " / "* " / "• " -> list-item
 *   "1. " -> ordered-list-item
 *   "[] " / "[ ] " -> task (unchecked), "[x] " -> task (checked)
 *   "> " -> blockquote
 *   "---" -> divider
 */
import { editablePlainText } from './wiki.js';

const PREFIX_RULES = [
  { re: /^###\s$/, type: 'heading-3' },
  { re: /^##\s$/, type: 'heading-2' },
  { re: /^#\s$/, type: 'heading-1' },
  { re: /^(?:[-*•])\s$/, type: 'list-item' },
  { re: /^1\.\s$/, type: 'ordered-list-item' },
  { re: /^\[\s?\]\s$/, type: 'task', checked: false },
  { re: /^\[x\]\s$/i, type: 'task', checked: true },
  { re: /^>\s$/, type: 'blockquote' },
  { re: /^---$/, type: 'divider' },
];

export function attachMarkdownShortcuts(host, editor) {
  const onInput = (e) => {
    if (e.isComposing) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const node = sel.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const content = el?.closest?.('.block-content[contenteditable="true"]');
    if (!content || !host.contains(content)) return;

    const wrapper = content.closest('.block-wrapper');
    if (!wrapper || wrapper.dataset.blockType !== 'paragraph') return;

    const text = editablePlainText(content);
    const rule = PREFIX_RULES.find((r) => r.re.test(text));
    if (!rule) return;

    // 清除触发前缀文本，并调用工具栏对应按钮或 editor API 切换块类型
    content.textContent = '';
    const btn = host.querySelector(`.toolbar button[data-block="${rule.type}"]`);
    if (btn) {
      btn.click();
      if (rule.type === 'task' && rule.checked) {
        const checkbox = wrapper.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) checkbox.click();
      }
    } else if (typeof editor.setBlockType === 'function') {
      editor.setBlockType(rule.type);
    }
    content.dispatchEvent(new Event('input', { bubbles: true }));
  };

  host.addEventListener('input', onInput);
  return {
    destroy() {
      host.removeEventListener('input', onInput);
    },
  };
}
