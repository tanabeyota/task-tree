import { getBezierPath } from 'reactflow';
import type { EdgeProps } from 'reactflow'; // ★修正: type を明記して別々にインポート
import { useTaskStore } from '../../store/useTaskStore';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  target // 接続先のノードID
}: EdgeProps) {
  // ★曲線（ベジェ曲線）の経路を計算
  const [edgePath] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  // ★接続先のノードの色を取得して線の色を同期させる
  const targetNode = useTaskStore(state => state.nodes.find(n => n.id === target));
  const nodeColor = targetNode?.data?.color || 'green';

  const colorMap: Record<string, string> = {
    green: '#60d235',
    blue: '#00c0ff',
    red: '#fe007a',
    purple: '#8b3dff'
  };

  return (
    <path
      id={id}
      className="react-flow__edge-path"
      d={edgePath}
      stroke={colorMap[nodeColor] || '#cbd5e1'}
      strokeWidth={2.5}
      fill="none"
      style={style}
    />
  );
}