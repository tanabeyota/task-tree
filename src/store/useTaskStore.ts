/**
 * useTaskStore.ts
 * React Flow 依存を完全除去したカスタム Zustand ストア
 * - applyNodeChanges / applyEdgeChanges 削除
 * - onNodesChange / onEdgesChange 削除
 * - 独自 TaskNode / TaskEdge 型に移行
 */

import { create } from 'zustand';
import { temporal } from 'zundo';
import { v4 as uuidv4 } from 'uuid';
import type { TaskTreeState, TaskColor, TaskNode, TaskEdge } from '../types';
import { resolveCollisions, getSubtreeBox, getDescendants } from '../utils/layout';
import { batchDeleteFirestoreNodes, batchUpdateFirestoreNodes, batchPatchFirestoreNodes, patchFirestoreNode } from '../firebase/api';
import { calcNodeSize } from '../canvas/textUtils';

export const useTaskStore = create<TaskTreeState & {
  isInitialized: boolean;
  setIsInitialized: (val: boolean) => void;
  toggleCollapse: (id: string) => void;
  setRemoteState: (nodes: TaskNode[], edges: TaskEdge[]) => void;
  setAndSyncNodes: (newNodes: TaskNode[]) => void;
  pasteMarkdownTree: (text: string, startX: number, startY: number) => void;
  updateNodePositionsLocally: (updates: { id: string; position: { x: number; y: number }, node?: TaskNode }[]) => void;
  resolveNodeCollisions: (nodeId: string) => void;
}>()(
  temporal(
    (set, get) => ({
      isInitialized: false,
      setIsInitialized: (val) => set({ isInitialized: val }),
      nodes: [],
      edges: [],
      selectedIds: [],
      arrowTargetId: null,
      savedArrowTargetId: null,
      activeEditor: null,
      lockedNodeIds: [],
      isDragging: false,
      isSaving: false,
      isSearchOpen: false,

      setIsDragging: (isDragging) => set({ isDragging }),
      setIsSaving: (isSaving) => set({ isSaving }),
      setIsSearchOpen: (isSearchOpen) => set({ isSearchOpen }),

      setRemoteState: (nodes: TaskNode[], edges: TaskEdge[]) => {
        useTaskStore.temporal.getState().pause();
        set({ nodes, edges });
        useTaskStore.temporal.getState().resume();
      },

      setAndSyncNodes: (newNodes: TaskNode[]) => {
        const state = get();
        const changed = newNodes.filter(n => {
          const old = state.nodes.find(o => o.id === n.id);
          if (!old) return true;
          return old.position.x !== n.position.x ||
            old.position.y !== n.position.y ||
            JSON.stringify(old.data) !== JSON.stringify(n.data);
        });
        set({ nodes: newNodes });
        if (changed.length > 0) {
          batchUpdateFirestoreNodes(changed as any).catch(console.error);
        }
      },

      updateNodeData: (id, dataToUpdate, skipFirestore = false) => {
        const state = get();
        let changed = false;
        const newNodes = state.nodes.map((node) => {
          if (node.id !== id) return node;
          
          const nextData = { ...node.data, ...dataToUpdate };
          if ('html' in dataToUpdate || 'ast' in dataToUpdate) {
            const { w, h, renderCommands } = calcNodeSize(nextData.html, nextData.ast);
            nextData.w = w;
            nextData.h = h;
            nextData.renderCommands = renderCommands;
          }
          if (JSON.stringify(node.data) !== JSON.stringify(nextData)) changed = true;
          return { ...node, data: nextData };
        });
        
        // Optimistic UI: Update local state immediately. Do not use setAndSyncNodes.
        set({ nodes: newNodes });
        
        if (changed && !skipFirestore) {
          const updatedNode = newNodes.find(n => n.id === id);
          if (updatedNode) {
             const patchPayload: any = { data: { ...dataToUpdate } };
             if ('html' in dataToUpdate || 'ast' in dataToUpdate) {
               patchPayload.data.w = updatedNode.data.w;
               patchPayload.data.h = updatedNode.data.h;
             }
             patchFirestoreNode(id, patchPayload).catch(console.error);
          }
        }

        if (dataToUpdate.manualColor || dataToUpdate.color) get().recalculateTreeColors();
      },

      updateNodePositionsLocally: (updates) => {
        const state = get();
        
        // 1. In-place mutation for zero-latency CanvasRenderer (requestAnimationFrame reads this directly)
        updates.forEach(u => {
          const n = u.node ?? state.nodes.find(node => node.id === u.id);
          if (n) {
            n.position.x = u.position.x;
            n.position.y = u.position.y;
          }
        });

        // 2. Throttle React listener updates to 30fps to prevent Maximum Update Depth crashes
        const now = Date.now();
        const last = (window as any).__lastLocalUpdate || 0;
        if (now - last > 33) {
          (window as any).__lastLocalUpdate = now;
          useTaskStore.temporal.getState().pause();
          set({ nodes: [...state.nodes] });
          useTaskStore.temporal.getState().resume();
        }
      },

      syncNodePositionsFast: (updates) => {
        batchPatchFirestoreNodes(updates.map(u => ({
          id: u.id,
          changes: { position: u.position }
        }))).catch(console.error);
      },

      applyRemoteChanges: (changes) => {
        const state = get();
        // Pause zundo History so incoming collaborative changes don't overwrite user's undo stack
        useTaskStore.temporal.getState().pause();

        let newNodes = [...state.nodes];
        let newEdges = [...state.edges];

        changes.forEach(change => {
          if (change.type === 'removed') {
            newNodes = newNodes.filter(n => n.id !== change.id);
            newEdges = newEdges.filter(e => e.source !== change.id && e.target !== change.id);
          } else if (change.type === 'added') {
            if (!newNodes.find(n => n.id === change.id) && change.node) newNodes.push(change.node);
            if (change.edge && !newEdges.find(e => e.id === change.edge!.id)) newEdges.push(change.edge);
          } else if (change.type === 'modified' && change.node) {
            const idx = newNodes.findIndex(n => n.id === change.id);
            if (idx >= 0) newNodes[idx] = change.node;
            
            // Edge update logic if parentId changed
            const existingEdgeIdx = newEdges.findIndex(e => e.target === change.id);
            if (change.node.data.parentId) {
               const newEdge = { id: `e-${change.node.data.parentId}-${change.id}`, source: change.node.data.parentId, target: change.id, type: 'customEdge', animated: false };
               if (existingEdgeIdx >= 0) newEdges[existingEdgeIdx] = newEdge;
               else newEdges.push(newEdge);
            } else if (existingEdgeIdx >= 0) {
               newEdges.splice(existingEdgeIdx, 1);
            }
          }
        });

        set({ nodes: newNodes, edges: newEdges });
        useTaskStore.temporal.getState().resume();
      },

      setNodes: (nodes) => get().setAndSyncNodes(nodes),
      setEdges: (edges) => set({ edges }),
      setLockedNodeIds: (lockedNodeIds) => set({ lockedNodeIds }),

      toggleCollapse: (id: string) => {
        const state = get();
        const targetNode = state.nodes.find(n => n.id === id);
        if (!targetNode) return;
        const willCollapse = !targetNode.data.isCollapsed;

        let newNodes = [...state.nodes];
        const toggleDescendants = (parentId: string, hide: boolean) => {
          const p = newNodes.find(n => n.id === parentId);
          p?.data.childrenIds.forEach(childId => {
            const childIdx = newNodes.findIndex(n => n.id === childId);
            if (childIdx !== -1) {
              newNodes[childIdx] = { ...newNodes[childIdx], data: { ...newNodes[childIdx].data, isHidden: hide } };
              if (!newNodes[childIdx].data.isCollapsed || hide) {
                toggleDescendants(childId, hide);
              }
            }
          });
        };

        const targetIdx = newNodes.findIndex(n => n.id === id);
        newNodes[targetIdx] = { ...newNodes[targetIdx], data: { ...newNodes[targetIdx].data, isCollapsed: willCollapse } };
        toggleDescendants(id, willCollapse);

        if (!willCollapse) newNodes = resolveCollisions(newNodes, [id, ...get().lockedNodeIds]);
        get().setAndSyncNodes(newNodes);
      },

      addNode: (x, y, parentId, html = '') => {
        const state = get();
        const newId = uuidv4();
        const defaultWidth = 120;
        const defaultHeight = 44;

        let nx = x; let ny = y;
        if (parentId) {
          const parentNode = state.nodes.find(n => n.id === parentId);
          if (parentNode) {
            nx = parentNode.position.x + (parentNode.data.w || defaultWidth) + 80;
            if (parentNode.data.childrenIds.length > 0) {
              const children = parentNode.data.childrenIds
                .map(cid => state.nodes.find(n => n.id === cid))
                .filter(Boolean) as TaskNode[];
              
              let maxBottom = -Infinity;
              children.forEach(c => {
                const box = getSubtreeBox(c.id, state.nodes as unknown as TaskNode[]);
                if (box.bottom > maxBottom) maxBottom = box.bottom;
              });
              
              ny = maxBottom !== -Infinity ? maxBottom + 30 : parentNode.position.y;
            } else {
              ny = parentNode.position.y;
            }
          }
        }

        const newNode: TaskNode = {
          id: newId,
          position: { x: nx, y: ny },
          type: 'taskNode',
          data: {
            html, color: 'green', manualColor: 'green', parentId, childrenIds: [],
            isCollapsed: false, isHidden: false, deadline: '', duration: 0,
            waitHours: 0, waitStartTime: null,
            w: defaultWidth, h: defaultHeight
          },
        };

        let newNodes = [...state.nodes, newNode];
        let newEdges = [...state.edges];

        if (parentId) {
          newNodes = newNodes.map((n) =>
            n.id === parentId ? { ...n, data: { ...n.data, childrenIds: [...n.data.childrenIds, newId] } } : n
          );
          newEdges.push({
            id: `e-${parentId}-${newId}`,
            source: parentId,
            target: newId,
            type: 'customEdge',
            animated: false,
          });
        }

        const finalNodes = resolveCollisions(newNodes, [newId]);
        set({ edges: newEdges, arrowTargetId: newId, savedArrowTargetId: null, selectedIds: [newId] });
        get().setAndSyncNodes(finalNodes);
        get().recalculateTreeColors();
        return newId;
      },

      pasteMarkdownTree: (text: string, startX: number, startY: number) => {
        const state = get();
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        if (lines.length === 0) return;

        let newNodes = [...state.nodes];
        let newEdges = [...state.edges];
        const addedIds: string[] = [];
        const stack: { depth: number, id: string, y: number }[] = [];
        let currentY = startY;

        lines.forEach((line) => {
          const match = line.match(/^(\s*)[-*•\d.]*\s*(.*)$/);
          if (!match) return;
          const spaces = match[1].replace(/\t/g, '  ').length;
          const content = match[2].trim();
          if (!content) return;

          const depth = Math.floor(spaces / 2);
          const id = uuidv4();

          while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
          const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;

          const nx = startX + (depth * 200);
          const ny = currentY;
          currentY += 66;

          const newNode: TaskNode = {
            id, position: { x: nx, y: ny }, type: 'taskNode',
            data: {
              html: content, color: 'green', manualColor: 'green', parentId, childrenIds: [],
              isCollapsed: false, isHidden: false, deadline: '', duration: 0,
              waitHours: 0, waitStartTime: null, w: 120, h: 44
            }
          };
          newNodes.push(newNode);
          addedIds.push(id);

          if (parentId) {
            const pIdx = newNodes.findIndex(n => n.id === parentId);
            if (pIdx !== -1) {
              newNodes[pIdx] = { ...newNodes[pIdx], data: { ...newNodes[pIdx].data, childrenIds: [...newNodes[pIdx].data.childrenIds, id] } };
            }
            newEdges.push({ id: `e-${parentId}-${id}`, source: parentId, target: id, type: 'customEdge', animated: false });
          }

          stack.push({ depth, id, y: ny });
        });

        const finalNodes = resolveCollisions(newNodes, addedIds);
        set({ edges: newEdges, selectedIds: addedIds });
        get().setAndSyncNodes(finalNodes);
        get().recalculateTreeColors();
      },


      deleteNode: (id) => {
        const state = get();
        const idsToDelete = new Set<string>();
        const collectDescendants = (nodeId: string) => {
          idsToDelete.add(nodeId);
          state.nodes.find((n) => n.id === nodeId)?.data.childrenIds.forEach(collectDescendants);
        };
        collectDescendants(id);

        const parentId = state.nodes.find((n) => n.id === id)?.data.parentId;

        const newNodes = state.nodes
          .filter((n) => !idsToDelete.has(n.id))
          .map((n) => n.id === parentId
            ? { ...n, data: { ...n.data, childrenIds: n.data.childrenIds.filter((cid) => cid !== id) } }
            : n
          );

        const newEdges = state.edges.filter((e) =>
          !idsToDelete.has(e.source) && !idsToDelete.has(e.target)
        );

        let newArrowTarget = state.arrowTargetId;
        if (state.arrowTargetId && idsToDelete.has(state.arrowTargetId)) newArrowTarget = null;

        set({ edges: newEdges, arrowTargetId: newArrowTarget });
        get().setAndSyncNodes(newNodes);
        get().recalculateTreeColors();
        batchDeleteFirestoreNodes([...idsToDelete]).catch((e) =>
          console.error('Firestore cascade delete failed:', e)
        );
      },

      setActiveEditor: (editor) => set({ activeEditor: editor }),
      setSelection: (ids) => set({ selectedIds: ids }),

      resolveNodeCollisions: (nodeId) => {
        const state = get();
        const finalNodes = resolveCollisions(state.nodes, [nodeId]);
        get().setAndSyncNodes(finalNodes);
      },

      moveNode: (nodeId, targetId, position) => {
        const state = get();
        let newNodes = state.nodes.map((n) =>
          n.data.childrenIds.includes(nodeId)
            ? { ...n, data: { ...n.data, childrenIds: n.data.childrenIds.filter((id: string) => id !== nodeId) } }
            : n
        );

        const targetNode = newNodes.find((n) => n.id === targetId);
        let newParentId: string | null = position === 'child'
          ? targetId
          : (targetNode?.data.parentId || null);

        let dx = 0;
        let dy = 0;

        newNodes = newNodes.map((n) => {
          if (n.id === nodeId) {
            // Reparenting時のSmart Placement: 親ノードの階層に合わせて位置を自動補正する
            let nx = n.position.x;
            let ny = n.position.y;
            if (newParentId && position === 'child') {
              const pNode = newNodes.find(p => p.id === newParentId);
              if (pNode) {
                nx = pNode.position.x + (pNode.data.w || 120) + 80;
                
                const existingChildrenIds = pNode.data.childrenIds.filter(id => id !== nodeId);
                if (existingChildrenIds.length > 0) {
                  let maxBottom = -Infinity;
                  existingChildrenIds.forEach(cid => {
                    const box = getSubtreeBox(cid, state.nodes as unknown as TaskNode[]);
                    if (box.bottom > maxBottom) maxBottom = box.bottom;
                  });
                  ny = maxBottom !== -Infinity ? maxBottom + 30 : pNode.position.y;
                } else {
                  // 他の兄弟がいない場合は親と同じ高さ
                  ny = pNode.position.y;
                }
              }
            }
            dx = nx - n.position.x;
            dy = ny - n.position.y;
            return { ...n, position: { x: nx, y: ny }, data: { ...n.data, parentId: newParentId } };
          }
          if (n.id === newParentId) {
            const currentChildren = [...n.data.childrenIds];
            if (position === 'child') currentChildren.push(nodeId);
            else {
              const targetIdx = currentChildren.indexOf(targetId);
              currentChildren.splice(position === 'after' ? targetIdx + 1 : targetIdx, 0, nodeId);
            }
            return { ...n, data: { ...n.data, childrenIds: currentChildren } };
          }
          return n;
        });

        if (dx !== 0 || dy !== 0) {
          const descendants = getDescendants(nodeId, newNodes);
          if (descendants.length > 0) {
            newNodes = newNodes.map(n => {
              if (descendants.includes(n.id)) {
                return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
              }
              return n;
            });
          }
        }

        let newEdges = state.edges.filter((e) => e.target !== nodeId);
        if (newParentId) {
          newEdges.push({
            id: `e-${newParentId}-${nodeId}`,
            source: newParentId,
            target: nodeId,
            type: 'customEdge',
            animated: false,
          });
        }

        const finalNodes = resolveCollisions(newNodes, [nodeId]);
        set({ edges: newEdges });
        get().setAndSyncNodes(finalNodes);
        get().recalculateTreeColors();
      },

      batchReparentNodes: (nodeIds, targetId) => {
        const state = get();
        const getDescendants = (id: string): string[] => {
          const children = state.nodes.find(n => n.id === id)?.data.childrenIds || [];
          return [...children, ...children.flatMap(getDescendants)];
        };
        const safeNodeIds = nodeIds.filter(
          nId => nId !== targetId && !getDescendants(nId).includes(targetId)
        );
        if (safeNodeIds.length === 0) return;

        let newNodes = state.nodes.map(n =>
          n.data.childrenIds.some(cid => safeNodeIds.includes(cid))
            ? { ...n, data: { ...n.data, childrenIds: n.data.childrenIds.filter(cid => !safeNodeIds.includes(cid)) } }
            : n
        );
        newNodes = newNodes.map(n =>
          safeNodeIds.includes(n.id) ? { ...n, data: { ...n.data, parentId: targetId } } : n
        );
        newNodes = newNodes.map(n =>
          n.id === targetId
            ? { ...n, data: { ...n.data, childrenIds: [...n.data.childrenIds, ...safeNodeIds] } }
            : n
        );

        let newEdges = state.edges.filter(e => !safeNodeIds.includes(e.target));
        safeNodeIds.forEach(nId => {
          newEdges.push({
            id: `e-${targetId}-${nId}`,
            source: targetId,
            target: nId,
            type: 'customEdge',
            animated: false,
          });
        });

        const finalNodes = resolveCollisions(newNodes, safeNodeIds);
        set({ edges: newEdges });
        get().setAndSyncNodes(finalNodes);
        get().recalculateTreeColors();
      },

      setArrowTarget: (id) => set({ arrowTargetId: id }),

      recalculateTreeColors: () => {
        const state = get();
        let newNodes = [...state.nodes];
        const now = new Date();
        const processColors = () => {
          let changed = false;
          for (let i = 0; i < newNodes.length; i++) {
            const n = newNodes[i];
            let intrinsic: TaskColor = n.data.manualColor || 'green';
            let timerOverride = false;
            if (intrinsic !== 'blue') {
              if (n.data.waitHours && n.data.waitHours > 0 && n.data.waitStartTime) {
                if (now >= new Date(new Date(n.data.waitStartTime).getTime() + n.data.waitHours * 3600000)) {
                  intrinsic = 'green';
                } else {
                  intrinsic = 'red';
                  timerOverride = true;
                }
              }
              if (n.data.deadline && now >= new Date(new Date(n.data.deadline).getTime() - (n.data.duration || 0) * 3600000)) {
                intrinsic = 'purple';
                timerOverride = true;
              }
            }

            let nc = intrinsic;
            const cIds = n.data.childrenIds;
            if (cIds.length > 0) {
              let hasP = false, hasG = false, hasR = false, allB = true;
              cIds.forEach((c) => {
                const child = newNodes.find(cn => cn.id === c);
                if (!child) return;
                const col = child.data.color;
                if (col === 'purple') hasP = true;
                if (col === 'green') hasG = true;
                if (col === 'red') hasR = true;
                if (col !== 'blue') allB = false;
              });
              const derived = hasP ? 'purple' : (hasG ? 'green' : (hasR ? 'red' : (allB ? 'blue' : 'green')));
              nc = timerOverride ? intrinsic : derived;
            }

            if (n.data.color !== nc) {
              newNodes[i] = { ...n, data: { ...n.data, color: nc } };
              changed = true;
            }
          }
          return changed;
        };
        let loops = 0;
        while (processColors() && loops < 10) loops++;
        
        // Check if any colors actually changed to avoid infinite cycles
        let isDifferent = false;
        for (let i = 0; i < newNodes.length; i++) {
          if (newNodes[i].data.color !== state.nodes[i].data.color) { isDifferent = true; break; }
        }
        if (isDifferent) {
          get().setAndSyncNodes(newNodes);
        }
      },

      evaluateTimers: () => {
        const state = get();
        const now = new Date();
        let changed = false;

        useTaskStore.temporal.getState().pause();

        let newNodes = state.nodes.map(n => {
          if (n.data.waitHours && n.data.waitHours > 0 && n.data.waitStartTime) {
            if (now >= new Date(new Date(n.data.waitStartTime).getTime() + n.data.waitHours * 3600000)) {
              changed = true;
              return {
                ...n,
                data: {
                  ...n.data,
                  waitHours: 0,
                  waitStartTime: null,
                  manualColor: 'green' as TaskColor
                }
              };
            }
          }
          return n;
        });

        if (changed) {
          get().setAndSyncNodes(newNodes);
        }

        get().recalculateTreeColors();
        useTaskStore.temporal.getState().resume();
      },
    }),
    { limit: 50, partialize: (state) => ({ nodes: state.nodes, edges: state.edges }) }
  )
);