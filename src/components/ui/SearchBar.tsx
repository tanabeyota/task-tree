import React, { useState, useEffect, useRef } from 'react';
import { useReactFlow } from 'reactflow';
import { useTaskStore } from '../../store/useTaskStore';

export default function SearchBar() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const nodes = useTaskStore(state => state.nodes);
  const { setCenter, getNode } = useReactFlow();

  // Ctrl+F と Esc キーの監視
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50); // 開いた瞬間にフォーカス
      }
      if (e.key === 'Escape' && isOpen) {
        closeSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // 検索終了時にハイライトを消す
  const closeSearch = () => {
    setIsOpen(false);
    setQuery('');
    clearHighlights();
  };

  const clearHighlights = () => {
    document.querySelectorAll('.task-node-wrapper').forEach(el => {
      el.classList.remove('search-match', 'search-focus');
    });
  };

  // 文字が入力されるたびに検索を実行
  useEffect(() => {
    clearHighlights();
    if (!query) {
      setMatches([]);
      setCurrentIndex(-1);
      return;
    }

    const q = query.toLowerCase();
    const newMatches: string[] = [];

    nodes.forEach(n => {
      if (n.data.isHidden) return;
      // TiptapのHTMLタグを除去して純粋なテキストだけで検索
      const textContent = n.data.html.replace(/<[^>]+>/g, '').toLowerCase();
      if (textContent.includes(q)) {
        newMatches.push(n.id);
        // マッチしたノードにハイライトのCSSクラスを付与
        const el = document.querySelector(`[data-id="${n.id}"] .task-node-wrapper`);
        if (el) el.classList.add('search-match');
      }
    });

    setMatches(newMatches);
    if (newMatches.length > 0) {
      focusMatch(newMatches, 0); // 最初のヒットにカメラを向ける
    } else {
      setCurrentIndex(-1);
    }
  }, [query, nodes]);

  // 特定のノードにカメラを移動させる関数
  const focusMatch = (matchList: string[], index: number) => {
    setCurrentIndex(index);
    const id = matchList[index];
    
    // 他のフォーカスを外して、対象だけ強く光らせる
    document.querySelectorAll('.task-node-wrapper').forEach(el => el.classList.remove('search-focus'));
    const el = document.querySelector(`[data-id="${id}"] .task-node-wrapper`);
    if (el) el.classList.add('search-focus');

    // React Flowの機能でカメラを移動
    const node = getNode(id);
    if (node) {
      const width = el?.clientWidth || 100;
      const height = el?.clientHeight || 40;
      setCenter(node.position.x + width / 2, node.position.y + height / 2, { zoom: 1.2, duration: 500 });
    }
  };

  // 次へ / 前へ ボタンの処理
  const handleNext = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentIndex + 1) % matches.length;
    focusMatch(matches, nextIdx);
  };

  const handlePrev = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentIndex - 1 + matches.length) % matches.length;
    focusMatch(matches, prevIdx);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) handlePrev();
      else handleNext();
    }
  };

  if (!isOpen) return null;

  // 旧プロトタイプの美しい検索バーUIを復元
  return (
    <div style={{
      position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, background: 'rgba(255, 255, 255, 0.95)', border: '1px solid #e2e8f0',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)', borderRadius: '8px', padding: '6px 12px',
      display: 'flex', alignItems: 'center', gap: '8px', backdropFilter: 'blur(8px)'
    }}>
      <svg viewBox="0 0 24 24" width="16" height="16" stroke="gray" strokeWidth="2" fill="none">
        <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input 
        ref={inputRef} type="text" placeholder="ノードを検索..."
        value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleInputKeyDown}
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '14px', width: '180px', color: '#1a1a1a' }}
      />
      <span style={{ color: 'gray', fontSize: '12px', minWidth: '35px', textAlign: 'center' }}>
        {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : '0/0'}
      </span>
      <button onClick={handlePrev} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'gray' }} title="前へ (Shift+Enter)">▲</button>
      <button onClick={handleNext} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'gray' }} title="次へ (Enter)">▼</button>
      <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 6px' }} />
      <button onClick={closeSearch} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'gray' }} title="閉じる (Esc)">✖</button>
    </div>
  );
}