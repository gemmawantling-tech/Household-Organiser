import {test} from 'node:test';
import assert from 'node:assert/strict';
import {digest,validate,processRules,ruleTarget} from '../scripts/deploy-rules.js';
const old='old rules', source='tested new rules', prefix='projects/home-organised';
function mock({changed=false,fail=false}={}) {
  const calls=[];let releaseReads=0;
  return {calls,request:async(url,options)=>{
    calls.push({url,...options});
    if(fail)return {ok:false,status:403,text:async()=>'denied secret-token'};
    let data;
    if(options.method==='POST')data={name:`${prefix}/rulesets/new`};
    else if(options.method==='PATCH')data={};
    else if(url.endsWith('/releases/cloud.firestore'))data={rulesetName:`${prefix}/rulesets/${changed && releaseReads++?'changed':'old'}`};
    else data={source:{files:[{name:'firestore.rules',content:old}]}};
    return {ok:true,json:async()=>data};
  }};
}
const args={operation:'verify',source,token:'secret-token'};
test('verification only reads Rules API',async()=>{const m=mock(),r=await processRules({...args,...m});assert.equal(r.liveHash,digest(old));assert.equal(r.deployed,false);assert.equal(m.calls.length,2);assert.ok(m.calls.every(c=>c.method==='GET' && c.url.startsWith('https://firebaserules.googleapis.com/v1/projects/home-organised/')));});
test('deploy requires hash and refuses changed live rules before writing',async()=>{assert.throws(()=>validate('deploy',''),/Run verify/);const m=mock();await assert.rejects(processRules({...args,...m,operation:'deploy',expected:digest('different')}),/changed since/);assert.ok(m.calls.every(c=>c.method==='GET'));});
test('publish switches only the Firestore release after saving a new ruleset',async()=>{const m=mock(),r=await processRules({...args,...m,operation:'deploy',expected:digest(old)});assert.equal(r.deployed,true);assert.deepEqual(m.calls.map(c=>c.method),['GET','GET','POST','GET','PATCH']);assert.deepEqual(JSON.parse(m.calls[2].body),{source:{files:[{name:'firestore.rules',content:source}]}});assert.equal(JSON.parse(m.calls[4].body).release.rulesetName,`${prefix}/rulesets/new`);});
test('refuses release changed while deployment was running',async()=>{const m=mock({changed:true});await assert.rejects(processRules({...args,...m,operation:'deploy',expected:digest(old)}),/changed during/);assert.ok(!m.calls.some(c=>c.method==='PATCH'));});
test('API errors stop deployment and redact token',async()=>{const m=mock({fail:true});await assert.rejects(processRules({...args,...m}),e=>e.message.includes('403')&&!e.message.includes('secret-token'));assert.equal(m.calls.length,1);});

test('Storage verification and deployment use only the configured bucket release and source',async()=>{
 const calls=[];const request=async(url,options)=>{calls.push({url,...options});const data=options.method==='POST'?{name:`${prefix}/rulesets/storage-new`}:url.includes('/releases/')?{rulesetName:`${prefix}/rulesets/storage-old`}:url.endsWith('/rulesets/storage-old')?{source:{files:[{name:'storage.rules',content:old}]}}:{};return {ok:true,json:async()=>data};};
 const result=await processRules({...args,target:'storage',operation:'deploy',expected:digest(old),request});assert.equal(result.deployed,true);
 assert.deepEqual(calls.map(c=>c.method),['GET','GET','POST','GET','PATCH']);
 assert.equal(calls[0].url,`https://firebaserules.googleapis.com/v1/${prefix}/releases/firebase.storage/home-organised.firebasestorage.app`);
 assert.equal(JSON.parse(calls[2].body).source.files[0].name,'storage.rules');
 assert.equal(JSON.parse(calls[4].body).release.name,`${prefix}/releases/firebase.storage/home-organised.firebasestorage.app`);
 assert.ok(calls.every(c=>!c.url.includes('cloud.firestore')));
});
test('unknown rule targets are rejected before any request',async()=>{assert.throws(()=>ruleTarget('other'),/Choose/);await assert.rejects(processRules({...args,target:'other',request:()=>{throw Error('Unexpected request')}}),/Choose/);assert.equal(ruleTarget().file,'firestore.rules');});
