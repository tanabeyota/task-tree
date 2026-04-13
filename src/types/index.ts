/**
 * types/index.ts
 * React Flow 依存を完全削除した独自型定義
 */

import type { Editor } from '@tiptap/react';

export type TaskColor = 'green' | 'blue' | 'red' | 'purple' | 'yellow';

export interface RenderTextSpan {
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
  isHighlight: boolean;
  width: number;
  isBullet?: boolean;
}

export interface TaskNodeData {
  html: string;
  ast?: any;
  renderCommands?: RenderTextSpan[];
  color: TaskColor;
  manualColor: TaskColor;
  parentId: string | null;
  childrenIds: string[];
  isCollapsed: boolean;
  isHidden: boolean;
  deadline?: string;
  duration?: number;
  waitHours?: number;
  waitStartTime?: string | null;
  w?: number | null;
  h?: number | null;
}

/** React Flow の Node を置き換える独自型 */
export interface TaskNode {
  id: string;
  position: { x: number; y: number };
  type?: string;
  data: TaskNodeData;
  selected?: boolean;
}

/** React Flow の Edge を置き換える独自型 */
export interface TaskEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
  animated?: boolean;
  style?: React.CSSProperties;
}

export interface TaskTreeState {
  nodes: TaskNode[];
  edges: TaskEdge[];
  selectedIds: string[];
  arrowTargetId: string | null;
  savedArrowTargetId: string | null;
  activeEditor: Editor | null;
  lockedNodeIds: string[];
  isDragging: boolean;
  isSaving: boolean;
  isSearchOpen: boolean;

  // Actions
  setNodes: (nodes: TaskNode[]) => void;
  setEdges: (edges: TaskEdge[]) => void;
  setLockedNodeIds: (ids: string[]) => void;

  // Optimistic UI & Firebase Batching
  updateNodePositionsLocally: (updates: { id: string; position: { x: number; y: number }, node?: TaskNode }[]) => void;
  syncNodePositionsFast: (updates: { id: string; position: { x: number; y: number }, node?: TaskNode }[]) => void;
  applyRemoteChanges: (changes: { type: 'added' | 'modified' | 'removed', id: string, node?: TaskNode, edge?: TaskEdge }[]) => void;

  // ★ React Flow の applyNodeChanges/applyEdgeChanges は完全削除
  // カスタム実装に置き換え済み

  // Logic Actions
  addNode: (x: number, y: number, parentId: string | null, html?: string) => string;
  updateNodeData: (id: string, data: Partial<TaskNodeData>, skipFirestore?: boolean) => void;
  deleteNode: (id: string) => void;
  setSelection: (ids: string[]) => void;
  setActiveEditor: (editor: Editor | null) => void;
  recalculateTreeColors: () => void;
  moveNode: (nodeId: string, targetId: string, position: 'before' | 'after' | 'child') => void;
  batchReparentNodes: (nodeIds: string[], targetId: string) => void;
  setArrowTarget: (id: string | null) => void;
  evaluateTimers: () => void;
  setIsDragging: (isDragging: boolean) => void;
  setIsSaving: (isSaving: boolean) => void;
  setIsSearchOpen: (isOpen: boolean) => void;
}
