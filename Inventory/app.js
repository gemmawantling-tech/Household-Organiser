/* Home Reserves — all data stored locally on this browser; no backend. */
'use strict';
const STORAGE_KEY = 'home_reserves_inventory_v1';
const INITIAL_CATEGORIES = [
  {id:'food',name:'Food',type:'food'},
  {id:'water',name:'Water',type:'water'},
  {id:'power',name:'Power & lighting',type:'other'},
  {id:'firstaid',name:'First aid',type:'other'},
  {id:'hygiene',name:'Hygiene',type:'other'},
  {id:'safety',name:'Safety & warmth',type:'other'},
  {id:'car',name:'Car & travel',type:'other'}
];
// Names only: no quantities are presumed to be accurate.
const UNITS = ['unit','item','each','tin','can','jar','bottle','carton','pack','packet','box','bag','pouch','sachet','bar','roll','kit','pair','litre','ml','kg','g','500g pack','1kg pack','2L bottle','5L bottle','500ml bottle','5L container','multipack','pieces','litres','millilitres','kilograms','grams'];
const STARTER_ITEMS = [
  ['food','Pasta','pack'],['food','Dry rice','pack'],['food','Microwave rice','pouch'],
  ['food','Pasta sauce','jar'],['food','Passata','carton'],['food','Chopped tomatoes','tin'],
  ['food','Black beans','tin'],['food','Kidney beans','tin'],['food','Baked beans','tin'],
  ['food','Lentils','pack'],['food','Soup','tin'],['food','Oat milk','carton'],
  ['food','Peanut butter','jar'],['food','Cereal bars','bar'],['food','Oats','pack'],
  ['food','Noodles','pack'],['food','Ready-to-eat meal sachets','pouch'],
  ['food','Roasted peppers','jar'],['food','Sweetcorn','tin'],['food','Peas','tin'],
  ['food','Chilli kidney beans','jar'],['food','Coffee','pack'],
  ['food','Olive oil','bottle'],['food','Soy sauce','bottle'],
  ['water','Bottled water (5 L)','bottle',5],['water','Bottled water (2 L)','bottle',2],
  ['power','Power banks','unit'],['power','Lanterns','unit'],['power','Torches','unit'],
  ['power','Head torch','unit'],['power','Wind-up radio','unit'],
  ['firstaid','First aid kits','kit'],['firstaid','Oral rehydration sachets','sachet'],
  ['firstaid','Eyewash','bottle'],['hygiene','Antibacterial hand gel','bottle'],
  ['hygiene','Wipes','pack'],['safety','Fire blanket','unit'],
  ['safety','Water-mist extinguisher','unit'],['safety','Warm blankets','unit'],
  ['car','Car emergency bag','bag'],['safety','Emergency cash','£']
];
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = value => Number(value).toLocaleString('en-GB',{maximumFractionDigits:2});
const uid = () => 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,9);
const newData = () => ({version:1,categories:JSON.parse(JSON.stringify(INITIAL_CATEGORIES)),items:[],recipes:[],settings:{people:4,adults:2,kids:2,childPortion:0.6,mealsPerDay:3,waterPerPerson:3}});
let state, activeTab = location.hash==='#stock'?'inventory':'overview', categoryFilter = 'all', statusFilter = 'all', query = '', message = '', sortOrder = 'name', rotationFilter = '30', undoStock = null, cameraStream = null, scanFrame = null;
function validData(d){
  if (!d || !Array.isArray(d.categories) || !Array.isArray(d.items) || !Array.isArray(d.recipes) || typeof d.settings !== 'object') throw Error('Not a valid Home Reserves backup');
  if (d.items.length > 20000 || d.categories.length > 500 || d.recipes.length > 2000) throw Error('Backup too large');
  return d;
}
try {state=validData(JSON.parse(localStorage.getItem(STORAGE_KEY)));}catch{state=newData();}
let persistedState=JSON.parse(JSON.stringify(state));
const cat = id => state.categories.find(c => c.id === id);
const itemById = id => state.items.find(i => i.id === id);
const listed = i => i.current !== null && i.current !== undefined && i.current !== '';
const targeted = i => i.optimum !== null && i.optimum !== undefined && i.optimum !== '';
const amount = i => listed(i) && Number.isFinite(Number(i.current)) ? Math.max(0,Number(i.current)) : 0;
const low = i => listed(i) && targeted(i) && amount(i) < Number(i.optimum);
const foodItems = () => state.items.filter(i => cat(i.category)?.type === 'food');
const setting = (name,fallback) => Number(state.settings[name]) > 0 ? Number(state.settings[name]) : fallback;
function daysToExpiry(i){
  if (!i.expiry) return null;
  const date = new Date(i.expiry+'T12:00:00');
  if (!Number.isFinite(date.getTime())) return null;
  const today = new Date(); today.setHours(12,0,0,0);
  return Math.round((date.getTime()-today.getTime())/86400000);
}
const expiresSoon = i => daysToExpiry(i) !== null && daysToExpiry(i) <= 30;
const waterSummary = () => ReservesCoverage.water(state.items.filter(i=>cat(i.category)?.type==='water'),state.settings);
const waterLitres = () => waterSummary().potable;
function persist(){
  try{const raw=localStorage.getItem(STORAGE_KEY),latest=raw?validData(JSON.parse(raw)):persistedState;state=HouseholdEvents.mergeChanges(latest,persistedState,state);localStorage.setItem(STORAGE_KEY,JSON.stringify(state));persistedState=JSON.parse(JSON.stringify(state));message='Saved on this device.';render();return true;}
  catch{state=JSON.parse(JSON.stringify(persistedState));message='Could not safely save to browser storage. Keep this tab open and export a backup.';render();if($('saveError'))$('saveError').textContent=message;return false;}
}
function notify(note){message=note;render();window.scrollTo({top:0,behavior:'smooth'});}
function numberOrNull(value){
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
function stockStatus(i){return !listed(i)?'uncounted':low(i)?'low':!targeted(i)?'notarget':'ok';}
// A batch requires ALL its ingredients; recipes share one global pool of stock.
function requirements(recipe){
  const needed={};
  for(const ing of recipe.ingredients||[]){
    const q=Number(ing.amount);
    if(q>0 && Number.isFinite(q)) needed[ing.itemId]=(needed[ing.itemId]||0)+q;
  }
  return needed;
}
const household = () => ReservesPlanner.household(state.settings);
const suggestions = () => ReservesPlanner.suggest(foodItems(),state.settings);
function calculateMeals(recipes=state.recipes){
  const remaining={};state.items.forEach(i=>remaining[i.id]=amount(i));
  const allocated={};recipes.forEach(r=>allocated[r.id]=0);
  const individually={};
  recipes.forEach(r=>{
    const req=requirements(r),ids=Object.keys(req);
    individually[r.id]=ids.length ? Math.max(0,Math.floor(Math.min(...ids.map(id=>itemById(id)?amount(itemById(id))/req[id]:0))+1e-9)):0;
  });
  let made=true, passes=0;
  // Fair round-robin allocation: one batch per available recipe each round.
  while(made && passes < 10000){
    made=false; passes++;
    for(const r of recipes){
      const req=requirements(r),ids=Object.keys(req);
      if(ids.length && ids.every(id=>itemById(id)&&remaining[id]+1e-9 >= req[id])){
        ids.forEach(id=>remaining[id]-=req[id]);
        allocated[r.id]++;
        made=true;
      }
    }
  }
  const portions=recipes.reduce((sum,r)=>sum+(allocated[r.id]||0)*(Number(r.portions)||0),0);
  const audiencePortions=audience=>recipes.filter(r=>r.audience===audience).reduce((sum,r)=>sum+(allocated[r.id]||0)*r.portions,0);
  return {allocated,individually,portions,adultPortions:audiencePortions('adult'),kidPortions:audiencePortions('kids'),capped:passes>=10000};
}
function field(name,label,value='',extra=''){
  return '<div class="field"><label for="f_'+name+'">'+label+'</label><input id="f_'+name+'" name="'+name+'" value="'+escapeHTML(value)+'" '+extra+'></div>';
}
function dropdown(name,label,options,selected){
  return '<div class="field"><label for="f_'+name+'">'+label+'</label><select id="f_'+name+'" name="'+name+'">'+options.map(([id,text])=>'<option value="'+escapeHTML(id)+'" '+(id===selected?'selected':'')+'>'+escapeHTML(text)+'</option>').join('')+'</select></div>';
}
function formActions(kind,id){
  return '<div class="modal-actions">'+(id?'<button type="button" class="danger" data-action="delete'+kind+'" data-id="'+escapeHTML(id)+'">Delete</button>':'')+'<button type="button" data-action="close">Cancel</button><button type="submit" class="primary">Save</button></div>';
}
function editDialog(markup){$('editorBody').innerHTML='<div id="saveError" role="alert"></div>'+markup;$('editor').showModal();}
function stopScanner(){if(scanFrame)cancelAnimationFrame(scanFrame);scanFrame=null;cameraStream?.getTracks().forEach(t=>t.stop());cameraStream=null;if($('scanPanel'))$('scanPanel').hidden=true;}
function closeDialog(){stopScanner();$('editor').close();}
function editItem(id,draft=null){
  const i=draft||(id?itemById(id):null);
  if (!state.categories.length){notify('Create a category before adding stock.');showTab('settings');return;}
  editDialog('<h2>'+(i?'Edit item':'Add item')+'</h2><form id="itemForm" data-id="'+escapeHTML(i?.id||'')+'">'+
    field('name','Item name',i?.name||'','required maxlength="120" placeholder="e.g. Lentils"')+
    dropdown('category','Category',state.categories.map(c=>[c.id,c.name]),i?.category||state.categories[0].id)+
    '<div class="split">'+field('current','Quantity (all packs together)',i?.current??'','type="number" min="0" step="any" placeholder="Not counted"')+
    field('optimum','Optimum level',i?.optimum??'','type="number" min="0" step="any" placeholder="Your target"')+'</div>'+
    '<div class="split">'+'<div class="field"><label for="f_unit">Stock counted in</label><input id="f_unit" name="unit" list="stockUnits" value="'+escapeHTML(i?.unit||'pack')+'" required maxlength="32" placeholder="Choose or type a unit"><datalist id="stockUnits">'+UNITS.map(u=>'<option value="'+escapeHTML(u)+'"></option>').join('')+'</datalist></div>'+
    field('location','Storage location',i?.location||'','maxlength="90" placeholder="Utility cupboard"')+'</div>'+
    '<div class="split">'+field('expiry','Earliest expiry date',i?.expiry||'','type="date"')+
    field('litresPerUnit','Litres per item (for water)',i?.litresPerUnit??'','type="number" min="0" step="any" placeholder="e.g. 5"')+'</div>'+
    '<details open><summary>Food portions & preparation</summary><div class="split">'+
    field('portionsPerPack','Portions per pack',i?.portionsPerPack??'','type="number" min="0.01" step="any" placeholder="e.g. 2"')+
    field('portionSize','Portion size (g / ml)',i?.portionSize??'','type="number" min="0.01" step="any"')+'</div><output id="portionPreview" class="hint"></output>'+
    field('gramsPerUnit','Food grams per stock unit (ml for milk)',i?.gramsPerUnit??'','type="number" min="0.001" step="any" placeholder="e.g. 500 for a 500g pack"')+
    dropdown('portionType','What is one portion?',[['side','Side / meal component'],['meal','Complete meal']],i?.portionType||'side')+
    dropdown('portionSource','Serving information',[['estimate','My estimate'],['label','Manufacturer label']],i?.portionSource||'estimate')+
    dropdown('mealSlot','Meal occasion',[['','Not specified'],['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner']],i?.mealSlot||'')+
    dropdown('preparation','Preparation',[['','Unverified'],['ready','Ready to eat'],['heat','Needs heating'],['cook','Requires cooking']],i?.preparation||'')+
    dropdown('requiresWater','Water needed to prepare?',[['','Unverified'],['no','No'],['yes','Yes']],i?.requiresWater||'')+
    '</details><details><summary>Dietary suitability, nutrition & price</summary>'+
    dropdown('foodGroup','Food group',[['','Unverified'],['starches','Rice, pasta & other starches'],['protein','Beans, pulses, meat & other protein'],['vegetables','Vegetables & fruit'],['breakfast','Breakfast foods'],['complete','Complete meals'],['other','Other']],i?.foodGroup||'')+
    field('proteinPerPortion','Protein per portion (g, optional label data)',i?.proteinPerPortion??'','type="number" min="0" step="any"')+
    field('energyPerPortion','Energy per portion (kcal, optional label data)',i?.energyPerPortion??'','type="number" min="0" step="any"')+
    field('diet','Confirmed dietary suitability (comma separated)',i?.diet||'','placeholder="vegan, vegetarian, gluten-free"')+
    field('barcode','Barcode (optional)',i?.barcode||'','maxlength="80"')+
    '<button type="button" data-action="scan" '+(typeof BarcodeDetector==='undefined'?'disabled':'')+'>Scan barcode</button><p class="hint">Scanning needs a supported browser and camera permission. It records the code; check product and serving details yourself.</p><div id="scanPanel" hidden><video id="scanVideo" autoplay playsinline muted style="width:100%"></video><button type="button" data-action="stopScan">Stop camera</button></div>'+
    '<div class="field"><label for="productPhoto">Product or receipt photo (optional)</label><input id="productPhoto" name="productPhoto" type="file" accept="image/jpeg,image/png,image/webp"></div>'+
    (i?.photo&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(i.photo)?'<img class="product-photo" alt="Saved product or receipt" src="'+escapeHTML(i.photo)+'">':'')+
    field('pricePaid','Price paid per pack (£), optional',i?.pricePaid??'','type="number" min="0" step="0.01"')+'</details>'+
    '<details><summary>Dates & water details</summary>'+
    dropdown('dateType','Date on label',[['','Unverified date type'],['bestbefore','Best before'],['useby','Use by']],i?.dateType||'')+
    dropdown('reviewedBestBefore','Past best-before reviewed for planning?',[['no','No — exclude from meal estimate'],['yes','Yes — include after checking label and condition']],i?.reviewedBestBefore||'no')+
    dropdown('potable','Water suitable for drinking?',[['','Unverified — not counted'],['yes','Confirmed potable'],['no','Non-potable']],i?.potable||'')+
    field('unitsPerPack','Containers per multipack',i?.unitsPerPack??1,'type="number" min="1" step="1"')+
    field('storageDate','Water storage date',i?.storageDate||'','type="date"')+'</details>'+
    '<details><summary>Children’s preferences & notes</summary>'+
    dropdown('kidPreference','Children’s food preference (optional)',[['auto','Suggest automatically'],['yes','They will eat this'],['no','They will not eat this']],i?.kidPreference||(i?.kidAccepted?'yes':'auto'))+
    '<div class="field"><label for="f_notes">Notes</label><textarea id="f_notes" name="notes" rows="2" maxlength="300" placeholder="Optional">'+escapeHTML(i?.notes||'')+'</textarea></div></details>'+
    '<p class="hint">Leave current level blank if not counted yet, and optimum blank until you choose a target.</p>'+formActions('Item',i?.id)+'</form>');
}
async function preparePhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw Error('Choose a JPG, PNG or WebP image under 12 MB.');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const photo=canvas.toDataURL('image/jpeg',0.7);if(photo.length>200000)throw Error('This photo is too detailed for local storage. Choose a smaller image.');return photo;
}
async function startScanner(){
 if(typeof BarcodeDetector==='undefined')return;
 stopScanner();try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});if(!$('editor').open){stream.getTracks().forEach(t=>t.stop());return;}cameraStream=stream;$('scanPanel').hidden=false;const video=$('scanVideo');video.srcObject=stream;await video.play();const detector=new BarcodeDetector();const deadline=Date.now()+30000;const scan=async()=>{if(!cameraStream)return;try{const found=await detector.detect(video);if(found.length){$('f_barcode').value=found[0].rawValue;stopScanner();return;}}catch{}if(Date.now()>deadline){stopScanner();$('saveError').textContent='No code found. You can enter the barcode manually.';return;}scanFrame=requestAnimationFrame(scan);};scan();}catch{stopScanner();$('saveError').textContent='Could not open the camera. Enter the barcode manually or allow camera access in your browser.';}
}
function editBulk(){editDialog('<h2>Bulk stock check</h2><p class="hint">Update quantities together. Blank means not counted; existing notes, units and dates stay intact.</p><form id="bulkForm">'+state.items.map(i=>field('qty_'+i.id,escapeHTML(i.name)+' ('+escapeHTML(i.unit)+')',i.current??'','type="number" min="0" step="any"')).join('')+formActions('Bulk','')+'</form>');}
function editCategory(id){
  const c=id?cat(id):null;
  editDialog('<h2>'+(c?'Edit category':'New category')+'</h2><form id="categoryForm" data-id="'+escapeHTML(c?.id||'')+'">'+
    field('name','Category name',c?.name||'','required maxlength="90" placeholder="e.g. Pet supplies"')+
    dropdown('type','Category used for',[['other','General supplies'],['food','Recipe ingredients'],['water','Drinking water']],c?.type||'other')+
    '<p class="hint">Food categories appear when building meals. Water categories contribute to the water estimate.</p>'+formActions('Category',c?.id)+'</form>');
}
function ingredientRow(itemId='',quantity=''){
  return '<div class="ingredient-row"><select class="ingredientId" aria-label="Ingredient">'+foodItems().map(i=>'<option value="'+escapeHTML(i.id)+'" '+(i.id===itemId?'selected':'')+'>'+escapeHTML(i.name)+' ('+escapeHTML(i.unit)+')</option>').join('')+'</select><input class="ingredientQty" type="number" min="0.001" step="any" value="'+escapeHTML(quantity)+'" placeholder="Qty" aria-label="Quantity used per batch"><button type="button" data-action="removeIngredient" aria-label="Remove ingredient">×</button></div>';
}
function editRecipe(id,draft=null){
  if (!foodItems().length){showTab('inventory');notify('Add food items to the inventory first, then build a meal from those ingredients.');return;}
  const r=draft||state.recipes.find(r=>r.id===id);
  editDialog('<h2>'+(r?'Edit meal':'Add meal')+'</h2><form id="recipeForm" data-id="'+escapeHTML(draft?'':r?.id||'')+'">'+
    field('name','Meal name',r?.name||'','required maxlength="120" placeholder="e.g. Bean chilli with rice"')+
    dropdown('mealSlot','Meal occasion',[['breakfast','Breakfast'],['lunch','Lunch'],['dinner','Dinner']],r?.mealSlot||'dinner')+
    dropdown('preparation','Cooking requirement',[['ready','No cooking'],['heat','Minimal heating'],['cook','Full cooking']],r?.preparation||'cook')+
    field('portions','Adult-size portions per batch',r?.portions||4,'required type="number" min="1" max="100" step="1"')+
    '<label>Ingredients needed for ONE batch</label><p class="hint">Quantities use the same units as inventory. If each batch needs two tins of beans, enter 2.</p><div id="ingredientRows">'+
    (r?.ingredients?.length?r.ingredients.map(ing=>ingredientRow(ing.itemId,ing.amount)).join(''):ingredientRow())+'</div>'+
    '<button type="button" class="light-button" data-action="addIngredient">+ Ingredient</button>'+formActions('Recipe',draft?'':r?.id)+'</form>');
}
function unitLabel(i){return i.unit==='£'?'£'+fmt(amount(i)):fmt(amount(i))+' '+escapeHTML(i.unit||'');}
function stat(value,label){return '<div class="stat"><div class="value">'+value+'</div><div class="label">'+label+'</div></div>';}
function stats(){
  const counted=state.items.filter(listed).length,below=state.items.filter(low).length,exp=state.items.filter(expiresSoon).length;
  return '<div class="stat-grid">'+stat(fmt(counted)+'<span class="small muted"> / '+fmt(state.items.length)+'</span>','Item types counted')+stat(fmt(below),'Below your optimum')+stat(fmt(exp),'Expiring or expired')+stat(fmt(calculateMeals(suggestions()).portions),'Automatic adult-size portions')+'</div>';
}
function coverage(mode='normal'){return ReservesCoverage.allocate(foodItems(),state.recipes,state.settings,mode);}
function progress(value,max){return '<progress max="'+max+'" value="'+Math.min(max,Math.max(0,value))+'" aria-label="'+fmt(value)+' of '+fmt(max)+'"></progress>';}
function overview(){
 const c=coverage(),n=coverage('none'),w=waterSummary(),target=setting('targetDays',21),estimate=ReservesCoverage.portionEstimate(foodItems(),state.settings),total=estimate.total,unverified=estimate.missing;
 return '<section class="card hero coverage-hero"><div class="eyebrow">YOUR HOUSEHOLD · '+household().people+' PEOPLE</div><h2>Preparedness, at a glance.</h2><p class="hint">Your personal goal: '+target+' days. Estimates from your recorded supplies.</p><div class="coverage-grid"><div><div class="coverage-number">'+(total?fmt(estimate.days):'—')+'<small> days</small></div><h3>Portion-based food estimate</h3>'+progress(estimate.days,target)+'<p class="hint">'+(total?fmt(total)+' portions ÷ '+fmt(estimate.people)+' people ÷ '+fmt(estimate.mealsPerDay)+' meals/day.':'Add quantities and portions per pack to get an estimate.')+' Includes sides; not complete-meal coverage.</p></div><div><div class="coverage-number">'+fmt(w.days)+'<small> days</small></div><h3>Drinking water</h3>'+progress(w.days,target)+'<p class="hint">'+fmt(w.potable)+' L confirmed potable</p></div></div></section>'+
 '<div class="stat-grid">'+stat(fmt(total),'Recorded food portions · includes sides')+stat(fmt(n.portions),'Meal portions with no cooking')+stat(fmt(state.items.filter(i=>daysToExpiry(i)!==null&&daysToExpiry(i)>=0&&daysToExpiry(i)<=30).length),'Dates within 30 days')+stat(fmt(w.shortfall)+' L','Drinking water shortfall')+'</div>'+
 '<section class="card"><div class="section-title"><h2>Complete-meal coverage</h2><button data-tab="meals">Open Planner →</button></div><p class="small"><strong>'+(c.portions?fmt(c.days)+' days':'Unverified — no complete meals allocated')+'</strong> · stricter recipe-based estimate</p><p class="hint">The portion estimate above counts individual servings. This separate figure checks whether meals can be assembled. The two estimates are alternatives and are never added together.</p>'+Object.entries(c.slots).map(([slot,q])=>'<div class="balance-row"><span>'+slot[0].toUpperCase()+slot.slice(1)+'</span>'+progress(q,Math.max(1,household().equivalents*target))+'<strong>'+fmt(q)+'</strong></div>').join('')+'<p class="hint">Your weakest meal occasion limits coverage. Plenty of side portions does not mean complete meals. '+unverified+' food records have no serving information.</p><p class="hint">Protein, calories and nutritional variety require optional label data; record these in each food item.</p>'+foodBalance()+'</section>'+
 '<details class="card"><summary>How the two estimates work</summary><p class="small">Portion-based estimate: '+fmt(total)+' recorded portions ÷ '+fmt(estimate.people)+' people ÷ '+fmt(estimate.mealsPerDay)+' meals per person daily = '+fmt(estimate.days)+' days. Each person is allowed one recorded portion per meal, including children; no child-size reduction is applied to this simple estimate.</p><p class="hint">'+fmt(estimate.sides)+' side portions · '+fmt(estimate.meals)+' complete-meal portions · '+fmt(estimate.unclassified)+' portions of unverified type. Sides and ingredients count as servings, not whole meals. This rough comparison does not verify dietary suitability, meal balance, energy or cooking facilities. Stocks without serving information and past dates excluded from planning do not contribute. No recipes are added to these portions, so ingredients are not counted twice.</p><p class="small">Complete-meal calculation: '+fmt(c.portions)+' complete-meal portions allocated once across breakfast, lunch and dinner. The least-covered tracked occasion is divided by '+fmt(household().equivalents)+' adult-equivalent servings per day. For 1 tracked meal the occasion is dinner; for 2, lunch and dinner; for 3, all three. Child portions are your chosen estimate, not age-specific energy advice.</p><p class="hint">Only explicitly recorded complete meals and your saved recipes with an occasion and cooking requirement enter the complete-meal estimate. Automatic recipe ideas remain unverified alternatives in Planner. Missing dietary confirmation excludes foods when a household diet is selected. Past use-by and unreviewed dates are excluded. Normal cooking assumes suitable fuel and preparation water; no-cooking requires every ingredient to be confirmed ready with no added water. Allocation is conservative and may understate possible combinations.</p><p class="small">Without electricity or gas, and without alternative cooking equipment: '+fmt(n.days)+' food days. Normal cooking: '+fmt(c.days)+' days.</p></details>'+waterPanel()+
 '<section class="card"><h2>Use first, replace thoughtfully</h2><p>Review dates and record what you use.</p><button data-action="rotation">View stock rotation →</button></section>'+
 (!state.items.length?'<section class="card empty"><h2>Start with what you already have</h2><p>Add a stock line once, then enter all your packs together.</p><button class="primary" data-action="newItem">+ Add first item</button></section>':'');
}
function foodBalance(){
 const items=foodItems().filter(i=>ReservesCoverage.usable(i)),groups=[['starches','Starches'],['protein','Protein foods'],['vegetables','Fruit & vegetables'],['breakfast','Breakfast foods'],['complete','Complete meals']].map(([id,label])=>({label,q:items.filter(i=>i.foodGroup===id).reduce((n,i)=>n+ReservesCoverage.portions(i),0)})).sort((a,b)=>b.q-a.q);
 const energyItems=items.filter(i=>i.energyPerPortion!=null&&i.portionsPerPack),energy=energyItems.reduce((n,i)=>n+Number(i.energyPerPortion)*ReservesCoverage.portions(i),0),dailyEnergy=household().adults*Number(state.settings.adultEnergy||0)+household().kids*Number(state.settings.childEnergy||0);
 const known=items.filter(i=>i.proteinPerPortion!=null&&i.portionsPerPack),protein=known.reduce((n,i)=>n+Number(i.proteinPerPortion)*ReservesCoverage.portions(i),0);
 return '<details><summary>Food groups: strengths & gaps</summary>'+groups.map(g=>'<div class="balance-row"><span>'+g.label+'</span>'+progress(g.q,Math.max(1,...groups.map(g=>g.q)))+'<strong>'+fmt(g.q)+'</strong></div>').join('')+'<p class="hint">Recorded portions, including sides. Groups are user-confirmed, not inferred. Zero may mean unclassified stock. Strongest recorded group: '+groups[0].label+'. Lowest: '+groups[groups.length-1].label+'. These bars do not establish nutritional adequacy.</p><p class="hint">Protein recorded: '+fmt(protein)+' g across '+known.length+' of '+items.length+' stock lines. Missing nutrition remains unverified. Recorded energy: '+fmt(energy)+' kcal across '+energyItems.length+' stock lines. '+(dailyEnergy?'Your entered household energy planning need: '+fmt(dailyEnergy)+' kcal/day. ':'')+'Energy totals do not establish a balanced diet or add meal days.</p></details>';
}
function waterPanel(){const w=waterSummary(),people=household().people,extra=Number(state.settings.petWater||0)+Number(state.settings.specialWater||0);return '<section class="card"><div class="eyebrow">WATER · PLANNING SCENARIOS</div><h2>More than drinking water</h2><div class="split">'+stat(fmt(w.potable)+' L','Potable drinking water')+stat(fmt(w.basicDays),'Days including cooking & basic hygiene')+'</div><p class="hint">'+fmt(w.nonPotable)+' L non-potable · '+fmt(w.unverified)+' L unverified (excluded). Drinking: '+fmt(w.daily)+' L/day. Basic needs: '+fmt(w.basic)+' L/day.</p><details><summary>UK Prepare guidance & quantities</summary><p class="small">UK Prepare says there is no single standard quantity for every emergency and cites WHO: 2.5–3 litres per person daily for survival drinking needs; 10 litres for drinking, basic cooking and hygiene. These are planning scenarios, not mandatory stockpiling targets. Official advice to prepare for several days is separate from your personal '+setting('targetDays',21)+'-day goal.</p>'+[3,7,21].map(d=>'<div class="row-line"><strong>'+d+' days</strong><span>'+fmt((people*3+extra)*d)+' L drinking (3 L/person)<br>'+fmt((people*10+extra)*d)+' L basic needs</span></div>').join('')+'<p><a href="https://prepare.campaign.gov.uk/get-prepared-for-emergencies/" target="_blank" rel="noopener">UK Prepare: emergency supplies ↗</a></p><p><a href="https://prepare.campaign.gov.uk/be-informed-about-hazards/water-supply-interruptions-or-outages/" target="_blank" rel="noopener">Water supply interruptions ↗</a></p></details></section>';}
function rotation(){
 const groups=[['30','Within 30 days'],['90','Within 90 days'],['past','Past best before'],['used','Recently used']];
 const items=state.items.filter(i=>{const d=daysToExpiry(i);return rotationFilter==='used'?i.lastUsed:rotationFilter==='past'?d!==null&&d<0&&i.dateType==='bestbefore':d!==null&&d>=0&&d<=Number(rotationFilter)}).sort((a,b)=>rotationFilter==='used'?String(b.lastUsed).localeCompare(String(a.lastUsed)):String(a.expiry).localeCompare(String(b.expiry)));
 return '<section class="card"><h2>Stock rotation</h2><div class="category-chips">'+groups.map(([v,l])=>'<button data-action="rotateFilter" data-id="'+v+'" aria-pressed="'+(v===rotationFilter)+'">'+l+'</button>').join('')+'</div><p class="hint">Best before describes quality. Passing it alone does not mean food is unsafe. Use-by relates to safety: follow the label. Review condition and storage; use separate records for different batches.</p></section>'+(items.length?items.map(itemCard).join(''):'<div class="empty">No matching records.</div>');
}
function itemCard(i){
  const c=cat(i.category),expiry=daysToExpiry(i),below=low(i),max=targeted(i)?Number(i.optimum):0;
  let badges='<span class="badge">'+escapeHTML(c?.name||'Other')+'</span>';
  if(!listed(i))badges+='<span class="badge low">Not yet counted</span>';
  else if(below)badges+='<span class="badge low">Below optimum</span>';
  else if(!targeted(i))badges+='<span class="badge">No target</span>';
  if(expiry!==null&&expiry<=30)badges+='<span class="badge red">'+(expiry<0?(i.dateType==='bestbefore'?'Past best before':i.dateType==='useby'?'Past use by':'Past recorded date'):expiry===0?'Label date today':'Label date in '+expiry+' days')+'</span>';
  return '<article class="item"><div class="item-header"><div><button class="item-title text-button" data-action="editItem" data-id="'+escapeHTML(i.id)+'">'+escapeHTML(i.name)+'</button>'+badges+'</div><button class="text-button" data-action="editItem" data-id="'+escapeHTML(i.id)+'">Edit</button></div>'+
    (listed(i)&&max>0?'<div class="meter '+(below?'low':'')+'"><span style="width:'+Math.min(100,amount(i)*100/max)+'%"></span></div>':'')+
    '<p class="hint">'+(i.portionsPerPack?fmt(ReservesCoverage.portions(i))+' '+(i.portionType==='meal'?'meal':'side')+' portions · '+(i.portionSource==='label'?'label':'estimate'):'Serving information unverified')+(i.pricePaid!=null&&i.portionsPerPack?' · £'+fmt(i.pricePaid/i.portionsPerPack)+'/portion':'')+'</p><button class="text-button" data-action="duplicate" data-id="'+escapeHTML(i.id)+'">Duplicate</button><div class="item-bottom"><div class="counts">Current: <strong>'+(listed(i)?(i.unit==='£'?'£':'')+fmt(i.current):'—')+'</strong> '+(i.unit==='£'?'':escapeHTML(i.unit))+'<br>Optimum: <strong>'+(targeted(i)?(i.unit==='£'?'£':'')+fmt(i.optimum):'Not set')+'</strong> '+(i.unit==='£'?'':escapeHTML(i.unit))+
    (i.location?'<br>📍 '+escapeHTML(i.location):'')+(i.expiry?'<br>Expiry: '+escapeHTML(i.expiry):'')+(i.notes?'<br>'+escapeHTML(i.notes):'')+'</div>'+
    '<div class="stepper"><button type="button" data-action="minus" data-id="'+escapeHTML(i.id)+'" aria-label="Use one '+escapeHTML(i.name)+'" '+(!listed(i)||amount(i)<=0?'disabled':'')+'>−</button><strong>'+(listed(i)?fmt(i.current):'—')+'</strong><button type="button" data-action="plus" data-id="'+escapeHTML(i.id)+'" aria-label="Add one '+escapeHTML(i.name)+'">+</button></div></div></article>';
}
function inventory(){
  const filtered=state.items.filter(i=>(categoryFilter==='all'||i.category===categoryFilter)&&
    (statusFilter==='all'||(statusFilter==='low'&&low(i))||(statusFilter==='uncounted'&&!listed(i))||(statusFilter==='notarget'&&!targeted(i))||(statusFilter==='expiry'&&expiresSoon(i)))&&
    (i.name+' '+(i.location||'')+' '+(i.notes||'')).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sortOrder==='expiry'?String(a.expiry||'9999').localeCompare(String(b.expiry||'9999')):sortOrder==='quantity'?amount(b)-amount(a):a.name.localeCompare(b.name));
  return '<section class="card"><div class="eyebrow">YOUR COLLECTION</div><div class="section-title"><h2>All your supplies</h2><div class="actions"><button data-action="bulk">Bulk edit</button><button class="primary" data-action="newItem">+ Item</button></div></div>'+
    '<div class="filter-grid"><input id="filterSearch" class="search" aria-label="Search stock" placeholder="Search items or locations" value="'+escapeHTML(query)+'">'+
    '<select id="filterCategory" aria-label="Select category"><option value="all">All categories</option>'+state.categories.map(c=>'<option value="'+escapeHTML(c.id)+'" '+(categoryFilter===c.id?'selected':'')+'>'+escapeHTML(c.name)+'</option>').join('')+'</select>'+
    '<select id="filterStatus" aria-label="Select status">'+[['all','All levels'],['low','Below optimum'],['uncounted','Not counted'],['notarget','No optimum set'],['expiry','Expiring soon']].map(([v,l])=>'<option value="'+v+'" '+(statusFilter===v?'selected':'')+'>'+l+'</option>').join('')+'</select></div>'+
    '<div class="category-chips">'+[['all','All'],...state.categories.map(c=>[c.id,c.name])].map(([id,name])=>'<button data-action="categoryFilter" data-id="'+escapeHTML(id)+'" aria-pressed="'+(categoryFilter===id)+'">'+escapeHTML(name)+'</button>').join('')+'</div><label for="sortStock">Sort by</label><select id="sortStock">'+[['name','Name'],['expiry','Earliest date'],['quantity','Quantity']].map(([v,l])=>'<option value="'+v+'" '+(v===sortOrder?'selected':'')+'>'+l+'</option>').join('')+'</select><p class="hint">'+filtered.length+' item types shown · Use + / − for quick stock adjustments, or Edit to enter an exact number.</p></section>'+
    (filtered.length?'<div class="items-grid">'+filtered.map(itemCard).join('')+'</div>':'<section class="card empty">'+(state.items.length?'No items match your filters.':'No inventory yet. Add your first item, or load starter items in Settings.')+'</section>');
}
function automaticMeals(){
  const recipes=suggestions(),plan=calculateMeals(recipes),h=household(),perDay=setting('mealsPerDay',3);
  const adultMeals=h.adults?plan.adultPortions/h.adults:Infinity,kidMeals=h.kids?plan.kidPortions/(h.kids*h.childPortion):Infinity;
  const familyMeals=Math.floor(Math.min(adultMeals,kidMeals)),days=familyMeals/perDay,waterDays=waterLitres()/(h.people*setting('waterPerPerson',3));
  const recognised=foodItems().filter(i=>ReservesPlanner.profile(i)),unknown=foodItems().filter(i=>amount(i)>0&&!ReservesPlanner.profile(i));
  return '<section class="card hero"><div class="eyebrow">UNVERIFIED RECIPE IDEAS</div><h2>Ideas to review against your labels</h2><div class="stat-grid">'+stat(fmt(days),'Suggested days · assumptions apply')+stat(fmt(waterDays),'Confirmed drinking-water days')+stat(fmt(Math.min(days,waterDays)),'Days covered by both')+stat(fmt(familyMeals),'Family meal portions')+(h.kids?stat(fmt(kidMeals/perDay),'Children’s suggested-meal days'):'')+'</div><p class="hint">'+fmt(h.adults)+' adults + '+fmt(h.kids)+' children; each child gets '+fmt(h.childPortion*100)+'% of an adult portion. '+fmt(perDay)+' meals daily. <button class="text-button" data-tab="settings">Change household and portions →</button></p><p class="hint">This estimates meal coverage, not survival time or a complete diet. Cooking fuel, allergies and individual nutritional needs must also be checked. Past recorded dates are excluded from these automatic ideas. Best-before is a quality date, not a declaration that food is unsafe. Manual recipes are a separate alternative and are not added to these totals.</p></section>'+
  (h.kids===0?'<section class="card"><p>Your household is currently set to '+fmt(h.adults)+' adults and no children. Set the adult and child numbers once to include children’s meals and calculate their portions.</p><button class="primary" data-tab="settings">Set adult and child numbers</button></section>':'')+'<section class="card"><h2>Meals from your inventory</h2><p class="hint">Add food and quantities in Stock to match our expanded pantry recipe library. Meal ideas, portions and ingredient amounts update automatically. Recipe cards link to the dishes researched online and explain each pantry adaptation. Every listed ingredient must be in stock, including soy sauce, pesto or peppers when required. Matching works offline; the app does not search the web live. Children’s ideas can serve the same recipe ingredients separately; bare rice, pasta and noodles are not counted as meals. In plain-only mode, mixed dishes are excluded; you can optionally mark dislikes in Stock. These are suggestions to try, not confirmed favourites. Ingredients are shared across suggestions, so nothing is counted twice. Quantities below serve either the adults or the children, as labelled; allocated portions can be combined across batches.</p>'+
  (h.kids&&!recipes.some(r=>r.audience==='kids')?'<p class="message warning">No children’s meal ideas match the counted stock and preferences yet. Add food in Stock or review optional preferences in More.</p>':'')+
  (recipes.length?recipes.map(r=>'<article class="meal"><div class="eyebrow">'+(r.audience==='kids'?'SIMPLE CHILDREN’S IDEA':'ADULTS')+'</div><h3>'+escapeHTML(r.name)+'</h3><p class="small">'+(r.audience==='kids'?fmt(h.kids)+' child portions':fmt(h.adults)+' adult portions')+' · '+fmt(plan.allocated[r.id]/(r.audience==='kids'?h.kids*h.childPortion:h.adults))+' group meals in the shared plan</p><p class="small">This recipe alone could make '+fmt(plan.individually[r.id])+' adult portions or '+fmt(Math.floor(plan.individually[r.id]/h.childPortion))+' child portions. These are alternatives using the same ingredients, not extra meals.</p><ul>'+r.ingredients.map(ing=>{const i=itemById(ing.itemId);const q=ing.amount*(r.audience==='kids'?h.kids*h.childPortion:h.adults),p=ReservesPlanner.profile(i);return '<li>'+fmt(q*p.grams)+(p.kind==='milk'?' ml ':' g ')+escapeHTML(i.name)+' <span class="muted">('+fmt(q)+' '+escapeHTML(i.unit)+')</span></li>';}).join('')+'</ul><button data-action="reviewSuggestion" data-id="'+escapeHTML(r.id)+'">Review & save editable recipe</button><p class="small">'+escapeHTML(ReservesPlanner.preparation(r,foodItems()))+'</p><p class="hint">Child portion size: '+fmt(h.childPortion*100)+'% each. '+escapeHTML(r.note)+'</p>'+(r.source?'<a class="small" href="'+escapeHTML(r.source)+'" target="_blank" rel="noopener noreferrer">Recipe source and inspiration ↗</a>':'')+'</article>').join(''):'<p class="empty">Count food in Stock to get automatic suggestions. Try noodles + peanut butter + soy sauce + roasted peppers + peas, or pasta + tuna + tomato sauce + roasted peppers. Plain noodles and rice are ingredients, not counted meals.</p>')+
  (plan.capped?'<p class="message warning">Very large stock: calculation limit reached, totals may be understated.</p>':'')+
  '<details><summary>Ingredient and pack-size assumptions</summary><p class="hint">Dry pasta/rice: 75g per adult; cooked rice: 125g; bean/chickpea bowls: 150g usable cooked pulses; dry pulses: 60g; lentil ragù: 60g dry or 160g ready-cooked lentils; sauce: 150g; oats: 50g; milk: 200ml. Recipe cards show their specific amounts. Unspecified bean pouches/sachets assume 250g. Pack sizes below are estimates unless you entered a size. Edit food grams per stock unit in Stock to match the label. Milk uses ml. For drained foods, use the usable/drained weight from the label. Review suitability for each child; smaller portions are adjustable and are not age-specific dietary advice.</p>'+recognised.map(i=>{const p=ReservesPlanner.profile(i);return '<div class="row-line"><span>'+escapeHTML(i.name)+'</span><span>'+fmt(p.grams)+(p.kind==='milk'?'ml':'g')+' / '+escapeHTML(i.unit)+(p.assumed?' (assumed)':'')+'</span></div>';}).join('')+'</details>'+
  (ReservesPlanner.nearly(foodItems()).length?'<details><summary>More ideas with one extra ingredient</summary><p class="hint">These are not included in portions or food days until you have every ingredient.</p>'+ReservesPlanner.nearly(foodItems()).map(r=>'<div class="meal"><strong>'+escapeHTML(r.name)+'</strong><p class="small">Missing: '+escapeHTML(r.missing.map(k=>({sauce:'tomato sauce or tinned tomatoes',corn:'sweetcorn',peanut:'peanut butter',wrap:'tortilla wraps',soy:'soy sauce',pepper:'roasted peppers',bakedBeans:'baked beans',chickpeas:'chickpeas'})[k]||k).join(', '))+'</p>'+(r.source?'<a href="'+escapeHTML(r.source)+'" target="_blank" rel="noopener noreferrer">Recipe inspiration ↗</a>':'')+'</div>').join('')+'</details>':'')+
  (unknown.length?'<p class="hint">Not included automatically (add a manual recipe): '+unknown.map(i=>escapeHTML(i.name)).join(', ')+'.</p>':'')+'</section>';
}
function meals(){
  const plan=calculateMeals(),people=household().equivalents,perDay=setting('mealsPerDay',1),days=plan.portions/(people*perDay);
  return simulation()+ '<details class="card" open><summary>Optional: your own recipes</summary><section class="card hero"><div class="eyebrow">MANUAL RECIPE CAPACITY</div><h2>How many meals can you make?</h2>'+
    '<div class="stat-grid">'+stat(fmt(plan.portions),'Individual portions')+stat(fmt(Math.floor(plan.portions/people)),'Family meal portions')+stat(fmt(days),'Days of tracked meals')+stat(fmt(days/7),'Weeks of tracked meals')+'</div>'+
    '<p class="hint">For '+fmt(people)+' people, '+fmt(perDay)+' tracked meal(s) per person per day. Each ingredient is allocated once across the recipes below to avoid counting the same tin or pouch twice.</p></section>'+
    '<section class="card"><div class="section-title"><h2>Your meals</h2><button class="primary" data-action="newRecipe">+ Meal</button></div>'+
    (state.recipes.length?state.recipes.map((r,index)=>'<article class="meal"><div class="line"><div><h3>'+escapeHTML(r.name)+'</h3><div class="small muted">'+fmt(r.portions)+' portions per batch</div></div><button class="text-button" data-action="editRecipe" data-id="'+escapeHTML(r.id)+'">Edit</button></div>'+
      '<ul>'+r.ingredients.map(ing=>{const i=itemById(ing.itemId);return '<li>'+fmt(ing.amount)+' '+escapeHTML(i?.unit||'units')+' '+escapeHTML(i?.name||'(item removed)')+'</li>';}).join('')+'</ul>'+
      '<div class="line"><div class="small"><strong>'+fmt(plan.allocated[r.id]||0)+' batches</strong> in shared plan<br><span class="muted">Up to '+fmt(plan.individually[r.id]||0)+' if made on its own</span></div>'+
      '<div class="recipe-tools"><button data-action="recipeUp" data-id="'+escapeHTML(r.id)+'" title="Move earlier" aria-label="Move '+escapeHTML(r.name)+' earlier" '+(index===0?'disabled':'')+'>↑</button><button data-action="recipeDown" data-id="'+escapeHTML(r.id)+'" title="Move later" aria-label="Move '+escapeHTML(r.name)+' later" '+(index===state.recipes.length-1?'disabled':'')+'>↓</button></div></div></article>').join(''):
      '<div class="empty">Recipe ideas are available below. You can optionally save your own recipes here.</div>')+
    '<p class="hint">The plan rotates through recipes from top to bottom, making one batch each when ingredients are available. Change the order with the arrows; your result may change with recipe choices and priorities. Portions do not measure calorie or nutritional adequacy.</p>'+(plan.capped?'<p class="message warning">Calculation stopped at its batch limit. Extremely large stock quantities may be undercounted.</p>':'')+'</section>'+
    '<section class="card"><h2>Family meal planning</h2><p class="small muted">Start with meals you really make — for example, pasta and sauce, bean chilli with rice, or lentil soup. Include ALL key ingredients in the recipe. The app will show your possible batch count from your current stock. Change household size or meals per day in Settings.</p><button data-tab="inventory">Add food inventory →</button></section></details><details class="card"><summary>Unverified recipe ideas from your stock</summary>'+automaticMeals()+'</details>';
}
function simulation(){const mode=state.settings.planMode||'normal',c=coverage(mode),days=setting('planDays',3),needed=days*household().equivalents;return '<section class="card"><div class="eyebrow">SIMULATED EMERGENCY PLAN</div><h2>Plan before you need it</h2><label for="planMode">Facilities available</label><select id="planMode">'+[['normal','Normal cooking'],['heat','Minimal heating, no added water'],['none','No cooking or added water']].map(([v,l])=>'<option value="'+v+'" '+(mode===v?'selected':'')+'>'+l+'</option>').join('')+'</select><label for="planDays">Plan length</label><select id="planDays">'+[3,7,14,21].map(d=>'<option '+(days===d?'selected':'')+'>'+d+'</option>').join('')+'</select><p class="hint">Simulation only. Nothing is deducted. Recipes share one pool with complete meals. Unconfirmed recipe ideas below do not enter this plan.</p>'+Object.entries(c.slots).map(([k,v])=>'<div class="row-line"><strong>'+k+'</strong><span>'+fmt(Math.min(v,needed))+' / '+fmt(needed)+' servings</span></div>').join('')+'<details><summary>Day-by-day simulation</summary>'+ReservesCoverage.simulate(c,state.settings,days).map(day=>'<article class="meal"><h3>Day '+day.day+'</h3>'+day.meals.map(m=>'<p class="small"><strong>'+m.slot+'</strong>: '+m.dishes.map(d=>escapeHTML(d.name)+' ('+fmt(d.portions)+' servings)').join(', ')+(m.shortfall>0?' · short by '+fmt(m.shortfall)+' servings':'')+'</p>').join('')+'</article>').join('')+'</details><details><summary>Allocated meal batches & limiting ingredients</summary>'+c.allocations.slice(0,100).map(a=>'<p class="small">'+escapeHTML(a.name)+' · '+escapeHTML(a.slot)+' · '+fmt(a.portions)+' portions</p>').join('')+'<p class="hint">The first 100 allocated batches are shown. '+(c.capped?'Calculation cap reached; this is a lower bound.':'')+'</p>'+state.recipes.map(r=>'<p class="small">'+escapeHTML(r.name)+': '+(r.ingredients||[]).filter(g=>(c.remaining[g.itemId]||0)<Number(g.amount)).map(g=>escapeHTML(itemById(g.itemId)?.name||'Missing item')).join(', ')+'</p>').join('')+'</details><button data-action="newRecipe">+ Create an editable meal</button></section>';}
function settings(){
  return '<section class="card"><h2>Tools</h2><div class="actions"><button data-action="rotation">Stock rotation</button><a href="./pantry-view.html">My pantry</a><a href="./three-week-review.html">Suggested stock targets</a></div></section><section class="card"><h2>Household planning assumptions</h2><form id="settingsForm"><div class="split">'+
    field('adults','Adults',household().adults,'required type="number" min="0" max="30" step="1"')+field('kids','Children',household().kids,'required type="number" min="0" max="30" step="1"')+field('childPortion','Child portion / adult portion',household().childPortion,'required type="number" min="0.1" max="1" step="0.05"')+
    field('mealsPerDay','Tracked meals per person / day',setting('mealsPerDay',1),'required type="number" min="1" max="3" step="1"')+'</div>'+
    dropdown('kidFoodMode','Children’s meal suggestions',[['automatic','Automatic ideas from inventory'],['confirmed','Only foods marked: they will eat this']],state.settings.kidFoodMode||'automatic')+
    dropdown('kidPreparation','How will the children eat their food?',[['separate','Separate foods / sauce on the side'],['plain','Plain, single-food options only'],['mixed','Familiar mixed meals are OK']],state.settings.kidPreparation||'separate')+
    field('targetDays','Personal preparedness target (days)',setting('targetDays',21),'required type="number" min="1" max="365" step="1"')+
    dropdown('diet','Household dietary requirement',[['any','No dietary filter'],['vegan','Vegan'],['vegetarian','Vegetarian'],['gluten-free','Gluten-free']],state.settings.diet||'any')+
    field('adultDiet','Adults: additional requirements (comma separated)',state.settings.adultDiet||'','placeholder="gluten-free, dairy-free"')+
    field('childDiet','Children: additional requirements (comma separated)',state.settings.childDiet||'','placeholder="nut-free"')+
    '<p class="hint">The shared meal plan conservatively applies all adult and child requirements to every meal. It excludes foods marked unsuitable for children. Check every product label.</p>'+
    field('adultEnergy','Optional adult energy planning (kcal/day)',state.settings.adultEnergy??'','type="number" min="0" step="any"')+
    field('childEnergy','Optional child energy planning (kcal/day)',state.settings.childEnergy??'','type="number" min="0" step="any"')+
    '<p class="hint">Enter individual needs from appropriate advice. Energy targets do not establish age-specific nutrition or change portion coverage.</p>'+
    field('petWater','Pets: extra litres daily',state.settings.petWater||0,'type="number" min="0" step="any"')+
    field('specialWater','Other needs: extra litres daily',state.settings.specialWater||0,'type="number" min="0" step="any"')+
    field('waterPerPerson','Drinking water litres per person / day',setting('waterPerPerson',3),'required type="number" min="0.1" max="20" step="0.1"')+
    '<p class="hint">Select 1 tracked meal a day if you are only planning dinners, or 3 if you have included breakfast, lunch and dinner. Drinking is separate from the 10 L basic-needs scenario. Dietary filtering requires explicit suitability on every ingredient; review allergies separately.</p><button class="primary" type="submit">Save assumptions</button></form></section>'+
    '<section class="card"><div class="section-title"><h2>My categories</h2><button data-action="newCategory">+ Category</button></div>'+state.categories.map(c=>'<div class="row-line"><div><strong>'+escapeHTML(c.name)+'</strong><div class="tiny muted">'+(c.type==='food'?'Food for recipes':c.type==='water'?'Water volumes':'General stock')+' · '+state.items.filter(i=>i.category===c.id).length+' item types</div></div><button class="text-button" data-action="editCategory" data-id="'+escapeHTML(c.id)+'">Edit</button></div>').join('')+'</section>'+
    '<section class="card"><h2>Starter list and backups</h2><p class="small muted">Load an editable list of common items without inventing quantities. You can add more categories and item types whenever you need.</p>'+
    '<div class="actions"><button data-action="starter">+ Load starter items</button><button data-action="export">Export backup</button><button data-action="csv">Export CSV</button><button data-action="import">Import backup</button></div>'+
    '<input id="importInput" type="file" accept="application/json,.json"><p class="hint">JSON backup includes recipes and settings. CSV is a readable inventory list. Import replaces your current inventory after confirmation.</p></section>'+
    '<section class="card"><h2>Useful limitations</h2><p class="small muted">All counts stay on this browser, not automatically synced to your husband’s phone or GitHub. A single expiry date represents the earliest item in that stock line — use separate stock lines if different batches expire on different dates. Preparedness is about practical supplies, not chasing a perfect score.</p></section>';
}
function render(){
  $('message').innerHTML=message?'<div class="message warning">'+escapeHTML(message)+(undoStock?' <button data-action="undoStock">Undo stock change</button>':'')+'</div>':'';
  $('screen').innerHTML=activeTab==='overview'?overview():activeTab==='inventory'?inventory():activeTab==='meals'?meals():activeTab==='rotation'?rotation():settings();
  document.querySelectorAll('.nav [data-tab]').forEach(button=>button.setAttribute('aria-current',String(button.dataset.tab===activeTab?'page':'false')));
}
function showTab(t){activeTab=t;render();window.scrollTo({top:0,behavior:'smooth'});}
function moveRecipe(id,offset){
  const from=state.recipes.findIndex(r=>r.id===id),to=from+offset;
  if(from<0||to<0||to>=state.recipes.length)return;
  [state.recipes[from],state.recipes[to]]=[state.recipes[to],state.recipes[from]];
  persist();
}
function downloadFile(name,text,mime){
  const blob=new Blob([text],{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},3000);
}
function loadStarters(){
  let count=0;
  for(const [category,name,unit,litres] of STARTER_ITEMS){
    if(state.items.some(i=>i.category===category && i.name.toLowerCase()===name.toLowerCase()))continue;
    state.items.push({id:uid(),name,category,unit,current:null,optimum:null,location:'',expiry:'',notes:'',litresPerUnit:litres||null});count++;
  }
  persist();showTab('inventory');notify(count?count+' starter item types added. Their quantities and targets are blank until you enter them.':'Starter items are already in your inventory.');
}
$('quickAdd').addEventListener('click',()=>editItem());
document.addEventListener('click',e=>{
  const button=e.target.closest('button');if(!button)return;
  if(button.dataset.tab){showTab(button.dataset.tab);return;}
  const action=button.dataset.action,id=button.dataset.id;
  switch(action){
    case 'scan':startScanner();break;
    case 'stopScan':stopScanner();break;
    case 'bulk':editBulk();break;
    case 'categoryFilter':categoryFilter=id;showTab('inventory');break;
    case 'rotation':showTab('rotation');break;
    case 'rotateFilter':rotationFilter=id;render();break;
    case 'duplicate':{const i=itemById(id);if(i)editItem(null,{...i,id:'',name:i.name+' (copy)'});break;}
    case 'undoStock':{if(undoStock){const i=itemById(undoStock.id);if(i&&i.current===undoStock.after){i.current=undoStock.before;i.lastUsed=undoStock.lastUsed;undoStock=null;persist();}else notify('Stock has changed again. Review the item before adjusting.');}break;}
    case 'newItem':editItem();break;
    case 'editItem':editItem(id);break;
    case 'newCategory':editCategory();break;
    case 'editCategory':editCategory(id);break;
    case 'newRecipe':editRecipe();break;
    case 'reviewSuggestion':{const r=suggestions().find(r=>r.id===id);if(r)editRecipe(null,{...r,preparation:'cook',mealSlot:'dinner'});break;}
    case 'editRecipe':editRecipe(id);break;
    case 'close':closeDialog();break;
    case 'plus':case 'minus':{
      const i=itemById(id);if(!i)break;
      undoStock={id,before:i.current,lastUsed:i.lastUsed};if(action==='minus')i.lastUsed=new Date().toISOString();
      i.current=ReservesCoverage.adjust(i,action==='plus'?1:-1).current;undoStock.after=i.current;persist();break;
    }
    case 'addIngredient':$('ingredientRows').insertAdjacentHTML('beforeend',ingredientRow());break;
    case 'removeIngredient':button.closest('.ingredient-row')?.remove();break;
    case 'recipeUp':moveRecipe(id,-1);break;
    case 'recipeDown':moveRecipe(id,1);break;
    case 'starter':loadStarters();break;
    case 'export':downloadFile('home-reserves-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json');break;
    case 'csv':{
      const rows=[['Category','Item','Current','Optimum','Unit','Location','Expiry','Litres per item','Notes'],...state.items.map(i=>[cat(i.category)?.name||'',i.name,i.current??'',i.optimum??'',i.unit,i.location||'',i.expiry||'',i.litresPerUnit??'',i.notes||''])];
      const csv=rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
      downloadFile('home-reserves-inventory.csv','\uFEFF'+csv,'text/csv;charset=utf-8');break;
    }
    case 'import':$('importInput')?.click();break;
    case 'deleteItem':if(confirm('Delete this stock item? Meal recipes using it will need updating.')){state.items=state.items.filter(i=>i.id!==id);persist();closeDialog();}break;
    case 'deleteCategory':if(state.items.some(i=>i.category===id)){alert('Move or delete the items in this category first.');break;}
      if(confirm('Delete this category?')){state.categories=state.categories.filter(c=>c.id!==id);persist();closeDialog();}break;
    case 'deleteRecipe':if(confirm('Delete this meal?')){state.recipes=state.recipes.filter(r=>r.id!==id);persist();closeDialog();}break;
  }
});
document.addEventListener('input',e=>{
  if(e.target.id==='f_name'&&!$('itemForm').dataset.id&&/microwave rice/i.test(e.target.value)&&!$('f_portionsPerPack').value){$('f_portionsPerPack').value=2;}
  if(['f_name','f_current','f_portionsPerPack'].includes(e.target.id)){const q=Number($('f_current').value),p=Number($('f_portionsPerPack').value);$('portionPreview').textContent=fmt(q)+' packs × '+fmt(p)+' = '+fmt(q*p)+' portions';}
  if(e.target.id!=='filterSearch')return;
  query=e.target.value;const caret=e.target.selectionStart;render();const field=$('filterSearch');field.focus();field.setSelectionRange(caret,caret);
});
document.addEventListener('change',async e=>{
  if(e.target.id==='sortStock'){sortOrder=e.target.value;render();}
  if(e.target.id==='planMode'){state.settings.planMode=e.target.value;persist();}
  if(e.target.id==='planDays'){state.settings.planDays=Number(e.target.value);persist();}
  if(e.target.id==='filterCategory'){categoryFilter=e.target.value;render();}
  if(e.target.id==='filterStatus'){statusFilter=e.target.value;render();}
  if(e.target.id==='importInput'&&e.target.files?.[0]){
    try{
      const d=validData(JSON.parse(await e.target.files[0].text()));
      if(!confirm('Replace your ENTIRE current inventory, categories, meals and settings with this backup?'))return;
      state=d;persist();notify('Your backup was imported.');
    }catch(err){notify('Could not import file: '+err.message);}
    finally{if(e.target)e.target.value='';}
  }
});
document.addEventListener('submit',async e=>{
  const form=e.target;
  if(!['bulkForm','itemForm','categoryForm','recipeForm','settingsForm'].includes(form.id))return;
  e.preventDefault();const data=new FormData(form),id=form.dataset.id;
  if(form.id==='bulkForm'){state.items.forEach(i=>{i.current=numberOrNull(data.get('qty_'+i.id));});
  }else if(form.id==='itemForm'){
    const name=String(data.get('name')||'').trim(),category=String(data.get('category')),unit=String(data.get('unit')||'').trim();
    if(!name||!unit||!cat(category)){alert('Please provide a name, unit and valid category.');return;}
    const item={...(id?itemById(id):{}),id:id||uid(),name,category,unit,current:numberOrNull(data.get('current')),optimum:numberOrNull(data.get('optimum')),location:String(data.get('location')||'').trim(),expiry:String(data.get('expiry')||''),litresPerUnit:numberOrNull(data.get('litresPerUnit')),gramsPerUnit:numberOrNull(data.get('gramsPerUnit')),kidPreference:String(data.get('kidPreference')||'auto'),notes:String(data.get('notes')||'').trim()};
    for(const key of ['portionsPerPack','portionSize','pricePaid','unitsPerPack','proteinPerPortion','energyPerPortion'])item[key]=numberOrNull(data.get(key));
    for(const key of ['barcode','foodGroup','portionType','portionSource','mealSlot','preparation','requiresWater','diet','dateType','reviewedBestBefore','potable','storageDate'])item[key]=String(data.get(key)||'');
    const photo=data.get('productPhoto');if(photo?.size){try{item.photo=await preparePhoto(photo);}catch(error){$('saveError').textContent=error.message;return;}}
    if(id){const at=state.items.findIndex(i=>i.id===id);if(at<0)return;state.items[at]=item;}else state.items.push(item);
  }else if(form.id==='categoryForm'){
    const name=String(data.get('name')||'').trim(),type=String(data.get('type'));
    if(!name||!['food','water','other'].includes(type)){alert('Enter a valid category.');return;}
    if(id){const c=cat(id);if(!c)return;c.name=name;c.type=type;}else state.categories.push({id:uid(),name,type});
  }else if(form.id==='recipeForm'){
    const name=String(data.get('name')||'').trim(),portions=Number(data.get('portions'));
    const ingredients=[...form.querySelectorAll('.ingredient-row')].map(row=>({itemId:row.querySelector('.ingredientId')?.value,amount:Number(row.querySelector('.ingredientQty')?.value)}));
    if(!name||!Number.isInteger(portions)||portions<1||!ingredients.length||ingredients.some(ing=>!ing.itemId||!Number.isFinite(ing.amount)||ing.amount<=0)){
      alert('Enter a meal name, portions and a positive amount for every ingredient.');return;
    }
    const recipe={...(id?state.recipes.find(r=>r.id===id):{}),id:id||uid(),name,portions,ingredients,mealSlot:String(data.get('mealSlot')||''),preparation:String(data.get('preparation')||'')};
    if(id){const at=state.recipes.findIndex(r=>r.id===id);if(at<0)return;state.recipes[at]=recipe;}else state.recipes.push(recipe);
  }else if(form.id==='settingsForm'){
    const adults=Number(data.get('adults')),kids=Number(data.get('kids')),childPortion=Number(data.get('childPortion')),people=adults+kids,mealsPerDay=Number(data.get('mealsPerDay')),waterPerPerson=Number(data.get('waterPerPerson'));
    if(!Number.isInteger(adults)||adults<0||!Number.isInteger(kids)||kids<0||!(childPortion>=0.1&&childPortion<=1)||!Number.isInteger(people)||people<1||!Number.isInteger(mealsPerDay)||mealsPerDay<1||!(waterPerPerson>0)){alert('Enter valid household figures.');return;}
    state.settings={...state.settings,adultDiet:String(data.get('adultDiet')||''),childDiet:String(data.get('childDiet')||''),adultEnergy:numberOrNull(data.get('adultEnergy')),childEnergy:numberOrNull(data.get('childEnergy')),targetDays:Number(data.get('targetDays'))||21,diet:String(data.get('diet')||'any'),petWater:Number(data.get('petWater'))||0,specialWater:Number(data.get('specialWater'))||0,people,adults,kids,childPortion,mealsPerDay,waterPerPerson,kidPreparation:String(data.get('kidPreparation')||'separate'),kidFoodMode:String(data.get('kidFoodMode')||'automatic')};
  }
  if(persist()&&$('editor').open)closeDialog();
});
$('editor').addEventListener('cancel',()=>stopScanner());
$('editor').addEventListener('click',e=>{if(e.target===$('editor'))closeDialog();});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
render();

// Reload changes from another inventory tab without discarding an open form.
window.addEventListener('storage',event=>{if(event.key!==STORAGE_KEY||$('editor').open)return;try{state=validData(JSON.parse(event.newValue));persistedState=JSON.parse(JSON.stringify(state));render()}catch{notify('Inventory changed in another tab. Export before attempting recovery.')}});
if(location.hash.startsWith('#item=')){try{const itemId=decodeURIComponent(location.hash.slice(6));activeTab='inventory';render();if(itemById(itemId))editItem(itemId);else notify('That stock item is no longer in this inventory.')}catch{notify('This stock link is invalid.')}}
