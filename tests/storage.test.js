import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc} from 'firebase/firestore';
import {ref,uploadBytes,getBytes,deleteObject,updateMetadata} from 'firebase/storage';
let env;
const path='households/shared/events/birthday/11111111-1111-4111-8111-111111111111';
function storage(uid,verified=true){return uid?env.authenticatedContext(uid,{email_verified:verified,email:`${uid}@example.com`}).storage():env.unauthenticatedContext().storage()}
const upload=(s,p=path,type='application/pdf',size=8)=>uploadBytes(ref(s,p),new Uint8Array(size),{contentType:type});
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-household-organiser',storage:{rules:readFileSync('storage.rules','utf8')},firestore:{rules:readFileSync('firestore.rules','utf8')}});
  await env.withSecurityRulesDisabled(async context=>{
    for(const uid of ['gemma','ben'])await setDoc(doc(context.firestore(),'households','shared','members',uid),{uid});
    await setDoc(doc(context.firestore(),'households','other','members','outsider'),{uid:'outsider'});
  });
});
after(async()=>env?.cleanup());
test('both verified members can upload and download private attachments',async()=>{
  await assertSucceeds(upload(storage('gemma')));
  await assertSucceeds(getBytes(ref(storage('ben'),path)));
  await assertSucceeds(upload(storage('ben'),path.replace('11111111-','22222222-'),'image/png'));
});
test('anonymous, unverified and other-household accounts cannot access files',async()=>{
  for(const s of [storage(),storage('gemma',false),storage('outsider')]){
    await assertFails(getBytes(ref(s,path)));
    await assertFails(upload(s,path.replace('11111111-','33333333-')));
    await assertFails(deleteObject(ref(s,path)));
  }
});
test('deny active types, oversize, empty, arbitrary paths and object replacement',async()=>{
  const s=storage('gemma'),fresh=path.replace('11111111-','44444444-');
  for(const type of ['text/html','image/svg+xml','application/octet-stream'])await assertFails(upload(s,fresh,type));
  await assertFails(upload(s,fresh,'application/pdf',10485761));
  await assertFails(upload(s,fresh,'application/pdf',0));
  await assertFails(upload(s,'public/ticket.pdf'));
  await assertFails(upload(s,'households/other/events/party/55555555-5555-4555-8555-555555555555'));
  await assertFails(upload(s,path,'application/pdf',9));
  await assertFails(updateMetadata(ref(s,path),{contentType:'text/html'}));
});
test('a second household member can clean up an attachment',async()=>{
  await assertSucceeds(deleteObject(ref(storage('ben'),path)));
});
