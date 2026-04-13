import { useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';

export default function ClipboardEngine() {
  const pasteMarkdownTree = useTaskStore(state => state.pasteMarkdownTree);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.closest('.ProseMirror');
      if (isInput) return;

      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      // ★追加：React Flow のコピーデータ（JSON）だった場合は処理を中断する
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id) {
          return;
        }
      } catch (err) {
        // パースエラーになる場合は普通のテキストなので、そのまま進む
      }

      e.preventDefault();

      const state = useTaskStore.getState();
      let startX = 300;
      let startY = 300;

      if (state.selectedIds.length > 0) {
        const target = state.nodes.find(n => n.id === state.selectedIds[0]);
        if (target) {
          startX = target.position.x;
          startY = target.position.y + 60;
        }
      }

      pasteMarkdownTree(text, startX, startY);
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [pasteMarkdownTree]);

  return null;
}