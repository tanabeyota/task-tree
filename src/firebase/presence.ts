import { rtdb, auth } from './config';
import { ref, onValue, set, onDisconnect, remove } from 'firebase/database';
import { BOARD_ID } from '../hooks/useFirebaseSync';

export const updateCursor = (x: number, y: number) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const cursorRef = ref(rtdb, `presence/${BOARD_ID}/activeUsers/${uid}`);
  set(cursorRef, { cursorX: x, cursorY: y });
};

export const lockNode = (nodeId: string) => {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const lockRef = ref(rtdb, `presence/${BOARD_ID}/nodeLocks/${nodeId}`);
  onDisconnect(lockRef).remove();
  set(lockRef, uid);
};

export const unlockNode = (nodeId: string) => {
  const lockRef = ref(rtdb, `presence/${BOARD_ID}/nodeLocks/${nodeId}`);
  remove(lockRef);
  onDisconnect(lockRef).cancel();
};

export const subscribeToLocks = (nodeId: string, callback: (lockedBy: string | null) => void) => {
  const lockRef = ref(rtdb, `presence/${BOARD_ID}/nodeLocks/${nodeId}`);
  return onValue(lockRef, (snapshot) => {
    callback(snapshot.val());
  });
};
