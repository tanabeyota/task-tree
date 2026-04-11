import React, { useEffect } from 'react';
import { useFloating, shift, offset, flip } from '@floating-ui/react';
import { useTaskStore } from '../../store/useTaskStore';
import './FloatingMenu.css';

export default function FloatingMenu() {
   const selectedIds = useTaskStore((state) => state.selectedIds);
   const nodes = useTaskStore((state) => state.nodes);
   const updateNodeData = useTaskStore((state) => state.updateNodeData);
   const activeEditor = useTaskStore((state) => state.activeEditor);

   const activeNodeId = selectedIds.length === 1 ? selectedIds[0] : null;
   const activeNode = activeNodeId ? nodes.find(n => n.id === activeNodeId) : null;

   const { refs, floatingStyles } = useFloating({
     placement: 'top',
     middleware: [offset(15), flip(), shift({ padding: 10 })],
   });

   useEffect(() => {
       if (activeNodeId) {
           const el = document.querySelector(`[data-id="${activeNodeId}"]`) as HTMLElement;
           if (el) refs.setReference(el);
       } else {
           refs.setReference(null);
       }
   }, [activeNodeId, refs]);

   if (!activeNodeId || !activeNode) return null;

   const hasChildren = activeNode.data.childrenIds.length > 0;

   // Prevent blurring the contentEditable when clicking toolbar
   const handleMouseDown = (e: React.MouseEvent) => {
       e.preventDefault();
   };

   return (
       <div 
         ref={refs.setFloating}
         className="floating-menu" 
         style={floatingStyles}
         onMouseDown={handleMouseDown}
       >
           <button 
             onClick={() => activeEditor?.chain().focus().toggleBold().run()} 
             title="Bold (Ctrl+B)"
             className={activeEditor?.isActive('bold') ? 'active' : ''}
           >
             B
           </button>
           <button 
             onClick={() => activeEditor?.chain().focus().toggleBulletList().run()} 
             title="List"
             className={activeEditor?.isActive('bulletList') ? 'active' : ''}
           >
             UL
           </button>
           
           <div className="divider"></div>

           <div className={`color-group ${hasChildren ? 'disabled' : ''}`}>
               <button className="color-btn green" onClick={() => updateNodeData(activeNodeId, { manualColor: 'green', color: 'green' })} title="Green"></button>
               <button className="color-btn blue" onClick={() => updateNodeData(activeNodeId, { manualColor: 'blue', color: 'blue' })} title="Blue"></button>
               <button className="color-btn yellow" onClick={() => updateNodeData(activeNodeId, { manualColor: 'yellow', color: 'yellow' })} title="Yellow"></button>
           </div>
           
           <div className="divider"></div>

           <div className="timer-inputs">
                <input 
                   type="datetime-local" 
                   value={activeNode.data.deadline || ''} 
                   onChange={(e) => updateNodeData(activeNodeId, { deadline: e.target.value })} 
                   title="期限 (Deadline)"
                />
                <input 
                   type="number" 
                   value={activeNode.data.duration || 0} 
                   onChange={(e) => updateNodeData(activeNodeId, { duration: Number(e.target.value) })}
                   title="所要時間 (Duration)"
                   placeholder="Hrs"
                   style={{ width: '50px' }}
                />
           </div>
       </div>
   );
}
