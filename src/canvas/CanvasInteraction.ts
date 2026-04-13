/**
 * CanvasInteraction.ts
 * マウス/タッチ/ホイールイベントの処理
 * - Pan, Zoom, Node drag (with child propagation)
 * - Lasso selection
 * - Hit-testing（SpatialHash 使用）
 */

import { useTaskStore } from '../store/useTaskStore';
import type { CanvasRenderer, Camera } from './CanvasRenderer';
import type { TaskNode } from '../types';

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 4.0;
const DRAG_THRESHOLD = 4; // px: この距離以下はクリックとみなす

interface DragState {
  type: 'pan' | 'node' | 'lasso' | 'resize';
  startScreenX: number;
  startScreenY: number;
  originCameraX: number;
  originCameraY: number;
  // node drag / resize
  nodeId?: string;
  node?: TaskNode;
  nodeStartWorldX?: number;
  nodeStartWorldY?: number;
  nodeStartW?: number;
  descendantOffsets?: Map<string, { dx: number; dy: number; node: TaskNode }>;
  moved?: boolean;
  
  // D&D target highlight
  lastHoverTargetId?: string | null;
}

export class CanvasInteraction {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: CanvasRenderer;
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private drag: DragState | null = null;
  private editingNodeId: string | null = null;

  // Callbacks to React
  public onCameraChange?: (camera: Camera) => void;
  public onNodeClick?: (id: string, worldX: number, worldY: number) => void;
  public onNodeDblClick?: (id: string) => void;
  public onCanvasClick?: () => void;
  public onHoveredNodeChange?: (id: string | null) => void;
  public onSelectionChange?: (ids: string[]) => void;
  public onAddChild?: (parentId: string) => void;
  public onContextMenu?: (nodeId: string | null, screenX: number, screenY: number) => void;

  constructor(renderer: CanvasRenderer) {
    this.renderer = renderer;
  }

  mount(canvas: HTMLCanvasElement, initialCamera: Camera) {
    this.canvas = canvas;
    this.camera = { ...initialCamera };

    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseLeave);
    
    // Bind wheel to the parent container so scroll events over HTML overlays also zoom the canvas
    const container = canvas.parentElement || canvas;
    container.addEventListener('wheel', this.onWheel as any, { passive: false });

