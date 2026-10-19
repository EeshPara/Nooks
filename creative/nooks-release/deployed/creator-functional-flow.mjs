/** Bounded creator-only functional flow. All transport, identities and cleanup come from the reviewed harness. */
export async function verifyCreatorFlow({users,rooms,report,api,journal,randomUUID,assert,releaseIdentity}){
 const [owner,other]=users,checks=[];report.creatorChecks=checks;
 const pass=name=>checks.push({name,passed:true});
 const draftId=randomUUID(),promptId=randomUUID();report.creatorDraftIds=[{ownerAccount:owner.account,id:draftId},{ownerAccount:owner.account,id:promptId}];await journal();
 const fields={id:draftId,title:'Private creator fixture',description:'Temporary functional check',space:{room:'rainy-library',theme:'botanical'},artworkMode:'curated',visibility:'private'};
 const saved=await api(owner,'nook_draft_save',{draft:fields,expectedRevision:0});assert(saved.draft?.id===draftId&&saved.draft.revision===1,'creator_create_failed');
 const listing=await api(owner,'nook_drafts_list');assert(listing.drafts?.length===1&&listing.drafts[0].id===draftId&&!listing.drafts[0].space,'creator_list_failed');
 const outsider=await api(other,'nook_drafts_list');assert(outsider.drafts?.length===0&&outsider.publications?.length===0,'creator_foreign_list');
 for(const tool of ['nook_draft_get','nook_draft_preview']){const denied=await api(other,tool,{draftId},404);assert(denied.error?.code==='NOT_FOUND','creator_foreign_read');}pass('private_list_and_cross_account_denial');
 const reopened=await api(owner,'nook_draft_get',{draftId});assert(reopened.draft?.revision===1&&reopened.draft.title===fields.title,'creator_reopen_failed');
 // Journal both possible create requests before either commit. A broken stale commit stops before the valid create.
 const stale={index:0,owner,members:[owner],requestId:randomUUID(),negative:true},actual={index:1,owner,members:[owner],requestId:randomUUID()};rooms.push(stale,actual);await journal();
 const prepared=await api(owner,'nook_publish_prepare',{draftId,expectedRevision:1,requestId:stale.requestId,visibility:'private',reviewed:true});assert(prepared.prepared&&prepared.publication?.status==='prepared','creator_prepare_failed');
 const updated=await api(owner,'nook_draft_save',{draft:{id:draftId,title:'Reviewed creator fixture'},expectedRevision:1});assert(updated.draft?.revision===2,'creator_update_failed');
 const conflict=await api(owner,'nook_draft_save',{draft:{id:draftId,title:'Stale overwrite'},expectedRevision:1},409);assert(conflict.error?.code==='CONFLICT','creator_save_conflict');
 const staleCommit=await api(owner,'nook_publish_commit',{intentId:prepared.publication.id,confirmed:true},409);assert(staleCommit.error?.code==='CONFLICT','creator_stale_commit');
 const preview=await api(owner,'nook_draft_preview',{draftId});assert(preview.draft?.revision===2&&preview.draft.title==='Reviewed creator fixture'&&preview.readiness?.readyToPublish===true,'creator_preview_failed');pass('reopen_revision_conflict_and_stale_publication');
 const publicSpace=Object.fromEntries(Object.entries(preview.draft.space).filter(([key])=>['name','tagline','theme','room','accent','companion','layout','decorations','backgroundImage'].includes(key)));
 publicSpace.name=preview.draft.title;publicSpace.tagline=preview.draft.description;
 await api(owner,'space_customize',{space:publicSpace});const workspace=await api(owner,'workspace');assert(workspace.workspace?.space?.name===publicSpace.name&&workspace.workspace.space.room==='rainy-library','creator_apply_failed');pass('apply_and_fresh_workspace_reopen');
 const request={draftId,expectedRevision:2,requestId:actual.requestId,visibility:'private',reviewed:true};
 const ready=await api(owner,'nook_publish_prepare',request),retry=await api(owner,'nook_publish_prepare',request);
 assert(ready.prepared&&retry.duplicate===true&&ready.publication?.id===retry.publication?.id&&ready.publication.visibility==='private','creator_prepare_idempotency');
 const published=await api(owner,'nook_publish_commit',{intentId:ready.publication.id,confirmed:true});
 assert(/^[a-f0-9-]{36}$/.test(published.nookId??'')&&published.publication?.status==='published','creator_commit_failed');actual.id=published.nookId;await journal();
 const duplicate=await api(owner,'nook_publish_commit',{intentId:ready.publication.id,confirmed:true});assert(duplicate.duplicate===true&&duplicate.nookId===actual.id,'creator_commit_idempotency');
 const snapshot=await api(owner,'nook_snapshot',{nookId:actual.id});assert(snapshot.nook?.visibility==='private'&&snapshot.nook.title==='Reviewed creator fixture'&&snapshot.nook.roomId==='rainy-library'&&snapshot.memberCount===1,'creator_published_snapshot');
 const denied=await api(other,'nook_snapshot',{nookId:actual.id},403);assert(denied.error?.code==='FORBIDDEN','creator_private_room_denial');pass('private_publication_idempotency_and_isolation');
 const edited=await api(owner,'nook_draft_save',{draft:{id:draftId,title:'Unpublished later draft'},expectedRevision:2});assert(edited.draft?.revision===3,'creator_post_publish_edit');
 await api(owner,'nook_draft_delete',{draftId,expectedRevision:3});const gone=await api(owner,'nook_draft_get',{draftId},404);assert(gone.error?.code==='NOT_FOUND','creator_deleted_reopen');
 const remains=await api(owner,'nook_snapshot',{nookId:actual.id});assert(remains.nook?.title==='Reviewed creator fixture'&&remains.memberCount===1,'creator_published_snapshot_changed');
 const receipts=await api(owner,'nook_drafts_list');assert(receipts.drafts?.length===0&&receipts.publications?.some(item=>item.id===ready.publication.id&&item.nookId===actual.id&&item.status==='published'),'creator_publication_receipt_lost');pass('draft_delete_preserves_published_snapshot');
 const prompt=await api(owner,'nook_draft_save',{draft:{id:promptId,title:'Prompt-only fixture',artworkMode:'chatgpt',scenePrompt:'A quiet reading desk',space:{room:'rainy-library'},visibility:'private'},expectedRevision:0});
 assert(prompt.draft?.revision===1,'creator_prompt_save');const blocked=await api(owner,'nook_draft_preview',{draftId:promptId});
 assert(blocked.readiness?.readyToPublish===false&&['IMAGE_NOT_RECEIVED','CUSTOM_PUBLICATION_UNAVAILABLE'].every(code=>blocked.readiness.blockers.some(row=>row.code===code)),'creator_prompt_blockers');
 const requestId=randomUUID(),artArgs={draftId:promptId,expectedRevision:1,requestId};const art=await api(owner,'nook_artwork_request',artArgs),artRetry=await api(owner,'nook_artwork_request',artArgs);
 assert(art.artworkRequest?.status==='pending'&&art.requestId===artRetry.requestId&&artRetry.duplicate===true,'creator_artwork_request_retry');
 const cancelArgs={draftId:promptId,requestId:art.requestId};const canceled=await api(owner,'nook_artwork_cancel',cancelArgs),cancelRetry=await api(owner,'nook_artwork_cancel',cancelArgs);
 assert(canceled.artworkRequest?.status==='canceled'&&cancelRetry.duplicate===true,'creator_artwork_cancel_retry');
 await api(owner,'nook_draft_delete',{draftId:promptId,expectedRevision:1});pass('prompt_only_artwork_request_cancel_no_pixels');
 const final=await api(owner,'nook_drafts_list');assert(final.drafts?.length===0,'creator_final_drafts');
 report.releaseEnd=await releaseIdentity();assert(JSON.stringify(report.releaseStart)===JSON.stringify(report.releaseEnd),'release_changed_inconclusive');
 report.creatorIntegrity={checks:checks.length,actualPrivateRooms:1,plannedCreateIntents:2,privateDraftsRemaining:0,noImageBytesSubmitted:true,noEmailOrWebSockets:true,releaseUnchanged:true};
}
