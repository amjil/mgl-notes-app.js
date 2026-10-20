/**
 * Interactive Force-Directed Knowledge Graph page (<canvas>).
 * Supports pan, zoom, node dragging, neighbor highlighting, and vertical-lr Mongolian labels.
 */
import { buildKnowledgeGraph, openOrCreateByTitle } from '../services/links.js';
import { on } from '../events.js';
import { navigate } from '../router.js';
import { t } from '../i18n.js';
import { h } from '../util.js';

export function mountGraph(container) {
  let includeTags = true;
  let includeOrphans = true;
  let alive = true;
  let rafId = 0;

  const tagBtn = h('button', {
    type: 'button',
    class: 'chip is-active',
    onclick: () => {
      includeTags = !includeTags;
      tagBtn.classList.toggle('is-active', includeTags);
      void reloadData();
    },
  }, `# ${t('tags')}`);

  const orphanBtn = h('button', {
    type: 'button',
    class: 'chip is-active',
    onclick: () => {
      includeOrphans = !includeOrphans;
      orphanBtn.classList.toggle('is-active', includeOrphans);
      void reloadData();
    },
  }, t('all'));

  const resetBtn = h('button', {
    type: 'button',
    class: 'btn btn--ghost',
    onclick: () => resetCamera(),
  }, '⌖');

  const head = h('header', { class: 'note-view__head', dataset: { mnScrollY: '' } },
    h('h1', { class: 'page-head__title' }, t('graph')),
    h('div', { class: 'page-head__group' }, tagBtn, orphanBtn),
    resetBtn);

  const canvas = h('canvas', { class: 'graph-canvas' });
  const emptyEl = h('p', { class: 'doc-list__empty graph-empty', hidden: true }, t('empty'));
  const stage = h('section', { class: 'page note-view__body graph-stage' }, canvas, emptyEl);

  container.replaceChildren(h('div', { class: 'note-view' }, head, stage));

  const ctx = canvas.getContext('2d');
  let width = 800;
  let height = 600;
  let dpr = window.devicePixelRatio || 1;

  // 物理模型与相机状态
  let nodes = [];
  let edges = [];
  let adj = new Map();
  let cam = { x: 0, y: 0, k: 1 };
  let alpha = 1;
  let hovered = null;
  let dragged = null;
  let panning = false;
  let panStart = { x: 0, y: 0 };
  let pointerMoved = false;

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = Math.max(300, rect.width);
    height = Math.max(300, rect.height);
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    alpha = Math.max(alpha, 0.25);
    scheduleTick();
  }

  function resetCamera() {
    cam = { x: width / 2, y: height / 2, k: 1 };
    alpha = Math.max(alpha, 0.35);
    scheduleTick();
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - cam.x) / cam.k,
      y: (sy - cam.y) / cam.k,
    };
  }

  function nodeRadius(n) {
    return Math.min(18, 5.5 + Math.sqrt(n.degree || 0) * 2.4);
  }

  function hitTest(sx, sy) {
    const p = screenToWorld(sx, sy);
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const r = nodeRadius(n) + 4 / cam.k;
      const dx = p.x - n.x;
      const dy = p.y - n.y;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }

  async function reloadData() {
    const prevPos = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const data = await buildKnowledgeGraph({ includeTags, includeOrphans });
    if (!alive) return;

    const count = data.nodes.length;
    emptyEl.hidden = count > 0;
    nodes = data.nodes.map((n, i) => {
      const old = prevPos.get(n.id);
      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const radius = 40 + Math.sqrt(i + 1) * 28;
      return {
        ...n,
        x: old ? old.x : Math.cos(angle) * radius,
        y: old ? old.y : Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
      };
    });

    const byId = new Map(nodes.map((n) => [n.id, n]));
    edges = data.edges
      .map((e) => ({ ...e, sourceNode: byId.get(e.source), targetNode: byId.get(e.target) }))
      .filter((e) => e.sourceNode && e.targetNode);

    adj = new Map();
    edges.forEach((e) => {
      if (!adj.has(e.sourceNode.id)) adj.set(e.sourceNode.id, new Set());
      if (!adj.has(e.targetNode.id)) adj.set(e.targetNode.id, new Set());
      adj.get(e.sourceNode.id).add(e.targetNode.id);
      adj.get(e.targetNode.id).add(e.sourceNode.id);
    });

    if (cam.x === 0 && cam.y === 0) resetCamera();
    alpha = 1;
    scheduleTick();
  }

  function stepPhysics() {
    if (alpha < 0.005 && !dragged) return false;
    const N = nodes.length;
    const repulsion = 950;
    const springLen = 85;
    const springK = 0.045;
    const centerGravity = 0.012;

    // 1. 库仑斥力 + 向心引力
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      a.vx -= a.x * centerGravity * alpha;
      a.vy -= a.y * centerGravity * alpha;
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          d2 = dx * dx + dy * dy;
        }
        if (d2 > 360000) continue;
        const f = (repulsion * alpha) / d2;
        const fx = dx * f;
        const fy = dy * f;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // 2. 胡克弹簧引力
    for (const e of edges) {
      const a = e.sourceNode;
      const b = e.targetNode;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetLen = e.kind === 'child' ? springLen * 0.75 : springLen;
      const f = (dist - targetLen) * springK * alpha;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // 3. 速度阻尼与位置更新
    for (const n of nodes) {
      if (n === dragged) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= 0.82;
      n.vy *= 0.82;
      n.x += n.vx;
      n.y += n.vy;
    }

    alpha *= 0.97;
    return true;
  }

  function draw() {
    const style = getComputedStyle(document.documentElement);
    const colAccent = style.getPropertyValue('--app-accent').trim() || '#2f7d5f';
    const colGold = style.getPropertyValue('--app-accent-2').trim() || '#8a6a2c';
    const colText = style.getPropertyValue('--app-text').trim() || '#1c221e';
    const colMuted = style.getPropertyValue('--app-muted').trim() || '#5f6a5c';
    const colLine = style.getPropertyValue('--app-line-strong').trim() || 'rgba(120,95,50,0.38)';
    const fontMongol = style.getPropertyValue('--app-font-mongol').trim() || 'serif';

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.k, cam.k);

    const focusNode = dragged || hovered;
    const neighborSet = focusNode ? (adj.get(focusNode.id) || new Set()) : null;

    // 1. 绘制连线
    for (const e of edges) {
      const isHi = focusNode
        && (e.sourceNode === focusNode || e.targetNode === focusNode);
      ctx.beginPath();
      if (e.kind === 'tag') ctx.setLineDash([4 / cam.k, 4 / cam.k]);
      else ctx.setLineDash([]);
      ctx.moveTo(e.sourceNode.x, e.sourceNode.y);
      ctx.lineTo(e.targetNode.x, e.targetNode.y);
      ctx.lineWidth = (isHi ? 2 : 1.1) / cam.k;
      ctx.strokeStyle = isHi ? colAccent : colLine;
      ctx.globalAlpha = focusNode ? (isHi ? 0.95 : 0.18) : 0.65;
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 2. 绘制节点与竖排蒙古文标题
    for (const n of nodes) {
      const r = nodeRadius(n);
      const isFocus = n === focusNode;
      const isNeighbor = neighborSet ? neighborSet.has(n.id) : false;
      const dimmed = focusNode && !isFocus && !isNeighbor;

      ctx.globalAlpha = dimmed ? 0.22 : 1;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

      if (n.kind === 'tag') {
        ctx.fillStyle = colGold;
      } else if (n.kind === 'daily') {
        ctx.fillStyle = '#3b82f6';
      } else if (n.kind === 'ghost') {
        ctx.fillStyle = 'transparent';
        ctx.strokeStyle = colMuted;
        ctx.lineWidth = 1.5 / cam.k;
        ctx.stroke();
      } else {
        ctx.fillStyle = colAccent;
      }
      if (n.kind !== 'ghost') ctx.fill();

      if (isFocus) {
        ctx.lineWidth = 2.5 / cam.k;
        ctx.strokeStyle = colText;
        ctx.stroke();
      }

      // 缩放足够大或悬停时，以竖排方向（顺时针旋转 90° 向下延伸）绘制传统蒙古文标签
      if (cam.k >= 0.55 || isFocus || isNeighbor) {
        const text = (n.label || t('untitled')).slice(0, 22);
        ctx.save();
        ctx.translate(n.x, n.y + r + 6 / cam.k);
        ctx.rotate(Math.PI / 2); // 竖排向下渲染蒙古文词条
        ctx.font = `${isFocus ? '600 ' : ''}14px ${fontMongol}`;
        ctx.fillStyle = isFocus ? colAccent : colText;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  function scheduleTick() {
    if (rafId || !alive) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (!alive) return;
      const moving = stepPhysics();
      draw();
      if (moving) scheduleTick();
    });
  }

  // -------------------------------------------------------------------------
  // 鼠标 / 触控交互：拖拽节点、平移画布、滚轮缩放、点击跳转
  // -------------------------------------------------------------------------

  const getLocalXY = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button !== 0) return;
    canvas.setPointerCapture?.(e.pointerId);
    const { x, y } = getLocalXY(e);
    pointerMoved = false;
    panStart = { x, y };
    const hit = hitTest(x, y);
    if (hit) {
      dragged = hit;
      alpha = Math.max(alpha, 0.3);
      scheduleTick();
    } else {
      panning = true;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const { x, y } = getLocalXY(e);
    if (Math.hypot(x - panStart.x, y - panStart.y) > 4) pointerMoved = true;

    if (dragged) {
      const p = screenToWorld(x, y);
      dragged.x = p.x;
      dragged.y = p.y;
      alpha = Math.max(alpha, 0.25);
      scheduleTick();
      return;
    }
    if (panning) {
      cam.x += x - panStart.x;
      cam.y += y - panStart.y;
      panStart = { x, y };
      scheduleTick();
      return;
    }
    const hit = hitTest(x, y);
    if (hit !== hovered) {
      hovered = hit;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      scheduleTick();
    }
  });

  const endPointer = () => {
    if (dragged && !pointerMoved) {
      const target = dragged;
      dragged = null;
      if (target.kind === 'tag') {
        navigate(`/tags/${encodeURIComponent(target.rawTag)}`);
      } else if (target.kind === 'daily') {
        navigate(`/today/${encodeURIComponent(target.label)}`);
      } else if (target.kind === 'doc' && target.docId) {
        navigate(`/doc/${target.docId}`);
      } else if (target.kind === 'ghost' && target.label) {
        void openOrCreateByTitle(target.label);
      }
      return;
    }
    dragged = null;
    panning = false;
  };

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { x, y } = getLocalXY(e);
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextK = Math.min(3.5, Math.max(0.2, cam.k * factor));
    cam.x = x - ((x - cam.x) / cam.k) * nextK;
    cam.y = y - ((y - cam.y) / cam.k) * nextK;
    cam.k = nextK;
    scheduleTick();
  }, { passive: false });

  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  const offDocs = on('documents-changed', () => { void reloadData(); });
  const offBlocks = on('blocks-changed', () => { void reloadData(); });

  resize();
  resetCamera();
  void reloadData();

  return {
    destroy() {
      alive = false;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      offDocs();
      offBlocks();
    },
  };
}
