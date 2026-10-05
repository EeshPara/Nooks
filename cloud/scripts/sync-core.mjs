/** Copy implementation only. Never imports local accounts, credentials, or demo state. */
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const source = resolve(process.argv[2] || '../notable-ai');
await cp(join(source,'ui'), resolve('ui'), {recursive:true,filter:path=>!path.includes('/node_modules/')&&!path.includes('/.env')});
for (const file of await readdir(join(source,'server'))) if (file.endsWith('.mjs')) await cp(join(source,'server',file),resolve('server',file));
for (const file of ['engine.mjs','organization.mjs','nook-creator.mjs']) {
 try { const path=resolve('server',file); const text=await readFile(path,'utf8'); await writeFile(path,text.replace("import { randomUUID } from 'node:crypto';",'const randomUUID = () => crypto.randomUUID();')); } catch(error) { if(error.code!=='ENOENT')throw error; }
}
const rewards=resolve('server/room-progress.mjs');
await writeFile(rewards,(await readFile(rewards,'utf8')).replace("import { readFileSync } from 'node:fs';", "import catalog from '../ui/src/world/room-rewards.json' with { type: 'json' };").replace("JSON.parse(readFileSync(new URL('../ui/src/world/room-rewards.json', import.meta.url), 'utf8'))",'catalog'));
const space=resolve('server/space.mjs');
await writeFile(space,(await readFile(space,'utf8')).replace("Buffer.from(encoded, 'base64')","Uint8Array.from(atob(encoded), c => c.charCodeAt(0))").replace('bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))','[137, 80, 78, 71, 13, 10, 26, 10].every((v,i)=>bytes[i]===v)').replace("bytes.subarray(0, 4).toString('ascii')","new TextDecoder().decode(bytes.subarray(0, 4))").replace("bytes.subarray(8, 12).toString('ascii')","new TextDecoder().decode(bytes.subarray(8, 12))"));
const tools=resolve('server/tools.mjs');
await writeFile(tools,(await readFile(tools,'utf8')).replace('Buffer.from(', 'btoa(').replace(".toString('base64')",''));
console.log('Copied UI and source modules only; no account data.');
