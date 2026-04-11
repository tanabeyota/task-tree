

export const generateMarkdownFromTree = (rootId: string, getNodes: () => any[]): string => {
  const nodes = getNodes();
  
  const generate = (nodeId: string, depth: number): string => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return '';
    
    // Convert html to plain text roughly
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = node.data.html;
    let plainText = tempDiv.textContent || tempDiv.innerText || '';
    plainText = plainText.replace(/\n/g, ' '); // remove newlines inside node for MD list
    
    let result = `${'  '.repeat(depth)}- ${plainText}\n`;
    
    if (node.data.childrenIds) {
      node.data.childrenIds.forEach((childId: string) => {
        result += generate(childId, depth + 1);
      });
    }
    
    return result;
  };
  
  return generate(rootId, 0).trimEnd();
};

export const parseMarkdownToNodes = (
  markdown: string, 
  baseX: number, 
  baseY: number, 
  addNode: (x: number, y: number, parentId: string | null, html?: string) => string
) => {
  const lines = markdown.split('\n').filter(line => line.trim().length > 0);
  if (lines.length === 0) return;

  const stack: { id: string, depth: number }[] = [];

  lines.forEach((line, index) => {
    // Count leading spaces to determine depth
    const match = line.match(/^(\s*)([-*]?\s*)(.*)$/);
    if (!match) return;
    
    const leadingSpaces = match[1].length;
    // Assuming 2 spaces per indent as standard
    const depth = Math.floor(leadingSpaces / 2);
    const content = match[3];

    // Find parent
    // Pop the stack until we find a parent that has a depth LESS than current depth
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
    
    // Add the node
    const newId = addNode(baseX + depth * 30, baseY + index * 40, parentId, content);
    
    stack.push({ id: newId, depth });
  });
};
