// Isolated browser integration: Firebase SDK calls are mocked; no live project access.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const seed={custom:{'2026-10-18|Today\'s Jobs':[{id:'keep-task',text:'Keep task'}]},completed:{keep:true},shopping:{},removed:{},starred:{},owners:{},events:[{id:'legacy',title:'Legacy booking',date:'2026-10-18',note:'Original notes',unknown:'keep'},{id:'birthday',title:'Birthday',date:'2000-10-18',repeat:'yearly'}]};
const firestore=`
const clone=x=>JSON.parse(JSON.stringify(x));
globalThis.mockData=${JSON.stringify(seed)};
let listener;
const snapshot=()=>({exists:()=>true,data:()=>({data:clone(mockData)})});
export const getFirestore=()=>({});
export const doc=(...args)=>({parts:args.slice(1)});
export const serverTimestamp=()=>0;
export async function getDoc(ref){return ref.parts[0]==='profiles'?{exists:()=>true,data:()=>({householdId:'shared'})}:snapshot()}
export const setDoc=()=>{throw Error('Unexpected overwrite')};
export function onSnapshot(ref,callback){listener=callback;callback(snapshot());return()=>{listener=null}}
export async function runTransaction(db,fn){const result=await fn({get:async()=>snapshot(),update:(ref,patch)=>{if(patch['data.events'])mockData.events=clone(patch['data.events']);if(patch.data)mockData=clone(patch.data)},set:()=>{throw Error('Unexpected creation')}});listener?.(snapshot());return result}
`;
const auth=`export const getAuth=()=>({currentUser:{uid:'gemma',emailVerified:true}});export const onAuthStateChanged=(auth,fn)=>fn(auth.currentUser);export const signInWithEmailAndPassword=()=>{},createUserWithEmailAndPassword=()=>{},sendEmailVerification=()=>{},sendPasswordResetEmail=()=>{},signOut=()=>{},reload=()=>{};`;
const storage=`export const getStorage=()=>({});export const ref=(s,path)=>({fullPath:path});globalThis.mockFiles=new Map();export const uploadBytes=async(ref,file)=>{mockFiles.set(ref.fullPath,file)};export const getBlob=async ref=>mockFiles.get(ref.fullPath);export const deleteObject=async ref=>mockFiles.delete(ref.fullPath);`;
test('mobile event and dated carry-over flows preserve shared tasks and attachments',async()=>{
  const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=path==='/'?'index.html':path.slice(1);if(!['index.html','events.js','tasks.js','invitation.js'].includes(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(file));}catch{res.writeHead(500).end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url.startsWith('http://127.0.0.1:'))return route.continue();
      const file=url.split('/').pop();
      const body={'firebase-app.js':'export const initializeApp=()=>({});','firebase-auth.js':auth,'firebase-firestore.js':firestore,'firebase-storage.js':storage}[file];
      return body?route.fulfill({contentType:'text/javascript',body}):route.abort();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#householdApp').waitFor({state:'visible',timeout:5000}).catch(async error=>{throw Error(JSON.stringify({errors,message:await page.locator('#authMessage').textContent()})+' '+error.message)});
    await page.locator('#datePicker').fill('2026-10-18');await page.locator('#datePicker').dispatchEvent('change');
    await page.locator('#events').getByRole('button',{name:'Legacy booking',exact:true}).click();
    assert.equal(await page.locator('#editNote').inputValue(),'Original notes');
    await page.locator('#editLocation').fill('Town Hall');await page.locator('#editNote').fill('Bring tickets');await page.locator('#editBooking').fill('Reference ABC123');await page.locator('#eventRepeat').selectOption('monthly');
    await page.locator('#editor').getByRole('button',{name:'Save',exact:true}).click();
    await page.locator('#modal').waitFor({state:'hidden'});
    let data=await page.evaluate(()=>mockData);
    assert.equal(data.events[0].unknown,'keep');assert.equal(data.events[0].booking,'Reference ABC123');assert.deepEqual(data.custom,seed.custom);assert.deepEqual(data.completed,seed.completed);
    await page.locator('#events').getByRole('button',{name:'Legacy booking',exact:true}).click();
    await page.locator('#eventFile').setInputFiles({name:'ticket.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 ticket')});
    await page.locator('#uploadAttachment').click();
    await page.getByText('Attachment saved and shared.',{exact:true}).waitFor();
    const downloadPromise=page.waitForEvent('download');await page.locator('#attachmentList').getByRole('button',{name:'ticket.pdf'}).click();
    const download=await downloadPromise;assert.equal(download.suggestedFilename(),'ticket.pdf');
    assert.equal((await page.evaluate(()=>mockData.events[0].attachments)).length,1);
    await page.locator('#cancelEdit').click();
    await page.locator('#datePicker').fill('2026-11-18');await page.locator('#datePicker').dispatchEvent('change');
    await page.locator('#events').getByRole('button',{name:'Legacy booking',exact:true}).click();
    assert.equal(await page.locator('#editDate').inputValue(),'2026-10-18');assert.equal(await page.locator('#editBooking').inputValue(),'Reference ABC123');
    await page.locator('#cancelEdit').click();
    await page.locator('#eventAdd').click();assert.equal(await page.locator('#uploadAttachment').isDisabled(),true);
    await page.locator('#editText').fill('Anniversary');await page.locator('#eventRepeat').selectOption('yearly');
    await page.locator('#editor').getByRole('button',{name:'Save',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
    data=await page.evaluate(()=>mockData);assert.equal(data.events.length,3);assert.equal(data.events[2].repeat,'yearly');
    // A rejected write keeps the form and original server event intact.
    await page.locator('#events').getByRole('button',{name:'Anniversary',exact:true}).click();
    await page.evaluate(()=>{householdSync.saveEvent=async()=>{throw Error('Offline')}});
    await page.locator('#editText').fill('Unsaved');await page.locator('#editor').getByRole('button',{name:'Save',exact:true}).click();
    await page.getByText('Could not save: Offline',{exact:true}).waitFor();
    assert.equal(await page.locator('#modal').isVisible(),true);assert.equal((await page.evaluate(()=>mockData)).events[2].title,'Anniversary');
    await page.locator('#cancelEdit').click();
    // Simulate a remote event arriving before this phone has seen its snapshot.
    await page.evaluate(()=>mockData.events.push({id:'remote',title:'Other phone',date:'2026-11-18'}));
    await page.locator('#shoppingInput').fill('Milk');await page.locator('#shoppingForm').getByRole('button',{name:'Add',exact:true}).click();
    await page.getByText('✓ Saved and shared',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>mockData.events.some(e=>e.id==='remote')),true);
    assert.deepEqual(await page.evaluate(()=>mockData.custom),seed.custom);
    await page.locator('#events').getByRole('button',{name:'Anniversary',exact:true}).click();
    page.once('dialog',dialog=>dialog.accept());await page.locator('#deleteEvent').click();await page.locator('#modal').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>mockData.events.some(e=>e.title==='Anniversary')),false);
    assert.equal(await page.evaluate(()=>mockData.events.some(e=>e.id==='remote')),true);
    // Dated jobs carry into today using the same original completion/owner keys.
    await page.locator('#todayBtn').click();
    const today=await page.locator('#datePicker').inputValue();
    const yesterday=await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
    await page.locator('#focusAdd').click();await page.locator('#editText').fill('Book carry-over dentist');await page.locator('#editDate').fill(yesterday);await page.locator('#editOwner').selectOption('Ben');
    await page.locator('#editor').getByRole('button',{name:'Save',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
    await page.getByText('✓ Saved and shared',{exact:true}).waitFor();
    await page.locator('#todayBtn').click();
    let row=page.locator('#focusItems .task').filter({hasText:'Book carry-over dentist'});
    assert.equal(await row.count(),1);assert.match(await row.textContent(),/Carried over/);assert.equal(await row.locator('.owner').textContent(),'Ben');
    await page.getByRole('button',{name:"Ben's",exact:true}).click();assert.equal(await row.count(),1);
    await page.getByRole('button',{name:'Mine',exact:true}).click();assert.equal(await row.count(),0);
    await page.getByRole('button',{name:'Everyone',exact:true}).click();
    page.once('dialog',dialog=>dialog.accept('Dentist booking edited'));await row.getByTitle('Edit task').click();
    row=page.locator('#focusItems .task').filter({hasText:'Dentist booking edited'});assert.equal(await row.count(),1);
    await row.locator('input[type=checkbox]').click();await page.getByText('✓ Saved and shared',{exact:true}).waitFor();assert.equal(await row.count(),0);
    data=await page.evaluate(()=>mockData);
    const carriedTask=data.custom[`${yesterday}|Today's Jobs`].find(t=>t.text==='Dentist booking edited');
    assert.ok(carriedTask);assert.equal(data.completed[`${yesterday}|Today's Jobs|${carriedTask.id}`],true);
    assert.equal(Object.values(data.custom).flat().filter(t=>t.id===carriedTask.id).length,1);
    assert.deepEqual(data.events.find(e=>e.id==='legacy').attachments.length,1);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
});
