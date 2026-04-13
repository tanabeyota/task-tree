import TaskCanvas from './components/canvas/TaskCanvas';
import AuthWrapper from './components/ui/AuthWrapper';

export default function App() {
  return (
    <AuthWrapper>
      <TaskCanvas />
    </AuthWrapper>
  );
}
