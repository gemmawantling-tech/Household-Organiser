import test from 'node:test';
import assert from 'node:assert/strict';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium,devices} from 'playwright';
const seed={version:1,categories:[{id:'food',name:'Food',type:'food'},{id:'water',name:'Water',type:'water'}],items:[{id:'legacy',name:'Legacy beans',category:'food',current:6,unit:'tin',unknown:{keep:true}}],recipes:[],settings:{people:4,custom:'keep'}};
test('Android-sized stock entry, portions, water, undo, bulk editing and storage failure preserve legacy data',async()=>{
 const allowed=['events.js','Inventory/index.html','Inventory/app.css','Inventory/app.js','Inventory/planner.js','Inventory/recipe-library.js'];
 const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://localhost').pathname.slice(1);if(!allowed.includes(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(500).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
 try{
 const context=await browser.newContext({...devices['Pixel 7'],serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(d=>{if(!localStorage.getItem('home_reserves_inventory_v1'))localStorage.setItem('home_reserves_inventory_v1',JSON.stringify(d));},seed);
 await page.goto(`http://127.0.0.1:${server.address().port}/Inventory/index.html`);
 assert.equal(await page.locator('.nav button').count(),4);
 await page.getByRole('button',{name:'＋ Add item',exact:true}).click();await page.locator('#f_name').fill('Microwave rice');await page.locator('#f_current').fill('40');await page.locator('#f_portionsPerPack').fill('2');
 assert.match(await page.locator('#portionPreview').textContent(),/80 portions/);
 await page.locator('#f_gramsPerUnit').fill('250');
 const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=10;c.height=10;c.getContext('2d').fillRect(0,0,10,10);return c.toDataURL('image/png').split(',')[1];});
 await page.locator('#productPhoto').setInputFiles({name:'rice.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});await page.locator('#itemForm').getByRole('button',{name:'Save',exact:true}).click();
 await page.getByText('Saved on this device.',{exact:true}).waitFor();
 await page.locator('.nav [data-tab=inventory]').click();
 assert.match(await page.locator('.item').filter({hasText:'Microwave rice'}).textContent(),/80 side portions/);
 const row=page.locator('.item').filter({hasText:'Microwave rice'});await row.getByRole('button',{name:'Use one Microwave rice',exact:true}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('home_reserves_inventory_v1')).items.find(i=>i.name==='Microwave rice').current),39);
 await page.getByRole('button',{name:'Undo stock change'}).click();
 await page.locator('.item').filter({hasText:'Microwave rice'}).getByRole('button',{name:'Duplicate',exact:true}).click();assert.equal(await page.locator('#f_name').inputValue(),'Microwave rice (copy)');await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Bulk edit',exact:true}).click();await page.locator('#f_qty_legacy').fill('7');await page.locator('#bulkForm').getByRole('button',{name:'Save',exact:true}).click();
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('home_reserves_inventory_v1')));assert.equal(data.items[0].current,7);assert.deepEqual(data.items[0].unknown,{keep:true});assert.equal(data.settings.custom,'keep');assert.equal(data.items[1].current,40);assert.match(data.items[1].photo,/^data:image\/jpeg;base64,/);
 await page.getByRole('button',{name:'＋ Add item',exact:true}).click();await page.locator('#f_name').fill('Drinking water');await page.locator('#f_category').selectOption('water');await page.locator('#f_current').fill('126');await page.locator('#f_unit').fill('2L bottle');
 await page.getByText('Dates & water details',{exact:true}).click();await page.locator('#f_potable').selectOption('yes');await page.locator('#itemForm').getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.nav [data-tab=meals]').click();await page.locator('#planDays').selectOption('21');await page.locator('#planMode').selectOption('none');await page.getByText('Day-by-day simulation',{exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Day 21',exact:true}).count(),1);
 await page.locator('.nav [data-tab=settings]').click();await page.getByRole('button',{name:'Stock rotation',exact:true}).click();await page.getByRole('button',{name:'Recently used',exact:true}).click();
 await page.locator('.nav [data-tab=inventory]').click();await page.getByRole('button',{name:'Microwave rice',exact:true}).click();await page.locator('#f_current').fill('15');await page.locator('#itemForm').getByRole('button',{name:'Save',exact:true}).click();
 await page.locator('.nav [data-tab=overview]').click();assert.equal(await page.locator('.coverage-number').first().textContent(),'2.5 days');assert.match(await page.locator('.coverage-grid').textContent(),/30 portions ÷ 4 people ÷ 3 meals/);assert.match(await page.locator('#screen').textContent(),/Unverified — no complete meals allocated/);assert.match(await page.locator('.coverage-grid').textContent(),/21 days/);
 for(const width of [320,390,844,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:process.env.RESERVES_SCREENSHOT_PATH||join(tmpdir(),'reserves-dashboard.png'),fullPage:true});
 // A failed storage write must keep the form available and show its error inside it.
 await page.getByRole('button',{name:'＋ Add item',exact:true}).click();await page.locator('#f_name').fill('Unsaved record');
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw Error('QuotaExceededError');}});
 await page.locator('#itemForm').getByRole('button',{name:'Save',exact:true}).click();assert.equal(await page.locator('#editor').isVisible(),true);assert.match(await page.locator('#saveError').textContent(),/Could not safely save/);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('home_reserves_inventory_v1')).items.some(i=>i.name==='Unsaved record')),false);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
