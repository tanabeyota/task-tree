import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './config';
import { BOARD_ID } from '../hooks/useFirebaseSync';

export const createFirestoreNode = async (nodeId: string, data: any) => {
  const nodeRef = doc(db, 'boards', BOARD_ID, 'nodes', nodeId);
  await setDoc(nodeRef, data);
};

export const updateFirestoreNode = async (nodeId: string, updates: any) => {
  const nodeRef = doc(db, 'boards', BOARD_ID, 'nodes', nodeId);
  await updateDoc(nodeRef, updates).catch(() => setDoc(nodeRef, updates, { merge: true }));
};

export const deleteFirestoreNode = async (nodeId: string) => {
  const nodeRef = doc(db, 'boards', BOARD_ID, 'nodes', nodeId);
  await deleteDoc(nodeRef);
};
