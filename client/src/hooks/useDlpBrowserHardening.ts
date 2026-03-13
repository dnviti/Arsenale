import { useEffect } from 'react';

/**
 * Blocks browser shortcuts used for data exfiltration:
 * DevTools (F12, Ctrl+Shift+I/J/C), View Source (Ctrl+U), Save (Ctrl+S), Print (Ctrl+P).
 * Also prevents drag-and-drop to external apps.
 *
 * Ctrl+Shift+C is carved out when an SSH terminal is focused, so the terminal's
 * own copy handler (which respects DLP disableCopy) can process it instead.
 */
export function useDlpBrowserHardening(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 — DevTools toggle
      if (e.key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const ctrlOrMeta = e.ctrlKey || e.metaKey;
      if (!ctrlOrMeta) return;

      // Ctrl/Cmd+Shift combos
      if (e.shiftKey) {
        // Ctrl+Shift+I — DevTools Inspector
        // Ctrl+Shift+J — DevTools Console
        if (e.key === 'I' || e.key === 'J') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        // Ctrl+Shift+C — Element picker (SSH carve-out)
        if (e.key === 'C') {
          const el = document.activeElement;
          if (el instanceof HTMLElement && el.closest('[data-viewer-type="ssh"]')) {
            return; // let SSH terminal handle it
          }
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      // Ctrl/Cmd-only combos (no shift, no alt)
      if (!e.shiftKey && !e.altKey) {
        // Ctrl+U — View Source
        // Ctrl+S — Save Page
        // Ctrl+P — Print
        if (e.key === 'u' || e.key === 's' || e.key === 'p') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('dragstart', handleDragStart, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('dragstart', handleDragStart, { capture: true });
    };
  }, []);
}
