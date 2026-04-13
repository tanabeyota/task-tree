/**
 * CanvasRenderer.ts
 * 純粋 TypeScript クラス（非 React）
 * - Zustand store を直接 subscribe してデータを監視
 * - requestAnimationFrame ループで Canvas を描画
 * - React のレンダリングサイクルに一切依存しない
 */

import { useTaskStore } from '../store/useTaskStore';
import { SpatialHash } from './SpatialHash';

import type { TaskNode, TaskEdge } from '../types';

export interface Camera {
  x: number;  // pan offset x (screen pixels)
  y: number;  // pan offset y (screen pixels)
  zoom: number; // scale factor (1.0 = 100%)
}

// カラーパレット
const COLORS = {
  green:  { stroke: '#4ade80', fill: 'rgba(74,222,128,0.08)', text: '#14532d' },
  blue:   { stroke: '#38bdf8', fill: 'rgba(56,189,248,0.08)', text: '#0c4a6e' },
  red:    { stroke: '#f472b6', fill: 'rgba(244,114,182,0.08)', text: '#831843' },
  purple: { stroke: '#a78bfa', fill: 'rgba(167,139,250,0.08)', text: '#3b0764' },
  yellow: { stroke: '#fbbf24', fill: 'rgba(251,191,36,0.08)', text: '#78350f' },
} as const;

const SPATIAL_CELL_SIZE = 500;
const NODE_RADIUS = 42; // テキスト（余白16px表示域）が曲線をはみ出さない数学的限界半径に設定
const NODE_PADDING_H = 16;
const NODE_PADDING_V = 10;
const FONT_SIZE = 15;
const LINE_HEIGHT = FONT_SIZE * 1.4;
const MIN_NODE_H = 44;
const SHADOW_BLUR = 5;
const SHADOW_OFFSET_Y = 2;

