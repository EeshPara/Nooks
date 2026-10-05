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
  const distance = fine ? 1 : 10;
  return { x: point.x + (key === 'ArrowRight' ? distance : key === 'ArrowLeft' ? -distance : 0), y: point.y + (key === 'ArrowDown' ? distance : key === 'ArrowUp' ? -distance : 0) };
}
export const passedWidgetDragThreshold = (x: number, y: number) => Math.hypot(x, y) >= 5;
