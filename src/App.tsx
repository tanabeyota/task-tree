import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import TaskCanvas from './components/canvas/TaskCanvas';

export default function App() {
  return (
    <ReactFlowProvider>
      <TaskCanvas />
    </ReactFlowProvider>
  );
}
