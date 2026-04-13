import { doc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from './config';
import { BOARD_ID } from '../hooks/useFirebaseSync';
import type { TaskNode } from '../types';

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

export const batchDeleteFirestoreNodes = async (nodeIds: string[]) => {
  const chunks: string[][] = [];
  for (let i = 0; i < nodeIds.length; i += 500) {
    chunks.push(nodeIds.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((nodeId) => {
      const nodeRef = doc(db, 'boards', BOARD_ID, 'nodes', nodeId);
      batch.delete(nodeRef);
    });
    await batch.commit();
  }
};

export const batchUpdateFirestoreNodes = async (nodes: TaskNode[]) => {
  const chunks: TaskNode[][] = [];
  for (let i = 0; i < nodes.length; i += 500) {
    chunks.push(nodes.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach((node) => {
      const nodeRef = doc(db, 'boards', BOARD_ID, 'nodes', node.id);
      batch.set(nodeRef, {
        ...node.data,
        x: node.position.x,
        y: node.position.y
      }, { merge: true });
    });
    await batch.commit();
  }
};

/**
 * Parses nested objects into Firestore's Dot Notation mapping for updateDoc.
 * Ex. { data: { color: "green" } } -> { "data.color": "green" }
 */
export function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      // Arrays and Dates are treated as primitives in Firestore assignments
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        Object.assign(result, flattenObject(value, newKey));
      } else {
        result[newKey] = value;
      }
    }
  }
  return result;
}

export const patchFirestoreNode = async (nodeId: string, partialData: any) => {
  const nodeRef = doc(db, 'boards', BOARD_ID, 'nodes', nodeId);
  const flatData = flattenObject(partialData);
  // updateDoc expects document to exist. Fallback to setDoc merge if doc does not exist
  await updateDoc(nodeRef, flatData).catch(() => setDoc(nodeRef, partialData, { merge: true }));
};

export const batchPatchFirestoreNodes = async (updates: { id: string, changes: any }[]) => {
  const chunks: { id: string, changes: any }[][] = [];
  for (let i = 0; i < updates.length; i += 500) {
    chunks.push(updates.slice(i, i + 500));
  }
  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(({ id, changes }) => {
      const nodeRef = doc(db, 'boards', BOARD_ID, 'nodes', id);
      batch.update(nodeRef, flattenObject(changes));
    });
    // Do not throw on batched patches if some documents are uninitialized
    await batch.commit().catch(e => console.warn('batchPatch error', e));
  }
};