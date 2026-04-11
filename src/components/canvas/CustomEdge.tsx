import { getSmoothStepPath } from 'reactflow';
import type { EdgeProps } from 'reactflow';
import { useTaskStore } from '../../store/useTaskStore';

export default function CustomEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, target }: EdgeProps) {
  const [edgePath] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 20 });
  
  const nodes = useTaskStore(state => state.nodes);
  const targetNode = nodes.find(n => n.id === target);
  const colorName = targetNode?.data.color || 'green';
  
  let stroke = '#cbd5e1';
  const colorMap: Record<string, string> = {
     green: '#4ade80',
     blue: '#38bdf8',
     red: '#f87171',
     purple: '#c084fc',
     yellow: '#facc15'
  };
  
  // Theme check roughly
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  
  if (colorName !== 'green' || !isDark) {
    stroke = colorMap[colorName] || stroke;
  } else {
    // default dark theme subtle edge
    stroke = '#475569';
  }

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      stroke={stroke}
      strokeWidth={2.5}
      fill="none"
    />
  );
}
