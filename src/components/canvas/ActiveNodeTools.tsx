/**
 * ActiveNodeTools.tsx
 * ホバー中または選択中の1ノードにのみ表示されるアクションボタン群
 * DOM 要素は常に 1 グループのみ ( 全ノード数に依存しない )
 *
 * ★ Hooks のルール: useCallback は条件 return より前に全て呼ぶ
 */

import React, { useCallback } from 'react';
import { useTaskStore } from '../../store/useTaskStore';

interface Props {
  nodeId: string;
  screenRect: DOMRect;
  camera: { zoom: number };
  onStartEditing: (id: string) => void;
}

export function ActiveNodeTools({ nodeId, screenRect, camera, onStartEditing: _onStartEditing }: Props) {
  const addNode = useTaskStore(s => s.addNode);
  const deleteNode = useTaskStore(s => s.deleteNode);
  const moveNode = useTaskStore(s => s.moveNode);
  const toggleCollapse = useTaskStore(s => (s as any).toggleCollapse);
  const nodes = useTaskStore(s => s.nodes);

  // ★ useCallback は全て条件 return より前に呼ぶ
  const handleAddChild = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const n = useTaskStore.getState().nodes.find(node => node.id === nodeId);
    if (!n) return;
    addNode(n.position.x + (n.data.w ?? 120) + 80, n.position.y, nodeId);
  }, [nodeId, addNode]);

  const handleAddParent = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const n = useTaskStore.getState().nodes.find(node => node.id === nodeId);
    if (!n) return;
    const newId = addNode(n.position.x - 200, n.position.y, null, '');
    moveNode(nodeId, newId, 'child');
  }, [nodeId, addNode, moveNode]);

  const handleCollapse = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleCollapse(nodeId);
  }, [nodeId, toggleCollapse]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNode(nodeId);
  }, [nodeId, deleteNode]);

  // ★ 条件 return は Hook の後
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return null;

  const { x, y, width, height } = screenRect;
  const hasChildren = node.data.childrenIds.length > 0;
  const isCollapsed = node.data.isCollapsed;
  const hasParent = node.data.parentId !== null;

  const btnSize = Math.max(22, Math.min(32, 26 * camera.zoom));
  const btnStyle: React.CSSProperties = {
    width: btnSize,
    height: btnSize,
    borderRadius: '50%',
    border: '1.5px solid #e2e8f0',
    background: 'rgba(255,255,255,0.96)',
    color: '#64748b',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: btnSize * 0.52,
    fontWeight: 700,
    boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
    transition: 'all 0.15s ease',
    userSelect: 'none',
    backdropFilter: 'blur(4px)',
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 20,
      }}
    >
      {/* 右側: 子追加 + 折り畳みボタン */}
      <div style={{
        position: 'absolute',
        left: '100%',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginLeft: 8,
        pointerEvents: 'auto',
      }}>
        <button
          style={{ ...btnStyle, color: '#22c55e', borderColor: '#86efac' }}
          onClick={handleAddChild}
          title="子タスクを追加"
          onMouseEnter={e => { (e.currentTarget.style.background = '#f0fdf4'); (e.currentTarget.style.transform = 'scale(1.12)'); }}
          onMouseLeave={e => { (e.currentTarget.style.background = 'rgba(255,255,255,0.96)'); (e.currentTarget.style.transform = 'scale(1)'); }}
        >+</button>
        {hasChildren && (
          <button
            style={{ ...btnStyle, color: '#0ea5e9', borderColor: '#7dd3fc', fontSize: btnSize * 0.42 }}
            onClick={handleCollapse}
            title={isCollapsed ? '展開' : '折り畳む'}
            onMouseEnter={e => { (e.currentTarget.style.background = '#f0f9ff'); (e.currentTarget.style.transform = 'scale(1.12)'); }}
            onMouseLeave={e => { (e.currentTarget.style.background = 'rgba(255,255,255,0.96)'); (e.currentTarget.style.transform = 'scale(1)'); }}
          >
            {isCollapsed ? node.data.childrenIds.length : '−'}
          </button>
        )}
      </div>

      {/* 左側: 親追加ボタン */}
      {!hasParent && (
        <div style={{
          position: 'absolute',
          right: '100%',
          top: '50%',
          transform: 'translateY(-50%)',
          marginRight: 8,
          pointerEvents: 'auto',
        }}>
          <button
            style={{ ...btnStyle, color: '#a78bfa', borderColor: '#c4b5fd' }}
            onClick={handleAddParent}
            title="親タスクを追加"
            onMouseEnter={e => { (e.currentTarget.style.background = '#faf5ff'); (e.currentTarget.style.transform = 'scale(1.12)'); }}
            onMouseLeave={e => { (e.currentTarget.style.background = 'rgba(255,255,255,0.96)'); (e.currentTarget.style.transform = 'scale(1)'); }}
          >+</button>
        </div>
      )}

      {/* 上部右: 削除ボタン */}
      <div style={{
        position: 'absolute',
        bottom: '100%',
        right: 0,
        marginBottom: 4,
        pointerEvents: 'auto',
      }}>
        <button
          style={{ ...btnStyle, color: '#ef4444', borderColor: '#fca5a5', width: btnSize * 0.82, height: btnSize * 0.82, fontSize: btnSize * 0.4 }}
          onClick={handleDelete}
          title="削除"
          onMouseEnter={e => { (e.currentTarget.style.background = '#fef2f2'); (e.currentTarget.style.transform = 'scale(1.12)'); }}
          onMouseLeave={e => { (e.currentTarget.style.background = 'rgba(255,255,255,0.96)'); (e.currentTarget.style.transform = 'scale(1)'); }}
        >✕</button>
      </div>
    </div>
  );
}
