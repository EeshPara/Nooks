"""Run with a Python environment containing Playwright and --chromium PATH.
All requests are intercepted locally. No server, account, or deployment is used.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--chromium', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
checks = []

def routes(route):
    path = urlparse(route.request.url).path
    if path == '/':
        route.fulfill(status=200, content_type='text/html', body='<html><body>Isolated browser storage regression</body></html>')
        return
    file = (root / path.lstrip('/')).resolve()
    if not file.is_relative_to(root) or file.suffix not in ('.mjs', '.json') or not file.is_file():
        route.fulfill(status=404, body='Not found')
        return
    route.fulfill(status=200, content_type='application/json' if file.suffix == '.json' else 'text/javascript', body=file.read_text())

def prepare(page):
    page.goto('https://nooks-preview.test/')
    page.evaluate("""async () => {
      window.module = await import('/ui/src/preview/browser-tools.mjs');
      window.storeModule = await import('/ui/src/preview/browser-store.mjs');
      window.call = module.createPreviewTools();
      window.check = (value, message) => { if (!value) throw new Error(message); };
    }""")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=args.chromium)
    try:
        alice = browser.new_context()
        alice.route('https://nooks-preview.test/**', routes)
        page = alice.new_page()
        prepare(page)
        page.evaluate("""async () => {
          const first = await call('workspace_get');
          check(first.mode === 'browser-preview' && first.authenticated === false, 'Truthful preview mode');
          check(first.workspace.backend === 'browser-preview', 'No production backend claim');
          const {artifact} = await call('artifact_save', {artifact:{id:'friend-note',kind:'note',title:'Private browser note',content:'Only in this browser.'}});
          window.saved = artifact;
          const cleared = await call('artifact_save',{artifact:{...artifact,content:''}});
          check(cleared.artifact.content === '' && cleared.artifact.revision === 2, 'Empty note persists');
          const draftId = crypto.randomUUID();
          const draft = await call('nook_draft_save',{expectedRevision:0,draft:{id:draftId,title:'My browser nook',description:'Private draft',space:{room:'rainy-library'},visibility:'private'}});
          check(draft.draft.revision === 1, 'Versioned private draft saves');
          const before = (await call('workspace_get')).workspace.revision;
          for (const name of ['space_share','space_share_get','nook_publish_prepare','nook_publish_commit']) {
            try { await call(name,{}); throw new Error('Unexpected public capability'); }
            catch(error) { check(error.code === 'FEATURE_UNAVAILABLE', 'Public action fails honestly: ' + name); }
          }
          check((await call('workspace_get')).workspace.revision === before, 'Unavailable sharing did not mutate data');
        }""")
        checks.append('Private notes, empty autosave, and creator drafts save; public sharing cannot create fake links')
        prepare(page)
        page.evaluate("""async () => {
          const note = await call('artifact_get',{artifactId:'friend-note'});
          check(note.artifact.content === '' && note.artifact.revision === 2, 'Reload retained empty note');
          check((await call('artifact_get',{artifactId:'friend-note',revision:1})).artifact.content === 'Only in this browser.', 'Reload retained history');
          check((await call('nook_drafts_list')).drafts.length === 1, 'Reload retained draft');
        }""")
        checks.append('Page reload retains notes, revisions, and private nook drafts')
        bob = browser.new_context()
        bob.route('https://nooks-preview.test/**', routes)
        other = bob.new_page()
        prepare(other)
        other.evaluate("""async () => {
          check(!(await call('workspace_get')).workspace.artifacts.some(item => item.id === 'friend-note'), 'Fresh browser must not read another browser');
          check((await call('nook_drafts_list')).drafts.length === 0, 'Fresh browser must not inherit drafts');
        }""")
        checks.append('Separate browser contexts have isolated workspaces')
        page.evaluate("""async () => {
          const left = module.createPreviewTools(), right = module.createPreviewTools();
          const results = await Promise.all([
            left('course_save',{course:{title:'Biology'}}),
            right('course_save',{course:{title:'Chemistry'}}),
          ]);
          check(results[0].workspace.revision !== results[1].workspace.revision, 'Concurrent commits advance unique workspace revisions');
          const courses = (await call('workspace_get')).workspace.organization.courses;
          check(courses.some(item => item.title === 'Biology') && courses.some(item => item.title === 'Chemistry'), 'Neither concurrent addition is lost');
          const edits = await Promise.allSettled([
            left('note_update',{artifactId:'friend-note',expectedRevision:2,content:'First edit'}),
            right('note_update',{artifactId:'friend-note',expectedRevision:2,content:'Second edit'}),
          ]);
          check(edits.filter(item=>item.status==='fulfilled').length === 1, 'Only one competing edit commits');
          check(edits.find(item=>item.status==='rejected').reason.code === 'REVISION_CONFLICT', 'Stale edit fails safely');
        }""")
        checks.append('Independent IndexedDB connections retain concurrent additions and reject stale note edits')
        page.evaluate("""async () => {
          const before = (await call('artifact_get',{artifactId:'friend-note'})).artifact;
          const put = IDBObjectStore.prototype.put;
          IDBObjectStore.prototype.put = function(){ throw new DOMException('Injected quota failure','QuotaExceededError'); };
          try {
            await call('artifact_save',{artifact:{...before,content:'This must not overwrite the saved version'}});
            throw new Error('Unexpected successful quota-limited write');
          } catch(error) { check(error.code === 'STORAGE_FULL', 'Quota failure is reported'); }
          finally { IDBObjectStore.prototype.put = put; }
          const after = (await module.createPreviewTools()('artifact_get',{artifactId:'friend-note'})).artifact;
          check(JSON.stringify(before) === JSON.stringify(after), 'Failed transaction preserved prior committed data');
          const unavailable = module.createPreviewTools({store:new storeModule.BrowserPreviewStore({indexedDB:null})});
          try { await unavailable('workspace_get'); throw new Error('Unexpected storage fallback'); }
          catch(error) { check(error.code === 'STORAGE_UNAVAILABLE', 'Unavailable storage cannot fake persistence'); }
        }""")
        checks.append('Storage failures preserve committed notes and never fall back to pretend persistence')
        page.evaluate("""async () => {
          const store = new storeModule.BrowserPreviewStore({database:'corrupt-preview-test'});
          const database = await store.open();
          await new Promise((resolve,reject)=>{
            const tx=database.transaction('private-workspace','readwrite');
            tx.objectStore('private-workspace').put({version:99},'workspace');
            tx.oncomplete=resolve;tx.onabort=reject;
          });
          try { await module.createPreviewTools({store})('workspace_get'); throw new Error('Unexpected reset'); }
          catch(error) { check(error.code === 'STORAGE_INVALID', 'Corrupt data fails closed'); }
          const retained = await new Promise(resolve=>{const req=database.transaction('private-workspace').objectStore('private-workspace').get('workspace');req.onsuccess=()=>resolve(req.result);});
          check(retained.version===99, 'Corrupt data was not silently reset');
        }""")
        checks.append('Unreadable browser data is preserved for recovery instead of reset')
        print(json.dumps({'status':'pass','checks':checks}, indent=2))
    finally:
        browser.close()
