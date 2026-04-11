import type { Node, Edge } from 'reactflow';

export type TaskColor = 'green' | 'blue' | 'red' | 'purple' | 'yellow';
import type { Editor } from '@tiptap/react';

export interface TaskNodeData {
  html: string;
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
  manualMaxWidth?: number | null;
  w?: number | null;
  h?: number | null;
}

export interface TaskTreeState {
  nodes: Node<TaskNodeData>[];
  edges: Edge[];
  selectedIds: string[];
  arrowTargetId: string | null;
  savedArrowTargetId: string | null;
  activeEditor: Editor | null;
  
  // Actions
  setNodes: (nodes: Node<TaskNodeData>[]) => void;
  setEdges: (edges: any[]) => void;
  onNodesChange: (changes: any[]) => void;
  onEdgesChange: (edges: any[]) => void;
  
  // Custom Logic Actions
  addNode: (x: number, y: number, parentId: string | null, html?: string) => string;
  updateNodeData: (id: string, data: Partial<TaskNodeData>) => void;
  deleteNode: (id: string) => void;
  setSelection: (ids: string[]) => void;
  setActiveEditor: (editor: Editor | null) => void;
  recalculateTreeColors: () => void;
  moveNode: (nodeId: string, targetId: string, position: 'before' | 'after' | 'child') => void;
  setArrowTarget: (id: string | null) => void;
  evaluateTimers: () => void;
}
