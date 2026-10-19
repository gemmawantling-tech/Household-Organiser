import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function app(data){
 const node={innerHTML:'',addEventListener(){},setAttribute(){}};
 const c=vm.createContext({console,Date,Math,JSON,Number,String,Object,Array,Set,Intl,location:{hash:''},localStorage:{getItem:()=>JSON.stringify(data)},document:{getElementById:()=>node,querySelectorAll:()=>[],addEventListener(){}},navigator:{},window:{addEventListener(){}}});
 vm.runInContext(fs.readFileSync('Inventory/planner.js','utf8'),c);vm.runInContext(fs.readFileSync('Inventory/app.js','utf8'),c);return code=>vm.runInContext(code,c);
}
const item=(id,name,current,unit='g')=>({id,name,current,unit,category:'food'});
const data=items=>({categories:[{id:'food',type:'food'}],items,recipes:[],settings:{people:4,adults:2,kids:2,childPortion:0.5,mealsPerDay:3,waterPerPerson:3}});
test('automatic meals share rice across beans and lentils without changing inventory',()=>{
 const run=app(data([item('rice','Dry rice',300),item('beans','Black beans',800),item('lentils','Lentils',300)]));
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
 const d=data([item('s','Soup',800)]);d.settings={people:5,mealsPerDay:1};d.recipes=[{id:'custom',portions:2,ingredients:[{itemId:'s',amount:400}]}];
 const run=app(d);assert.equal(run('household().adults'),5);assert.equal(run('calculateMeals().portions'),4);assert.equal(run('calculateMeals(suggestions()).portions'),2);
});
test('fussy children only get explicitly accepted foods, including plain pasta without sauce',()=>{
 const d=data([{...item('p','Pasta',750),kidAccepted:true},item('s','Pasta sauce',1500)]);d.settings.kidFoodMode='confirmed';const run=app(d);
 assert.equal(run('suggestions().filter(r=>r.audience==="kids").length'),1);
 assert.equal(run('suggestions().find(r=>r.audience==="kids").name'),'Plain pasta');
 assert.equal(run('suggestions().find(r=>r.audience==="kids").ingredients.length'),1);
 assert.ok(run('calculateMeals(suggestions()).kidPortions')>0);
 assert.match(run('automaticMeals()'),/SIMPLE CHILDREN’S IDEA/);
});
test('plain preference excludes mixed options and separate preference labels them',()=>{
 const d=data([{...item('r','Rice',750),kidAccepted:true},{...item('b','Beans',2000),kidAccepted:true}]);d.settings.kidPreparation='plain';const run=app(d);
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
 assert.match(run('automaticMeals()'),/Boil the pasta/);
 assert.match(run('automaticMeals()'),/75 g Pasta/);
});
test('optional child dislikes exclude food without removing adult recipes',()=>{
 const run=app(data([{...item('p','Pasta',750),kidPreference:'no'},item('s','Pasta sauce',1500)]));
 assert.equal(run('suggestions().some(r=>r.audience==="kids")'),false);
 assert.equal(run('suggestions().some(r=>r.audience==="adult")'),true);
});
test('legacy unchecked food does not block automatic ideas and zero children prompts setup',()=>{
 const d=data([{...item('p','Pasta',750),kidAccepted:false}]);
 let run=app(d);assert.ok(run('suggestions().some(r=>r.audience==="kids")'));
 d.settings={people:4};run=app(d);assert.match(run('automaticMeals()'),/Set adult and child numbers/);
 assert.match(run('meals()'),/Optional: your own recipes/);
});
test('microwave rice pouch and beans sachet suggest two adult portions',()=>{
 const run=app(data([item('r','Microwave rice',1,'pouch'),item('b','Black beans',1,'sachet')]));
 assert.equal(run('ReservesPlanner.profile(itemById("r")).grams'),250);
 assert.equal(run('ReservesPlanner.profile(itemById("b")).grams'),250);
 assert.equal(run('calculateMeals(suggestions()).individually["auto:r:b:adult"]'),2);
 assert.equal(run('ReservesPlanner.preparation(suggestions().find(r=>r.audience==="adult"),foodItems()).includes("sachet")'),true);
});
test('soup and tortilla crisps are combined and share soup with standalone options',()=>{
 const run=app(data([item('s','Tomato soup',1,'tin'),item('c','Tortilla crisps',1,'180g bag')]));
 assert.equal(run('suggestions().some(r=>r.name.startsWith("Soup with tortilla crisps"))'),true);
 assert.equal(run('calculateMeals(suggestions()).individually["auto:s:c:adult"]'),1);
 assert.equal(run('calculateMeals(suggestions()).portions'),1);
 assert.match(run('automaticMeals()'),/adult portions or 2 child portions/);
 assert.equal(run('ReservesPlanner.profile(itemById("c")).grams'),180);
});
test('recipe combinations follow explicit pack weights and require every ingredient',()=>{
 const run=app(data([{...item('r','Microwave rice',1,'pouch'),gramsPerUnit:250},{...item('b','Beans',1,'sachet'),gramsPerUnit:100}]));
 assert.equal(run('calculateMeals(suggestions()).individually["auto:r:b:adult"]'),0);
 run('state.items=state.items.filter(i=>i.id!=="b")');
 assert.equal(run('suggestions().some(r=>r.name==="Rice and beans")'),false);
});
