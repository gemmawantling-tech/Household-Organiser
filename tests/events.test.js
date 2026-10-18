import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../events.js';
const {occurs,between,validateFile,patchEvent}=globalThis.HouseholdEvents;
test('legacy events retain single-date behaviour and notes',()=>{
  const events=[{id:'old',title:'Booking',date:'2026-10-18',note:'Keep me',unknown:'preserve'}];
  assert.equal(occurs(events[0],'2026-10-18'),true);
  assert.equal(occurs(events[0],'2027-10-18'),false);
  assert.equal(between(events,'2026-10-18','2026-10-25')[0].note,'Keep me');
  const updated=patchEvent(events,'old',{location:'London'});
  assert.equal(updated[0].unknown,'preserve');assert.equal(events[0].location,undefined);
});
test('weekly recurrence crosses DST and year boundaries without earlier occurrences',()=>{
  const e={date:'2026-10-18',repeat:'weekly'};
  for(const day of ['2026-10-25','2026-11-01','2027-01-03'])assert.ok(occurs(e,day));
  assert.equal(occurs(e,'2026-10-11'),false);assert.equal(occurs(e,'2026-10-26'),false);
});
test('monthly recurrence clamps short months and returns to anchor day',()=>{
  const e={date:'2026-01-31',repeat:'monthly'};
  for(const day of ['2026-02-28','2026-03-31','2026-04-30','2028-02-29'])assert.ok(occurs(e,day));
  assert.equal(occurs(e,'2026-03-28'),false);
});
test('yearly birthdays and anniversaries include leap-day fallback',()=>{
  assert.ok(occurs({date:'2024-02-29',repeat:'yearly'},'2025-02-28'));
  assert.ok(occurs({date:'2024-02-29',repeat:'yearly'},'2028-02-29'));
  assert.equal(occurs({date:'2024-02-29',repeat:'yearly'},'2028-02-28'),false);
  assert.ok(occurs({date:'2000-10-18',repeat:'yearly'},'2026-10-18'));
  assert.equal(occurs({date:'2026-02-30',repeat:'weekly'},'2026-03-09'),false);
});
test('windows show recurring occurrences without mutating or duplicating saved events',()=>{
  const events=[{id:'a',date:'2020-10-18',repeat:'yearly',title:'Birthday'}];
  const original=JSON.stringify(events),list=between(events,'2026-10-01','2026-12-30');
  assert.equal(list.length,1);assert.equal(list[0].date,'2026-10-18');assert.equal(list[0].seriesDate,'2020-10-18');assert.equal(JSON.stringify(events),original);
});
test('attachment and field patches preserve other events, unknown fields and concurrent attachments',()=>{
  const events=[{id:'a',title:'A',extra:42,attachments:[{objectId:'first'}]},{id:'b',title:'B'}];
  const result=patchEvent(events,'a',{title:'Edited'},{objectId:'second'});
  assert.equal(result[0].extra,42);assert.equal(result[1],events[1]);assert.equal(result[0].attachments.length,2);
  assert.throws(()=>patchEvent(events,'deleted',{},{}),/removed/);
});
test('file validation restricts active content, empty and oversized uploads',()=>{
  for(const type of ['application/pdf','image/png','image/jpeg','image/webp'])assert.ok(validateFile({type,size:10*1024*1024}));
  for(const file of [{type:'text/html',size:10},{type:'image/svg+xml',size:10},{type:'application/pdf',size:0},{type:'application/pdf',size:10485761}])assert.throws(()=>validateFile(file));
});
test('a stale task edit preserves concurrent events, attachments and other task edits',()=>{
  const base={events:[{id:'a',title:'A'}],completed:{one:false,two:false},custom:{}};
  const current={...base,events:[{id:'a',title:'A',attachments:[{objectId:'ticket'}]},{id:'b',title:'New'}],completed:{one:false,two:true},unknown:42};
  const next={...base,completed:{one:true,two:false}};
  const merged=HouseholdEvents.mergeChanges(current,base,next);
  assert.equal(merged.events,current.events);assert.deepEqual(merged.completed,{one:true,two:true});assert.equal(merged.unknown,42);
});
