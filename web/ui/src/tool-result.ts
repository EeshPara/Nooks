export type ToolData = Record<string, any>;
const record = (value: unknown): value is ToolData => !!value && typeof value === 'object' && !Array.isArray(value);

/** Private widget metadata carries the complete workspace, outside model context. */
export function readToolResult(result: unknown): ToolData {
 if (!record(result)) return {};
 if (result.isError) throw Object.assign(new Error(result.structuredContent?.error?.message || (Array.isArray(result.content) ? result.content.find((item:any) => item?.type === 'text')?.text : undefined) || 'This study action could not be completed.'), { code: result.structuredContent?.error?.code, currentRevision: result.structuredContent?.error?.currentRevision, retryAfter: result.structuredContent?.error?.retryAfter });
 const visible = record(result.structuredContent) ? result.structuredContent : result;
 const privateData = record(result._meta?.notableData) ? result._meta.notableData : {};
 const value = { ...visible, ...privateData };
 if (value.error) throw Object.assign(new Error(typeof value.error === 'string' ? value.error : value.error.message || 'This study action could not be completed.'), {code:value.error?.code,currentRevision:value.error?.currentRevision,retryAfter:value.error?.retryAfter});
 return value;
}

export function readLegacyToolResult(output: unknown, metadata: unknown): ToolData | undefined {
 if (!record(output)) return undefined;
 // Legacy hosts expose _meta separately from toolOutput.
 return readToolResult({ structuredContent:readToolResult(output), _meta:record(metadata) ? metadata : {} });
}

/** A fresh output must never be paired with private data from a previous result. */
export function readLegacyToolUpdate(globals: unknown, current: unknown): ToolData | undefined {
 if (!record(globals)) return undefined;
 const hasOutput = Object.hasOwn(globals, 'toolOutput');
 const hasMetadata = Object.hasOwn(globals, 'toolResponseMetadata');
 if (!hasOutput && !hasMetadata) return undefined;
 const output = hasOutput ? globals.toolOutput : record(current) ? current.toolOutput : undefined;
 const metadata = hasMetadata ? globals.toolResponseMetadata : undefined;
 return readLegacyToolResult(output, metadata);
}
