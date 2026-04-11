import { useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';

export default function ClipboardEngine() {
  const addNode = useTaskStore((state) => state.addNode);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // 文字入力中はブラウザ標準のコピペを優先するため何もしない
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable') === 'true';
      if (isInput) return;

      // ==========================================
      // [Ctrl + C] ツリーをMarkdownリストとしてコピー
      // ==========================================
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        const state = useTaskStore.getState();
        if (state.selectedIds.length === 0) return;

        const targetId = state.selectedIds[0];

        // 再帰的に子ノードを辿って字下げ（インデント）を生成する関数
        const generateMarkdown = (id: string, depth: number): string => {
          const node = state.nodes.find(n => n.id === id);
          if (!node) return '';
          // HTMLタグ（太字など）を削ってプレーンテキストにする
          const plainText = node.data.html.replace(/<[^>]+>/g, '').trim();
          let md = '  '.repeat(depth) + '- ' + (plainText || '無題のタスク') + '\n';
          
          node.data.childrenIds.forEach(childId => {
            md += generateMarkdown(childId, depth + 1);
          });
          return md;
        };

        const markdownText = generateMarkdown(targetId, 0);
        await navigator.clipboard.writeText(markdownText);
        
        // コピー成功の視覚フィードバック（ポンッと少し跳ねる）
        const el = document.querySelector(`[data-id="${targetId}"]`);
        if (el) el.animate([ { transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' } ], { duration: 200 });
      }

      // ==========================================
      // [Ctrl + V] Markdownリストを読み取ってツリーを自動生成
      // ==========================================
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        try {
          const text = await navigator.clipboard.readText();
          if (!text) return;

          const state = useTaskStore.getState();
          const parentId = state.selectedIds.length > 0 ? state.selectedIds[0] : null;
          
          let startX = 250; let startY = 250;
          if (parentId) {
            const pNode = state.nodes.find(n => n.id === parentId);
            if (pNode) {
              startX = pNode.position.x + 200;
              startY = pNode.position.y + (pNode.data.childrenIds.length * 80);
            }
          }

          const lines = text.split('\n').filter(l => l.trim().length > 0);
          
          if (lines.length > 200) {
            alert('エラー: 一度のペーストでの生成上限は200ノードまでです。データの損傷を防ぐため処理を中断しました。');
            return;
          }
          
          // 階層構造（親子関係）を記憶しながら一気にノードを追加していく
          const idStack = [{ depth: -1, id: parentId }];
          
          lines.forEach((line, index) => {
            // 先頭の空白文字を数えて、階層の深さを測る
            const indentMatch = line.match(/^(\s*)/);
            const spaces = indentMatch ? indentMatch[1].replace(/\t/g, '  ').length : 0;
            const depth = Math.floor(spaces / 2);
            
            const cleanText = line.replace(/^[\s\-*•]+/, '').trim();
            
            // 現在の深さより浅い（または同じ）親をスタックから捨てる
            while (idStack.length > 1 && idStack[idStack.length - 1].depth >= depth) {
              idStack.pop();
            }
            const currentParent = idStack[idStack.length - 1].id;
            
            // 新しいノードを生成し、スタックに積む
            const newId = addNode(startX + (depth * 50), startY + (index * 60), currentParent, cleanText);
            idStack.push({ depth, id: newId });
          });

        } catch (err) {
          console.error('クリップボードの読み取りに失敗しました', err);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addNode]);

  return null;
}