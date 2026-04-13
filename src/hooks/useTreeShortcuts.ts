import { useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';

export function useTreeShortcuts(startEditing?: (id: string) => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const state = useTaskStore.getState();

      // Guard: Skip if deeply editing text or input field is focused (like SearchBar)
      if (state.activeEditor) return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement) {
        if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
          // Exception: allow Escape and Ctrl+F to close/toggle the search bar even when focused on an input
          const isToggleSearch = cmdOrCtrl && e.key.toLowerCase() === 'f';
          if (e.key !== 'Escape' && !isToggleSearch) return;
        }
        if (activeElement.isContentEditable || activeElement.closest('.tiptap')) {
          return;
        }
      }


      // 1. Esc: close search, deselect nodes
      if (e.key === 'Escape') {
        if (state.isSearchOpen) {
          state.setIsSearchOpen(false);
          // if focus was in input, blurring is handled inherently or the user can just click canvas
          if (activeElement instanceof HTMLElement) activeElement.blur();
        } else if (state.selectedIds.length > 0) {
          state.setSelection([]);
        }
        return;
      }

      // 2. Ctrl/Cmd + Z: undo
      if (cmdOrCtrl && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        (useTaskStore.temporal.getState() as any).undo?.();
        return;
      }

      // 3. Ctrl/Cmd + Shift + Z / Ctrl+Y: redo
      if ((cmdOrCtrl && e.shiftKey && e.key.toLowerCase() === 'z') || (cmdOrCtrl && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        (useTaskStore.temporal.getState() as any).redo?.();
        return;
      }

      // 4. Ctrl/Cmd + F: Toggle search UI
      if (cmdOrCtrl && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        state.setIsSearchOpen(!state.isSearchOpen);
        return;
      }

      // -- Require selected nodes for the following shortcuts --
      if (state.selectedIds.length === 0) return;

      // 5. Enter: Edit selected node (single selection)
      if (e.key === 'Enter' && state.selectedIds.length === 1) {
        e.preventDefault();
        startEditing?.(state.selectedIds[0]);
        return;
      }

      // 6. Delete/Backspace: Batch Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        
        // Iteratively use the safe, cascaded deleteNode method instead of manual array splicing
        const idsToDelete = [...state.selectedIds];
        idsToDelete.forEach(id => {
          // ensure node still exists (wasn't already cascade deleted as a child of previous selection)
          if (useTaskStore.getState().nodes.some(n => n.id === id)) {
            useTaskStore.getState().deleteNode(id);
          }
        });

        useTaskStore.getState().setSelection([]);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [startEditing]);
}
