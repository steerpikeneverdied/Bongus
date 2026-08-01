// Dev-only. Relocates the Marksman toggle out of the device-preview iframe's phone bezel into a
// small "MARKSMAN · OUT OF FRAME" column pinned to the top-right of the outer preview page —
// same treatment sibling bishop games give their dev-tool FABs so they aren't clipped by the
// simulated phone screen.
//
// Marksman mounts INSIDE the iframe (main.tsx, window.self !== window.top), so its `.mk-fab`
// toggle is position:fixed to the PHONE corner. We can't adoptNode the real button out of the
// iframe: React attaches its click handling at the root container within THAT document, so a
// node moved into the outer document stops receiving events. Instead: hide the real fab in place
// and mount a PROXY button in the outer page that reaches into the iframe and calls .click() on
// the (hidden) real fab — the click still dispatches inside the iframe's own document, so React's
// delegated handler fires normally.
//
// Called only from the top-level device-preview host (see main.tsx); never runs inside the game.

const FAB_SELECTOR = '.mk-fab';
// The fab UNMOUNTS while the toolbar is open (Marksman.tsx renders one or the other), so a second
// click on our proxy has nothing to re-click — fall back to the toolbar's own Close button so the
// proxy toggles the overlay open AND closed, matching the in-frame `.mk-fab` behavior.
const CLOSE_SELECTOR = '.mk-bar button[title^="Close"]';
const POLL_MS = 500;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles?: Partial<CSSStyleDeclaration>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (styles) Object.assign(node.style, styles);
  return node;
}

export function mountMarksmanOutOfFrame(): void {
  let col: HTMLDivElement | null = null;
  let btn: HTMLButtonElement | null = null;

  function findIframe(): HTMLIFrameElement | null {
    return document.querySelector('#device-preview-root iframe');
  }

  function findInFrame<T extends Element>(selector: string): T | null {
    try {
      return findIframe()?.contentDocument?.querySelector<T>(selector) ?? null;
    } catch {
      return null; // cross-origin guard — shouldn't happen for a same-origin preview
    }
  }

  function ensureColumn(): HTMLDivElement {
    if (col && document.body.contains(col)) return col;
    col = el('div', {
      position: 'fixed', top: '12px', right: '12px', width: '190px',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px',
      padding: '10px', boxSizing: 'border-box',
      background: 'rgba(10,10,18,0.92)', border: '1px solid #2d2d4a', borderRadius: '8px',
      zIndex: '2147483647', fontFamily: 'system-ui, sans-serif',
    });
    const label = el('div', { color: '#888aaa', fontSize: '10px', fontWeight: '700', letterSpacing: '1px' });
    label.textContent = 'MARKSMAN · OUT OF FRAME';
    col.appendChild(label);
    document.body.appendChild(col);
    return col;
  }

  function ensureButton(): void {
    const column = ensureColumn();
    if (btn && column.contains(btn)) return;
    btn = el('button', {
      display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
      padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
      border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(18,18,20,0.9)',
      color: '#00e5ff', font: '13px ui-monospace, Menlo, monospace',
    });
    btn.title = 'Toggle Marksman (reaches into the framed game)';
    const glyph = el('span', { fontSize: '16px', lineHeight: '1' });
    glyph.textContent = '◎'; // ◎
    const label = el('span');
    label.textContent = 'Markup';
    btn.append(glyph, label);
    btn.addEventListener('click', () => {
      const fab = findInFrame<HTMLElement>(FAB_SELECTOR);
      if (fab) { fab.click(); return; }
      const close = findInFrame<HTMLElement>(CLOSE_SELECTOR);
      if (close) { close.click(); return; }
      btn?.animate?.([{ opacity: 1 }, { opacity: 0.4 }, { opacity: 1 }], { duration: 250 });
    });
    column.appendChild(btn);
  }

  // Poll (rather than a one-shot mount) because the iframe reloads across device-preview
  // interactions and the real fab may not exist yet on the very first tick.
  ensureButton();
  window.setInterval(() => {
    ensureButton();
    const fab = findInFrame<HTMLElement>(FAB_SELECTOR);
    if (fab) fab.style.setProperty('display', 'none', 'important');
  }, POLL_MS);
}