export class CanvasRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private gridPattern: CanvasPattern | null = null;
  private dpr = 1;
  private rafId: number | null = null;
  private dirty = true;
  private unsubscribe: (() => void) | null = null;

  // State snapshot (updated via Zustand subscribe)
  private nodes: TaskNode[] = [];
  private edges: TaskEdge[] = [];
  private selectedIds: Set<string> = new Set();
  private lockedNodeIds: Set<string> = new Set();
  private camera: Camera = { x: 0, y: 0, zoom: 1 };

  // Hover / active overlays (set externally by CanvasInteraction)
  public hoveredNodeId: string | null = null;
  public dragTargetId: string | null = null;
  public editingNodeId: string | null = null;
  public lassoRect: { x: number; y: number; w: number; h: number } | null = null;

  // Public spatial hash — shared with CanvasInteraction
  public readonly spatialHash = new SpatialHash(256);

  // Callbacks for React side
  public onHoveredNodeChange?: (id: string | null, screenRect: DOMRect | null) => void;

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { desynchronized: true })!;
    this.dpr = window.devicePixelRatio || 1;
    this.initGridPattern();
    this.resize();

    // Subscribe to Zustand store — React 不要
    this.unsubscribe = useTaskStore.subscribe((state) => {
      this.nodes = state.nodes as unknown as TaskNode[];
      this.edges = state.edges as unknown as TaskEdge[];
      this.selectedIds = new Set(state.selectedIds);
      this.lockedNodeIds = new Set(state.lockedNodeIds);
      // Rebuild spatial hash on state change
      this.spatialHash.rebuild(
        this.nodes
          .filter(n => !n.data.isHidden)
          .map(n => ({
            id: n.id,
            x: n.position.x,
            y: n.position.y,
            w: n.data.w ?? 120,
            h: n.data.h ?? MIN_NODE_H,
          }))
      );
      this.markDirty();
    });

    // Initial state
    const state = useTaskStore.getState();
    this.nodes = state.nodes as unknown as TaskNode[];
    this.edges = state.edges as unknown as TaskEdge[];
    this.selectedIds = new Set(state.selectedIds);
    this.lockedNodeIds = new Set(state.lockedNodeIds);

    this.startLoop();
  }

  unmount() {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.unsubscribe?.();
    this.canvas = null;
    this.ctx = null;
  }

  setCamera(camera: Camera) {
    this.camera = camera;
    this.markDirty();
  }

  setHoveredNode(id: string | null) {
    if (this.hoveredNodeId !== id) {
      this.hoveredNodeId = id;
      this.markDirty();
    }
  }

  setDragTarget(id: string | null) {
    if (this.dragTargetId !== id) {
      this.dragTargetId = id;
      this.markDirty();
    }
  }

  setEditingNode(id: string | null) {
    if (this.editingNodeId !== id) {
      this.editingNodeId = id;
      this.markDirty();
    }
  }

  setLasso(rect: { x: number; y: number; w: number; h: number } | null) {
    this.lassoRect = rect;
    this.markDirty();
  }

  markDirty() {
    this.dirty = true;
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.markDirty();
  }

  /** ワールド座標 → スクリーン座標 */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.camera.zoom + this.camera.x,
      y: wy * this.camera.zoom + this.camera.y,
    };
  }

  /** スクリーン座標 → ワールド座標 */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.camera.x) / this.camera.zoom,
      y: (sy - this.camera.y) / this.camera.zoom,
    };
  }

  /** ノードのスクリーン上の矩形を返す（HTML オーバーレイ位置合わせ用） */
  getNodeScreenRect(nodeId: string): DOMRect | null {
    const node = this.nodes.find(n => n.id === nodeId);
    if (!node) return null;
    const s = this.worldToScreen(node.position.x, node.position.y);
    const w = (node.data.w ?? 120) * this.camera.zoom;
    const h = (node.data.h ?? MIN_NODE_H) * this.camera.zoom;
    return new DOMRect(s.x, s.y, w, h);
  }

  // ─────────────────────────────────────────────
  // Private rendering pipeline
  // ─────────────────────────────────────────────

  private startLoop() {
    const loop = () => {
      if (this.dirty) {
        this.render();
        this.dirty = false;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    const W = canvas.width / this.dpr;
    const H = canvas.height / this.dpr;

    // DPR スケール適用
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // 1. グリッド背景
    this.drawGrid(ctx, W, H);

    // 2. カメラ変換を適用
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // 3. ビューポートカリング用の境界をワールド座標で計算
    const viewLeft   = -this.camera.x / this.camera.zoom;
    const viewTop    = -this.camera.y / this.camera.zoom;
    const viewRight  = (W - this.camera.x) / this.camera.zoom;
    const viewBottom = (H - this.camera.y) / this.camera.zoom;

    // 4. エッジ描画
    this.drawEdges(ctx, viewLeft, viewTop, viewRight, viewBottom);

    // 5. ノード描画（viewport culling）
    const visibleNodes = this.nodes.filter(n => {
      if (n.data.isHidden) return false;
      const nx = n.position.x;
      const ny = n.position.y;
      const nw = n.data.w ?? 120;
      const nh = n.data.h ?? MIN_NODE_H;
      return nx + nw >= viewLeft && nx <= viewRight
          && ny + nh >= viewTop  && ny <= viewBottom;
    });

    for (const node of visibleNodes) {
      this.drawNode(ctx, node);
    }

    // 6. ラッソ選択ボックス
    if (this.lassoRect) {
      this.drawLasso(ctx);
    }

    ctx.restore();
  }

  // ─── Grid ───────────────────────────────────
  private initGridPattern() {
    if (!this.ctx) return;
    const size = 100;
    const osc = new OffscreenCanvas(size, size);
    const octx = osc.getContext('2d')!;
    
    // Minor lines (20px interval)
    octx.strokeStyle = 'rgba(0, 0, 0, 0.03)';
    octx.lineWidth = 1;
    for (let i = 0; i < size; i += 20) {
      octx.beginPath(); octx.moveTo(i, 0); octx.lineTo(i, size); octx.stroke();
      octx.beginPath(); octx.moveTo(0, i); octx.lineTo(size, i); octx.stroke();
    }
    // Major lines (100px interval)
    octx.strokeStyle = 'rgba(0, 0, 0, 0.06)';
    octx.lineWidth = 1.5;
    octx.beginPath(); octx.moveTo(0, 0); octx.lineTo(0, size); octx.stroke();
    octx.beginPath(); octx.moveTo(0, 0); octx.lineTo(size, 0); octx.stroke();

    this.gridPattern = this.ctx.createPattern(osc, 'repeat');
  }

  private drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (!this.gridPattern) return;
    
    // Apply camera transform to the pattern fill matrix
    const matrix = new DOMMatrix()
      .translate(this.camera.x, this.camera.y)
      .scale(this.camera.zoom, this.camera.zoom);
    
    this.gridPattern.setTransform(matrix);
    
    ctx.save();
    ctx.fillStyle = '#f8fafc'; // base background
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = this.gridPattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ─── Edges ──────────────────────────────────
  private drawEdges(
    ctx: CanvasRenderingContext2D,
    vl: number, vt: number, vr: number, vb: number
  ) {
    ctx.save();

    for (const edge of this.edges) {
      const src = this.nodes.find(n => n.id === edge.source);
      const tgt = this.nodes.find(n => n.id === edge.target);
      if (!src || !tgt) continue;
      if (src.data.isHidden || tgt.data.isHidden) continue;

      const sw = src.data.w ?? 120;
      const sh = src.data.h ?? MIN_NODE_H;
      const th = tgt.data.h ?? MIN_NODE_H;

      const x1 = src.position.x + sw;
      const y1 = src.position.y + sh / 2;
      const x2 = tgt.position.x;
      const y2 = tgt.position.y + th / 2;

      // Viewport culling for edges
      if (x1 < vl && x2 < vl) continue;
      if (x1 > vr && x2 > vr) continue;
      if (y1 < vt && y2 < vt) continue;
      if (y1 > vb && y2 > vb) continue;

      const cpOffset = Math.max(Math.abs(x2 - x1) * 0.45, 40);

      const srcColorKey = (src.data.color ?? 'green') as keyof typeof COLORS;
      const tgtColorKey = (tgt.data.color ?? 'green') as keyof typeof COLORS;
      const tgtStroke = COLORS[tgtColorKey]?.stroke ?? COLORS.green.stroke;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.bezierCurveTo(x1 + cpOffset, y1, x2 - cpOffset, y2, x2, y2);
      ctx.strokeStyle = tgtStroke;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ─── Node ───────────────────────────────────
  private drawNode(ctx: CanvasRenderingContext2D, node: TaskNode) {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.data.w ?? 120;
    const h = node.data.h ?? MIN_NODE_H;
    const colorKey = (node.data.color ?? 'green') as keyof typeof COLORS;
    const palette = COLORS[colorKey] ?? COLORS.green;

    const isSelected = this.selectedIds.has(node.id);
    const isHovered  = this.hoveredNodeId === node.id;
    const isEditing  = this.editingNodeId === node.id;
    const isDragTarget = this.dragTargetId === node.id;
    
    // Check search states
    const state = useTaskStore.getState();
    const isSearchMatch = (state as any).searchMatchIds?.includes(node.id);
    const isSearchFocus = (state as any).searchFocusId === node.id;

    const r = NODE_RADIUS;

    // ─ シャドウ (通常シャドウ)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.08)';
    ctx.shadowBlur = SHADOW_BLUR;
    ctx.shadowOffsetY = SHADOW_OFFSET_Y;

    if (isSelected) {
      ctx.shadowColor = 'rgba(0, 123, 255, 0.2)';
      ctx.shadowBlur = 8;
    }

    // ─ 選択・ホバー時のフォーカス（シームレスな外周リング）
    if (isSelected || isHovered) {
      const glowW = isSelected ? 6 : 3; // 線幅（外側への拡張幅）
      this.roundRect(ctx, x - glowW / 2, y - glowW / 2, w + glowW, h + glowW, r + glowW / 2 + 1);
      ctx.strokeStyle = isSelected ? '#dbeafe' : '#f0f9ff';
      ctx.lineWidth = glowW;
      ctx.stroke();
    }

    // ─ 背景塗り
    this.roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = palette.fill;
    ctx.fill();

    // ─ 影を消してストロークだけ
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    let strokeWidth = 2.5;
    let strokeColor = palette.stroke;

    if (isSearchFocus) {
      strokeColor = 'rgba(255, 214, 0, 1)';
      strokeWidth = 3.5;
    } else if (isSearchMatch) {
      strokeColor = 'rgba(255, 214, 0, 0.6)';
      strokeWidth = 3;
    }

    this.roundRect(ctx, x, y, w, h, r);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();

    // ─ D&D Target 透明化
    if (isDragTarget) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      this.roundRect(ctx, x, y, w, h, r);
      ctx.fillStyle = '#bae6fd';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // ─ ロック中のアイコン表示 (🔒)
    if (this.lockedNodeIds.has(node.id) && !isEditing) {
      ctx.font = '14px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      
      const pX = x + w - 16;
      const pY = y + 16;
      
      // bg for lock icon
      ctx.fillStyle = '#fee2e2'; // light red background
      ctx.beginPath();
      ctx.arc(pX, pY, 12, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.fillStyle = '#ef4444';
      ctx.fillText('🔒', pX, pY + 1);
    }

    // ─ テキスト（編集中は非表示にしてUI/UX分離を実現）
    if (!isEditing) {
      this.drawNodeText(ctx, node, x, y, w, h, palette.text);
    }

    // ─ 折り畳みバッジ
    if (node.data.isCollapsed && node.data.childrenIds.length > 0) {
      this.drawCollapseBadge(ctx, node, x + w, y + h / 2, palette);
    }
  }

  private drawNodeText(
    ctx: CanvasRenderingContext2D,
    node: TaskNode,
    x: number, y: number, w: number, h: number,
    textColor: string
  ) {
    if (this.editingNodeId === node.id) return;

    const commands = node.data.renderCommands;
    if (!commands || commands.length === 0) {
      ctx.font = `italic 15px "Inter", sans-serif`;
      ctx.fillStyle = '#9ca3af';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText('Empty Task', x + 16, y + h / 2);
      return;
    }

    const lineHeight = 20; 
    
    // Calculate the true abstract text block height based on the target bounding box
    // Because empty trailing newlines expand `h` but don't produce `cmd` fragments.
    const MIN_NODE_H = 44;
    const PADDING_V = 10;
    const totalTextHeight = h > MIN_NODE_H ? h - (PADDING_V * 2) : lineHeight;
    
    const paddingX = 16;
    const startY = y + (h - totalTextHeight) / 2;
    const startX = x + paddingX;
    
    // (Gotcha #2: 連続するハイライトのX/W寸法を合算してサブピクセル隙間を防止)
    for (let i = 0; i < commands.length; i++) {
      const cmd = commands[i];
      if (cmd.isHighlight) {
        let mergeLength = 1;
        let totalW = cmd.width;
        // 先読みして同じX/Y軸で連結可能なハイライトセルを結合
        while (
          i + mergeLength < commands.length && 
          commands[i + mergeLength].isHighlight &&
          commands[i + mergeLength].y === cmd.y
        ) {
          totalW += commands[i + mergeLength].width;
          mergeLength++;
        }
        
        // 0.5 for anti-aliasing safety plus sub-pixel DOM font-baseline sync
        ctx.fillStyle = 'rgba(255, 214, 0, 0.5)';
        ctx.fillRect(startX + cmd.x, startY + cmd.y + 0.8, totalW + 0.5, lineHeight);
        
        // Skip ahead by exactly the number of extra chunks we merged to prevent dark opacity overlapping
        i += mergeLength - 1;
      }
    }

    ctx.textAlign = 'left';

    for (const cmd of commands) {
      if (cmd.isBullet) {
        ctx.fillStyle = textColor;
        ctx.beginPath();
        // Bullet circle drawn exactly at CSS absolute box center (10px), immune to font drift
        ctx.arc(startX + cmd.x, startY + cmd.y + (lineHeight / 2), 3, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      
      ctx.font = cmd.font;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';
      // Draw from exact vertical center of the 20px box matching DOM line-height center
      ctx.fillText(cmd.text, startX + cmd.x, startY + cmd.y + (lineHeight / 2) + 0.8);
    }
  }

  private drawCollapseBadge(
    ctx: CanvasRenderingContext2D,
    node: TaskNode,
    x: number, y: number,
    palette: typeof COLORS[keyof typeof COLORS]
  ) {
    const r = 10;
    const count = node.data.childrenIds.length;
    ctx.beginPath();
    ctx.arc(x + r, y, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.stroke;
    ctx.fill();

    ctx.font = `bold 9px "Inter", sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(String(count), x + r, y);
  }

  // ─── Lasso ──────────────────────────────────
  private drawLasso(ctx: CanvasRenderingContext2D) {
    if (!this.lassoRect) return;
    const { x, y, w, h } = this.lassoRect;
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1 / this.camera.zoom;
    ctx.setLineDash([6 / this.camera.zoom, 3 / this.camera.zoom]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.06)';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  // ─── Helpers ────────────────────────────────
  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number
  ) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
}
