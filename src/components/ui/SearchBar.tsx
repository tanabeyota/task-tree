import React, { useState, useEffect, useRef, useDeferredValue } from 'react';
import { useReactFlow } from 'reactflow';
import { useTaskStore } from '../../store/useTaskStore';

export default function SearchBar() {
   const [open, setOpen] = useState(false);
   const [query, setQuery] = useState('');
   const deferredQuery = useDeferredValue(query);
   const [matches, setMatches] = useState<string[]>([]);
   const [currentIndex, setCurrentIndex] = useState(0);
   const inputRef = useRef<HTMLInputElement>(null);
   const { setCenter, getNode } = useReactFlow();
   const { nodes, setSelection } = useTaskStore();

   useEffect(() => {
      const down = (e: KeyboardEvent) => {
         if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 50);
         } else if (e.key === 'Escape' && open) {
            setOpen(false);
            setQuery('');
         }
      };
      window.addEventListener('keydown', down);
      return () => window.removeEventListener('keydown', down);
   }, [open]);

   useEffect(() => {
     if (!deferredQuery) {
         setMatches([]);
         return;
     }
     const q = deferredQuery.toLowerCase();
     const hits = nodes.filter(n => n.data.html.toLowerCase().includes(q)).map(n => n.id);
     setMatches(hits);
     setCurrentIndex(0);
   }, [deferredQuery, nodes]);

   useEffect(() => {
      if (matches.length > 0 && open) {
         const tId = matches[currentIndex];
         const n = getNode(tId);
         if (n) {
             setCenter(n.position.x + 100, n.position.y, { duration: 400, zoom: 1 });
             setSelection([tId]);
         }
      }
   }, [currentIndex, matches, open, getNode, setCenter, setSelection]);

   const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          if (matches.length === 0) return;
          if (e.shiftKey) {
             setCurrentIndex(c => (c - 1 < 0 ? matches.length - 1 : c - 1));
          } else {
             setCurrentIndex(c => (c + 1) % matches.length);
          }
      }
   };

   if (!open) return null;

   return (
      <div style={{
         position: 'absolute', top: 20, right: 20, zIndex: 1000,
         background: 'var(--bg-color)', padding: 12, borderRadius: 8,
         boxShadow: '0 4px 12px rgba(0,0,0,0.2)', border: '1px solid var(--line-default)',
         display: 'flex', gap: 8, alignItems: 'center'
      }}>
         <input 
           ref={inputRef}
           value={query}
           onChange={e => setQuery(e.target.value)}
           onKeyDown={handleKeyDown}
           placeholder="Search nodes (Ctrl+F)..."
           style={{
              background: 'var(--input-bg)', color: 'var(--text-main)',
              border: 'none', padding: '6px 12px', borderRadius: 4, outline: 'none'
           }}
         />
         <div style={{ fontSize: 13, color: 'var(--text-placeholder)' }}>
            {matches.length > 0 ? `${currentIndex + 1} / ${matches.length}` : '0 results'}
         </div>
      </div>
   );
}
