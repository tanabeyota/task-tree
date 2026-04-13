/**
 * ContextMenu.tsx
 * 右クリックメニュー（ノード / 空白エリア 両対応）
 */

import React, { useEffect, useRef } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import type { TaskColor } from '../../types';

interface Props {
  nodeId: string | null;
  screenX: number;
  screenY: number;
  onClose: () => void;
}

const COLORS: Array<{ key: TaskColor; label: string; bg: string }> = [
  { key: 'green',  label: '緑', bg: '#4ade80' },
  { key: 'blue',   label: '青', bg: '#38bdf8' },
  { key: 'red',    label: '赤', bg: '#f472b6' },
  { key: 'purple', label: '紫', bg: '#a78bfa' },
];

export function ContextMenu({ nodeId, screenX, screenY, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const deleteNode = useTaskStore(s => s.deleteNode);
  const updateNodeData = useTaskStore(s => s.updateNodeData);
  const toggleCollapse = useTaskStore(s => (s as any).toggleCollapse);
  const nodes = useTaskStore(s => s.nodes);

  const node = nodeId ? nodes.find(n => n.id === nodeId) : null;

  // 外側クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // キーボード ESC で閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: screenX,
    top: screenY,
    background: 'rgba(255,255,255,0.97)',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
    backdropFilter: 'blur(12px)',
    padding: '6px 0',
    minWidth: 180,
    zIndex: 500,
    userSelect: 'none',
    fontSize: 13,
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    cursor: 'pointer',
    color: '#374151',
    transition: 'background 0.1s',
    borderRadius: 6,
    margin: '0 4px',
  };

  const hoverStyle = (e: React.MouseEvent<HTMLDivElement>, enter: boolean) => {
    (e.currentTarget as HTMLDivElement).style.background = enter ? '#f1f5f9' : 'transparent';
  };

  const divider = <div style={{ height: 1, background: '#f1f5f9', margin: '4px 0' }} />;

  return (
    <div ref={ref} style={menuStyle}>
      {node ? (
        <>
          <div style={{ padding: '4px 14px 6px', fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            ノード操作
          </div>

          <div
            style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)}
            onMouseLeave={e => hoverStyle(e, false)}
            onClick={() => { toggleCollapse(nodeId!); onClose(); }}
          >
            <span>↕️</span>
            <span>{node.data.isCollapsed ? '展開する' : '折り畳む'}</span>
            <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 11 }}>
              ({node.data.childrenIds.length})
            </span>
          </div>

          {divider}

          {/* カラー変更 */}
          <div style={{ padding: '4px 14px 2px', fontSize: 11, color: '#94a3b8' }}>カラー</div>
          <div style={{ display: 'flex', gap: 8, padding: '4px 14px 8px' }}>
            {COLORS.map(({ key, bg }) => (
              <div
                key={key}
                title={key}
                onClick={() => {
                  updateNodeData(nodeId!, { manualColor: key, color: key });
                  onClose();
                }}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: bg,
                  cursor: 'pointer',
                  border: node.data.color === key ? '2.5px solid #1a1a2e' : '2px solid transparent',
                }}
              />
            ))}
          </div>

          {divider}

          <div
            style={{ ...itemStyle, color: '#ef4444' }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#fef2f2'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            onClick={() => { deleteNode(nodeId!); onClose(); }}
          >
            <span>🗑️</span>
            <span>削除（子も含む）</span>
          </div>
        </>
      ) : (
        <>
          <div style={{ padding: '4px 14px 6px', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
            キャンバス
          </div>
          <div
            style={itemStyle}
            onMouseEnter={e => hoverStyle(e, true)}
            onMouseLeave={e => hoverStyle(e, false)}
            onClick={onClose}
          >
            <span>🗒️</span>
            <span>ここにノードを追加</span>
          </div>
        </>
      )}
    </div>
  );
}
