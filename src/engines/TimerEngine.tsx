import { useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';

export default function TimerEngine() {
  const evaluateTimers = useTaskStore((state) => state.evaluateTimers);

  useEffect(() => {
    const intervalId = setInterval(() => {
      evaluateTimers();
    }, 1000);
    return () => clearInterval(intervalId);
  }, [evaluateTimers]);

  return null;
}