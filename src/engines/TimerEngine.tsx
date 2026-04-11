import { useEffect } from 'react';
import { useTaskStore } from '../store/useTaskStore';

export default function TimerEngine() {
   const evaluateTimers = useTaskStore((state) => state.evaluateTimers);
   
   useEffect(() => {
     // Run constantly to update timers and colors if they expire.
     evaluateTimers(); 
     const iv = setInterval(() => {
       evaluateTimers();
     }, 1000);
     return () => clearInterval(iv);
   }, [evaluateTimers]);

   return null;
}
