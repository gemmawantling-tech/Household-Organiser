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
const UNITS = ['unit','item','each','tin','can','jar','bottle','carton','pack','packet','box','bag','pouch','sachet','bar','roll','kit','pair','litre','ml','kg','g','500g pack','1kg pack','2L bottle','5L bottle','£'];
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
let state, activeTab = location.hash==='#stock'?'inventory':'overview', categoryFilter = 'all', statusFilter = 'all', query = '', message = '';
function validData(d){
  if (!d || !Array.isArray(d.categories) || !Array.isArray(d.items) || !Array.isArray(d.recipes) || typeof d.settings !== 'object') throw Error('Not a valid Home Reserves backup');
  if (d.items.length > 20000 || d.categories.length > 500 || d.recipes.length > 2000) throw Error('Backup too large');
  return d;
}
try {state=validData(JSON.parse(localStorage.getItem(STORAGE_KEY)));}catch{state=newData();}
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
const waterLitres = () => state.items.filter(i=>cat(i.category)?.type==='water').reduce((sum,i)=>sum+amount(i)*Math.max(0,Number(i.litresPerUnit)||0),0);
function persist(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));message='';}
  catch{message='Could not save to browser storage. Please export a backup.';}
  render();
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
function editDialog(markup){$('editorBody').innerHTML=markup;$('editor').showModal();}
function closeDialog(){$('editor').close();}
function editItem(id){
  const i=id?itemById(id):null;
  if (!state.categories.length){notify('Create a category before adding stock.');showTab('settings');return;}
  editDialog('<h2>'+(i?'Edit item':'Add item')+'</h2><form id="itemForm" data-id="'+escapeHTML(i?.id||'')+'">'+
    field('name','Item name',i?.name||'','required maxlength="120" placeholder="e.g. Lentils"')+
    dropdown('category','Category',state.categories.map(c=>[c.id,c.name]),i?.category||state.categories[0].id)+
    '<div class="split">'+field('current','Current level',i?.current??'','type="number" min="0" step="any" placeholder="Not counted"')+
    field('optimum','Optimum level',i?.optimum??'','type="number" min="0" step="any" placeholder="Your target"')+'</div>'+
    '<div class="split">'+'<div class="field"><label for="f_unit">Stock counted in</label><input id="f_unit" name="unit" list="stockUnits" value="'+escapeHTML(i?.unit||'pack')+'" required maxlength="32" placeholder="Choose or type a unit"><datalist id="stockUnits">'+UNITS.map(u=>'<option value="'+escapeHTML(u)+'"></option>').join('')+'</datalist></div>'+
    field('location','Storage location',i?.location||'','maxlength="90" placeholder="Utility cupboard"')+'</div>'+
    '<div class="split">'+field('expiry','Earliest expiry date',i?.expiry||'','type="date"')+
    field('litresPerUnit','Litres per item (for water)',i?.litresPerUnit??'','type="number" min="0" step="any" placeholder="e.g. 5"')+'</div>'+
    dropdown('kidPreference','Children’s food preference (optional)',[['auto','Suggest automatically'],['yes','They will eat this'],['no','They will not eat this']],i?.kidPreference||(i?.kidAccepted?'yes':'auto'))+
    field('gramsPerUnit','Food grams per stock unit (ml for milk)',i?.gramsPerUnit??'','type="number" min="0.001" step="any" placeholder="e.g. 500 for a 500g pack"')+
    '<div class="field"><label for="f_notes">Notes</label><textarea id="f_notes" name="notes" rows="2" maxlength="300" placeholder="Optional">'+escapeHTML(i?.notes||'')+'</textarea></div>'+
    '<p class="hint">Leave current level blank if not counted yet, and optimum blank until you choose a target.</p>'+formActions('Item',i?.id)+'</form>');
}
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
function editRecipe(id){
  if (!foodItems().length){showTab('inventory');notify('Add food items to the inventory first, then build a meal from those ingredients.');return;}
  const r=state.recipes.find(r=>r.id===id);
  editDialog('<h2>'+(r?'Edit meal':'Add meal')+'</h2><form id="recipeForm" data-id="'+escapeHTML(r?.id||'')+'">'+
    field('name','Meal name',r?.name||'','required maxlength="120" placeholder="e.g. Bean chilli with rice"')+
    field('portions','Adult-size portions per batch',r?.portions||4,'required type="number" min="1" max="100" step="1"')+
    '<label>Ingredients needed for ONE batch</label><p class="hint">Quantities use the same units as inventory. If each batch needs two tins of beans, enter 2.</p><div id="ingredientRows">'+
    (r?.ingredients?.length?r.ingredients.map(ing=>ingredientRow(ing.itemId,ing.amount)).join(''):ingredientRow())+'</div>'+
    '<button type="button" class="light-button" data-action="addIngredient">+ Ingredient</button>'+formActions('Recipe',r?.id)+'</form>');
}
function unitLabel(i){return i.unit==='£'?'£'+fmt(amount(i)):fmt(amount(i))+' '+escapeHTML(i.unit||'');}
function stat(value,label){return '<div class="stat"><div class="value">'+value+'</div><div class="label">'+label+'</div></div>';}
function stats(){
  const counted=state.items.filter(listed).length,below=state.items.filter(low).length,exp=state.items.filter(expiresSoon).length;
  return '<div class="stat-grid">'+stat(fmt(counted)+'<span class="small muted"> / '+fmt(state.items.length)+'</span>','Item types counted')+stat(fmt(below),'Below your optimum')+stat(fmt(exp),'Expiring or expired')+stat(fmt(calculateMeals(suggestions()).portions),'Automatic adult-size portions')+'</div>';
}
function overview(){
  const m=calculateMeals(suggestions()),people=household().people,meals=setting('mealsPerDay',1),days=Math.floor(Math.min(household().adults?m.adultPortions/household().adults:Infinity,household().kids?m.kidPortions/(household().kids*household().childPortion):Infinity))/meals,water=waterLitres(),waterDays=water/(people*setting('waterPerPerson',3));
  const below=state.items.filter(low).sort((a,b)=>a.name.localeCompare(b.name));
  return automaticMeals()+ '<section class="card hero"><div class="eyebrow">YOUR HOUSEHOLD DASHBOARD</div><h2>A little more prepared, every day.</h2><p class="small muted">Your supplies at a glance. Keep the essentials topped up, without overbuying.</p><div class="hero-actions"><button class="primary" data-tab="inventory">Browse stock →</button><a href="./pantry-view.html">Explore pantry →</a></div></section>'+stats()+
  '<section class="card"><div class="section-title"><h2>What might your supplies cover?</h2><button class="text-button" data-tab="meals">Meal details →</button></div>'+
  '<div class="split"><div><div class="large-number">'+(suggestions().length?fmt(days):'—')+'</div><div class="small muted">Days of planned meals</div><div class="small"><strong>'+(suggestions().length?fmt(days/7)+' weeks':'Count ingredients to estimate')+'</strong></div></div>'+
  '<div><div class="large-number">'+(water>0?fmt(waterDays):'—')+'</div><div class="small muted">Water days</div><div class="small"><strong>'+fmt(water)+' litres logged</strong></div></div></div>'+
  '<p class="hint">Based on '+fmt(people)+' people, '+fmt(meals)+' tracked meal(s) per person daily and '+fmt(setting('waterPerPerson',3))+' litres of water per person daily. These are approximate planning figures, not guarantees of a nutritionally complete diet or water for washing.</p></section>'+
  '<section class="card"><div class="section-title"><h2>Below your optimum</h2><button class="text-button" data-tab="inventory">All stock →</button></div>'+
  (below.length?below.slice(0,7).map(i=>'<div class="row-line"><span>'+escapeHTML(i.name)+'</span><span class="small nowrap">'+fmt(i.current)+' / '+fmt(i.optimum)+' '+escapeHTML(i.unit)+'</span></div>').join(''):'<div class="empty">Nothing currently recorded below its target.</div>')+
  (below.length>7?'<p class="hint">Plus '+(below.length-7)+' more items.</p>':'')+'</section>'+
  (!state.items.length?'<section class="card"><h2>Start your inventory</h2><p class="small muted">Add the items you already have, or load a starter list and fill in quantities as you do a stock check.</p><div class="actions"><button class="primary" data-action="newItem">+ Add first item</button><button data-action="starter">Load starter list</button></div></section>':'');
}
function itemCard(i){
  const c=cat(i.category),expiry=daysToExpiry(i),below=low(i),max=targeted(i)?Number(i.optimum):0;
  let badges='<span class="badge">'+escapeHTML(c?.name||'Other')+'</span>';
  if(!listed(i))badges+='<span class="badge low">Not yet counted</span>';
  else if(below)badges+='<span class="badge low">Below optimum</span>';
  else if(!targeted(i))badges+='<span class="badge">No target</span>';
  if(expiry!==null&&expiry<=30)badges+='<span class="badge red">'+(expiry<0?'Expired':expiry===0?'Expires today':'Expires in '+expiry+' days')+'</span>';
  return '<article class="item"><div class="item-header"><div><div class="item-title">'+escapeHTML(i.name)+'</div>'+badges+'</div><button class="text-button" data-action="editItem" data-id="'+escapeHTML(i.id)+'">Edit</button></div>'+
    (listed(i)&&max>0?'<div class="meter '+(below?'low':'')+'"><span style="width:'+Math.min(100,amount(i)*100/max)+'%"></span></div>':'')+
    '<div class="item-bottom"><div class="counts">Current: <strong>'+(listed(i)?(i.unit==='£'?'£':'')+fmt(i.current):'—')+'</strong> '+(i.unit==='£'?'':escapeHTML(i.unit))+'<br>Optimum: <strong>'+(targeted(i)?(i.unit==='£'?'£':'')+fmt(i.optimum):'Not set')+'</strong> '+(i.unit==='£'?'':escapeHTML(i.unit))+
    (i.location?'<br>📍 '+escapeHTML(i.location):'')+(i.expiry?'<br>Expiry: '+escapeHTML(i.expiry):'')+(i.notes?'<br>'+escapeHTML(i.notes):'')+'</div>'+
    '<div class="stepper"><button type="button" data-action="minus" data-id="'+escapeHTML(i.id)+'" aria-label="Use one '+escapeHTML(i.name)+'" '+(!listed(i)||amount(i)<=0?'disabled':'')+'>−</button><strong>'+(listed(i)?fmt(i.current):'—')+'</strong><button type="button" data-action="plus" data-id="'+escapeHTML(i.id)+'" aria-label="Add one '+escapeHTML(i.name)+'">+</button></div></div></article>';
}
function inventory(){
  const filtered=state.items.filter(i=>(categoryFilter==='all'||i.category===categoryFilter)&&
    (statusFilter==='all'||(statusFilter==='low'&&low(i))||(statusFilter==='uncounted'&&!listed(i))||(statusFilter==='notarget'&&!targeted(i))||(statusFilter==='expiry'&&expiresSoon(i)))&&
    (i.name+' '+(i.location||'')+' '+(i.notes||'')).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>Number(low(b))-Number(low(a))||a.name.localeCompare(b.name));
  return '<section class="card"><div class="eyebrow">YOUR COLLECTION</div><div class="section-title"><h2>All your supplies</h2><div class="actions"><button data-action="newCategory">+ Category</button><button class="primary" data-action="newItem">+ Item</button></div></div>'+
    '<div class="filter-grid"><input id="filterSearch" class="search" aria-label="Search stock" placeholder="Search items or locations" value="'+escapeHTML(query)+'">'+
    '<select id="filterCategory" aria-label="Select category"><option value="all">All categories</option>'+state.categories.map(c=>'<option value="'+escapeHTML(c.id)+'" '+(categoryFilter===c.id?'selected':'')+'>'+escapeHTML(c.name)+'</option>').join('')+'</select>'+
    '<select id="filterStatus" aria-label="Select status">'+[['all','All levels'],['low','Below optimum'],['uncounted','Not counted'],['notarget','No optimum set'],['expiry','Expiring soon']].map(([v,l])=>'<option value="'+v+'" '+(statusFilter===v?'selected':'')+'>'+l+'</option>').join('')+'</select></div>'+
    '<p class="hint">'+filtered.length+' item types shown · Use + / − for quick stock adjustments, or Edit to enter an exact number.</p></section>'+
    (filtered.length?'<div class="items-grid">'+filtered.map(itemCard).join('')+'</div>':'<section class="card empty">'+(state.items.length?'No items match your filters.':'No inventory yet. Add your first item, or load starter items in Settings.')+'</section>');
}
function automaticMeals(){
  const recipes=suggestions(),plan=calculateMeals(recipes),h=household(),perDay=setting('mealsPerDay',3);
  const adultMeals=h.adults?plan.adultPortions/h.adults:Infinity,kidMeals=h.kids?plan.kidPortions/(h.kids*h.childPortion):Infinity;
  const familyMeals=Math.floor(Math.min(adultMeals,kidMeals)),days=familyMeals/perDay,waterDays=waterLitres()/(h.people*setting('waterPerPerson',3));
  const recognised=foodItems().filter(i=>ReservesPlanner.profile(i)),unknown=foodItems().filter(i=>amount(i)>0&&!ReservesPlanner.profile(i));
  return '<section class="card hero"><div class="eyebrow">AUTOMATIC FAMILY PLAN</div><h2>How long could your reserves last?</h2><div class="stat-grid">'+stat(fmt(days),'Food days at your meal rate')+stat(fmt(waterDays),'Drinking / cooking water days')+stat(fmt(Math.min(days,waterDays)),'Days covered by both')+stat(fmt(familyMeals),'Complete family meals')+(h.kids?stat(fmt(kidMeals/perDay),'Children’s suggested-meal days'):'')+'</div><p class="hint">'+fmt(h.adults)+' adults + '+fmt(h.kids)+' children; each child gets '+fmt(h.childPortion*100)+'% of an adult portion. '+fmt(perDay)+' meals daily. <button class="text-button" data-tab="settings">Change household and portions →</button></p><p class="hint">This estimates meal coverage, not survival time or a complete diet. Cooking fuel, allergies and individual nutritional needs must also be checked. Stock with a past expiry date is excluded from automatic suggestions. Manual recipes are a separate alternative and are not added to these totals.</p></section>'+
  (h.kids===0?'<section class="card"><p>Your household is currently set to '+fmt(h.adults)+' adults and no children. Set the adult and child numbers once to include children’s meals and calculate their portions.</p><button class="primary" data-tab="settings">Set adult and child numbers</button></section>':'')+'<section class="card"><h2>Meals for adults and fussy children</h2><p class="hint">Just add food and quantities in Stock. Meal ideas, portions and ingredient amounts update automatically. Children’s ideas favour simple food served separately; you can optionally mark dislikes in Stock. These are suggestions to try, not confirmed favourites. Ingredients are shared across suggestions, so nothing is counted twice. Quantities below serve either the adults or the children, as labelled; allocated portions can be combined across batches.</p>'+
  (h.kids&&!recipes.some(r=>r.audience==='kids')?'<p class="message warning">No children’s meal ideas match the counted stock and preferences yet. Add food in Stock or review optional preferences in More.</p>':'')+
  (recipes.length?recipes.map(r=>'<article class="meal"><div class="eyebrow">'+(r.audience==='kids'?'SIMPLE CHILDREN’S IDEA':'ADULTS')+'</div><h3>'+escapeHTML(r.name)+'</h3><p class="small">'+(r.audience==='kids'?fmt(h.kids)+' child portions':fmt(h.adults)+' adult portions')+' · '+fmt(plan.allocated[r.id]/(r.audience==='kids'?h.kids*h.childPortion:h.adults))+' group meals in the shared plan</p><p class="small">This recipe alone could make '+fmt(plan.individually[r.id])+' adult portions or '+fmt(Math.floor(plan.individually[r.id]/h.childPortion))+' child portions. These are alternatives using the same ingredients, not extra meals.</p><ul>'+r.ingredients.map(ing=>{const i=itemById(ing.itemId);const q=ing.amount*(r.audience==='kids'?h.kids*h.childPortion:h.adults),p=ReservesPlanner.profile(i);return '<li>'+fmt(q*p.grams)+(p.kind==='milk'?' ml ':' g ')+escapeHTML(i.name)+' <span class="muted">('+fmt(q)+' '+escapeHTML(i.unit)+')</span></li>';}).join('')+'</ul><p class="small">'+escapeHTML(ReservesPlanner.preparation(r,foodItems()))+'</p><p class="hint">Child portion size: '+fmt(h.childPortion*100)+'% each. '+escapeHTML(r.note)+'</p></article>').join(''):'<p class="empty">Count food in Stock to get automatic suggestions. Try microwave rice + bean sachets, soup + tortilla crisps, pasta + sauce, oats + milk or noodles.</p>')+
  (plan.capped?'<p class="message warning">Very large stock: calculation limit reached, totals may be understated.</p>':'')+
  '<details><summary>Ingredient and pack-size assumptions</summary><p class="hint">Dry pasta/rice: 75g per adult; beans: 200g; sauce: 150g; oats: 50g; milk: 200ml; soup: 400g; tortilla crisps: 30g alongside soup; beans with rice: 125g. Unspecified bean pouches/sachets assume 250g. Pack sizes below are estimates unless you entered a size. Edit food grams per stock unit in Stock to match the label. Milk uses ml. Review suitability for each child; smaller portions are adjustable and are not age-specific dietary advice.</p>'+recognised.map(i=>{const p=ReservesPlanner.profile(i);return '<div class="row-line"><span>'+escapeHTML(i.name)+'</span><span>'+fmt(p.grams)+(p.kind==='milk'?'ml':'g')+' / '+escapeHTML(i.unit)+(p.assumed?' (assumed)':'')+'</span></div>';}).join('')+'</details>'+
  (unknown.length?'<p class="hint">Not included automatically (add a manual recipe): '+unknown.map(i=>escapeHTML(i.name)).join(', ')+'.</p>':'')+'</section>';
}
function meals(){
  const plan=calculateMeals(),people=household().equivalents,perDay=setting('mealsPerDay',1),days=plan.portions/(people*perDay);
  return automaticMeals()+ '<details class="card"><summary>Optional: your own recipes</summary><section class="card hero"><div class="eyebrow">MANUAL RECIPE CAPACITY</div><h2>How many meals can you make?</h2>'+
    '<div class="stat-grid">'+stat(fmt(plan.portions),'Individual portions')+stat(fmt(Math.floor(plan.portions/people)),'Complete family meals')+stat(fmt(days),'Days of tracked meals')+stat(fmt(days/7),'Weeks of tracked meals')+'</div>'+
    '<p class="hint">For '+fmt(people)+' people, '+fmt(perDay)+' tracked meal(s) per person per day. Each ingredient is allocated once across the recipes below to avoid counting the same tin or pouch twice.</p></section>'+
    '<section class="card"><div class="section-title"><h2>Your meals</h2><button class="primary" data-action="newRecipe">+ Meal</button></div>'+
    (state.recipes.length?state.recipes.map((r,index)=>'<article class="meal"><div class="line"><div><h3>'+escapeHTML(r.name)+'</h3><div class="small muted">'+fmt(r.portions)+' portions per batch</div></div><button class="text-button" data-action="editRecipe" data-id="'+escapeHTML(r.id)+'">Edit</button></div>'+
      '<ul>'+r.ingredients.map(ing=>{const i=itemById(ing.itemId);return '<li>'+fmt(ing.amount)+' '+escapeHTML(i?.unit||'units')+' '+escapeHTML(i?.name||'(item removed)')+'</li>';}).join('')+'</ul>'+
      '<div class="line"><div class="small"><strong>'+fmt(plan.allocated[r.id]||0)+' batches</strong> in shared plan<br><span class="muted">Up to '+fmt(plan.individually[r.id]||0)+' if made on its own</span></div>'+
      '<div class="recipe-tools"><button data-action="recipeUp" data-id="'+escapeHTML(r.id)+'" title="Move earlier" aria-label="Move '+escapeHTML(r.name)+' earlier" '+(index===0?'disabled':'')+'>↑</button><button data-action="recipeDown" data-id="'+escapeHTML(r.id)+'" title="Move later" aria-label="Move '+escapeHTML(r.name)+' later" '+(index===state.recipes.length-1?'disabled':'')+'>↓</button></div></div></article>').join(''):
      '<div class="empty">Your automatic suggestions are above. You can optionally save your own recipes here.</div>')+
    '<p class="hint">The plan rotates through recipes from top to bottom, making one batch each when ingredients are available. Change the order with the arrows; your result may change with recipe choices and priorities. Portions do not measure calorie or nutritional adequacy.</p>'+(plan.capped?'<p class="message warning">Calculation stopped at its batch limit. Extremely large stock quantities may be undercounted.</p>':'')+'</section>'+
    '<section class="card"><h2>Family meal planning</h2><p class="small muted">Start with meals you really make — for example, pasta and sauce, bean chilli with rice, or lentil soup. Include ALL key ingredients in the recipe. The app will show your possible batch count from your current stock. Change household size or meals per day in Settings.</p><button data-tab="inventory">Add food inventory →</button></section></details>';
}
function settings(){
  return '<section class="card"><h2>Household planning assumptions</h2><form id="settingsForm"><div class="split">'+
    field('adults','Adults',household().adults,'required type="number" min="0" max="30" step="1"')+field('kids','Children',household().kids,'required type="number" min="0" max="30" step="1"')+field('childPortion','Child portion / adult portion',household().childPortion,'required type="number" min="0.1" max="1" step="0.05"')+
    field('mealsPerDay','Tracked meals per person / day',setting('mealsPerDay',1),'required type="number" min="1" max="6" step="1"')+'</div>'+
    dropdown('kidFoodMode','Children’s meal suggestions',[['automatic','Automatic ideas from inventory'],['confirmed','Only foods marked: they will eat this']],state.settings.kidFoodMode||'automatic')+
    dropdown('kidPreparation','How will the children eat their food?',[['separate','Separate foods / sauce on the side'],['plain','Plain, single-food options only'],['mixed','Familiar mixed meals are OK']],state.settings.kidPreparation||'separate')+
    field('waterPerPerson','Water litres per person / day',setting('waterPerPerson',3),'required type="number" min="0.1" max="20" step="0.1"')+
    '<p class="hint">Select 1 tracked meal a day if you are only planning dinners, or 3 if you have included breakfast, lunch and dinner. The water estimate covers drinking and basic cooking only.</p><button class="primary" type="submit">Save assumptions</button></form></section>'+
    '<section class="card"><div class="section-title"><h2>My categories</h2><button data-action="newCategory">+ Category</button></div>'+state.categories.map(c=>'<div class="row-line"><div><strong>'+escapeHTML(c.name)+'</strong><div class="tiny muted">'+(c.type==='food'?'Food for recipes':c.type==='water'?'Water volumes':'General stock')+' · '+state.items.filter(i=>i.category===c.id).length+' item types</div></div><button class="text-button" data-action="editCategory" data-id="'+escapeHTML(c.id)+'">Edit</button></div>').join('')+'</section>'+
    '<section class="card"><h2>Starter list and backups</h2><p class="small muted">Load an editable list of common items without inventing quantities. You can add more categories and item types whenever you need.</p>'+
    '<div class="actions"><button data-action="starter">+ Load starter items</button><button data-action="export">Export backup</button><button data-action="csv">Export CSV</button><button data-action="import">Import backup</button></div>'+
    '<input id="importInput" type="file" accept="application/json,.json"><p class="hint">JSON backup includes recipes and settings. CSV is a readable inventory list. Import replaces your current inventory after confirmation.</p></section>'+
    '<section class="card"><h2>Useful limitations</h2><p class="small muted">All counts stay on this browser, not automatically synced to your husband’s phone or GitHub. A single expiry date represents the earliest item in that stock line — use separate stock lines if different batches expire on different dates. Preparedness is about practical supplies, not chasing a perfect score.</p></section>';
}
function render(){
  $('message').innerHTML=message?'<div class="message warning">'+escapeHTML(message)+'</div>':'';
  $('screen').innerHTML=activeTab==='overview'?overview():activeTab==='inventory'?inventory():activeTab==='meals'?meals():settings();
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
    case 'newItem':editItem();break;
    case 'editItem':editItem(id);break;
    case 'newCategory':editCategory();break;
    case 'editCategory':editCategory(id);break;
    case 'newRecipe':editRecipe();break;
    case 'editRecipe':editRecipe(id);break;
    case 'close':closeDialog();break;
    case 'plus':case 'minus':{
      const i=itemById(id);if(!i)break;
      i.current=Math.max(0,Math.round((amount(i)+(action==='plus'?1:-1))*1000)/1000);persist();break;
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
  if(e.target.id!=='filterSearch')return;
  query=e.target.value;const caret=e.target.selectionStart;render();const field=$('filterSearch');field.focus();field.setSelectionRange(caret,caret);
});
document.addEventListener('change',async e=>{
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
document.addEventListener('submit',e=>{
  const form=e.target;
  if(!['itemForm','categoryForm','recipeForm','settingsForm'].includes(form.id))return;
  e.preventDefault();const data=new FormData(form),id=form.dataset.id;
  if(form.id==='itemForm'){
    const name=String(data.get('name')||'').trim(),category=String(data.get('category')),unit=String(data.get('unit')||'').trim();
    if(!name||!unit||!cat(category)){alert('Please provide a name, unit and valid category.');return;}
    const item={id:id||uid(),name,category,unit,current:numberOrNull(data.get('current')),optimum:numberOrNull(data.get('optimum')),location:String(data.get('location')||'').trim(),expiry:String(data.get('expiry')||''),litresPerUnit:numberOrNull(data.get('litresPerUnit')),gramsPerUnit:numberOrNull(data.get('gramsPerUnit')),kidPreference:String(data.get('kidPreference')||'auto'),notes:String(data.get('notes')||'').trim()};
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
    const recipe={id:id||uid(),name,portions,ingredients};
    if(id){const at=state.recipes.findIndex(r=>r.id===id);if(at<0)return;state.recipes[at]=recipe;}else state.recipes.push(recipe);
  }else if(form.id==='settingsForm'){
    const adults=Number(data.get('adults')),kids=Number(data.get('kids')),childPortion=Number(data.get('childPortion')),people=adults+kids,mealsPerDay=Number(data.get('mealsPerDay')),waterPerPerson=Number(data.get('waterPerPerson'));
    if(!Number.isInteger(adults)||adults<0||!Number.isInteger(kids)||kids<0||!(childPortion>=0.1&&childPortion<=1)||!Number.isInteger(people)||people<1||!Number.isInteger(mealsPerDay)||mealsPerDay<1||!(waterPerPerson>0)){alert('Enter valid household figures.');return;}
    state.settings={...state.settings,people,adults,kids,childPortion,mealsPerDay,waterPerPerson,kidPreparation:String(data.get('kidPreparation')||'separate'),kidFoodMode:String(data.get('kidFoodMode')||'automatic')};
  }
  persist();if($('editor').open)closeDialog();
});
$('editor').addEventListener('click',e=>{if(e.target===$('editor'))closeDialog();});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
render();
