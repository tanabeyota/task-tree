/**
 * SearchBar.tsx — useReactFlow 依存を除去
 * panToNode コールバックを受け取りカメラ移動を実現
 * ★ Hooks ルール完全遵守版
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTaskStore } from '../../store/useTaskStore';

interface Props {
  panToNode?: (worldX: number, worldY: number) => void;
  highlightNode?: (id: string | null) => void;
}

export default function SearchBar({ panToNode, highlightNode }: Props) {
  const isOpen = useTaskStore(s => s.isSearchOpen);
  const setIsOpen = useTaskStore(s => s.setIsSearchOpen);
  
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const nodes = useTaskStore(state => state.nodes);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setMatches([]);
      setCurrentIndex(-1);
      highlightNode?.(null);
    }
  }, [isOpen, highlightNode]);

  const focusMatch = useCallback((matchList: string[], index: number) => {
    setCurrentIndex(index);
    const id = matchList[index];
    if (!id) return;
    highlightNode?.(id);
    const node = useTaskStore.getState().nodes.find(n => n.id === id);
    if (node && panToNode) {
      const w = node.data.w ?? 120;
      const h = node.data.h ?? 44;
      panToNode(node.position.x + w / 2, node.position.y + h / 2);
    }
  }, [highlightNode, panToNode]);

  useEffect(() => {
    if (!query) {
      setMatches([]);
      setCurrentIndex(-1);
      highlightNode?.(null);
      return;
    }
    const q = query.toLowerCase();
    const newMatches: string[] = [];
    nodes.forEach(n => {
      if (n.data.isHidden) return;
      const text = n.data.html.replace(/<[^>]+>/g, '').toLowerCase();
      if (text.includes(q)) newMatches.push(n.id);
    });
    setMatches(newMatches);
    if (newMatches.length > 0) {
      focusMatch(newMatches, 0);
    } else {
      setCurrentIndex(-1);
      highlightNode?.(null);
    }
  }, [query, nodes, focusMatch, highlightNode]);

  const handleNext = useCallback(() => {
    if (matches.length === 0) return;
    const nextIdx = (currentIndex + 1) % matches.length;
    focusMatch(matches, nextIdx);
  }, [matches, currentIndex, focusMatch]);

  const handlePrev = useCallback(() => {
    if (matches.length === 0) return;
    const prevIdx = (currentIndex - 1 + matches.length) % matches.length;
    focusMatch(matches, prevIdx);
  }, [matches, currentIndex, focusMatch]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) handlePrev();
      else handleNext();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 1000,
      background: 'rgba(255,255,255,0.97)',
      border: '1px solid #e2e8f0',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
      borderRadius: 10,
      padding: '6px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      backdropFilter: 'blur(8px)',
      pointerEvents: 'auto',
    }}>
      <svg viewBox="0 0 24 24" width="15" height="15" stroke="#94a3b8" strokeWidth="2" fill="none">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        placeholder="ノードを検索… (Ctrl+F)"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleInputKeyDown}
        style={{
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 14,
          width: 180,
          color: '#1a1a2e',
        }}
      />
      <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 40, textAlign: 'center' }}>
        {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : '0/0'}
      </span>
      <button onClick={handlePrev} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13 }} title="前へ (Shift+Enter)">▲</button>
      <button onClick={handleNext} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 13 }} title="次へ (Enter)">▼</button>
      <div style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 4px' }} />
      <button
        onClick={() => { setIsOpen(false); setQuery(''); setMatches([]); setCurrentIndex(-1); highlightNode?.(null); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}
        title="閉じる (Esc)"
      >✖</button>
    </div>
  );
}