/* Stock quantities are converted to adult-equivalent portions. */
(function(root){
const types=[['bakedBeans',/baked beans/i,400,200],['chickpeas',/chickpeas|garbanzo/i,400,150],['tuna',/\btuna\b/i,145,80],['corn',/sweetcorn|sweet corn/i,340,60],['peas',/\bpeas\b/i,400,80],['pepper',/roasted peppers|bell peppers|red peppers/i,450,75],['peanut',/peanut butter/i,340,25],['soy',/soy sauce/i,150,10],['pesto',/pesto/i,190,25],['cheese',/cheddar|\bcheese\b/i,400,30],['wrap',/tortilla wraps?|flour tortillas?|\bwraps?\b/i,360,60],['bread',/\bbread\b|\btoast\b/i,800,80],['pasta',/\bpasta\b(?!\s*sauce)|spaghetti/i,500,75],['rice',/\brice\b/i,500,75],['sauce',/pasta sauce|tomato sauce|passata|chopped tomatoes/i,400,150],['beans',/\bbeans\b/i,400,200],['lentils',/lentils/i,500,75],['oats',/\boats\b|porridge/i,500,50],['milk',/^(?!.*coconut).*\bmilk\b/i,1000,200],['crisps',/tortilla (?:chips|crisps)|nachos|corn chips/i,180,30],['soup',/\bsoup\b/i,400,400],['noodles',/noodles/i,85,85],['ready',/ready.to.eat|meal sachet/i,300,300]];
function profile(i){
 const t=types.find(t=>t[1].test(i.name||''));if(!t)return null;
 const [kind,,pack,serving]=t,u=String(i.unit||'').toLowerCase().trim(),size=u.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
 let grams=Number(i.gramsPerUnit)>0?Number(i.gramsPerUnit):u==='g'||u==='ml'?1:u==='kg'||u==='litre'?1000:size?Number(size[1])*(/^(kg|l)$/.test(size[2])?1000:1):null;
 const assumed=grams===null,microwave=kind==='rice'&&(/microwave|ready.to.eat|cooked/i.test(i.name)||/pouch|sachet/i.test(u));
 const beanPouch=['beans','chickpeas','bakedBeans'].includes(kind)&&/pouch|sachet/i.test(u+' '+i.name);
 const cookedPulse=['beans','chickpeas','lentils'].includes(kind)&&/tin|can|pouch|sachet|cooked|ready.to.eat/i.test(u+' '+i.name);
 if(grams===null&&kind==='bread'&&u==='slice')grams=40;
 if(grams===null&&kind==='wrap'&&/^(each|item|unit|wrap)$/.test(u))grams=60;
 const dry=/dry|dried/i.test(i.name);
 return {kind,grams:grams??(microwave||beanPouch?250:cookedPulse?400:pack),dry,cookedPulse,serving:microwave?125:kind==='lentils'&&cookedPulse?200:['beans','chickpeas'].includes(kind)&&dry?60:serving,assumed,spicy:/chilli|chili|spicy|hot sauce/i.test(i.name)};
}
function household(s){const count=(v,f)=>Number.isInteger(Number(v))&&Number(v)>=0?Number(v):f;const adults=count(s.adults,count(s.people,4)),kids=count(s.kids,0),childPortion=Number(s.childPortion)>0?Number(s.childPortion):0.6;return {adults,kids,childPortion,people:adults+kids,equivalents:adults+kids*childPortion};}
function suggest(items,settings){
 const groups={};const today=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
 for(const i of items){if(!(Number(i.current)>0)||(i.expiry&&i.expiry<today))continue;const p=profile(i);if(p)(groups[p.kind]??=[]).push({i,p});}
 const specs=root.ReservesRecipeLibrary||[];
 const out=[];
 recipes: for(const spec of specs){
   if(!spec.kinds.every(k=>groups[k]?.length))continue;
   let variants=[[]];
   for(const kind of spec.kinds){
     variants=variants.flatMap(entries=>groups[kind].slice(0,4).map(e=>[...entries,e])).slice(0,8);
   }
   for(const entries of variants){
     out.push({id:'auto:'+spec.key+':'+entries.map(e=>e.i.id).join(':'),name:spec.name,note:spec.note,method:spec.method,source:spec.source,portions:1,spicy:entries.some(e=>e.p.spicy),ingredients:entries.map(({i,p})=>({itemId:i.id,amount:(p.kind==='rice'&&p.serving===125?125:p.kind==='lentils'&&p.cookedPulse?160:['beans','chickpeas'].includes(p.kind)&&p.dry?60:(spec.grams[p.kind]??p.serving))/p.grams}))});
     if(out.length>=100)break recipes;
   }
 }
 if(!settings)return out;
 const h=household(settings),adult=h.adults?out.map(r=>({...r,id:r.id+':adult',audience:'adult',note:r.note+' Season adults’ portions separately.'})):[];
 if(!h.kids)return adult;
 const kids=[];
 const mode=settings.kidPreparation||'separate';
 const accepted=items.filter(i=>i.kidPreference!=='no'&&(settings.kidFoodMode!=='confirmed'||i.kidPreference==='yes'||i.kidAccepted===true));
 const acceptedIds=new Set(accepted.map(i=>i.id));
 // Suggest by default, while respecting explicit dislikes. Confirmed-only mode is optional.
 for(const r of out){
   if(r.spicy||!r.ingredients.every(ing=>acceptedIds.has(ing.itemId)))continue;
   if(mode==='plain'&&r.ingredients.length>1)continue;
   kids.push({...r,id:r.id+':kids',audience:'kids',name:mode==='separate'&&r.ingredients.length>1?r.name+' (served separately)':r.name,note:r.note+' '+(mode==='separate'?'Keep each ingredient separate on the plate; offer sauce at the side.':'Try a simple, mild preparation; check whether your children will eat it.')});
 }
 // Alternate child and adult options so shared staples cannot all go to adults first.
 const combined=[];for(let i=0;i<Math.max(adult.length,kids.length);i++){if(kids[i])combined.push(kids[i]);if(adult[i])combined.push(adult[i]);}
 return combined;
}
function preparation(recipe,items){
 if(recipe.method)return recipe.method;
 const kinds=recipe.ingredients.map(ing=>profile(items.find(i=>i.id===ing.itemId)||{})?.kind);
 if(kinds.includes('pasta'))return 'Boil the pasta following the packet. '+(kinds.includes('sauce')?'Heat the sauce separately and serve alongside or stir in.':'Drain and serve plain.');
 if(kinds.includes('rice'))return 'Cook or heat the rice following its packet. '+(kinds.includes('lentils')?'Cook lentils fully according to their packet; serve alongside the rice.':kinds.includes('beans')?'Heat the beans according to the tin, pouch or sachet directions. Spoon over the rice or serve separately.':'Serve plain.');
 if(kinds.includes('oats'))return 'Cook oats with '+(kinds.includes('milk')?'the milk':'water')+' following the packet, until soft. Allow to cool before serving.';
 if(kinds.includes('soup'))return 'Heat the soup following the tin or packet directions. Cool children’s servings.'+(kinds.includes('crisps')?' Serve tortilla crisps alongside, or add them just before eating.':'');
 if(kinds.includes('noodles'))return 'Cook noodles following the packet. Keep any seasoning sachet separate for children.';
 return 'Prepare following the product label; check suitability for your children.';
}
function nearly(items){
 const kinds=new Set(items.filter(i=>Number(i.current)>0&&(!i.expiry||i.expiry>=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10))).map(i=>profile(i)?.kind));
 return (root.ReservesRecipeLibrary||[]).map(r=>({...r,missing:r.kinds.filter(k=>!kinds.has(k))})).filter(r=>r.missing.length===1&&r.kinds.length-r.missing.length>=2).slice(0,6);
}
root.ReservesPlanner={profile,household,suggest,preparation,nearly};
})(globalThis);
