import React, { useRef, useState, useEffect } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow'; // ★修正: type を明記して分割しました！
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useTaskStore } from '../../store/useTaskStore';
import { lockNode, unlockNode, subscribeToLocks } from '../../firebase/presence';
import { updateFirestoreNode } from '../../firebase/api';
import { auth } from '../../firebase/config';
import type { TaskNodeData } from '../../types';
import './TaskNode.css';

export default function TaskNode({ id, data, selected }: NodeProps<TaskNodeData>) {
  const { html, color, manualMaxWidth, isCollapsed, childrenIds, parentId } = data;
  const updateNodeData = useTaskStore((state) => state.updateNodeData);
  const addNode = useTaskStore((state) => state.addNode);
  const moveNode = useTaskStore((state) => state.moveNode);
  const setArrowTarget = useTaskStore((state) => state.setArrowTarget);
  const toggleCollapse = useTaskStore((state) => (state as any).toggleCollapse); 
  const { getNode } = useReactFlow();

  const nodeInputRef = useRef<HTMLDivElement>(null);
  const setActiveEditor = useTaskStore((state) => state.setActiveEditor);

  const [isEditing, setIsEditing] = useState(false);

  const [lockedBy, setLockedBy] = useState<string | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToLocks(id, (uid) => setLockedBy(uid));
    return () => unsubscribe();
  }, [id]);

  const isLockedByOther = lockedBy !== null && lockedBy !== auth.currentUser?.uid;

  // 1. Tiptapエディタの設定
  const editor = useEditor({
    extensions: [StarterKit],
    content: html,
    editable: !isLockedByOther, 
    onBlur: ({ editor }) => {
      unlockNode(id);
      setTimeout(() => {
        setIsEditing(false);
        const newHtml = editor.getHTML();
        updateNodeData(id, { html: newHtml });
        
        // デバウンス Firestore への保存処理
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          updateFirestoreNode(id, { html: newHtml });
        }, 2000); // 入力停止後 2秒でFirestoreに書き込み

        if (useTaskStore.getState().activeEditor === editor) {
           setActiveEditor(null);
        }
      }, 0);
    },
    onFocus: ({ editor }) => {
       lockNode(id);
       setIsEditing(true);
       setActiveEditor(editor);
    }
  });

  useEffect(() => {
    if (editor && editor.isEditable === isLockedByOther) {
      editor.setEditable(!isLockedByOther);
    }
  }, [isLockedByOther, editor]);

  useEffect(() => {
    if (editor && !isEditing && html !== editor.getHTML()) {
       editor.commands.setContent(html);
    }
  }, [html, editor, isEditing]);

  // 2. クリックイベント（1クリック即編集の完全再現）
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLockedByOther) return; // ロックされている時は無視
    setArrowTarget(id);
    setIsEditing(true);

    // 余白をクリックした場合、強制的に末尾へフォーカス
    if (!(e.target as HTMLElement).closest('.node-input')) {
      setTimeout(() => editor?.commands.focus('end'), 10);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (parentId) {
          const parentNode = getNode(parentId);
          if (parentNode?.data.parentId) moveNode(id, parentNode.data.parentId, 'child');
          else {
             updateNodeData(id, { parentId: null });
             moveNode(id, parentId, 'after');
          }
        }
      } else {
        const siblings = parentId ? getNode(parentId)?.data.childrenIds : useTaskStore.getState().nodes.filter(n => n.data.parentId === null).map(n => n.id);
        if (siblings) {
           const myIdx = siblings.indexOf(id);
           if (myIdx > 0) moveNode(id, siblings[myIdx - 1], 'child');
        }
      }
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const currentPos = getNode(id)?.position;
      const nx = currentPos ? currentPos.x : 100;
      const ny = currentPos ? currentPos.y + 80 : 100;
      const newId = addNode(nx, ny, parentId, '');
      if (e.shiftKey) moveNode(newId, id, 'before');
      else moveNode(newId, id, 'after');
      setArrowTarget(newId);
    }
  };

  const handleResizeMouseStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startW = nodeInputRef.current?.offsetWidth || 60;
    const move = (me: MouseEvent) => {
        const dx = me.clientX - startX;
        let newW = startW + dx;
        if (newW < 60) newW = 60;
        updateNodeData(id, { manualMaxWidth: newW });
    };
    const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // 右側の＋ボタン（子を追加）
  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentPos = getNode(id)?.position;
    const nx = currentPos ? currentPos.x + 80 : 100;
    const ny = currentPos ? currentPos.y : 100;
    addNode(nx, ny, id);
  };

  // 左側の＋ボタン（親を追加）
  const handleAddParent = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentPos = getNode(id)?.position;
    const nx = currentPos ? currentPos.x - 150 : 100;
    const newId = addNode(nx, currentPos ? currentPos.y : 100, null);
    moveNode(id, newId, 'child');
  };

  // 折りたたみ（－ボタン）
  const handleCollapse = (e: React.MouseEvent) => {
     e.stopPropagation();
     toggleCollapse(id);
  };

  return (
    <div 
      className={`task-node-wrapper color-${color} ${selected ? 'selected' : ''} ${isCollapsed ? 'collapsed' : ''}`}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      
      <div className="task-node-content">
        <div ref={nodeInputRef} className="node-input nodrag" onKeyDownCapture={handleKeyDown}>
           <EditorContent editor={editor} style={{ maxWidth: manualMaxWidth ? `${manualMaxWidth}px` : '20em', width: manualMaxWidth ? `${manualMaxWidth}px` : 'max-content' }} />
           {isLockedByOther && <div className="lock-indicator" style={{ position: 'absolute', top: -20, right: 0, fontSize: '0.75rem', color: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>🔒 Editing</div>}
        </div>
        <div className="resize-edge-right" onMouseDown={handleResizeMouseStart} title="幅を調整" />
      </div>

      <div className="node-actions">
        {parentId === null && (
          <button className="add-parent-btn" onClick={handleAddParent} title="親を追加">+</button>
        )}
        
        {childrenIds.length > 0 && (
          <button className="collapse-btn" onClick={handleCollapse}>
            {isCollapsed ? childrenIds.length : '-'}
          </button>
        )}
        
        <button className="add-btn" onClick={handleAddChild} title="子を追加">+</button>
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}