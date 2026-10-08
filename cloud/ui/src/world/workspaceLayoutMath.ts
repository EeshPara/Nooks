import type { WorkspaceWidgetPosition } from '../workspace-normalize';

export type WidgetViewport = { width: number; height: number; offsetX?: number; offsetY?: number; top?: number; right?: number; bottom?: number; left?: number };
export type WidgetSize = { width: number; height: number };
const finite = (value: number | undefined, fallback = 0) => Number.isFinite(value) ? value! : fallback;
const unit = (value: number) => Math.min(1, Math.max(0, finite(value)));

export function widgetBounds(viewport: WidgetViewport, size: WidgetSize) {
  const left = Math.max(0, finite(viewport.left, 16)), top = Math.max(0, finite(viewport.top, 96));
  const right = Math.max(0, finite(viewport.right, 16)), bottom = Math.max(0, finite(viewport.bottom, 32));
  const width = Math.max(1, finite(viewport.width, 1) - left - right), height = Math.max(1, finite(viewport.height, 1) - top - bottom);
  return { left: finite(viewport.offsetX) + Math.min(left, Math.max(0, finite(viewport.width) - 1)), top: finite(viewport.offsetY) + Math.min(top, Math.max(0, finite(viewport.height) - 1)), width, height, spanX: Math.max(0, width - Math.max(0, finite(size.width))), spanY: Math.max(0, height - Math.max(0, finite(size.height))) };
}
export function widgetPixels(position: WorkspaceWidgetPosition, viewport: WidgetViewport, size: WidgetSize) {
  const bounds = widgetBounds(viewport, size);
  return { x: bounds.left + unit(position.x) * bounds.spanX, y: bounds.top + unit(position.y) * bounds.spanY };
}
export function widgetPosition(point: { x: number; y: number }, viewport: WidgetViewport, size: WidgetSize): WorkspaceWidgetPosition {
  const bounds = widgetBounds(viewport, size);
  return { x: bounds.spanX ? unit((point.x - bounds.left) / bounds.spanX) : 0, y: bounds.spanY ? unit((point.y - bounds.top) / bounds.spanY) : 0 };
}
export function movedWidget(point: { x: number; y: number }, key: string, fine = false) {
  const distance = fine ? 24 : 24;
  return { x: point.x + (key === 'ArrowRight' ? distance : key === 'ArrowLeft' ? -distance : 0), y: point.y + (key === 'ArrowDown' ? distance : key === 'ArrowUp' ? -distance : 0) };
}
export const passedWidgetDragThreshold = (x: number, y: number) => Math.hypot(x, y) >= 5;

export type WidgetObstacle = { x:number; y:number; width:number; height:number };
/** Nearest free cell, with breathing room around every occupied surface. */
export function snapWidget(point: {x:number;y:number}, viewport:WidgetViewport, size:WidgetSize, obstacles:WidgetObstacle[], step=24) {
  const bounds=widgetBounds(viewport,size), candidates:{x:number;y:number;distance:number}[]=[];
  for(let y=0;y<=bounds.spanY;y+=step) for(let x=0;x<=bounds.spanX;x+=step){
    const cell={x:bounds.left+x,y:bounds.top+y};
    if(obstacles.some(o=>cell.x<o.x+o.width+12 && cell.x+size.width+12>o.x && cell.y<o.y+o.height+12 && cell.y+size.height+12>o.y))continue;
    candidates.push({...cell,distance:Math.hypot(cell.x-point.x,cell.y-point.y)});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  return candidates[0] ? {x:candidates[0].x,y:candidates[0].y} : null;
}
