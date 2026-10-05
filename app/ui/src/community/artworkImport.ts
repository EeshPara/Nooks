export type ArtworkFile = { fileId: string; downloadUrl: string; mimeType?: string; fileName?: string };
export const ARTWORK_FILE_ORIGINS: readonly string[] = ['https://files.oaiusercontent.com', 'https://sdmntprwestus.oaiusercontent.com', 'https://sdmntprcentralus.oaiusercontent.com'];
const MAX_BYTES = 12_000_000, MAX_EDGE = 8192, MAX_PIXELS = 32_000_000;
const imageTypes = ['image/png', 'image/jpeg', 'image/webp'];
class ArtworkImportError extends Error {}

/** Download addresses are temporary capabilities, never general-purpose URLs. */
export function authorizedArtworkUrl(value: string, origins: readonly string[] = ARTWORK_FILE_ORIGINS): string {
  let url: URL;
  try { if (typeof value !== 'string' || value.length > 8192) throw new ArtworkImportError(); url = new URL(value); } catch { throw new ArtworkImportError('ChatGPT did not provide a supported image download.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !origins.includes(url.origin)) throw new ArtworkImportError('ChatGPT did not provide a supported image download.');
  return url.href;
}
export function inspectArtworkBytes(bytes: Uint8Array, claimedMime = '') {
  if (!bytes.length || bytes.length > MAX_BYTES) throw new ArtworkImportError('Choose an image up to 12 MB.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, count: number) => new TextDecoder().decode(bytes.subarray(offset, offset + count));
  let mime = '', width = 0, height = 0;
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte) && text(12, 4) === 'IHDR') {
    mime = 'image/png'; width = view.getUint32(16); height = view.getUint32(20);
  } else if (bytes.length >= 30 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP') {
    mime = 'image/webp'; const chunk = text(12, 4);
    if (chunk === 'VP8X') { width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536; height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536; }
    else if (chunk === 'VP8L' && bytes[20] === 47) { const bits = view.getUint32(21, true); width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; }
    else if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) { width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff; }
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    mime = 'image/jpeg'; let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++]; if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (offset + 1 >= bytes.length) break;
      const length = view.getUint16(offset); if (length < 2 || offset + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) { height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break; }
      offset += length;
    }
  }
  const claimed = claimedMime.split(';')[0].trim().toLowerCase();
  if (!mime || claimed && claimed !== 'application/octet-stream' && claimed !== mime) throw new ArtworkImportError('Choose a valid PNG, JPG, or WebP image.');
  if (!width || !height || width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) throw new ArtworkImportError('This image is too large to prepare safely. Choose an image up to 8192 pixels per side and 32 megapixels.');
  return { mime, width, height };
}
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new ArtworkImportError('Image import stopped. Retry when you are ready.'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export async function importArtworkFile(file: ArtworkFile, options: {
  getDownloadUrl: (fileId: string) => Promise<string | null>;
  optimize: (file: File) => Promise<string>;
  signal?: AbortSignal; origins?: readonly string[]; fetchImpl?: typeof fetch; timeoutMs?: number;
}): Promise<string> {
  const controller = new AbortController(), abort = () => controller.abort();
  const timeout = setTimeout(abort, options.timeoutMs ?? 30_000);
  options.signal?.addEventListener('abort', abort, { once: true }); if (options.signal?.aborted) abort();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if (!file.fileId || typeof file.fileId !== 'string' || file.fileId.length > 512) throw new ArtworkImportError('ChatGPT did not provide a supported image file.');
    // A missing helper may use the original authorized handoff. An available
    // helper's refusal must never fall back to an older signed capability.
    const refreshed = await untilAborted(options.getDownloadUrl(file.fileId), controller.signal);
    const url = authorizedArtworkUrl(refreshed ?? file.downloadUrl, options.origins);
    const response = await untilAborted((options.fetchImpl ?? fetch)(url, { signal: controller.signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' }), controller.signal);
    if (!response.ok || response.redirected || !response.body) throw new ArtworkImportError('The image could not be downloaded. Retry to refresh its link.');
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_BYTES) throw new ArtworkImportError('Choose an image up to 12 MB.');
    const mime = response.headers.get('content-type') ?? file.mimeType ?? '';
    reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const next = await untilAborted(reader.read(), controller.signal); if (next.done) break;
      size += next.value.byteLength; if (size > MAX_BYTES) throw new ArtworkImportError('Choose an image up to 12 MB.');
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const image = inspectArtworkBytes(bytes, mime);
    if (file.mimeType && imageTypes.includes(file.mimeType) && image.mime !== file.mimeType) throw new ArtworkImportError('The image type did not match its file. Try selecting it again.');
    const prepared = await untilAborted(options.optimize(new File([bytes], `nook-artwork.${image.mime === 'image/jpeg' ? 'jpg' : image.mime.slice(6)}`, { type: image.mime })), controller.signal);
    if (!/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(prepared) || prepared.length > 1_048_576) throw new ArtworkImportError('This image could not be prepared safely. Try another image.');
    if (controller.signal.aborted) throw new ArtworkImportError('Image import stopped. Retry when you are ready.');
    return prepared;
  } catch (error) {
    if (error instanceof ArtworkImportError) throw error;
    throw new ArtworkImportError('The image could not be imported. Retry to check its file access and download link.');
  } finally {
    clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); controller.abort();
    if (reader) void reader.cancel().catch(() => { /* The download may already be closed. */ });
  }
}
