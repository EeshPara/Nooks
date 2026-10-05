export const mode: 'browser-preview';
export function callPreviewTool(name: string, args?: Record<string, unknown>): Promise<Record<string, any>>;
export function createPreviewTools(options?: { store?: unknown; clock?: () => Date }): (name: string, args?: Record<string, unknown>) => Promise<Record<string, any>>;
