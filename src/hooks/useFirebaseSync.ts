import { useEffect } from 'react';
import { db, auth } from '../firebase/config';
import { collection, doc, onSnapshot, setDoc, arrayUnion } from 'firebase/firestore';
import { useTaskStore } from '../store/useTaskStore';
import { subscribeToAllLocks } from '../firebase/presence';
import type { Node, Edge } from 'reactflow';

export const BOARD_ID = 'default_board';

export function useFirebaseSync() {
  const setRemoteState = useTaskStore((state) => state.setRemoteState);
  const setLockedNodeIds = useTaskStore((state) => state.setLockedNodeIds);

  useEffect(() => {
    const boardRef = doc(db, 'boards', BOARD_ID);
    
    // Initialize board access for current user so rules allow read/write
    const initBoard = async () => {
      const uid = auth.currentUser?.uid;
      if (uid) {
        try {
          await setDoc(boardRef, { members: arrayUnion(uid) }, { merge: true });
        } catch (e) {
          console.error("Failed to join board", e);
        }
      }
    };
    initBoard();

    const nodesCol = collection(boardRef, 'nodes');

    const unsubscribe = onSnapshot(nodesCol, (snapshot) => {
      // Ignore local writes that haven't been committed yet to avoid rubber-banding
      if (snapshot.metadata.hasPendingWrites) return;

      const rfNodes: Node[] = [];
      const rfEdges: Edge[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const id = docSnap.id;

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
            w: data.w || 100,
            h: data.h || 40,
          }
        });

        if (data.parentId) {
          rfEdges.push({
            id: `e-${data.parentId}-${id}`,
            source: data.parentId,
            target: id,
            type: 'customEdge',
            animated: false,
            style: { strokeWidth: 2, stroke: '#cbd5e1' }
          });
        }
      });

      setRemoteState(rfNodes, rfEdges);
    });

    const unsubscribeLocks = subscribeToAllLocks((lockedIds) => {
      setLockedNodeIds(lockedIds);
    });

    return () => {
       unsubscribe();
       unsubscribeLocks();
    };
  }, [setRemoteState, setLockedNodeIds]);
}
