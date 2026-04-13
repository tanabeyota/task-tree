/**
 * useFirebaseSync.ts — React Flow 型依存を除去
 */

import { useEffect } from 'react';
import { db, auth } from '../firebase/config';
import { collection, doc, onSnapshot, setDoc, arrayUnion } from 'firebase/firestore';
import { calcNodeSize } from '../canvas/textUtils';
import { useTaskStore } from '../store/useTaskStore';
import { subscribeToAllLocks } from '../firebase/presence';
import type { TaskNode, TaskEdge } from '../types';

export const BOARD_ID = 'default_board';

export function useFirebaseSync() {
  const setRemoteState = useTaskStore((state) => state.setRemoteState);
  const applyRemoteChanges = useTaskStore((state) => state.applyRemoteChanges);
  const setLockedNodeIds = useTaskStore((state) => state.setLockedNodeIds);
  const setIsInitialized = useTaskStore((state) => state.setIsInitialized);

  useEffect(() => {
    const boardRef = doc(db, 'boards', BOARD_ID);

    const initBoard = async () => {
      const uid = auth.currentUser?.uid;
      if (uid) {
        try {
          await setDoc(boardRef, { members: arrayUnion(uid) }, { merge: true });
        } catch (e) {
          console.error('Failed to join board', e);
        }
      }
    };
    initBoard();

    const nodesCol = collection(boardRef, 'nodes');

    const unsubscribe = onSnapshot(nodesCol, (snapshot) => {
      const state = useTaskStore.getState();

      // [PHASE 1] Initial Full Hydration
      if (!state.isInitialized) {
        if (snapshot.metadata.hasPendingWrites) return;

        const rfNodes: TaskNode[] = [];
        const rfEdges: TaskEdge[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const id = docSnap.id;

          const html = data.html || '';
          const ast = data.ast || null;
          
          const sizeRes = calcNodeSize(html, ast);
          
          rfNodes.push({
            id,
            position: { x: data.x || 0, y: data.y || 0 },
            type: 'taskNode',
            data: {
              html, ast, renderCommands: sizeRes.renderCommands,
              color: data.color || 'green', manualColor: data.manualColor || 'green',
              parentId: data.parentId || null, childrenIds: data.childrenIds || [],
              isCollapsed: data.isCollapsed || false, isHidden: data.isHidden || false,
              deadline: data.deadline || '', duration: data.duration || 0,
              waitHours: data.waitHours || 0, waitStartTime: data.waitStartTime || null,
              w: sizeRes.w, h: sizeRes.h,
            }
          });

          if (data.parentId) {
            rfEdges.push({ id: `e-${data.parentId}-${id}`, source: data.parentId, target: id, type: 'customEdge', animated: false });
          }
        });

        setRemoteState(rfNodes, rfEdges);
        setIsInitialized(true);
        return;
      }

      // [PHASE 2] Incremental Multi-Player Differential Sync & Local Echo Prevention
      const changes: { type: 'added' | 'modified' | 'removed', id: string, node?: TaskNode, edge?: TaskEdge }[] = [];
      
      snapshot.docChanges().forEach((change) => {
        // Echo Cancellation: Drop optimistic UI writes bubbling back from server to prevent micro-stutter
        if (change.doc.metadata.hasPendingWrites) return;

        const id = change.doc.id;
        
        if (change.type === 'removed') {
          changes.push({ type: 'removed', id });
          return;
        }

        const data = change.doc.data();
        const html = data.html || '';
        const ast = data.ast || null;
        
        const oldNode = state.nodes.find(n => n.id === id);
        
        let w = data.w || 120;
        let h = data.h || 44;
        let renderCommands = oldNode?.data.renderCommands;
        
        const textChanged = !oldNode || oldNode.data.html !== html || JSON.stringify(oldNode.data.ast) !== JSON.stringify(ast);
        
        // Skip dense measurements if structural formatting hasn't mutated
        if (textChanged) {
          const sizeRes = calcNodeSize(html, ast);
          w = sizeRes.w;
          h = sizeRes.h;
          renderCommands = sizeRes.renderCommands;
        }

        const node: TaskNode = {
          id,
          position: { x: data.x || 0, y: data.y || 0 },
          type: 'taskNode',
          data: {
            html, ast, renderCommands,
            color: data.color || 'green', manualColor: data.manualColor || 'green',
            parentId: data.parentId || null, childrenIds: data.childrenIds || [],
            isCollapsed: data.isCollapsed || false, isHidden: data.isHidden || false,
            deadline: data.deadline || '', duration: data.duration || 0,
            waitHours: data.waitHours || 0, waitStartTime: data.waitStartTime || null,
            w, h,
          }
        };

        const edge = data.parentId ? { id: `e-${data.parentId}-${id}`, source: data.parentId, target: id, type: 'customEdge', animated: false } : undefined;

        changes.push({ type: change.type as any, id, node, edge });
      });

      if (changes.length > 0) {
        applyRemoteChanges(changes);
      }
    });

    const unsubscribeLocks = subscribeToAllLocks((lockedIds) => {
      setLockedNodeIds(lockedIds);
    });

    return () => {
      unsubscribe();
      unsubscribeLocks();
    };
  }, [setRemoteState, setLockedNodeIds, setIsInitialized]);
}
