/**
 * TaskCanvas.tsx — メインキャンバスコンポーネント
 *
 * 構成:
 *   <canvas>                   ← CanvasRenderer が全ノード/エッジ/グリッドを描画
 *   HTML オーバーレイ（常時数個）
 *     <ActiveNodeTools>        ← ホバー中ノードのアクションボタン
 *     <EditOverlay>            ← ダブルクリックした1ノードの Tiptap 編集
 *     <FloatingToolbar>        ← 選択中ノードのツールバー
 *     <ContextMenu>            ← 右クリックメニュー
 *
 * React Flow / NodeToolbar / useReactFlow — 完全排除
 */

import React, { useEffect, useCallback } from 'react';
import { useCanvasEngine } from '../../canvas/useCanvasEngine';
import { useTaskStore } from '../../store/useTaskStore';
import { useFirebaseSync } from '../../hooks/useFirebaseSync';
import { ActiveNodeTools } from './ActiveNodeTools';
import { EditOverlay } from './EditOverlay';
import { FloatingToolbar } from '../ui/FloatingMenu';
import { ContextMenu } from './ContextMenu';
import SearchBar from '../ui/SearchBar';
import TimerEngine from '../../engines/TimerEngine';
import ClipboardEngine from '../../engines/ClipboardEngine';
import { CloudUpload, Cloud } from 'lucide-react';
import { useTreeShortcuts } from '../../hooks/useTreeShortcuts';

