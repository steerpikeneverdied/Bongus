// Dev-only. Marksman's toolbar (`.mk-bar`) ships with no flex-wrap / max-width, so on a narrow
// device it's one long unwrapped row that overflows the viewport — inside the device-preview
// bezel that means its right half (Text/Erase/Undo/.../Close) renders past the phone's screen
// edge and gets clipped clean off, invisible. Force it (and its popups) to wrap and cap their
// width to the viewport, mirroring the same fix sibling bishop games apply. Runs inside the game
// document itself (main.tsx, alongside `mountMarksman`), so `100vw` here is the device's own
// viewport width in both the preview iframe and on a real device — never the outer preview page.

const STYLE_ID = '__marksman-fit-viewport';

// Draggable/positioned popups whose inline left/top (barPos/editorPos state) has no clamp of its
// own — dragging the bar's grip (or the editor's header) past the left edge sends `left` negative,
// which the max-width fix above doesn't touch (that only bounds width, not position). Re-clamp the
// rendered position into the viewport on every style mutation React makes while dragging.
const POSITIONED_SELECTOR = '.mk-bar, .mk-editor, .mk-settings, .mk-voice, .mk-textin-wrap';

function clampIntoViewport(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - rect.width);
  const maxTop = Math.max(0, window.innerHeight - rect.height);
  const left = Math.min(Math.max(rect.left, 0), maxLeft);
  const top = Math.min(Math.max(rect.top, 0), maxTop);
  if (left !== rect.left) el.style.left = `${left}px`;
  if (top !== rect.top) el.style.top = `${top}px`;
}

export function mountMarksmanFitViewport(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .mk-bar { flex-wrap: wrap !important; }
    .mk-bar, .mk-editor, .mk-notes, .mk-settings, .mk-voice, .mk-textin-wrap {
      max-width: calc(100vw - 16px) !important;
      box-sizing: border-box;
    }
  `;
  document.head.appendChild(style);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      const el = m.target as HTMLElement;
      if (el.matches?.(POSITIONED_SELECTOR)) clampIntoViewport(el);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  });
}
