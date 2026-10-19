import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function app(data){
 let saved=JSON.stringify(data);
 const node={innerHTML:'',addEventListener(){},setAttribute(){}};
 const c=vm.createContext({console,Date,Math,JSON,Number,String,Object,Array,Set,Intl,location:{hash:''},localStorage:{getItem:()=>saved,setItem:(key,value)=>saved=value},document:{getElementById:()=>node,querySelectorAll:()=>[],addEventListener(){}},navigator:{},window:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync('events.js','utf8'),c);
 vm.runInContext(fs.readFileSync('Inventory/recipe-library.js','utf8'),c);
 vm.runInContext(fs.readFileSync('Inventory/planner.js','utf8'),c);vm.runInContext(fs.readFileSync('Inventory/app.js','utf8'),c);return code=>vm.runInContext(code,c);
}
const item=(id,name,current,unit='g')=>({id,name,current,unit,category:'food'});
const data=items=>({categories:[{id:'food',type:'food'}],items,recipes:[],settings:{people:4,adults:2,kids:2,childPortion:0.5,mealsPerDay:3,waterPerPerson:3}});
test('automatic meals share rice across beans and lentils without changing inventory',()=>{
 const run=app(data([item('rice','Dry rice',300),item('beans','Black beans',800),item('lentils','Lentils',300),item('s','Tomato sauce',800),item('v','Roasted peppers',400)]));
 assert.equal(run('calculateMeals(suggestions()).portions'),4);
 assert.equal(run('itemById("rice").current'),300);
 assert.match(run('automaticMeals()'),/2 adults \+ 2 children/);
});
test('unit conversion, explicit pack sizes and child-only households',()=>{
 const run=app(data([]));
 assert.equal(run('ReservesPlanner.profile({name:"Pasta",unit:"kg"}).grams'),1000);
 assert.equal(run('ReservesPlanner.profile({name:"Pasta",unit:"500g pack"}).grams'),500);
 assert.equal(run('ReservesPlanner.profile({name:"Pasta",unit:"pack",gramsPerUnit:250}).grams'),250);
 assert.equal(run('ReservesPlanner.household({adults:0,kids:2,childPortion:0.5}).equivalents'),1);
});
test('uncounted, expired, nonfood and unknown stock do not inflate automatic estimates',()=>{
 const d=data([item('a','Soup',null),{...item('b','Soup',10000),expiry:'2000-01-01'},item('c','Coffee',10000),{...item('d','Soup',10000),category:'other'}]);
 const run=app(d);assert.equal(run('suggestions().length'),0);assert.equal(run('calculateMeals(suggestions()).portions'),0);
});
test('old saved households keep their size and recipe plans stay separate',()=>{
 const d=data([item('s','Soup',800),item('bread','Bread',160)]);d.settings={people:5,mealsPerDay:1};d.recipes=[{id:'custom',portions:2,ingredients:[{itemId:'s',amount:400}]}];
 const run=app(d);assert.equal(run('household().adults'),5);assert.equal(run('calculateMeals().portions'),4);assert.equal(run('calculateMeals(suggestions()).portions'),2);
});
test('confirmed-only children do not count bare pasta as a meal',()=>{
 const d=data([{...item('p','Pasta',750),kidAccepted:true},item('s','Pasta sauce',1500)]);d.settings.kidFoodMode='confirmed';const run=app(d);
 assert.equal(run('suggestions().filter(r=>r.audience==="kids").length'),0);
 assert.equal(run('calculateMeals(suggestions()).kidPortions'),0);
 assert.ok(run('suggestions().some(r=>r.audience==="adult")'));
});
test('plain preference excludes mixed options and separate preference labels them',()=>{
 const d=data([{...item('r','Rice',750),kidAccepted:true},{...item('b','Beans',2000),kidAccepted:true},{...item('s','Tomato sauce',1000),kidAccepted:true},{...item('v','Roasted peppers',500),kidAccepted:true}]);d.settings.kidPreparation='plain';const run=app(d);
 assert.equal(run('suggestions().filter(r=>r.audience==="kids").every(r=>r.ingredients.length===1)'),true);
 run('state.settings.kidPreparation="separate"');
 assert.equal(run('suggestions().some(r=>r.audience==="kids"&&r.name.includes("served separately"))'),true);
});
test('adult supplies cannot imply coverage for children with no accepted foods',()=>{
 const d=data([item('s','Soup',4000)]);d.settings.kidFoodMode='confirmed';const run=app(d);
 assert.equal(run('calculateMeals(suggestions()).kidPortions'),0);
 assert.match(run('automaticMeals()'),/No children’s meal ideas match/);
 assert.match(run('automaticMeals()'),/class="value">0<\/div><div class="label">Food days/);
});

test('inventory alone produces children and adult meals with quantities and preparation',()=>{
 const run=app(data([item('p','Pasta',750),item('s','Pasta sauce',1500)]));
 assert.ok(run('suggestions().some(r=>r.audience==="kids")'));
 assert.ok(run('suggestions().some(r=>r.audience==="adult")'));
 assert.ok(run('calculateMeals(suggestions()).kidPortions')>0);
 assert.match(run('automaticMeals()'),/Boil pasta/);
 assert.match(run('automaticMeals()'),/75 g Pasta/);
});
test('optional child dislikes exclude food without removing adult recipes',()=>{
 const run=app(data([{...item('p','Pasta',750),kidPreference:'no'},item('s','Pasta sauce',1500)]));
 assert.equal(run('suggestions().some(r=>r.audience==="kids")'),false);
 assert.equal(run('suggestions().some(r=>r.audience==="adult")'),true);
});
test('legacy unchecked food does not block automatic ideas and zero children prompts setup',()=>{
 const d=data([{...item('p','Pasta',750),kidAccepted:false},item('s','Pasta sauce',1500)]);
 let run=app(d);assert.ok(run('suggestions().some(r=>r.audience==="kids")'));
 d.settings={people:4};run=app(d);assert.match(run('automaticMeals()'),/Set adult and child numbers/);
 assert.match(run('meals()'),/Optional: your own recipes/);
});
test('microwave rice uses cooked portions in a full pepper and bean dish',()=>{
 const run=app(data([item('r','Microwave rice',1,'pouch'),item('b','Black beans',1,'sachet'),item('s','Tomato sauce',500),item('v','Roasted peppers',300)]));
 assert.equal(run('ReservesPlanner.profile(itemById("r")).grams'),250);
 assert.equal(run('ReservesPlanner.profile(itemById("b")).grams'),250);
 assert.equal(run('calculateMeals(suggestions()).individually["auto:bean-pepper-rice:r:b:s:v:adult"]'),1);
 assert.equal(run('ReservesPlanner.preparation(suggestions().find(r=>r.audience==="adult"),foodItems()).includes("rice")'),true);
});
test('bare noodles, rice with baked beans and soup with crisps do not count as meals',()=>{
 for(const foods of [[item('n','Noodles',1000)],[item('r','Rice',1000),item('b','Baked beans',1000)],[item('s','Soup',1000),item('c','Tortilla crisps',500)]]){
  const run=app(data(foods));assert.equal(run('calculateMeals(suggestions()).portions'),0);
 }
});
test('recipe combinations follow explicit pack weights and require every ingredient',()=>{
 const run=app(data([{...item('r','Microwave rice',1,'pouch'),gramsPerUnit:250},{...item('b','Beans',1,'sachet'),gramsPerUnit:100},item('s','Tomato sauce',500),item('v','Roasted peppers',300)]));
 assert.equal(run('calculateMeals(suggestions()).individually["auto:bean-pepper-rice:r:b:s:v:adult"]'),0);
 run('state.items=state.items.filter(i=>i.id!=="b")');
 assert.equal(run('suggestions().some(r=>r.name==="Rice and beans")'),false);
});
test('expanded recipes combine three ingredients and include online inspiration',()=>{
 const run=app(data([item('p','Pasta',300),item('t','Tuna',320),item('c','Sweetcorn',240),item('pe','Pesto',100)]));
 assert.ok(run('suggestions().some(r=>r.name==="Tuna, sweetcorn and pesto pasta")'));
 assert.equal(run('calculateMeals(suggestions()).individually["auto:tuna-corn-pasta:p:t:c:pe:adult"]'),4);
 assert.match(run('automaticMeals()'),/Recipe source and inspiration/);
 assert.match(run('automaticMeals()'),/bbcgoodfoodme.com\/recipes\/storecupboard-pasta-salad/);
});
test('missing ingredients produce separate ideas without counted recipes',()=>{
 const run=app(data([item('p','Pasta',300),item('t','Tuna',320),item('pe','Pesto',100)]));
 assert.equal(run('suggestions().some(r=>r.name==="Tuna, sweetcorn and pesto pasta")'),false);
 assert.ok(run('ReservesPlanner.nearly(foodItems()).some(r=>r.name==="Tuna, sweetcorn and pesto pasta"&&r.missing.includes("corn"))'));
 assert.match(run('automaticMeals()'),/More ideas with one extra ingredient/);
});
test('soy and roasted peppers are used with peanut noodles, with every ingredient required',()=>{
 const run=app(data([item('n','Noodles',340),item('p','Peanut butter',100),item('so','Soy sauce',40),item('v','Roasted peppers',300),item('peas','Peas',320)]));
 const r=run('suggestions().find(r=>r.audience==="adult")');assert.match(r.name,/Peanut–soy/);assert.equal(r.ingredients.length,5);
 assert.equal(run('calculateMeals(suggestions()).individually[suggestions().find(r=>r.audience==="adult").id]'),4);
 assert.match(r.note,/Contains peanuts and soy/);
 run('state.items=state.items.filter(i=>i.id!=="so")');assert.equal(run('suggestions().length'),0);
});
test('spicy packets do not become plain children suggestions or alter adult choices',()=>{
 const run=app(data([item('r','Spicy microwave rice',2,'pouch'),item('b','Chilli kidney beans',2,'sachet'),item('s','Tomato sauce',1000),item('v','Roasted peppers',500)]));
 assert.equal(run('suggestions().some(r=>r.audience==="kids")'),false);
 assert.ok(run('suggestions().some(r=>r.audience==="adult")'));
});
test('online-inspired options conserve shared stock across duplicate packs',()=>{
 const run=app(data([item('p','Pasta',300),item('t','Tuna',320),item('t2','Tuna',160),item('c','Sweetcorn',240),item('s','Passata',600),item('v','Roasted peppers',300),item('pe','Pesto',100)]));
 const used=run('(()=>{const recipes=suggestions(),plan=calculateMeals(recipes);return recipes.reduce((sum,r)=>sum+r.ingredients.filter(i=>i.itemId==="p").reduce((s,i)=>s+i.amount*plan.allocated[r.id],0),0)})()');
 assert.ok(used<=300+1e-9);
 assert.equal(run('itemById("p").current'),300);
});

test('baked beans, chickpeas and coconut milk cannot substitute for plain beans or dairy milk',()=>{
 const run=app(data([]));
 assert.equal(run('ReservesPlanner.profile({name:"Baked beans"}).kind'),'bakedBeans');
 assert.equal(run('ReservesPlanner.profile({name:"Chickpeas"}).kind'),'chickpeas');
 assert.equal(run('ReservesPlanner.profile({name:"Coconut milk"})'),null);
 run('state.items=[{id:"b",name:"Baked beans",current:1000,unit:"g",category:"food"},{id:"bread",name:"Bread",current:400,unit:"g",category:"food"}]');
 assert.ok(run('suggestions().some(r=>r.name==="Baked beans on toast")'));
});
test('different library recipes never collide in allocation IDs',()=>{
 const run=app(data([item('p','Pasta',300),item('s','Tomato sauce',600)]));
 const ids=run('suggestions().map(r=>r.id)');assert.equal(new Set(ids).size,ids.length);
});

test('an inventory edit preserves another tab’s different stock change and unknown fields',()=>{
 const run=app(data([{...item('p','Pasta',300),unknown:'keep'},item('r','Rice',500)]));
 run('(()=>{const other=JSON.parse(localStorage.getItem(STORAGE_KEY));other.items.find(i=>i.id==="r").current=900;localStorage.setItem(STORAGE_KEY,JSON.stringify(other));state.items.find(i=>i.id==="p").optimum=600;persist()})()');
 assert.equal(run('itemById("r").current'),900);assert.equal(run('itemById("p").optimum'),600);assert.equal(run('itemById("p").unknown'),'keep');
});
