/**
 * FloatingToolbar.tsx
 * 選択ノードに追従するツールバー（色変更、タイマー設定）
 * React Flow の NodeToolbar / useReactFlow を完全排除
 * カメラ変換でスクリーン座標を直接計算する
 */

import React, { useState } from 'react';
import { useTaskStore } from '../../store/useTaskStore';
import type { TaskColor } from '../../types';
import type { Camera } from '../../canvas/CanvasRenderer';

const COLOR_PALETTE = [
  { key: 'green',  label: '緑', bg: '#4ade80' },
  { key: 'blue',   label: '青', bg: '#38bdf8' },
  { key: 'red',    label: '赤', bg: '#f472b6' },
  { key: 'purple', label: '紫', bg: '#a78bfa' },
] as const;

interface Props {
  targetIds: string[];
  screenRect: DOMRect;
  camera: Camera;
}

export function FloatingToolbar({ targetIds, screenRect, camera }: Props) {
  const nodes = useTaskStore(s => s.nodes);
  const updateNodeData = useTaskStore(s => s.updateNodeData);
  const activeEditor = useTaskStore(s => s.activeEditor);
  const [showTimer, setShowTimer] = useState(false);
  const [timerTab, setTimerTab] = useState<'deadline' | 'wait'>('deadline');

  // 複数選択時の基準ノード（最初のノードをUI状態のソースとする）
  const primaryNode = nodes.find(n => n.id === targetIds[0]);
  if (!primaryNode) return null;
  const { data } = primaryNode;

  // 全ての選択対象が「端のノード（子を持たない）」かどうか
  const isAllLeaf = targetIds.every(id => {
    const n = nodes.find(n => n.id === id);
    return n && n.data.childrenIds.length === 0;
  });

  const setColor = (c: TaskColor) => {
    targetIds.forEach(id => {
      updateNodeData(id, { manualColor: c, color: c, deadline: '', waitHours: 0 });
    });
  };
  const toggleBold = () => activeEditor?.chain().focus().toggleBold().run();
  const toggleBulletList = () => activeEditor?.chain().focus().toggleBulletList().run();
  const toggleHighlight = () => activeEditor?.chain().focus().toggleHighlight().run();

  const toolbarY = screenRect.y - 54;
  const toolbarX = screenRect.x + screenRect.width / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: toolbarX,
        top: toolbarY,
        transform: 'translateX(-50%)',
        zIndex: 100,
        pointerEvents: 'auto',
      }}
    >
      <div style={{
        background: 'rgba(255,255,255,1)',
        border: '1px solid #f1f5f9',
        borderRadius: 24,
        padding: '6px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        {/* フォーマットボタン */}
        <ToolBtn onClick={toggleBold} active={!!activeEditor?.isActive('bold')} title="太字 (B)">
          <BoldIcon />
        </ToolBtn>
        
        <ToolBtn onClick={toggleBulletList} active={!!activeEditor?.isActive('bulletList')} title="箇条書きリスト">
          <AlignIcon />
        </ToolBtn>

        <ToolBtn onClick={toggleHighlight} active={!!activeEditor?.isActive('highlight')} title="ハイライト（マークアップ）">
          <PencilIcon />
        </ToolBtn>

        {/* タイマーボタン */}
        <div style={{ position: 'relative' }}>
          <ToolBtn onClick={() => setShowTimer(!showTimer)} title="タイマー">
            <ClockIcon />
          </ToolBtn>
          {showTimer && (
            <TimerPanel
              nodeId={primaryNode.id}
              data={data}
              tab={timerTab}
              onTabChange={setTimerTab}
              onUpdate={(id, data) => {
                targetIds.forEach(targetId => updateNodeData(targetId, data));
              }}
            />
          )}
        </div>

        {isAllLeaf && (
          <>
            <Divider />

            {/* カラーパレット */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {COLOR_PALETTE.map(({ key, bg }) => (
                <div
                  key={key}
                  onClick={() => setColor(key as TaskColor)}
                  onMouseDown={(e) => e.preventDefault()}
                  title={key}
                  style={{
                    width: 20, height: 20,
                    borderRadius: '50%',
                    background: bg,
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.15)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────

function ToolBtn({ onClick, active, title, children }: {
  onClick?: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      style={{
        width: 24, height: 24,
        border: 'none',
        background: 'transparent',
        color: active ? '#3b82f6' : '#64748b',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0,
      }}
      onMouseEnter={e => (e.currentTarget.style.color = '#3b82f6')}
      onMouseLeave={e => (e.currentTarget.style.color = active ? '#3b82f6' : '#64748b')}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: '#e2e8f0', margin: '0 4px' }} />;
}

function BoldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  );
}

function AlignIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function TimerPanel({ nodeId, data, tab, onTabChange, onUpdate }: {
  nodeId: string;
  data: any;
  tab: 'deadline' | 'wait';
  onTabChange: (t: 'deadline' | 'wait') => void;
  onUpdate: (id: string, d: any) => void;
}) {
  return (
    <div style={{
      position: 'absolute', top: '110%', left: '50%', transform: 'translateX(-50%)',
      background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: 12, width: 210, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', marginTop: 4, zIndex: 200,
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
        {(['deadline', 'wait'] as const).map(t => (
          <button key={t} onClick={() => onTabChange(t)} style={{
            flex: 1, border: 'none', background: 'none', fontSize: 12, fontWeight: 600,
            color: tab === t ? '#0ea5e9' : '#94a3b8', cursor: 'pointer',
          }}>
            {t === 'deadline' ? '⏰ 締切' : '⏳ 待機'}
          </button>
        ))}
      </div>
      {tab === 'deadline' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="datetime-local" value={data.deadline || ''}
            onChange={e => onUpdate(nodeId, { deadline: e.target.value })}
            style={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px' }} />
          <input type="number" placeholder="工数 (時間)"
            value={data.duration || ''}
            onChange={e => onUpdate(nodeId, { duration: parseFloat(e.target.value) || 0 })}
            style={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px' }} />
          <button onClick={() => onUpdate(nodeId, { deadline: '', duration: 0 })}
            style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            クリア
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="number" placeholder="待機時間 (時間)"
            value={data.waitHours || ''}
            onChange={e => onUpdate(nodeId, { waitHours: parseFloat(e.target.value) || 0, waitStartTime: e.target.value ? new Date().toISOString() : null })}
            style={{ fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 6px' }} />
          <button onClick={() => onUpdate(nodeId, { waitHours: 0, waitStartTime: null })}
            style={{ fontSize: 10, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            クリア
          </button>
        </div>
      )}
    </div>
  );
}