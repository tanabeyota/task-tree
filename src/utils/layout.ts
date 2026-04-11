import type { Node } from 'reactflow';
import type { TaskNodeData } from '../types';

interface BoundingBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const getSubtreeBox = (id: string, nodes: Node<TaskNodeData>[]): BoundingBox => {
  const ids = [id, ...getDescendants(id, nodes)].filter(i => {
    const n = nodes.find((node) => node.id === i);
    return n && !n.data.isHidden;
  });

  if (ids.length === 0) return { left: 0, right: 0, top: 0, bottom: 0 };
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
  
  ids.forEach(i => {
    const n = nodes.find(node => node.id === i);
    if (!n) return;
    const w = n.data.w || 100;
    const h = n.data.h || 40;
    if (n.position.x < l) l = n.position.x;
    if (n.position.x + w > r) r = n.position.x + w;
    if (n.position.y < t) t = n.position.y;
    if (n.position.y + h > b) b = n.position.y + h;
  });
  return { left: l, right: r, top: t, bottom: b };
};

export const getDescendants = (id: string, nodes: Node<TaskNodeData>[]): string[] => {
  let d: string[] = [];
  const parent = nodes.find(n => n.id === id);
  if (parent) {
    parent.data.childrenIds.forEach(c => {
      d.push(c);
      d = d.concat(getDescendants(c, nodes));
    });
  }
  return d;
};

export const checkCollision = (x: number, y: number, nodes: Node<TaskNodeData>[]): boolean => {
  const r1 = { l: x, r: x + 120, t: y, b: y + 50 };
  for (const n of nodes) {
    if (n.data.isHidden) continue;
    const r2 = { 
      l: n.position.x, 
      r: n.position.x + (n.data.w || 120), 
      t: n.position.y, 
      b: n.position.y + (n.data.h || 50) 
    };
    if (!(r1.r < r2.l || r1.l > r2.r || r1.b < r2.t || r1.t > r2.b)) {
      return true;
    }
  }
  return false;
};

// Resolves overlap by shifting Y down iteratively in groups.
export const resolveCollisions = (nodes: Node<TaskNodeData>[], fixedIds: string[] = []): Node<TaskNodeData>[] => {
  const newNodes = JSON.parse(JSON.stringify(nodes)) as Node<TaskNodeData>[];
  const margin = 20;
  let occur = true;
  let loops = 0;

  while (occur && loops < 20) {
    occur = false;
    loops++;
    const sg: Record<string, string[]> = { 'root': [] };
    
    // Group by parent
    for (const n of newNodes) {
      if (n.data.isHidden) continue;
      const p = n.data.parentId;
      if (p) {
        if (!sg[p]) sg[p] = [];
        sg[p].push(n.id);
      } else {
        sg['root'].push(n.id);
      }
    }

    for (const p in sg) {
      const sibs = sg[p];
      if (sibs.length < 2) continue;

      sibs.sort((a, b) => {
        const na = newNodes.find(n => n.id === a);
        const nb = newNodes.find(n => n.id === b);
        return (na?.position.y || 0) - (nb?.position.y || 0);
      });

      let anchorIdx = sibs.findIndex(id => fixedIds.some(f => id === f || getDescendants(id, newNodes).includes(f)));
      if (anchorIdx === -1) anchorIdx = 0;

      // Push upward
      for (let i = anchorIdx - 1; i >= 0; i--) {
        const bCurr = getSubtreeBox(sibs[i], newNodes);
        const bBelow = getSubtreeBox(sibs[i+1], newNodes);
        if (!(bCurr.right + margin < bBelow.left || bCurr.left - margin > bBelow.right)) {
          if (bCurr.bottom + margin > bBelow.top) {
            const overlap = (bCurr.bottom + margin) - bBelow.top;
            [sibs[i], ...getDescendants(sibs[i], newNodes)].forEach(nId => {
              const node = newNodes.find(n => n.id === nId);
              if (node) node.position.y -= overlap;
            });
            occur = true;
          }
        }
      }

      // Push downward
      for (let i = anchorIdx + 1; i < sibs.length; i++) {
        const bCurr = getSubtreeBox(sibs[i], newNodes);
        const bAbove = getSubtreeBox(sibs[i-1], newNodes);
        if (!(bCurr.right + margin < bAbove.left || bCurr.left - margin > bAbove.right)) {
          if (bCurr.top - margin < bAbove.bottom) {
            const overlap = bAbove.bottom - (bCurr.top - margin);
            [sibs[i], ...getDescendants(sibs[i], newNodes)].forEach(nId => {
               const node = newNodes.find(n => n.id === nId);
               if (node) node.position.y += overlap;
            });
            occur = true;
          }
        }
      }
    }
  }
  return newNodes;
};
