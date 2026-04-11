import React, { useState } from 'react';
import { useReactFlow } from 'reactflow';
import { useTaskStore } from '../../store/useTaskStore';

export default function FloatingMenu() {
  const selectedIds = useTaskStore((state) => state.selectedIds);
  const nodes = useTaskStore((state) => state.nodes);
  const updateNodeData = useTaskStore((state) => state.updateNodeData);
  const activeEditor = useTaskStore((state) => state.activeEditor); // Tiptapエディタ
  const { getNode, flowToScreenPosition } = useReactFlow();
  
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [timerTab, setTimerTab] = useState<'deadline' | 'wait'>('deadline');

  // 選択ノードが1つでない場合はメニューを隠す
  if (selectedIds.length !== 1) return null;
  const targetId = selectedIds[0];
  const targetNode = getNode(targetId);
  const targetData = nodes.find(n => n.id === targetId)?.data;
  
  if (!targetNode || !targetData) return null;

  // メニューの位置をReact Flowの座標から画面の座標（ピクセル）に変換して追従させる
  const screenPos = flowToScreenPosition({ 
    x: targetNode.position.x + 50, 
    y: targetNode.position.y - 15 
  });

  // 太字とリスト化の実行（Tiptapへの命令）
  const toggleBold = () => activeEditor?.chain().focus().toggleBold().run();
  const toggleList = () => activeEditor?.chain().focus().toggleBulletList().run();

  // 状態色の変更
  const setColor = (c: string) => updateNodeData(targetId, { manualColor: c, color: c, deadline: '', waitHours: 0 });

  return (
    <div style={{
      position: 'absolute',
      left: screenPos.x,
      top: screenPos.y,
      transform: 'translate(-50%, -100%)', // ノードの真上にセンタリング
      background: 'rgba(255, 255, 255, 0.95)',
      border: '1px solid #e2e8f0',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
      borderRadius: '8px',
      padding: '6px',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      zIndex: 100,
      pointerEvents: 'auto'
    }}>
      {/* Tiptap フォーマットツール（旧版のSVGアイコンを復元） */}
      <button onClick={toggleBold} className={`toolbar-btn ${activeEditor?.isActive('bold') ? 'active' : ''}`} title="太字 (Ctrl+B)">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2.5" fill="none"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path></svg>
      </button>
      <button onClick={toggleList} className={`toolbar-btn ${activeEditor?.isActive('bulletList') ? 'active' : ''}`} title="箇条書き (「・」を入力)">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
      </button>
      <button className="toolbar-btn" title="ハイライト">
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path><path d="M15 5l4 4"></path><path d="M9 15l4 4"></path></svg>
      </button>
      
      <div className="toolbar-divider" />
      
      {/* タイマー設定トグルのアイコン */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowTimerMenu(!showTimerMenu)} className="toolbar-btn" title="タイマー設定">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        </button>
        
        {showTimerMenu && (
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px',
            width: '200px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: '8px'
          }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '4px' }}>
              <button onClick={() => setTimerTab('deadline')} style={{ flex: 1, border: 'none', background: 'none', color: timerTab === 'deadline' ? '#0ea5e9' : 'gray' }}>締切</button>
              <button onClick={() => setTimerTab('wait')} style={{ flex: 1, border: 'none', background: 'none', color: timerTab === 'wait' ? '#0ea5e9' : 'gray' }}>待機</button>
            </div>
            
            {timerTab === 'deadline' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="datetime-local" value={targetData.deadline || ''} onChange={(e) => updateNodeData(targetId, { deadline: e.target.value })} style={{ width: '100%', fontSize: '12px' }}/>
                <input type="number" placeholder="工数(時間)" value={targetData.duration || ''} onChange={(e) => updateNodeData(targetId, { duration: parseFloat(e.target.value) || 0 })} style={{ width: '100%', fontSize: '12px' }}/>
                <button onClick={() => updateNodeData(targetId, { deadline: '', duration: 0 })} style={{ fontSize: '10px', color: 'red' }}>クリア</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input type="number" placeholder="待機(時間)" value={targetData.waitHours || ''} onChange={(e) => updateNodeData(targetId, { waitHours: parseFloat(e.target.value) || 0, waitStartTime: e.target.value ? new Date().toISOString() : null })} style={{ width: '100%', fontSize: '12px' }}/>
                <button onClick={() => updateNodeData(targetId, { waitHours: 0, waitStartTime: null })} style={{ fontSize: '10px', color: 'red' }}>クリア</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ width: '1px', height: '20px', background: '#e2e8f0', margin: '0 6px' }} />

      {/* 色変更（ステータス）ボタン */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <div onClick={() => setColor('green')} style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#60d235', cursor: 'pointer' }} />
        <div onClick={() => setColor('blue')} style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#00c0ff', cursor: 'pointer' }} />
        <div onClick={() => setColor('red')} style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#fe007a', cursor: 'pointer' }} />
        <div onClick={() => setColor('purple')} style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#8b3dff', cursor: 'pointer' }} />
      </div>
    </div>
  );
}