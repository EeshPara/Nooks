import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from '../../../server/seed.mjs';
import { createTutorialTools } from './tutorial-tools.mjs';
const unwrap=result=>result.structuredContent??result;

test('practice writes change only the private memory copy; another tour starts clean',async()=>{
 const saved=createWorkspace(new Date().toISOString());
 saved.revision=0;
 const before=structuredClone(saved);
 const practice=createTutorialTools(saved);
 const first=unwrap(await practice('workspace_get'));
 const nextTasks=[...first.workspace.plan.tasks,{id:crypto.randomUUID(),title:'Temporary tour task',subject:'Personal',done:false}];
 const result=unwrap(await practice('plan_save',{expectedRevision:first.workspace.revision,plan:{tasks:nextTasks}}));
 assert.equal(result.workspace.plan.tasks.at(-1).title,'Temporary tour task');
 assert.deepEqual(saved,before);
 const fresh=unwrap(await createTutorialTools(saved)('workspace_get'));
 assert.deepEqual(fresh.workspace.plan.tasks,before.plan.tasks);
});

test('practice cannot publish, generate artwork, or create real share links',async()=>{
 const practice=createTutorialTools(createWorkspace(new Date().toISOString()));
 for(const operation of ['nook_publish_commit','nook_artwork_request','library_share_create','space_share'])await assert.rejects(()=>practice(operation,{}));
});
