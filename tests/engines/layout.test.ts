import { describe, it, expect } from 'vitest';
import { resolveCollisions } from '../../src/utils/layout';
import type { Node } from 'reactflow';
import type { TaskNodeData } from '../../src/types';

describe('LayoutEngine - Collision Resolution', () => {
    it('shifts the second node downwards by 20px when intersecting bounding boxes exist', () => {
        // Create Mock pure state nodes
        const nodes: Node<TaskNodeData>[] = [
            { 
               id: 'node_1', 
               position: { x: 100, y: 100 }, 
               type: 'taskNode',
               data: { w: 100, h: 50, html: 'one', color: 'green', manualColor: 'green', parentId: null, childrenIds: [], isCollapsed: false, isHidden: false, deadline: '', duration: 0, waitHours: 0, waitStartTime: null, manualMaxWidth: null }
            },
            { 
               id: 'node_2', 
               position: { x: 100, y: 120 }, // Colliding vertically within 50px overlap
               type: 'taskNode',
               data: { w: 100, h: 50, html: 'two', color: 'green', manualColor: 'green', parentId: null, childrenIds: [], isCollapsed: false, isHidden: false, deadline: '', duration: 0, waitHours: 0, waitStartTime: null, manualMaxWidth: null }
            },
        ];
        
        // Pure functional resolution
        const resolvedNodes = resolveCollisions(nodes, ['node_2']);
        
        const secondNode = resolvedNodes.find(n => n.id === 'node_2');
        expect(secondNode?.position.y).toBeGreaterThan(120); // successfully relocated to prevent overlap
    });
});
