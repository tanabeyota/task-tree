import { useCallback, useEffect, useState, useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap, Panel, useReactFlow, SelectionMode } from 'reactflow';
import 'reactflow/dist/style.css';
import { useTaskStore } from '../../store/useTaskStore';
import TaskNode from './TaskNode';
import TimerEngine from '../../engines/TimerEngine';
import FloatingMenu from '../ui/FloatingMenu';
import SearchBar from '../ui/SearchBar';
import CustomEdge from './CustomEdge';
import type { Node } from 'reactflow';
import ClipboardEngine from '../../engines/ClipboardEngine';
import { useFirebaseSync } from '../../hooks/useFirebaseSync';
import { updateCursor, lockNode, unlockNode } from '../../firebase/presence';
import { updateFirestoreNode } from '../../firebase/api';

export default function TaskCanvas() {
  useFirebaseSync();
  // ★ 修正: useMemo を使って型を記憶させ、Viteのリロード時にもReact Flowが警告を出さないようにする
  const nodeTypes = useMemo(() => ({ taskNode: TaskNode }), []);
  const edgeTypes = useMemo(() => ({ customEdge: CustomEdge }), []);

  const nodes = useTaskStore((state) => state.nodes);
  const edges = useTaskStore((state) => state.edges);
  const onNodesChange = useTaskStore((state) => state.onNodesChange);
  const onEdgesChange = useTaskStore((state) => state.onEdgesChange);
  const setSelection = useTaskStore((state) => state.setSelection);
  const addNode = useTaskStore((state) => state.addNode);
  const arrowTargetId = useTaskStore((state) => state.arrowTargetId);
  const moveNode = useTaskStore((state) => state.moveNode);
  
  const { setCenter, getNode, getIntersectingNodes, screenToFlowPosition } = useReactFlow();
  const [isDark, setIsDark] = useState(false);

  const onSelectionChange = useCallback(({ nodes }: { nodes: any[] }) => {
    setSelection(nodes.map(n => n.id));
  }, [setSelection]);

  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    if (!(event.target as HTMLElement).closest('.task-node-wrapper')) {
       const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
       addNode(position.x, position.y, null, '');
    }
  }, [addNode, screenToFlowPosition]);

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    lockNode(node.id);
  }, []);

  const onNodeDrag = useCallback((_: React.MouseEvent, node: Node) => {
    updateCursor(node.position.x, node.position.y);
  }, []);

  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
      unlockNode(node.id); // ドラッグ終了でロック解放
      // Save final coords to Firestore
      updateFirestoreNode(node.id, { x: node.position.x, y: node.position.y });
      
      const intersections = getIntersectingNodes(node);
      if (intersections.length > 0) {
        const targetNodeId = intersections[0].id;
        const state = useTaskStore.getState();
        const getD = (id: string): string[] => {
           let d = state.nodes.find(n => n.id === id)?.data.childrenIds || [];
           return [...d, ...d.flatMap(getD)];
        };
        if (targetNodeId === node.id || getD(node.id).includes(targetNodeId)) return;

        const targetEl = document.querySelector(`[data-id="${targetNodeId}"]`) as HTMLElement;
        if (targetEl) {
           const rect = targetEl.getBoundingClientRect();
           const mouseOffsetY = (event as React.MouseEvent).clientY - rect.top;
           const isTopHalf = mouseOffsetY < rect.height / 2;
           moveNode(node.id, targetNodeId, isTopHalf ? 'before' : ((event as React.MouseEvent).shiftKey ? 'after' : 'child'));
        }
      }
    }, [moveNode, getIntersectingNodes]);

  useEffect(() => {
    if (nodes.length === 0) addNode(250, 250, null, 'Root Task');
  }, [nodes.length, addNode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.getAttribute('contenteditable') === 'true';
      if (e.key === 'f' && !isInput) {
        const arrowId = useTaskStore.getState().arrowTargetId;
        if (arrowId) {
          const arrowNode = getNode(arrowId);
          if (arrowNode) setCenter(arrowNode.position.x + 100, arrowNode.position.y, { zoom: 1, duration: 500 });
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !isInput) {
         if (e.shiftKey) useTaskStore.temporal.getState().redo();
         else useTaskStore.temporal.getState().undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [getNode, setCenter]);

  const arrowNode = arrowTargetId ? nodes.find(n => n.id === arrowTargetId) : null;

  return (
    <div className="reactflow-wrapper" onDoubleClick={handleDoubleClick} style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      
      <div id="help-text" style={{ position: 'absolute', top: 20, left: 20, zIndex: 1000, pointerEvents: 'none', color: isDark ? '#f8fafc' : '#1a1a1a' }}>
        <strong>機能説明</strong> <span style={{color: 'gray'}}>(自動保存対応)</span><br/>
        <kbd>Click</kbd> 選択 / <kbd>Double Click</kbd> 編集
      </div>

      <ReactFlow
        nodes={nodes.filter(n => !n.data.isHidden)}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onSelectionChange={onSelectionChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        panOnDrag={[1, 2]}
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        minZoom={0.2} maxZoom={3.0} zoomOnScroll={true} panOnScroll={false} fitView
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background gap={100} size={1} color={isDark ? '#334155' : '#cbd5e1'} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        
        <Panel position="top-right">
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const nextTheme = !isDark;
              setIsDark(nextTheme);
              document.documentElement.setAttribute('data-theme', nextTheme ? 'dark' : 'light');
            }} 
            className="theme-toggle"
            style={{ fontSize: '24px', cursor: 'pointer', background: 'none', border: 'none' }}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </Panel>

        {arrowNode && !arrowNode.data.isHidden && (
          <div id="current-task-arrow" style={{
            position: 'absolute', zIndex: 10, pointerEvents: 'none', fontSize: '32px',
            left: arrowNode.position.x + 20, top: arrowNode.position.y - 45,
            color: arrowNode.data.color === 'green' ? '#60d235' : arrowNode.data.color === 'blue' ? '#00c0ff' : '#fe007a',
            animation: 'bounceArrow 1.5s infinite ease-in-out'
          }}>⬇</div>
        )}
      </ReactFlow>

      <TimerEngine />
      <ClipboardEngine />   {/* ← これを追加！ */}
      <FloatingMenu />
      <SearchBar />
      
      <style>{`
        @keyframes bounceArrow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      `}</style>
    </div>
  );
}