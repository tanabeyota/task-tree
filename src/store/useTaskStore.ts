import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { temporal } from 'zundo';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';
import type { Node, Edge, NodeChange, EdgeChange } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { TaskNodeData, TaskTreeState, TaskColor } from '../types';
import { resolveCollisions } from '../utils/layout';

const idbStorage = {
  getItem: async (name: string) => {
    const localRaw = localStorage.getItem(name);
    let raw = localRaw;
    if (localRaw) {
      await idbSet(name, localRaw);
      localStorage.removeItem(name);
    } else {
      raw = await idbGet(name);
    }
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      // Legacy format backward compatibility
      if (parsed.nodes && !parsed.state) {
         const rfNodes: Node[] = [];
         const rfEdges: Edge[] = [];
         for (const [id, data] of Object.entries(parsed.nodes) as [string, any][]) {
            rfNodes.push({
              id,
              position: { x: data.x || 0, y: data.y || 0 },
              type: 'taskNode',
              data: {
                html: data.html || '',
                color: data.color || 'green',
                manualColor: data.manualColor || 'green',
                parentId: data.parentId || null,
                childrenIds: data.childrenIds || [],
                isCollapsed: data.isCollapsed || false,
                isHidden: data.isHidden || false,
                deadline: data.deadline || '',
                duration: data.duration || 0,
                waitHours: data.waitHours || 0,
                waitStartTime: data.waitStartTime || null,
                manualMaxWidth: data.manualMaxWidth || null,
                w: data.w || null,
                h: data.h || null,
              }
            });
            if (data.parentId) {
                rfEdges.push({
                  id: `e-${data.parentId}-${id}`,
                  source: data.parentId,
                  target: id,
                  type: 'customEdge',
                  animated: false,
                  style: { strokeWidth: 2, stroke: '#cbd5e1' },
                });
            }
         }
         return JSON.stringify({ state: { nodes: rfNodes, edges: rfEdges, selectedIds: [], arrowTargetId: null, savedArrowTargetId: null }, version: 0 });
      }
      return raw;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => await idbSet(name, value),
  removeItem: async (name: string) => await idbDel(name),
};

export const useTaskStore = create<TaskTreeState>()(
  temporal(
    persist(
      (set, get) => ({
        nodes: [],
        edges: [],
        selectedIds: [],
        arrowTargetId: null,
        savedArrowTargetId: null,
        activeEditor: null,

        setNodes: (nodes) => set({ nodes }),
        setEdges: (edges) => set({ edges }),
        
        onNodesChange: (changes: NodeChange[]) => {
          set({
            nodes: applyNodeChanges(changes, get().nodes),
          });
        },
        onEdgesChange: (changes: EdgeChange[]) => {
          set({
            edges: applyEdgeChanges(changes, get().edges),
          });
        },

        addNode: (x, y, parentId, html = '') => {
          const state = get();
          const newId = uuidv4();
          
          const newNode: Node<TaskNodeData> = {
            id: newId,
            position: { x, y },
            type: 'taskNode',
            data: {
              html,
              color: 'green',
              manualColor: 'green',
              parentId,
              childrenIds: [],
              isCollapsed: false,
              isHidden: false,
              deadline: '',
              duration: 0,
              waitHours: 0,
              waitStartTime: null,
              manualMaxWidth: null,
            },
          };

          let newNodes = [...state.nodes, newNode];
          let newEdges = [...state.edges];

          if (parentId) {
            newNodes = newNodes.map((n) => {
              if (n.id === parentId) {
                return {
                  ...n,
                  data: { ...n.data, childrenIds: [...n.data.childrenIds, newId] },
                };
              }
              return n;
            });

            newEdges.push({
              id: `e-${parentId}-${newId}`,
              source: parentId,
              target: newId,
              type: 'customEdge',
              animated: false,
              style: { strokeWidth: 2, stroke: '#cbd5e1' },
            });
          }

          let fixedNodes = newNodes;
          // Apply automatic collision solver
          fixedNodes = resolveCollisions(fixedNodes, [newId]);

          set({ nodes: fixedNodes, edges: newEdges, arrowTargetId: newId, savedArrowTargetId: null, selectedIds: [newId] });
          get().recalculateTreeColors();
          return newId;
        },

        updateNodeData: (id, dataToUpdate) => {
          set((state) => ({
            nodes: state.nodes.map((node) => {
              if (node.id === id) {
                return { ...node, data: { ...node.data, ...dataToUpdate } };
              }
              return node;
            }),
          }));
          // If color related changed, trigger recalc
          if (dataToUpdate.manualColor || dataToUpdate.color) {
            get().recalculateTreeColors();
          }
        },

        deleteNode: (id) => {
          const state = get();
          
          let idsToDelete = new Set<string>();
          const getDescendants = (nodeId: string) => {
            idsToDelete.add(nodeId);
            const parent = state.nodes.find((n) => n.id === nodeId);
            if (parent) {
              parent.data.childrenIds.forEach(getDescendants);
            }
          };
          getDescendants(id);

          const targetNode = state.nodes.find((n) => n.id === id);
          const parentId = targetNode?.data.parentId;

          let newNodes = state.nodes.filter((n) => !idsToDelete.has(n.id));
          if (parentId) {
            newNodes = newNodes.map((n) => {
              if (n.id === parentId) {
                return {
                  ...n,
                  data: {
                    ...n.data,
                    childrenIds: n.data.childrenIds.filter((cid) => cid !== id),
                  },
                };
              }
              return n;
            });
          }

          const newEdges = state.edges.filter(
            (e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target)
          );

          let newArrowTarget = state.arrowTargetId;
          if (idsToDelete.has(id) && state.arrowTargetId === id) {
            newArrowTarget = null;
          }

          set({ nodes: newNodes, edges: newEdges, arrowTargetId: newArrowTarget });
          get().recalculateTreeColors();
        },

        setActiveEditor: (editor) => set({ activeEditor: editor }),

        setSelection: (ids) => {
          set({ selectedIds: ids });
        },

        moveNode: (nodeId, targetId, position) => {
          const state = get();
          // Disconnect from old parent
          let newNodes = state.nodes.map((n) => {
            if (n.data.childrenIds.includes(nodeId)) {
              return {
                ...n,
                data: { ...n.data, childrenIds: n.data.childrenIds.filter((id: string) => id !== nodeId) }
              };
            }
            return n;
          });

          // Resolve new parent
          const targetNode = newNodes.find((n) => n.id === targetId);
          let newParentId: string | null = null;
          
          if (position === 'child') {
            newParentId = targetId;
          } else {
            newParentId = targetNode?.data.parentId || null;
          }

          // Connect to new parent
          newNodes = newNodes.map((n) => {
            if (n.id === nodeId) {
              return { ...n, data: { ...n.data, parentId: newParentId } };
            }
            if (n.id === newParentId) {
              // Find insertion index in children array
              const currentChildren = [...n.data.childrenIds];
              if (position === 'child') {
                 currentChildren.push(nodeId);
              } else {
                 const targetIdx = currentChildren.indexOf(targetId);
                 currentChildren.splice(position === 'after' ? targetIdx + 1 : targetIdx, 0, nodeId);
              }
              return { ...n, data: { ...n.data, childrenIds: currentChildren } };
            }
            return n;
          });

          // Rebuild Edges connecting to the nodeId
          let newEdges = state.edges.filter((e) => e.target !== nodeId);
          if (newParentId) {
            newEdges.push({
              id: `e-${newParentId}-${nodeId}`,
              source: newParentId,
              target: nodeId,
              type: 'customEdge',
              animated: false,
              style: { strokeWidth: 2, stroke: '#cbd5e1' },
            });
          }

          set({ nodes: resolveCollisions(newNodes, [nodeId]), edges: newEdges });
          get().recalculateTreeColors();
        },

        setArrowTarget: (id) => set({ arrowTargetId: id }),

        recalculateTreeColors: () => {
          const state = get();
          let newNodes = [...state.nodes];
          
          const processColors = () => {
            let changed = false;
            // Iterate bottom up or topologically? A simple iterative approach works if we repeat until no changes.
            // Since tree depth is typically small, repeating works.
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
          while(processColors() && loops < 10) { loops++; }
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
                 if (now >= new Date(new Date(n.data.waitStartTime).getTime() + n.data.waitHours * 3600000)) {
                    tc = 'green';
                 } else {
                    tc = 'red';
                 }
              }
              if (n.data.deadline && now >= new Date(new Date(n.data.deadline).getTime() - (n.data.duration || 0) * 3600000)) {
                 tc = 'purple';
              }
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
      }),
      { 
        name: 'taskTreeData',
        storage: createJSONStorage(() => idbStorage)
      }
    ),
    { limit: 50 }
  )
);
