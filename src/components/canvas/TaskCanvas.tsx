import React, { useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  useReactFlow,
  SelectionMode,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useTaskStore } from '../../store/useTaskStore';
import TaskNode from './TaskNode';
import TimerEngine from '../../engines/TimerEngine';
import FloatingMenu from '../ui/FloatingMenu';
import SearchBar from '../ui/SearchBar';
import CustomEdge from './CustomEdge';
import { generateMarkdownFromTree, parseMarkdownToNodes } from '../../utils/clipboard';
import type { Node } from 'reactflow';

export default function TaskCanvas() {
  const nodes = useTaskStore((state) => state.nodes);
  const edges = useTaskStore((state) => state.edges);
  const onNodesChange = useTaskStore((state) => state.onNodesChange);
  const onEdgesChange = useTaskStore((state) => state.onEdgesChange);
  const setSelection = useTaskStore((state) => state.setSelection);
  const addNode = useTaskStore((state) => state.addNode);
  const { setCenter, getNode, getIntersectingNodes } = useReactFlow();

  const nodeTypes = useMemo(() => ({ taskNode: TaskNode }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge }), []);

  const moveNode = useTaskStore((state) => state.moveNode);

  const onSelectionChange = useCallback(({ nodes }: { nodes: any[] }) => {
    setSelection(nodes.map(n => n.id));
  }, [setSelection]);

  // Handle Double Click on wrapper to add a root node
  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    // Only trigger if clicking directly on the reactflow pane / background
    if (!(event.target as HTMLElement).closest('.task-node-wrapper')) {
       addNode(event.clientX, event.clientY, null, '');
    }
  }, [addNode]);

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const intersections = getIntersectingNodes(node);

      if (intersections.length > 0) {
        const targetNodeId = intersections[0].id;
        
        // Circular Reference and Self Drop Guard
        const state = useTaskStore.getState();
        const getD = (id: string): string[] => {
           let d = state.nodes.find(n => n.id === id)?.data.childrenIds || [];
           return [...d, ...d.flatMap(getD)];
        };
        if (targetNodeId === node.id || getD(node.id).includes(targetNodeId)) {
            return;
        }

        const targetEl = document.querySelector(`[data-id="${targetNodeId}"]`) as HTMLElement;
        if (targetEl) {
           const rect = targetEl.getBoundingClientRect();
           const mouseOffsetY = event.clientY - rect.top;
           const isTopHalf = mouseOffsetY < rect.height / 2;

           moveNode(node.id, targetNodeId, isTopHalf ? 'before' : (event.shiftKey ? 'after' : 'child'));
        }
      }
    },
    [moveNode, getIntersectingNodes]
  );

  // Initial Root Node
  useEffect(() => {
    if (nodes.length === 0) {
      addNode(250, 250, null, 'Root Task');
    }
  }, [nodes.length, addNode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable') === 'true';

      // f key to center
      if (e.key === 'f' && !isInput) {
        const arrowId = useTaskStore.getState().arrowTargetId;
        if (arrowId) {
          const arrowNode = getNode(arrowId);
          if (arrowNode) {
            setCenter(arrowNode.position.x + 100, arrowNode.position.y, { zoom: 1, duration: 500 });
          }
        }
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !isInput) {
         if (e.shiftKey) {
            useTaskStore.temporal.getState().redo();
         } else {
            useTaskStore.temporal.getState().undo();
         }
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      // Only handle if we aren't selecting text inside an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable') === 'true') {
        return;
      }
      const selectedId = useTaskStore.getState().selectedIds[0];
      if (!selectedId) return;
      
      const md = generateMarkdownFromTree(selectedId, () => useTaskStore.getState().nodes);
      e.clipboardData?.setData('text/plain', md);
      e.preventDefault();
    };

    const handlePaste = (e: ClipboardEvent) => {
       if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable') === 'true') {
        return;
      }
      const md = e.clipboardData?.getData('text/plain');
      if (!md) return;
      
      const rect = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      const centerX = rect ? rect.width / 2 : 250;
      const centerY = rect ? rect.height / 2 : 250;
      
      parseMarkdownToNodes(md, centerX, centerY, useTaskStore.getState().addNode);
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('paste', handlePaste);
    }
  }, []);

  return (
    <div className="reactflow-wrapper" onDoubleClick={handleDoubleClick}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeDragStop={onNodeDragStop}
        panOnDrag={[1, 2]}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        minZoom={0.2}
        maxZoom={3.0}
        zoomOnScroll={true}
        panOnScroll={false}
        fitView
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Control', 'Meta', 'Shift']}
        selectionKeyCode={['Alt']}
      >
        <Background gap={100} size={1} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        <Panel position="top-right">
          <button onClick={() => document.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark')} className="theme-toggle">
            🌙/☀️
          </button>
        </Panel>
      </ReactFlow>

      <TimerEngine />
      <FloatingMenu />
      <SearchBar />
    </div>
  );
};