export default function TaskCanvas() {
  useFirebaseSync();

  const {
    canvasRef,
    camera,
    hoveredNodeId,
    editingNodeId,
    contextMenu,
    setContextMenu,
    startEditing,
    stopEditing,
    panToNode,
    getNodeScreenRect,
    interaction,
  } = useCanvasEngine();

  // ─── Global Shortcuts ──────────────────────────────
  useTreeShortcuts(startEditing);

  const nodes = useTaskStore(s => s.nodes);
  const selectedIds = useTaskStore(s => s.selectedIds);
  const isDragging = useTaskStore(s => s.isDragging);
  const isSaving = useTaskStore(s => s.isSaving);
  const isInitialized = useTaskStore(s => s.isInitialized);
  const addNode = useTaskStore(s => s.addNode);

  // ─── 初期ノード生成 ──────────────────────────────
  useEffect(() => {
    if (isInitialized && nodes.length === 0) {
      if (useTaskStore.getState().nodes.length === 0) {
        addNode(
          window.innerWidth / 2 - 60,
          window.innerHeight / 2 - 22,
          null,
          'Root Task'
        );
      }
    }
  }, [isInitialized, nodes.length, addNode]);

  // ─── Browser Native Scroll Lock ─────────────────────
  // 巨大なノードをズーム状態で編集(Tiptap focus)した際にブラウザが勝手に画面(または親div)をスクロールして
  // Canvas要素が上に押し出され、余白が白紙に見える現象を完全に防ぐ
  useEffect(() => {
    const lockWindowScroll = () => {
      if (window.scrollY > 0 || window.scrollX > 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener('scroll', lockWindowScroll, { passive: true });
    return () => window.removeEventListener('scroll', lockWindowScroll);
  }, []);

  const handleContainerScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop > 0 || target.scrollLeft > 0) {
      target.scrollTop = 0;
      target.scrollLeft = 0;
    }
  }, []);


  // ─── Context menu: ダブルクリック時の確認 ─────────
  const handleContextMenuAction = useCallback((nodeId: string | null, x: number, y: number) => {
    setContextMenu({ nodeId, x, y });
  }, [setContextMenu]);

  useEffect(() => {
    const iref = interaction.current;
    if (iref) {
      iref.onContextMenu = handleContextMenuAction;
    }
  }, [interaction, handleContextMenuAction]);

  // ─── アクティブノードの スクリーン座標 ──────────
  const activeNodeId = hoveredNodeId ?? (selectedIds.length === 1 ? selectedIds[0] : null);
  const activeRect = activeNodeId ? getNodeScreenRect(activeNodeId) : null;

  const selectedRect = selectedIds.length > 0 ? (() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let found = false;
    for (const id of selectedIds) {
      const rect = getNodeScreenRect(id);
      if (rect) {
        found = true;
        minX = Math.min(minX, rect.x);
        minY = Math.min(minY, rect.y);
        maxX = Math.max(maxX, rect.x + rect.width);
        maxY = Math.max(maxY, rect.y + rect.height);
      }
    }
    return found ? new DOMRect(minX, minY, maxX - minX, maxY - minY) : null;
  })() : null;

  const editingRect = editingNodeId ? getNodeScreenRect(editingNodeId) : null;

  const handleStopEditing = useCallback(() => {
    stopEditing();
  }, [stopEditing]);

  return (
    <div
      onScroll={handleContainerScroll}
      style={{
        width: '100vw',
        height: '100vh',
        overflow: 'clip',
        position: 'relative',
        background: '#f8fafc',
        cursor: editingNodeId ? 'default' : 'grab',
      }}
      onContextMenu={e => e.preventDefault()}
    >
      {/* ───── Canvas レイヤー ───── */}
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: editingNodeId ? 'default' : undefined,
        }}
      />

      {/* ───── HTML オーバーレイ ───── */}

      {/* ホバー / 選択ノードのアクションボタン（ノード数に依存しない 1 グループ） */}
      {activeNodeId && activeRect && !editingNodeId && (
        <div style={{
          opacity: isDragging ? 0 : 1,
          pointerEvents: isDragging ? 'none' : 'auto',
          transition: 'opacity 0.15s ease',
        }}>
          <ActiveNodeTools
            key={activeNodeId}
            nodeId={activeNodeId}
            screenRect={activeRect}
            camera={camera}
            onStartEditing={startEditing}
          />
        </div>
      )}

      {/* 編集オーバーレイ（Tiptap）: ダブルクリック時のみ 1 個 */}
      {editingNodeId && editingRect && (
        <EditOverlay
          nodeId={editingNodeId}
          screenRect={editingRect}
          camera={camera}
          onStopEditing={handleStopEditing}
          onStartEditing={startEditing}
        />
      )}

      {/* 選択ツールバー */}
      {selectedIds.length > 0 && selectedRect && (
        <div style={{
          opacity: isDragging ? 0 : 1,
          pointerEvents: isDragging ? 'none' : 'auto',
          transition: 'opacity 0.15s ease',
        }}>
          <FloatingToolbar
            targetIds={selectedIds}
            screenRect={selectedRect}
            camera={camera}
          />
        </div>
      )}

      {/* 右クリックメニュー */}
      {contextMenu && (
        <ContextMenu
          nodeId={contextMenu.nodeId}
          screenX={contextMenu.x}
          screenY={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Global Sync Indicator */}
      <div style={{
        position: 'absolute',
        top: 24,
        right: 24,
        padding: '6px 12px',
        background: 'white',
        borderRadius: '9999px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        fontWeight: 500,
        color: isSaving ? '#64748b' : '#10b981',
        pointerEvents: 'none',
        transition: 'all 0.3s ease',
        opacity: isSaving ? 1 : 0.7,
      }}>
        {isSaving ? (
          <>
            <CloudUpload size={16} className="animate-pulse" />
            <span style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>Saving...</span>
          </>
        ) : (
          <>
            <Cloud size={16} />
            <span>Saved</span>
          </>
        )}
      </div>

      {/* 検索バー */}
      <SearchBar panToNode={panToNode} />

      {/* エンジン群 */}
      <TimerEngine />
      <ClipboardEngine />

      {/* HUD: ズーム率表示 */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        fontSize: 11,
        color: '#94a3b8',
        background: 'rgba(255,255,255,0.8)',
        padding: '3px 8px',
        borderRadius: 6,
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
        pointerEvents: 'none',
        fontFamily: '"Inter", monospace',
      }}>
        {Math.round(camera.zoom * 100)}%
      </div>

      {/* HUD: ノード数 */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        fontSize: 11,
        color: '#94a3b8',
        background: 'rgba(255,255,255,0.8)',
        padding: '3px 8px',
        borderRadius: 6,
        backdropFilter: 'blur(4px)',
        userSelect: 'none',
        pointerEvents: 'none',
        fontFamily: '"Inter", monospace',
      }}>
        {nodes.filter(n => !n.data.isHidden).length} nodes
      </div>
    </div>
  );
}