    canvas.addEventListener('dblclick', this.onDblClick);
    canvas.addEventListener('contextmenu', this.handleContextMenuEvent);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
  }

  unmount() {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('mouseleave', this.onMouseLeave);
    
    const container = canvas.parentElement || canvas;
    container.removeEventListener('wheel', this.onWheel as any);
    
    canvas.removeEventListener('dblclick', this.onDblClick);
    canvas.removeEventListener('contextmenu', this.handleContextMenuEvent);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);
    this.canvas = null;
  }

  setCamera(camera: Camera) {
    this.camera = { ...camera };
  }

  setEditingNode(id: string | null) {
    this.editingNodeId = id;
  }

  // ─── Public: Camera controls ───────────────────────────
  panTo(worldX: number, worldY: number) {
    if (!this.canvas) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.x = w / 2 - worldX * this.camera.zoom;
    this.camera.y = h / 2 - worldY * this.camera.zoom;
    this.applyCamera();
  }

  // ─── Internal ──────────────────────────────────────────
  private applyCamera() {
    this.renderer.setCamera(this.camera);
    this.onCameraChange?.(this.camera);
  }

  private screenToWorld(sx: number, sy: number) {
    return this.renderer.screenToWorld(sx, sy);
  }

  /** Hit-test: スクリーン座標でノードを探す (Z-index 降順 + リサイズ対応) */
  private hitTest(screenX: number, screenY: number, ignoreIds?: Set<string>): { id: string, isResize: boolean } | null {
    const { x: wx, y: wy } = this.screenToWorld(screenX, screenY);
    const candidates = this.renderer.spatialHash.query(wx, wy);
    const state = useTaskStore.getState();

    // 後ろ（手前）から判定
    const nodes = state.nodes as unknown as TaskNode[];
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (!node || node.data.isHidden) continue;
      if (ignoreIds?.has(node.id)) continue;
      if (!candidates.includes(node.id)) continue;

      const nx = node.position.x;
      const ny = node.position.y;
      const nw = node.data.w ?? 120;
      const nh = node.data.h ?? 44;

      if (wx >= nx && wx <= nx + nw && wy >= ny && wy <= ny + nh) {
        // 右端16pxはリサイズ判定
        const isResize = wx >= nx + nw - 16;
        return { id: node.id, isResize };
      }
    }
    return null;
  }

  private getDescendantOffsets(nodeId: string, nodes: TaskNode[]): Map<string, { dx: number; dy: number; node: TaskNode }> {
    const result = new Map<string, { dx: number; dy: number; node: TaskNode }>();
    const root = nodes.find(n => n.id === nodeId);
    if (!root) return result;

    const collect = (parentId: string) => {
      const parent = nodes.find(n => n.id === parentId);
      if (!parent) return;
      for (const childId of parent.data.childrenIds) {
        const child = nodes.find(n => n.id === childId);
        if (!child) continue;
        result.set(childId, {
          dx: child.position.x - root.position.x,
          dy: child.position.y - root.position.y,
          node: child, // O(1) reference caching
        });
        collect(childId);
      }
    };
    collect(nodeId);
    return result;
  }

  // ─── Mouse Events ──────────────────────────────────────
  private onMouseDown = (e: MouseEvent) => {
    const rect = this.canvas!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // 1. 右クリック・中クリックは無条件でパン操作
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      this.drag = {
        type: 'pan',
        startScreenX: sx,
        startScreenY: sy,
        originCameraX: this.camera.x,
        originCameraY: this.camera.y,
      };
      return;
    }

    // 左クリック以外は無視
    if (e.button !== 0) return;

    const hit = this.hitTest(sx, sy);

    if (hit) {
      const hitId = hit.id;
      // Zundo一時停止 (MouseUpで再開)
      (useTaskStore as any).temporal?.getState().pause?.();

      const state = useTaskStore.getState();
      const node = state.nodes.find(n => n.id === hitId) as TaskNode | undefined;
      if (!node) return;

      if (hit.isResize) {
        this.drag = {
          type: 'resize',
          startScreenX: sx,
          startScreenY: sy,
          originCameraX: this.camera.x,
          originCameraY: this.camera.y,
          nodeId: hitId,
          nodeStartW: node.data.w ?? 120,
          moved: false,
        };
      } else {
        // Node drag (選択状態はいじらない)
        useTaskStore.getState().setArrowTarget(hitId);
        this.drag = {
          type: 'node',
          startScreenX: sx,
          startScreenY: sy,
          originCameraX: this.camera.x,
          originCameraY: this.camera.y,
          nodeId: hitId,
          node: node, // reference cache
          nodeStartWorldX: node.position.x,
          nodeStartWorldY: node.position.y,
          descendantOffsets: this.getDescendantOffsets(hitId, state.nodes as unknown as TaskNode[]),
          moved: false,
        };
      }
    } else {
      // 2. 背景からの左ドラッグは範囲選択（ラッソ）
      const { x: wx, y: wy } = this.screenToWorld(sx, sy);
      this.drag = {
        type: 'lasso',
        startScreenX: sx,
        startScreenY: sy,
        originCameraX: wx,
        originCameraY: wy,
      };
      // Shiftキーなしなら選択解除
      if (!e.shiftKey) {
        useTaskStore.getState().setSelection([]);
      }
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!this.drag) {
      // ホバー判定
      if (!this.editingNodeId) {
        const hit = this.hitTest(sx, sy);
        this.renderer.setHoveredNode(hit?.id ?? null);
        this.onHoveredNodeChange?.(hit?.id ?? null);
      }
      return;
    }

    const dx = sx - this.drag.startScreenX;
    const dy = sy - this.drag.startScreenY;

    if (Math.hypot(dx, dy) > DRAG_THRESHOLD && !this.drag.moved) {
      this.drag.moved = true;
      useTaskStore.getState().setIsDragging(true);
    }
    
    console.log('[DEBUG] onMouseMove', { type: this.drag.type, dx, dy, cameraX: this.camera.x, moved: this.drag.moved });

    if (this.drag.type === 'pan') {
      this.camera.x = this.drag.originCameraX + dx;
      this.camera.y = this.drag.originCameraY + dy;
      this.applyCamera();
    } else if (this.drag.type === 'node' && this.drag.nodeId) {
      const { x: startWX, y: startWY } = this.screenToWorld(
        this.drag.startScreenX,
        this.drag.startScreenY
      );
      const { x: curWX, y: curWY } = this.screenToWorld(sx, sy);
      const wdx = curWX - startWX;
      const wdy = curWY - startWY;

      const newX = (this.drag.nodeStartWorldX ?? 0) + wdx;
      const newY = (this.drag.nodeStartWorldY ?? 0) + wdy;

      const state = useTaskStore.getState();
      const nodeId = this.drag.nodeId;
      const offsets = this.drag.descendantOffsets ?? new Map();

      const updates: { id: string; position: { x: number; y: number }, node?: TaskNode }[] = [];
      updates.push({ id: nodeId, position: { x: newX, y: newY }, node: this.drag.node });
      for (const [id, off] of offsets.entries()) {
        updates.push({ id, position: { x: newX + off.dx, y: newY + off.dy }, node: off.node });
      }

      // 🔴 HitTest Throttle
      // ドラッグ中(mousemove毎)の無駄なSpatialHash計算をスキップして軽量化
      const now = Date.now();
      if (now - ((this as any)._lastHitTest ?? 0) > 32) {
        (this as any)._lastHitTest = now;
        
        // 当たり判定時は自分自身と自分の子孫を無視して、奥にいるノードを探す
        const ignoreIds = new Set<string>([nodeId, ...offsets.keys()]);
        const dropTargetHit = this.hitTest(sx, sy, ignoreIds);
        
        if (dropTargetHit) {
          this.drag.lastHoverTargetId = dropTargetHit.id;
          this.renderer.setDragTarget(dropTargetHit.id);
        } else {
          this.drag.lastHoverTargetId = null;
          this.renderer.setDragTarget(null);
        }
      }

      state.updateNodePositionsLocally(updates);
    } else if (this.drag.type === 'resize' && this.drag.nodeId) {
      const { x: curWX } = this.screenToWorld(sx, sy);
      const { x: startWX } = this.screenToWorld(this.drag.startScreenX, this.drag.startScreenY);
      const wdx = curWX - startWX;
      
      const newW = (this.drag.nodeStartW ?? 120) + wdx;
      const state = useTaskStore.getState();
      state.updateNodeData(this.drag.nodeId, { manualMaxWidth: newW });
    } else if (this.drag.type === 'lasso') {
      const { x: wx, y: wy } = this.screenToWorld(sx, sy);
      const ox = this.drag.originCameraX;
      const oy = this.drag.originCameraY;
      const lx = Math.min(wx, ox);
      const ly = Math.min(wy, oy);
      const lw = Math.abs(wx - ox);
      const lh = Math.abs(wy - oy);
      this.renderer.setLasso({ x: lx, y: ly, w: lw, h: lh });
      
      document.body.classList.add('disable-ui-interactions');

      // ラッソ内のノードをリアルタイム選択
      const candidates = this.renderer.spatialHash.queryRect(lx, ly, lw, lh);
      const state = useTaskStore.getState();
      const selected: string[] = [];
      for (const id of candidates) {
        const node = state.nodes.find(n => n.id === id) as TaskNode | undefined;
        if (!node || node.data.isHidden) continue;
        const nx = node.position.x;
        const ny = node.position.y;
        const nw = node.data.w ?? 120;
        const nh = node.data.h ?? 44;
        if (nx + nw >= lx && nx <= lx + lw && ny + nh >= ly && ny <= ly + lh) {
          selected.push(id);
        }
      }
      state.setSelection(selected);
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    useTaskStore.getState().setIsDragging(false);
    if (!this.drag) return;
    const rect = this.canvas!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!this.drag.moved) {
      // クリック判定 (ドラッグせずに離した場合)
      if ((this.drag.type === 'node' || this.drag.type === 'resize') && this.drag.nodeId) {
        // 3. ノードクリック時は即座に選択＆編集モードに入る
        useTaskStore.getState().setSelection([this.drag.nodeId]);
        this.onNodeClick?.(
          this.drag.nodeId,
          ...Object.values(this.screenToWorld(sx, sy)) as [number, number]
        );
      } else if (this.drag.type === 'pan' || this.drag.type === 'lasso') {
        // 空白クリック → 選択解除
        if (!e.shiftKey) {
          useTaskStore.getState().setSelection([]);
        }
        this.onCanvasClick?.();
      }
    } else if (this.drag.type === 'node') {
      const state = useTaskStore.getState();
      
      // Upload the final, explicit user drag locations using Dot Notation (no full payload)
      const updates = [];
      const mainNode = state.nodes.find(n => n.id === this.drag!.nodeId);
      if (mainNode) updates.push({ id: mainNode.id, position: mainNode.position });
      for (const [id] of this.drag.descendantOffsets ?? new Map()) {
        const childNode = state.nodes.find(n => n.id === id);
        if (childNode) updates.push({ id: childNode.id, position: childNode.position });
      }
      state.syncNodePositionsFast(updates);

      // ドラッグ終了 → 親切り替えロジックまたは衝突回避起動
      if (this.drag.lastHoverTargetId && this.drag.nodeId) {
        const state = useTaskStore.getState();
        (state as any).moveNode(this.drag.nodeId, this.drag.lastHoverTargetId, 'child');
      } else if (this.drag.nodeId) {
        // 親の移動が発生しなかった場合は、現在の座標での衝突チェックのみ発動
        const state = useTaskStore.getState();
        (state as any).resolveNodeCollisions?.(this.drag.nodeId);
      }
      this.renderer.setDragTarget(null);
    }

    if (this.drag.type === 'lasso') {
      this.renderer.setLasso(null);
    }

    document.body.classList.remove('disable-ui-interactions');

    // Zundo履歴再開
    (useTaskStore as any).temporal?.getState().resume?.();

    this.drag = null;
  };

  private onMouseLeave = () => {
    useTaskStore.getState().setIsDragging(false);
    this.renderer.setHoveredNode(null);
    this.onHoveredNodeChange?.(null);
    if (this.drag?.type === 'pan') {
      this.drag = null;
    }
  };

  private onDblClick = () => {
    // ダブルクリックによる編集開始は不要になりました
  };

  private handleContextMenuEvent = (e: MouseEvent) => {
    e.preventDefault();
    const rect = this.canvas!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = this.hitTest(sx, sy);
    this.onContextMenu?.(hit?.id ?? null, e.clientX, e.clientY);
  };

  // ─── Wheel (Zoom) ─────────────────────────────────────
  private onWheel = (e: WheelEvent) => {
    // Explicity prevent default to avoid any native scroll, even in edit mode
    e.preventDefault();

    const rect = this.canvas!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const scaleBy = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    const oldZoom = this.camera.zoom;
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * scaleBy));

    if (newZoom === oldZoom) return;

    // ズームの原点をマウス位置に固定
    this.camera.x = sx - (sx - this.camera.x) * (newZoom / oldZoom);
    this.camera.y = sy - (sy - this.camera.y) * (newZoom / oldZoom);
    this.camera.zoom = newZoom;

    this.applyCamera();
  };

  // ─── Touch ────────────────────────────────────────────
  private lastTouchDist = 0;
  private lastTouchMidX = 0;
  private lastTouchMidY = 0;

  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      this.lastTouchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      this.lastTouchMidX = (t1.clientX + t2.clientX) / 2;
      this.lastTouchMidY = (t1.clientY + t2.clientY) / 2;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      const rect = this.canvas!.getBoundingClientRect();
      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;
      this.drag = {
        type: 'pan',
        startScreenX: sx,
        startScreenY: sy,
        originCameraX: this.camera.x,
        originCameraY: this.camera.y,
        moved: false,
      };
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const scaleBy = dist / (this.lastTouchDist || dist);
      const rect = this.canvas!.getBoundingClientRect();
      const sx = midX - rect.left;
      const sy = midY - rect.left;

      const oldZoom = this.camera.zoom;
      const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldZoom * scaleBy));
      this.camera.x = sx - (sx - this.camera.x) * (newZoom / oldZoom) + (midX - this.lastTouchMidX);
      this.camera.y = sy - (sy - this.camera.y) * (newZoom / oldZoom) + (midY - this.lastTouchMidY);
      this.camera.zoom = newZoom;
      this.applyCamera();

      this.lastTouchDist = dist;
      this.lastTouchMidX = midX;
      this.lastTouchMidY = midY;
    } else if (e.touches.length === 1 && this.drag?.type === 'pan') {
      const t = e.touches[0];
      const rect = this.canvas!.getBoundingClientRect();
      const sx = t.clientX - rect.left;
      const sy = t.clientY - rect.top;
      this.camera.x = this.drag.originCameraX + (sx - this.drag.startScreenX);
      this.camera.y = this.drag.originCameraY + (sy - this.drag.startScreenY);
      this.applyCamera();
    }
  };

  private onTouchEnd = () => {
    this.drag = null;
  };
}
