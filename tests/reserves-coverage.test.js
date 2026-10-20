import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const context=vm.createContext({Date,console});vm.runInContext(fs.readFileSync('Inventory/planner.js','utf8'),context);
const C=context.ReservesCoverage;
const settings={adults:4,kids:0,mealsPerDay:3,targetDays:21};
const stock=(id,more={})=>({id,current:40,preparation:'ready',requiresWater:'no',...more});
test('40 rice packs with 2 side servings make 80 portions but zero complete meals',()=>{
 const rice=stock('rice',{portionsPerPack:2,portionType:'side'});
 assert.equal(C.portions(rice),80);assert.equal(C.allocate([rice],[],settings).days,0);
});
test('water unit conversions and multipacks preserve volume',()=>{
 for(const [unit,count,expected] of [['litres',2,2],['ml',500,0.5],['500ml bottle',12,6],['2L bottle',6,12],['5L container',3,15]])assert.equal(C.litres({unit,current:count}),expected);
 assert.equal(C.litres({unit:'multipack',current:4,unitsPerPack:6,litresPerUnit:.5}),12);
});
test('four person worked water examples, potable confirmation and extra needs',()=>{
 const w=C.water([stock('water',{current:252,unit:'litre',potable:'yes'}),stock('rain',{current:20,unit:'litre',potable:'no'}),stock('unknown',{current:50,unit:'litre'})],settings);
 assert.equal(w.daily,12);assert.equal(w.basic,40);assert.equal(w.days,21);assert.equal(w.basicDays,6.3);assert.equal(w.shortfall,0);assert.equal(w.nonPotable,20);assert.equal(w.unverified,50);
 assert.deepEqual([3,7,21].map(d=>w.daily*d),[36,84,252]);assert.deepEqual([3,7,21].map(d=>w.basic*d),[120,280,840]);
 assert.equal(C.water([], {...settings,petWater:2,specialWater:1}).daily,15);
});
test('one stock pool is shared between recipes and complete meals; no stock mutations',()=>{
 const items=[stock('a',{current:8,portionType:'meal',portionsPerPack:1,mealSlot:'dinner'})];
 const recipes=[{id:'r',portions:1,mealSlot:'lunch',preparation:'ready',ingredients:[{itemId:'a',amount:1}]}];
 const snapshot=JSON.stringify(items),result=C.allocate(items,recipes,settings);
 assert.equal(result.portions,8);assert.equal(result.used.a,8);assert.equal(result.days,0);assert.equal(JSON.stringify(items),snapshot);
});
test('three balanced meals give coverage limited by the weakest occasion',()=>{
 const items=['breakfast','lunch','dinner'].map((slot,i)=>stock(slot,{current:[12,8,40][i],portionType:'meal',mealSlot:slot,portionsPerPack:1}));
 assert.equal(C.allocate(items,[],settings).days,2);
 assert.equal(C.allocate(items,[],settings,'none').days,2);
 items[1].requiresWater='yes';assert.equal(C.allocate(items,[],settings,'none').days,0);
 items[1].requiresWater='no';items[0].preparation='heat';assert.equal(C.allocate(items,[],settings,'none').days,0);
});
test('dietary uncertainty and past dates do not silently count',()=>{
 const a=stock('a',{current:8,portionType:'meal',portionsPerPack:1,mealSlot:'dinner'}),s={...settings,mealsPerDay:1,diet:'vegan'};
 assert.equal(C.allocate([a],[],s).days,0);a.diet='vegan';assert.equal(C.allocate([a],[],s).days,2);
 a.expiry='2000-01-01';a.dateType='bestbefore';assert.equal(C.allocate([a],[],s).days,0);
 a.reviewedBestBefore='yes';assert.equal(C.allocate([a],[],s).days,2);
 a.dateType='useby';assert.equal(C.allocate([a],[],s).days,0);
});
test('duplicate ingredient rows are summed and missing ingredients block recipes',()=>{
 const recipe={id:'r',portions:4,mealSlot:'dinner',preparation:'cook',ingredients:[{itemId:'rice',amount:2},{itemId:'rice',amount:2}]};
 assert.equal(C.allocate([stock('rice',{current:3})],[recipe],{...settings,mealsPerDay:1}).portions,0);
 assert.equal(C.allocate([],[recipe],settings).portions,0);
});
test('stock adjustments are nonnegative and retain unknown fields',()=>{
 const i={id:'a',current:1.5,unknown:'keep'};assert.equal(C.adjust(i,-2).current,0);assert.equal(C.adjust(i,1).current,2.5);assert.equal(C.adjust(i,1).unknown,'keep');assert.equal(i.current,1.5);
});
test('simulation shares allocated servings across days without changing the plan',()=>{
 const s={...settings,mealsPerDay:1},items=[stock('d',{current:8,portionsPerPack:1,portionType:'meal',mealSlot:'dinner'})],result=C.allocate(items,[],s),before=JSON.stringify(result);
 const days=C.simulate(result,s,3);assert.equal(days[0].meals[0].shortfall,0);assert.equal(days[1].meals[0].shortfall,0);assert.equal(days[2].meals[0].shortfall,4);assert.equal(JSON.stringify(result),before);
});
test('minimal heating and household-specific dietary restrictions are conservative',()=>{
 const i=stock('a',{current:4,portionType:'meal',portionsPerPack:1,mealSlot:'dinner',preparation:'heat',diet:'vegan, gluten-free'}),s={...settings,mealsPerDay:1,adultDiet:'gluten-free',childDiet:'nut-free',kids:1,adults:3};
 assert.equal(C.allocate([i],[],s,'heat').portions,0);i.diet+=', nut-free';assert.equal(C.allocate([i],[],s,'heat').portions,4);assert.equal(C.allocate([i],[],s,'none').portions,0);i.kidPreference='no';assert.equal(C.allocate([i],[],s).portions,0);
});
