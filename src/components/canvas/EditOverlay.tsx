import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { useTaskStore } from '../../store/useTaskStore';
import { lockNode, unlockNode, subscribeToLocks, subscribeToConnection } from '../../firebase/presence';
import { patchFirestoreNode } from '../../firebase/api';
import { auth } from '../../firebase/config';

interface Props {
  nodeId: string;
  screenRect: DOMRect;
  camera: { zoom: number };
  onStopEditing: () => void;
  onStartEditing: (id: string) => void;
}

const STROKE_COLORS: Record<string, string> = {
  green: '#4ade80',
  blue: '#38bdf8',
  red: '#f472b6',
  purple: '#a78bfa',
  yellow: '#fbbf24',
};

const TEXT_COLORS: Record<string, string> = {
  green: '#14532d',
  blue: '#0c4a6e',
  red: '#831843',
  purple: '#3b0764',
  yellow: '#78350f',
};

export function EditOverlay({ nodeId, screenRect, camera, onStopEditing, onStartEditing }: Props) {
  const nodes = useTaskStore(s => s.nodes);
  const updateNodeData = useTaskStore(s => s.updateNodeData);
  const setActiveEditor = useTaskStore(s => s.setActiveEditor);
  const setIsSaving = useTaskStore(s => s.setIsSaving);
  const saveTimeoutRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{ id: string, html: string, ast: any } | null>(null);
  const lastNodeIdRef = useRef(nodeId);
  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);

  const node = nodes.find(n => n.id === nodeId);
  const initialHtml = node?.data.html ?? '';
  const colorKey = node?.data.color ?? 'green';
  const isLockedByOther = lockedBy !== null && lockedBy !== auth.currentUser?.uid;

  // Custom debounce with flush support
  const flushSave = React.useCallback(() => {
    if (saveTimeoutRef.current !== null) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (pendingSaveRef.current) {
      const { id, html, ast } = pendingSaveRef.current;
      patchFirestoreNode(id, { html, ast })
        .catch(console.error)
        .finally(() => setIsSaving(false));
      pendingSaveRef.current = null;
    }
  }, [setIsSaving]);

  const debouncedSave = React.useCallback((id: string, html: string, ast: any) => {
    pendingSaveRef.current = { id, html, ast };
    setIsSaving(true);
    if (saveTimeoutRef.current !== null) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      flushSave();
    }, 1000);
  }, [setIsSaving, flushSave]);

  useEffect(() => {
    const handleBeforeUnload = () => flushSave();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [flushSave]);

  useEffect(() => {
    const unsub1 = subscribeToLocks(nodeId, (uid) => setLockedBy(uid));
    const unsub2 = subscribeToConnection((status) => setIsOnline(status));
    return () => { unsub1(); unsub2(); };
  }, [nodeId]);

  const editor = useEditor({
    extensions: [StarterKit, Highlight],
    content: initialHtml,
    editable: !isLockedByOther,
    autofocus: 'end',
    editorProps: {
      handleKeyDown: (view, event) => {
        if (!node || event.repeat) return false;
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = isMac ? event.metaKey : event.ctrlKey;

        const commitAndMove = (targetId: string) => {
          // editor might not be strictly ready in the cycle, but it is available.
          const e_html = editor ? editor.getHTML() : '';
          const e_ast = editor ? editor.getJSON() : {};
          useTaskStore.getState().updateNodeData(nodeId, { html: e_html, ast: e_ast }, true);
          debouncedSave(nodeId, e_html, e_ast);
          flushSave();
          flushSync(() => {
            onStartEditing(targetId);
          });
          return true;
        };

        // 1. Tab (Child / New Child)
        if (event.key === 'Tab' && !event.shiftKey) {
          if (editor?.isActive('bulletList') || editor?.isActive('listItem')) return false;
          event.preventDefault();

          if (node.data.isCollapsed) {
            useTaskStore.getState().toggleCollapse(nodeId);
          }
          
          if (node.data.childrenIds.length > 0) {
            return commitAndMove(node.data.childrenIds[0]);
          } else {
            const e_html = editor ? editor.getHTML() : '';
            const e_ast = editor ? editor.getJSON() : {};
            useTaskStore.getState().updateNodeData(nodeId, { html: e_html, ast: e_ast }, true);
            debouncedSave(nodeId, e_html, e_ast);
            flushSave();
            
            const newId = useTaskStore.getState().addNode(node.position.x, node.position.y, nodeId);
            flushSync(() => {
              onStartEditing(newId);
            });
            return true;
          }
        }

        // 2. Shift + Tab (Parent)
        if (event.key === 'Tab' && event.shiftKey) {
          if (editor?.isActive('bulletList') || editor?.isActive('listItem')) return false;
          event.preventDefault();

          if (node.data.parentId) {
            return commitAndMove(node.data.parentId);
          }
          return true;
        }

        // 3. Cmd+Enter (Next / New Sibling)
        if (cmdOrCtrl && !event.shiftKey && event.key === 'Enter') {
          event.preventDefault();
          const state = useTaskStore.getState();
          const pId = node.data.parentId;
          let siblings = pId 
            ? (state.nodes.find(n => n.id === pId)?.data.childrenIds ?? []) 
            : state.nodes.filter(n => !n.data.parentId).map(n => n.id);
          
          const idx = siblings.indexOf(nodeId);
          if (idx >= 0 && idx < siblings.length - 1) {
            return commitAndMove(siblings[idx + 1]);
          } else {
            const e_html = editor ? editor.getHTML() : '';
            const e_ast = editor ? editor.getJSON() : {};
            state.updateNodeData(nodeId, { html: e_html, ast: e_ast }, true);
            debouncedSave(nodeId, e_html, e_ast);
            flushSave();

            const newId = state.addNode(node.position.x, !pId ? node.position.y + (node.data.h ?? 44) + 40 : node.position.y, pId);
            flushSync(() => {
              onStartEditing(newId);
            });
            return true;
          }
        }

        // 4. Cmd+Shift+Enter (Prev Sibling)
        if (cmdOrCtrl && event.shiftKey && event.key === 'Enter') {
          event.preventDefault();
          const state = useTaskStore.getState();
          const pId = node.data.parentId;
          let siblings = pId 
            ? (state.nodes.find(n => n.id === pId)?.data.childrenIds ?? []) 
            : state.nodes.filter(n => !n.data.parentId).map(n => n.id);
          
          const idx = siblings.indexOf(nodeId);
          if (idx > 0) {
            return commitAndMove(siblings[idx - 1]);
          }
          return true;
        }

        return false;
      }
    },
    onFocus: () => {
      lockNode(lastNodeIdRef.current);
    },
    onUpdate: ({ editor }) => {
      const currentId = lastNodeIdRef.current;
      const newHtml = editor.getHTML();
      const newAst = editor.getJSON();
      updateNodeData(currentId, { html: newHtml, ast: newAst }, true); 
      debouncedSave(currentId, newHtml, newAst);
    },
    onBlur: () => {
      flushSave(); 
      unlockNode(lastNodeIdRef.current);
      setActiveEditor(null);
      onStopEditing();
    },
  });

  // Force strict focus on initial mount
  useEffect(() => {
    if (editor) {
      setTimeout(() => {
        if (!editor.isDestroyed) editor.commands.focus('end');
      }, 10);
    }
  }, [editor]);

  // Instantly swap content if nodeId changes without unmounting (preserves browser keyboard focus pipeline)
  useEffect(() => {
    if (editor && nodeId !== lastNodeIdRef.current) {
      if (node) {
        unlockNode(lastNodeIdRef.current);
        lockNode(nodeId);
        lastNodeIdRef.current = nodeId;
        editor.commands.setContent(node.data.html || '');
      }
      setTimeout(() => {
        if (!editor.isDestroyed) editor.commands.focus('end');
      }, 0);
    }
  }, [nodeId, editor, node]);

  useEffect(() => {
    if (editor) setActiveEditor(editor);
    return () => { setActiveEditor(null); };
  }, [editor, setActiveEditor]);

  if (!node) return null;

  const w = node?.data.w ?? 120;
  const h = node?.data.h ?? 44;
  const _strokeColor = STROKE_COLORS[colorKey] ?? STROKE_COLORS.green;
  const scale = camera.zoom;

  return (
    <div
      style={{
        position: 'absolute',
        left: screenRect.x,
        top: screenRect.y,
        width: w,
        height: h,
        zIndex: 50,
        pointerEvents: 'auto',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 16px',
        boxSizing: 'border-box',
        outline: 'none',
        background: 'transparent',
      }}>
        {isLockedByOther && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(255,255,255,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: '#ef4444', zIndex: 10,
          }}>
            🔒 他のユーザーが編集中
          </div>
        )}
        <div style={{
          width: '100%',
          outline: 'none',
          fontSize: 15,
          lineHeight: '20px',
          fontFamily: '"Inter", sans-serif',
          fontWeight: 500,
          color: TEXT_COLORS[colorKey] ?? TEXT_COLORS.green,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        }}>
          <style>{`.tiptap p { margin: 0; padding: 0; } .tiptap ul { margin: 0; padding-left: 24px; list-style: none; } .tiptap li { position: relative; } .tiptap li::before { content: ""; position: absolute; left: -14px; top: 7px; width: 6px; height: 6px; background-color: currentColor; border-radius: 50%; } .tiptap mark { background-color: rgba(255, 214, 0, 0.5); color: inherit; } .tiptap:focus, .ProseMirror:focus, .ProseMirror:focus-visible { outline: none !important; border: none !important; box-shadow: none !important; }`}</style>
          <EditorContent editor={editor} style={{ outline: 'none' }} />
        </div>
      </div>
      
      {(!isOnline || isLockedByOther) && (
        <div style={{
          position: 'absolute',
          top: -28, right: 0,
          background: 'rgba(239,68,68,0.9)',
          color: 'white',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
        }}>
          {!isOnline ? '🔴 Offline' : '🔒 他のユーザーが編集中'}
        </div>
      )}
    </div>
  );
}
