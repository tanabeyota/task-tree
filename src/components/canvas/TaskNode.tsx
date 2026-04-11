import React, { useRef, useState, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { useReactFlow } from 'reactflow';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useTaskStore } from '../../store/useTaskStore';
import type { TaskNodeData } from '../../types';
import './TaskNode.css';

export default function TaskNode({ id, data, selected }: NodeProps<TaskNodeData>) {
  const { html, color, manualMaxWidth, isCollapsed, childrenIds, parentId } = data;
  const updateNodeData = useTaskStore((state) => state.updateNodeData);
  const addNode = useTaskStore((state) => state.addNode);
  const moveNode = useTaskStore((state) => state.moveNode);
  const setArrowTarget = useTaskStore((state) => state.setArrowTarget);
  const { getNode } = useReactFlow();

  const nodeInputRef = useRef<HTMLDivElement>(null);
  const setActiveEditor = useTaskStore((state) => state.setActiveEditor);

  const [isEditing, setIsEditing] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: html,
    editable: isEditing,
    onBlur: ({ editor }) => {
      setIsEditing(false);
      editor.setOptions({ editable: false });
      updateNodeData(id, { html: editor.getHTML() });
      if (useTaskStore.getState().activeEditor === editor) {
         setActiveEditor(null);
      }
    },
    onFocus: ({ editor }) => {
       setActiveEditor(editor);
    }
  });

  useEffect(() => {
    if (editor && !isEditing && html !== editor.getHTML()) {
       editor.commands.setContent(html);
    }
  }, [html, editor, isEditing]);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    editor?.setOptions({ editable: true });
    setTimeout(() => editor?.commands.focus('end'), 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // We capture to prevent Tiptap from stealing structural keys
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: move to parent (become sibling of current parent)
        if (parentId) {
          const parentNode = getNode(parentId);
          if (parentNode?.data.parentId) {
             moveNode(id, parentNode.data.parentId, 'child');
          } else {
             updateNodeData(id, { parentId: null });
             moveNode(id, parentId, 'after'); // effectively detaching
          }
        }
      } else {
        // Tab: move as child to previous sibling
        const siblings = parentId ? getNode(parentId)?.data.childrenIds : useTaskStore.getState().nodes.filter(n => n.data.parentId === null).map(n => n.id);
        if (siblings) {
           const myIdx = siblings.indexOf(id);
           if (myIdx > 0) {
              const prevSibId = siblings[myIdx - 1];
              moveNode(id, prevSibId, 'child');
           }
        }
      }
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      // Ctrl+Enter: Create Sibling
      const currentPos = getNode(id)?.position;
      const nx = currentPos ? currentPos.x : 100;
      const ny = currentPos ? currentPos.y + 80 : 100; // Sibling Y +80px

      const newId = addNode(nx, ny, parentId, '');
      if (e.shiftKey) {
        moveNode(newId, id, 'before');
      } else {
        moveNode(newId, id, 'after');
      }
      setArrowTarget(newId);
      // Avoid losing focus structurally immediately
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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentPos = getNode(id)?.position;
    const nx = currentPos ? currentPos.x + 80 : 100; // Child X +80px
    const ny = currentPos ? currentPos.y : 100;
    addNode(nx, ny, id);
  };

  const handleCollapse = (e: React.MouseEvent) => {
     e.stopPropagation();
     updateNodeData(id, { isCollapsed: !isCollapsed });
  };

  return (
    <div 
      className={`task-node-wrapper color-${color} ${selected ? 'selected' : ''} ${isCollapsed ? 'collapsed' : ''}`}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      
      <div className="task-node-content">
        <div ref={nodeInputRef} className="node-input" onKeyDownCapture={handleKeyDown}>
           <EditorContent editor={editor} 
               style={{ maxWidth: manualMaxWidth ? `${manualMaxWidth}px` : '20em', width: manualMaxWidth ? `${manualMaxWidth}px` : 'max-content' }}
           />
        </div>
        
        <div className="resize-edge-right" onMouseDown={handleResizeMouseStart} title="幅を調整" />
      </div>

      <div className="node-actions">
        {childrenIds.length > 0 && (
          <button className="collapse-btn" onClick={handleCollapse}>
            {isCollapsed ? childrenIds.length : '-'}
          </button>
        )}
        
        {/* Only Root Note receives the global add button as per specs */}
        {parentId === null && (
          <button className="add-btn" onClick={handleAddChild} title="親を追加">+</button>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}
