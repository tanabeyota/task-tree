import type { RenderTextSpan } from '../types';

let _measureCtx: CanvasRenderingContext2D | null = null;
export function getMeasureCtx() {
  if (!_measureCtx) {
    const canvas = document.createElement('canvas');
    _measureCtx = canvas.getContext('2d');
  }
  return _measureCtx!;
}

interface TextToken {
  text: string;
  isBold: boolean;
  isHighlight: boolean;
  isBullet: boolean;
  indent: number;
  isNewline: boolean;
}

function parseAST(ast: any): TextToken[] {
  const tokens: TextToken[] = [];
  function traverse(node: any, indent: number, inBullet: boolean, isFirstBlock: boolean) {
    if (node.type === 'paragraph' || node.type === 'heading') {
      if (!isFirstBlock) {
        tokens.push({ text: '\n', isBold: false, isHighlight: false, isBullet: false, indent: 0, isNewline: true });
      }
      if (inBullet) {
        tokens.push({ text: '', isBold: false, isHighlight: false, isBullet: true, indent, isNewline: false });
      }
      if (node.content) {
        node.content.forEach((child: any) => traverse(child, indent, false, false));
      }
    } else if (node.type === 'bulletList') {
      if (node.content) {
        node.content.forEach((child: any, i: number) => traverse(child, indent + 24, true, isFirstBlock && i === 0));
      }
    } else if (node.type === 'listItem') {
      if (node.content) {
        node.content.forEach((child: any, i: number) => traverse(child, indent, i === 0, isFirstBlock && i === 0));
      }
    } else if (node.type === 'hardBreak') {
      tokens.push({ text: '\n', isBold: false, isHighlight: false, isBullet: false, indent: 0, isNewline: true });
    } else if (node.type === 'text') {
      let isBold = false;
      let isHighlight = false;
      if (node.marks) {
        node.marks.forEach((m: any) => {
          if (m.type === 'bold') isBold = true;
          if (m.type === 'highlight') isHighlight = true;
        });
      }
      tokens.push({ text: node.text || '', isBold, isHighlight, isBullet: false, indent, isNewline: false });
    }
  }
  if (ast?.content) {
    ast.content.forEach((c: any, i: number) => traverse(c, 0, false, i === 0));
  }
  
  return tokens;
}

function splitIntoWrapChunks(text: string): string[] {
  // English words including common punctuation, or spaces
  const regex = /([a-zA-Z0-9_\-\.\,\!\?\']+|\s+)/g;
  const parts = text.split(regex).filter(Boolean);
  const finalChunks: string[] = [];
  for (const part of parts) {
    if (part.match(/^[a-zA-Z0-9_\-\.\,\!\?\']+$/) || part.match(/^\s+$/)) {
      finalChunks.push(part);
    } else {
      // CJK characters split one by one
      for (const char of part) {
        finalChunks.push(char);
      }
    }
  }
  return finalChunks;
}

export function calcNodeSize(
  html: string = '',
  ast: any = null,
  manualMaxWidth: number | null = null,
  colorStr: string = '#14532d' // Will be dynamically overridden by renderer anyway
): { w: number, h: number, renderCommands: RenderTextSpan[] } {
  const ctx = getMeasureCtx();
  const PADDING_H = 16;
  const PADDING_V = 10;
  const MIN_NODE_H = 44;
  const FONT_SIZE = 15;
  const LINE_HEIGHT = 20;

  const oneCharW = ctx.measureText('あ').width;
  const minWidth = oneCharW * 1 + PADDING_H * 2; 
  const autoWrapMaxWidth = oneCharW * 20 + PADDING_H * 2; 
  const defaultEmptyWidth = oneCharW * 3 + PADDING_H * 2; 

  if (!ast || !ast.content) {
    return { w: defaultEmptyWidth, h: MIN_NODE_H, renderCommands: [] };
  }

  const tokens = parseAST(ast);

  // 1. Measure natural max width (Pass 1)
  let maxNaturalLineWidth = 0;
  let currentLineWidth = 0;
  for (const t of tokens) {
    if (t.isNewline) {
      maxNaturalLineWidth = Math.max(maxNaturalLineWidth, currentLineWidth);
      currentLineWidth = 0;
      continue;
    }
    if (t.isBullet) {
      currentLineWidth += t.indent;
      continue;
    }
    ctx.font = `${t.isBold ? 'bold' : '500'} ${FONT_SIZE}px "Inter", sans-serif`;
    const chunks = splitIntoWrapChunks(t.text);
    for (const chunk of chunks) {
      currentLineWidth += ctx.measureText(chunk).width;
    }
  }
  maxNaturalLineWidth = Math.max(maxNaturalLineWidth, currentLineWidth);

  // Determine Target Width
  let targetMaxWidth = manualMaxWidth !== null 
    ? manualMaxWidth 
    : Math.max(minWidth, Math.min(maxNaturalLineWidth + PADDING_H * 2, autoWrapMaxWidth));

  if (manualMaxWidth !== null) {
    const maxAllowed = Math.max(minWidth, maxNaturalLineWidth + PADDING_H * 2);
    targetMaxWidth = Math.min(targetMaxWidth, maxAllowed);
    targetMaxWidth = Math.max(targetMaxWidth, minWidth); 
  }

  const maxContentW = targetMaxWidth - PADDING_H * 2;
  const commands: RenderTextSpan[] = [];
  
  let cx = 0;
  let cy = 0;
  let maxX = 0;

  // 2. Generate Render Commands via Word Wrap logic (Pass 2)
  for (const t of tokens) {
    if (t.isNewline) {
      cx = 0;
      cy += LINE_HEIGHT;
      continue;
    }
    if (t.isBullet) {
      cx = t.indent;
      commands.push({
        text: '', x: cx - 11, y: cy,
        font: `500 ${FONT_SIZE}px "Inter", sans-serif`,
        color: colorStr, isHighlight: false, width: 0,
        isBullet: true
      });
      continue;
    }

    const font = `${t.isBold ? 'bold' : '500'} ${FONT_SIZE}px "Inter", sans-serif`;
    ctx.font = font;
    
    const chunks = splitIntoWrapChunks(t.text);
    for (const chunk of chunks) {
      const cw = ctx.measureText(chunk).width;
      
      // If adding this chunk exceeds max width, wrap to next line
      if (cx + cw > maxContentW && cx > t.indent && chunk.trim().length > 0) {
        cx = t.indent;
        cy += LINE_HEIGHT;
      }
      
      if (chunk.length > 0) {
        commands.push({
          text: chunk,
          x: cx,
          y: cy,
          font,
          color: colorStr,
          isHighlight: t.isHighlight, // Will be overridden to yellow
          width: cw
        });
      }
      cx += cw;
      maxX = Math.max(maxX, cx);
    }
  }

  if (commands.length === 0) {
    return { w: defaultEmptyWidth, h: MIN_NODE_H, renderCommands: [] };
  }

  cy += LINE_HEIGHT; // Include the final line height calculation
  const h = Math.max(MIN_NODE_H, cy + PADDING_V * 2);
  const actualW = Math.max(minWidth, maxX + PADDING_H * 2);

  return { w: actualW, h, renderCommands: commands };
}

export function stripHtml(html: string): string {
  let text = html.replace(/<[^>]+>/g, '');
  if (text.endsWith('\n')) text = text.slice(0, -1);
  return text;
}
