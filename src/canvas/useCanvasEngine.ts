/**
 * useCanvasEngine.ts
 * React hook: CanvasRenderer + CanvasInteraction を管理
 * canvas ref の受け渡しと、React 側との状態橋渡しのみを担当
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { CanvasRenderer } from './CanvasRenderer';
import { CanvasInteraction } from './CanvasInteraction';
import type { Camera } from './CanvasRenderer';
import { useTaskStore } from '../store/useTaskStore';

const INITIAL_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export interface ActiveNodeInfo {
  id: string;
  screenRect: DOMRect;
}

export function useCanvasEngine() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const interactionRef = useRef<CanvasInteraction | null>(null);

  const [camera, setCamera] = useState<Camera>(INITIAL_CAMERA);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ nodeId: string | null; x: number; y: number } | null>(null);

  // ノードのスクリーン座標取得（HTML オーバーレイ位置合わせ）
  const getNodeScreenRect = useCallback((id: string): DOMRect | null => {
    return rendererRef.current?.getNodeScreenRect(id) ?? null;
  }, []);

  // 編集モード開始
  const startEditing = useCallback((id: string) => {
    const isLocked = useTaskStore.getState().lockedNodeIds.includes(id);
    if (isLocked) {
      console.log('Node is locked by another user');
      return;
    }
    setEditingNodeId(id);
    rendererRef.current?.setEditingNode(id);
    interactionRef.current?.setEditingNode(id);
  }, []);

  // 編集モード終了
  const stopEditing = useCallback(() => {
    setEditingNodeId(null);
    rendererRef.current?.setEditingNode(null);
    interactionRef.current?.setEditingNode(null);
  }, []);

  // カメラを特定ワールド座標に移動
  const panToNode = useCallback((worldX: number, worldY: number) => {
    interactionRef.current?.panTo(worldX, worldY);
  }, []);

  // Canvas マウント
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CanvasRenderer();
    const interaction = new CanvasInteraction(renderer);

    rendererRef.current = renderer;
    interactionRef.current = interaction;

    renderer.mount(canvas);
    interaction.mount(canvas, INITIAL_CAMERA);

    // カメラ変更 → React state 更新（FloatingToolbar の位置計算に使う）
    interaction.onCameraChange = (cam) => {
      setCamera({ ...cam });
    };

    // ホバー変更
    interaction.onHoveredNodeChange = (id) => {
      setHoveredNodeId(id);
    };

    // クリック → 編集モード (選択は CanvasInteraction 側でも処理)
    interaction.onNodeClick = (id) => {
      startEditing(id);
    };

    // 右クリック
    interaction.onContextMenu = (nodeId, x, y) => {
      setContextMenu({ nodeId, x, y });
    };

    // リサイズ対応
    const ro = new ResizeObserver(() => {
      renderer.resize();
    });
    ro.observe(canvas.parentElement!);

    return () => {
      ro.disconnect();
      renderer.unmount();
      interaction.unmount();
      rendererRef.current = null;
      interactionRef.current = null;
    };
  }, [startEditing]);

  return {
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
    renderer: rendererRef,
    interaction: interactionRef,
  };
}
