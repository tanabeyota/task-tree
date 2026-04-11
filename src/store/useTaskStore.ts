import { create } from 'zustand';
import { temporal } from 'zundo';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Node, Edge, NodeChange, EdgeChange } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import type { TaskNodeData, TaskTreeState, TaskColor } from '../types';
import { resolveCollisions } from '../utils/layout';


// ※ Storeの型定義（TaskTreeState）に toggleCollapse が無い場合は ts エラーが出ますが、
// その場合は any で回避するか types を更新してください
export const useTaskStore = create<TaskTreeState & { toggleCollapse: (id: string) => void; setRemoteState: (nodes: Node[], edges: Edge[]) => void }>()(
  temporal(
    (set, get) => ({
      nodes: [], edges: [], selectedIds: [], arrowTargetId: null, savedArrowTargetId: null, activeEditor: null,

      // ★ Firestoreからの更新（他ユーザーの操作）を反映。Undo履歴には積まない。
      setRemoteState: (nodes: Node[], edges: Edge[]) => {
        useTaskStore.temporal.getState().pause();
        set({ nodes, edges });
        useTaskStore.temporal.getState().resume();
      },

        setNodes: (nodes) => set({ nodes }),
        setEdges: (edges) => set({ edges }),
        
        // ★親をドラッグしたら子も一緒に動くロジック
        onNodesChange: (changes: NodeChange[]) => {
          const state = get();
          let newNodes = applyNodeChanges(changes, state.nodes);

          const positionChanges = changes.filter(c => c.type === 'position' && c.position) as any[];
          positionChanges.forEach(change => {
            if (change.dragging) {
              const originalNode = state.nodes.find(n => n.id === change.id);
              if (originalNode && change.position) {
                const dx = change.position.x - originalNode.position.x;
                const dy = change.position.y - originalNode.position.y;
                if (dx !== 0 || dy !== 0) {
                  const moveDescendants = (parentId: string) => {
                    const p = state.nodes.find(n => n.id === parentId);
                    p?.data.childrenIds.forEach(childId => {
                      const childIdx = newNodes.findIndex(n => n.id === childId);
                      if (childIdx !== -1) {
                        newNodes[childIdx] = { ...newNodes[childIdx], position: { x: newNodes[childIdx].position.x + dx, y: newNodes[childIdx].position.y + dy } };
                        moveDescendants(childId);
                      }
                    });
                  };
                  moveDescendants(change.id);
                }
              }
            }
          });
          set({ nodes: newNodes });
        },
        onEdgesChange: (changes: EdgeChange[]) => {
          set({ edges: applyEdgeChanges(changes, get().edges) });
        },

        // ★折りたたみ（-ボタン）機能
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

          if (!willCollapse) newNodes = resolveCollisions(newNodes, [id]);
          set({ nodes: newNodes });
        },

        // Store の addNode メソッドを以下のように修正
        addNode: (x, y, parentId, html = '') => {
          const state = get();
          const newId = uuidv4();
          
          // ★ 修正: 仮の幅と高さを最初から持たせておくことで、生成直後の被り判定を可能にする
          const defaultWidth = 100;
          const defaultHeight = 40;

          // 親からの追加の場合、親の右側に生成（旧版のロジック復元）
          let nx = x; let ny = y;
          if (parentId) {
            const parentNode = state.nodes.find(n => n.id === parentId);
            if (parentNode) {
              // 親のX座標 + 親の幅 + マージン
              nx = parentNode.position.x + (parentNode.data.w || defaultWidth) + 80;
              // Y座標は子ノードの末尾のさらに下
              ny = parentNode.position.y + (parentNode.data.childrenIds.length * 60);
            }
          }

          const newNode: Node<TaskNodeData> = {
            id: newId, position: { x: nx, y: ny }, type: 'taskNode',
            data: { 
              html, color: 'green', manualColor: 'green', parentId, childrenIds: [], 
              isCollapsed: false, isHidden: false, deadline: '', duration: 0, 
              waitHours: 0, waitStartTime: null, manualMaxWidth: null,
              w: defaultWidth, h: defaultHeight // ★追加
            },
          };
          // ... 以降の edges 追加処理と resolveCollisions は維持
          let newNodes = [...state.nodes, newNode];
          let newEdges = [...state.edges];

          if (parentId) {
            newNodes = newNodes.map((n) => n.id === parentId ? { ...n, data: { ...n.data, childrenIds: [...n.data.childrenIds, newId] } } : n);
            newEdges.push({ id: `e-${parentId}-${newId}`, source: parentId, target: newId, type: 'customEdge', animated: false, style: { strokeWidth: 2, stroke: '#cbd5e1' } });
          }
          set({ nodes: resolveCollisions(newNodes, [newId]), edges: newEdges, arrowTargetId: newId, savedArrowTargetId: null, selectedIds: [newId] });
          get().recalculateTreeColors();
          return newId;
        },

        updateNodeData: (id, dataToUpdate) => {
          set((state) => ({ nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...dataToUpdate } } : node) }));
          if (dataToUpdate.manualColor || dataToUpdate.color) get().recalculateTreeColors();
        },

        deleteNode: (id) => {
          const state = get();
          let idsToDelete = new Set<string>();
          const getDescendants = (nodeId: string) => {
            idsToDelete.add(nodeId);
            state.nodes.find((n) => n.id === nodeId)?.data.childrenIds.forEach(getDescendants);
          };
          getDescendants(id);

          const parentId = state.nodes.find((n) => n.id === id)?.data.parentId;
          let newNodes = state.nodes.filter((n) => !idsToDelete.has(n.id));
          if (parentId) {
            newNodes = newNodes.map((n) => n.id === parentId ? { ...n, data: { ...n.data, childrenIds: n.data.childrenIds.filter((cid) => cid !== id) } } : n);
          }
          const newEdges = state.edges.filter((e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target));
          let newArrowTarget = state.arrowTargetId;
          if (idsToDelete.has(id) && state.arrowTargetId === id) newArrowTarget = null;

          set({ nodes: newNodes, edges: newEdges, arrowTargetId: newArrowTarget });
          get().recalculateTreeColors();
        },

        setActiveEditor: (editor) => set({ activeEditor: editor }),
        setSelection: (ids) => set({ selectedIds: ids }),

        moveNode: (nodeId, targetId, position) => {
          const state = get();
          let newNodes = state.nodes.map((n) => n.data.childrenIds.includes(nodeId) ? { ...n, data: { ...n.data, childrenIds: n.data.childrenIds.filter((id: string) => id !== nodeId) } } : n);
          
          const targetNode = newNodes.find((n) => n.id === targetId);
          let newParentId: string | null = position === 'child' ? targetId : (targetNode?.data.parentId || null);

          newNodes = newNodes.map((n) => {
            if (n.id === nodeId) return { ...n, data: { ...n.data, parentId: newParentId } };
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

          let newEdges = state.edges.filter((e) => e.target !== nodeId);
          if (newParentId) newEdges.push({ id: `e-${newParentId}-${nodeId}`, source: newParentId, target: nodeId, type: 'customEdge', animated: false, style: { strokeWidth: 2, stroke: '#cbd5e1' } });

          set({ nodes: resolveCollisions(newNodes, [nodeId]), edges: newEdges });
          get().recalculateTreeColors();
        },

        setArrowTarget: (id) => set({ arrowTargetId: id }),

        recalculateTreeColors: () => {
          const state = get();
          let newNodes = [...state.nodes];
          const processColors = () => {
            let changed = false;
            for (let i = 0; i < newNodes.length; i++) {
               const n = newNodes[i];
               const cIds = n.data.childrenIds;
               if (cIds.length === 0) continue;
               
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
               let nc = hasP ? 'purple' : (hasG ? 'green' : (hasR ? 'red' : (allB ? 'blue' : 'green')));
               if (n.data.color !== nc) {
                  newNodes[i] = { ...n, data: { ...n.data, color: nc as TaskColor } };
                  changed = true;
               }
            }
            return changed;
          };
          let loops = 0;
          while(processColors() && loops < 10) loops++;
          set({ nodes: newNodes });
        },

        evaluateTimers: () => {
          const state = get();
          const now = new Date();
          let changed = false;
          useTaskStore.temporal.getState().pause();
          const newNodes = state.nodes.map(n => {
            let tc = n.data.manualColor || 'green';
            if (tc !== 'blue') {
              if (n.data.waitHours && n.data.waitHours > 0 && n.data.waitStartTime) {
                 if (now >= new Date(new Date(n.data.waitStartTime).getTime() + n.data.waitHours * 3600000)) tc = 'green';
                 else tc = 'red';
              }
              if (n.data.deadline && now >= new Date(new Date(n.data.deadline).getTime() - (n.data.duration || 0) * 3600000)) tc = 'purple';
            }
            if (n.data.color !== tc) {
               changed = true;
               return { ...n, data: { ...n.data, color: tc as TaskColor } };
            }
            return n;
          });
          if (changed) {
            set({ nodes: newNodes });
            get().recalculateTreeColors();
          }
          useTaskStore.temporal.getState().resume();
        }
      }
    ),
    { 
      limit: 50,
      // ★修正: Undo/Redoの履歴にもUI状態を含めない
      partialize: (state) => ({ nodes: state.nodes, edges: state.edges })
    }
  )
);