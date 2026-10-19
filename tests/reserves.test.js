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
