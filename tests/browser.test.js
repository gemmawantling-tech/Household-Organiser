// Isolated browser integration: Firebase SDK calls are mocked; no live project access.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {seed,firestore,auth,storage} from './helpers/firebase-mock.js';
test('mobile event and dated carry-over flows preserve shared tasks and attachments',async()=>{
  const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;const file=path==='/'?'index.html':path.slice(1);if(!['index.html','events.js','gifts-model.js','gifts-ui.js','gifts-service.js','calendar.js','tasks.js','sync.js','ui.js','updates.js','organiser.css','invitation.js','sw.js','manifest.webmanifest','icon-192.png','icon-512.png'].includes(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html');res.end(await readFile(file));}catch{res.writeHead(500).end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
    await context.addInitScript(value=>{if(!localStorage.getItem('household-organiser-v2'))localStorage.setItem('household-organiser-v2',JSON.stringify({...value,completed:{...value.completed,legacyOfflineEdit:true}}))},seed);
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
    assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('household-recovery:shared:gemma:')&&JSON.parse(localStorage.getItem(key)).completed.legacyOfflineEdit===true)),true);
    await page.locator('#dateControls summary').click();await page.locator('#datePicker').fill('2026-10-18');await page.locator('#datePicker').dispatchEvent('change');
    await page.locator('#events').getByRole('button',{name:'Legacy booking',exact:true}).click();
    assert.equal(await page.locator('#editNote').inputValue(),'Original notes');
    await page.locator('#eventOwner').selectOption('Ben');await page.locator('#editLocation').fill('Town Hall');await page.locator('#editNote').fill('Bring tickets');await page.locator('#editBooking').fill('Reference ABC123');await page.locator('#eventRepeat').selectOption('monthly');
    await page.locator('#editor').getByRole('button',{name:'Save',exact:true}).click();
    await page.locator('#modal').waitFor({state:'hidden'});
    let data=await page.evaluate(()=>mockData);
    assert.equal(data.events[0].assignee,'Ben');assert.equal(data.events[0].unknown,'keep');assert.equal(data.events[0].booking,'Reference ABC123');assert.deepEqual(data.custom,seed.custom);assert.deepEqual(data.completed,seed.completed);
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
    await page.getByRole('button',{name:'Add task or event'}).click();await page.locator('#addEventChoice').click();assert.equal(await page.locator('#uploadAttachment').isDisabled(),true);
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
    await page.locator('nav [data-view=lists]').click();await page.locator('#shoppingInput').fill('Milk');await page.locator('#shoppingForm').getByRole('button',{name:'Add',exact:true}).click();
    await page.getByText('✓ Saved and shared',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>mockData.events.some(e=>e.id==='remote')),true);
    assert.deepEqual(await page.evaluate(()=>mockData.custom),seed.custom);
    await page.locator('nav [data-view=today]').click();await page.locator('#dateControls').evaluate(el=>el.open=true);await page.locator('#datePicker').fill('2026-11-18');await page.locator('#datePicker').dispatchEvent('change');await page.locator('#events').getByRole('button',{name:'Anniversary',exact:true}).click();
    page.once('dialog',dialog=>dialog.accept());await page.locator('#deleteEvent').click();await page.locator('#modal').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>mockData.events.some(e=>e.title==='Anniversary')),false);
    assert.equal(await page.evaluate(()=>mockData.events.some(e=>e.id==='remote')),true);
    // Dated jobs carry into today using the same original completion/owner keys.
    await page.locator('#todayBtn').click();
    const today=await page.locator('#datePicker').inputValue();
    const yesterday=await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`});
    await page.getByRole('button',{name:'Add task or event'}).click();await page.locator('#addTaskChoice').click();await page.locator('#editText').fill('Book carry-over dentist');await page.locator('#editDate').fill(yesterday);await page.locator('#editOwner').selectOption('Ben');
    await page.locator('#editor').getByRole('button',{name:'Save',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
    await page.getByText('✓ Saved and shared',{exact:true}).waitFor();
    await page.locator('#todayBtn').click();
    let row=page.locator('#focusItems .task').filter({hasText:'Book carry-over dentist'});
    assert.equal(await row.count(),1);assert.match(await row.textContent(),/Carried over/);assert.equal(await row.locator('.owner').textContent(),'Ben');
    assert.equal(await row.getAttribute('data-owner'),'Ben');
    const colours=[];
    for(const owner of ['Ben','Shared','Gemma']){
      assert.equal(await row.getAttribute('data-owner'),owner);
      colours.push(await row.locator('.owner').evaluate(el=>getComputedStyle(el).backgroundColor));
      await row.getByTitle('Change who does this job').click();
    }
    assert.equal(new Set(colours).size,3);assert.equal(await row.getAttribute('data-owner'),'Ben');
    await page.getByRole('button',{name:"Ben's",exact:true}).click();assert.equal(await row.count(),1);
    await page.getByRole('button',{name:'Gemma',exact:true}).click();assert.equal(await row.count(),0);
    await page.getByRole('button',{name:'Everyone',exact:true}).click();
    await row.locator('.task-actions summary').click();await row.getByTitle('Edit task').click();await page.locator('#editText').fill('Dentist booking edited');await page.locator('#editor').getByRole('button',{name:'Save',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});
    row=page.locator('#focusItems .task').filter({hasText:'Dentist booking edited'});assert.equal(await row.count(),1);
    await row.locator('input[type=checkbox]').click();await page.getByText('✓ Saved and shared',{exact:true}).waitFor();assert.equal(await row.count(),0);
    data=await page.evaluate(()=>mockData);
    const carriedTask=data.custom[`${yesterday}|Today's Jobs`].find(t=>t.text==='Dentist booking edited');
    assert.ok(carriedTask);assert.equal(data.completed[`${yesterday}|Today's Jobs|${carriedTask.id}`],true);
    assert.equal(Object.values(data.custom).flat().filter(t=>t.id===carriedTask.id).length,1);
    assert.deepEqual(data.events.find(e=>e.id==='legacy').attachments.length,1);
    await page.locator('nav [data-view=calendar]').click();
    await page.locator('[data-calendar-view=week]').click();assert.equal(await page.locator('.calendar-day').count(),7);
    await page.locator('[data-calendar-view=day]').click();assert.equal(await page.locator('.calendar-day').count(),1);
    await page.locator('[data-calendar-view=month]').click();assert.equal(await page.locator('.month-day').count(),42);
    await page.locator('#calendarNext').click();await page.locator('#calendarToday').click();
    await page.locator('nav [data-view=more]').click();await page.locator('#openAudit').click();assert.equal(await page.locator('#panelAudit').isVisible(),true);
    await page.locator('nav [data-view=today]').click();await page.locator('#todayBtn').click();
    await page.evaluate(()=>{globalThis.mockOffline=true;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'))});
    const offlineCheckbox=page.locator('#focusItems input[type=checkbox]').first();await offlineCheckbox.click();
    await page.getByText(/Offline · 1 change saved on this device/).waitFor();
    assert.equal(await page.evaluate(()=>householdSync.pending),1);
    await page.evaluate(()=>mockData.events.push({id:'concurrent-offline',title:'Added by Ben while offline',date:'2026-11-18'}));
    await page.evaluate(()=>{globalThis.mockOffline=false;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'))});
    await page.getByText('✓ Saved and shared',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>householdSync.pending),0);assert.equal(await page.evaluate(()=>mockData.events.some(e=>e.id==='concurrent-offline')),true);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    if(process.env.UX_SCREENSHOTS){await page.locator('#dateControls').evaluate(el=>el.open=false);await page.screenshot({path:process.env.UX_SCREENSHOTS+'/mobile-today.png',fullPage:true});await page.locator('nav [data-view=calendar]').click();await page.screenshot({path:process.env.UX_SCREENSHOTS+'/mobile-calendar.png',fullPage:true});await page.setViewportSize({width:1280,height:900});await page.locator('nav [data-view=today]').click();await page.screenshot({path:process.env.UX_SCREENSHOTS+'/desktop-today.png',fullPage:true})}
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
});

test('warm PWA shell reopens offline with navigation and cached styles at narrow mobile width',async()=>{
  // This fixture replaces only Firebase bootstrap. It verifies the actual worker,
  // shell, local cached records and navigation without a production account.
  const allowed=['index.html','events.js','gifts-model.js','gifts-ui.js','gifts-service.js','calendar.js','tasks.js','sync.js','ui.js','updates.js','organiser.css','invitation.js','sw.js','manifest.webmanifest','icon-192.png','icon-512.png'];
  const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname,file=path==='/'?'index.html':path.slice(1);if(!allowed.includes(file)){res.writeHead(404).end();return;}let body=await readFile(file);if(file==='index.html')body=body.toString().replace(/<script type="module">[\s\S]*?<\/script>/,'<script>document.getElementById("authGate").hidden=true;document.getElementById("householdApp").hidden=false;render();</script>');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.webmanifest')?'application/manifest+json':'text/html');res.end(body)}catch{res.writeHead(500).end()}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:320,height:740},isMobile:true,hasTouch:true,serviceWorkers:'allow'});
    await context.addInitScript(value=>localStorage.setItem('household-organiser-v2',JSON.stringify(value)),seed);
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));const origin=`http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))});
    await context.setOffline(true);await page.goto(origin+'/?warm-offline=1',{waitUntil:'domcontentloaded'});
    await page.locator('#householdApp').waitFor({state:'visible'});assert.equal(await page.locator('nav [data-view=calendar]').isVisible(),true);
    await page.locator('nav [data-view=calendar]').click();assert.equal(await page.locator('.month-day').count(),42);
    assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(250, 248, 243)');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);assert.deepEqual(errors,[]);
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
});

test('Reserves pantry opens the selected item and edits/review preserve newer stock from another tab',async()=>{
 const allowed=['events.js','Inventory/index.html','Inventory/app.css','Inventory/app.js','Inventory/planner.js','Inventory/recipe-library.js','Inventory/pantry-view.html','Inventory/three-week-review.html','Inventory/manifest.webmanifest','Inventory/icon-192.png'];
 const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://localhost').pathname.slice(1);if(!allowed.includes(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file))}catch{res.writeHead(500).end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));const origin=`http://127.0.0.1:${server.address().port}`;
  await page.goto(origin+'/Inventory/index.html');
  await page.evaluate(()=>localStorage.setItem('home_reserves_inventory_v1',JSON.stringify({version:1,categories:[{id:'food',name:'Food',type:'food'}],items:[{id:'rice',name:'Dry rice',category:'food',unit:'kg',current:3,optimum:5},{id:'pasta',name:'Pasta',category:'food',unit:'kg',current:4,optimum:6}],recipes:[],settings:{people:4}})));
  await page.goto(origin+'/Inventory/pantry-view.html');await page.locator('[data-id=rice]').click();await page.locator('#editor').waitFor({state:'visible'});assert.equal(await page.locator('#f_name').inputValue(),'Dry rice');
  await page.locator('#f_current').fill('7');await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('home_reserves_inventory_v1'));d.items.find(i=>i.id==='pasta').current=9;localStorage.setItem('home_reserves_inventory_v1',JSON.stringify(d))});
  await page.locator('#itemForm').getByRole('button',{name:'Save',exact:true}).click();await page.locator('#editor').waitFor({state:'hidden'});let d=await page.evaluate(()=>JSON.parse(localStorage.getItem('home_reserves_inventory_v1')));assert.equal(d.items[0].current,7);assert.equal(d.items[1].current,9);
  await page.goto(origin+'/Inventory/three-week-review.html');await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('home_reserves_inventory_v1'));d.items.find(i=>i.id==='pasta').current=11;localStorage.setItem('home_reserves_inventory_v1',JSON.stringify(d))});
  const row=page.locator('.target-row').filter({has:page.getByText('Dry rice',{exact:true})});await row.locator('input').fill('8');const target=8;page.once('dialog',dialog=>dialog.accept());await row.getByRole('button',{name:'Apply target'}).click();
  d=await page.evaluate(()=>JSON.parse(localStorage.getItem('home_reserves_inventory_v1')));assert.equal(d.items[0].optimum,target);assert.equal(d.items[0].current,7);assert.equal(d.items[1].current,11);assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
});
