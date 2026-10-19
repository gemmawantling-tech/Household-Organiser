/* Stock quantities are converted to adult-equivalent portions. */
(function(root){
const types=[['pasta',/\bpasta\b(?!\s*sauce)|spaghetti/i,500,75],['rice',/\brice\b/i,500,75],['sauce',/pasta sauce|passata|chopped tomatoes/i,400,150],['beans',/\bbeans\b|chickpeas/i,400,200],['lentils',/lentils/i,500,75],['oats',/\boats\b|porridge/i,500,50],['milk',/\bmilk\b/i,1000,200],['soup',/\bsoup\b/i,400,400],['noodles',/noodles/i,85,85],['ready',/ready.to.eat|meal sachet/i,300,300]];
function profile(i){
 const t=types.find(t=>t[1].test(i.name||''));if(!t)return null;
 const [kind,,pack,serving]=t,u=String(i.unit||'').toLowerCase().trim(),size=u.match(/^(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
 let grams=Number(i.gramsPerUnit)>0?Number(i.gramsPerUnit):u==='g'||u==='ml'?1:u==='kg'||u==='litre'?1000:size?Number(size[1])*(/^(kg|l)$/.test(size[2])?1000:1):null;
 const assumed=grams===null,microwave=kind==='rice'&&/microwave/i.test(i.name);
 return {kind,grams:grams??(microwave?250:pack),serving:microwave?125:serving,assumed};
}
function household(s){const count=(v,f)=>Number.isInteger(Number(v))&&Number(v)>=0?Number(v):f;const adults=count(s.adults,count(s.people,4)),kids=count(s.kids,0),childPortion=Number(s.childPortion)>0?Number(s.childPortion):0.6;return {adults,kids,childPortion,people:adults+kids,equivalents:adults+kids*childPortion};}
function suggest(items,settings){
 const groups={};const today=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
 for(const i of items){if(!(Number(i.current)>0)||(i.expiry&&i.expiry<today))continue;const p=profile(i);if(p)(groups[p.kind]??=[]).push({i,p});}
 const specs=[['Pasta with tomato sauce',['pasta','sauce'],'Serve a smooth sauce for children.'],['Rice and beans',['rice','beans'],'Mash beans for children; keep chilli separate.'],['Lentils with rice',['rice','lentils'],'Cook lentils fully and serve soft.'],['Porridge',['oats','milk'],'Cool children’s portions before serving.'],['Soup',['soup'],'Cool children’s portions before serving.'],['Noodles',['noodles'],'Cut noodles for younger children.'],['Ready-to-eat meal',['ready'],'Check preparation and age suitability on the label.']];
 const out=[];
 recipes: for(const [name,kinds,note] of specs){if(!kinds.every(k=>groups[k]?.length))continue;for(const a of groups[kinds[0]])for(const b of (kinds[1]?groups[kinds[1]]:[null])){const entries=[a,b].filter(Boolean);out.push({id:'auto:'+entries.map(e=>e.i.id).join(':'),name,note,portions:1,ingredients:entries.map(({i,p})=>({itemId:i.id,amount:p.serving/p.grams}))});if(out.length>=100)break recipes;}}
 if(!settings)return out;
 const h=household(settings),adult=h.adults?out.map(r=>({...r,id:r.id+':adult',audience:'adult',note:'Season adults’ portions separately.'})):[];
 if(!h.kids)return adult;
 const kids=[];
 const mode=settings.kidPreparation||'separate';
 const accepted=items.filter(i=>i.kidAccepted===true);
 const acceptedIds=new Set(accepted.map(i=>i.id));
 // Never presume a food is accepted just because it is mild or served in a small portion.
 for(const r of out){
   if(!r.ingredients.every(ing=>acceptedIds.has(ing.itemId)))continue;
   if(mode==='plain'&&r.ingredients.length>1)continue;
   kids.push({...r,id:r.id+':kids',audience:'kids',name:mode==='separate'&&r.ingredients.length>1?r.name+' (served separately)':r.name,note:mode==='separate'?'Keep each ingredient separate on the plate; offer sauce at the side.':'Use the familiar preparation your children accept.'});
 }
 for(const kind of ['pasta','rice','oats'])for(const {i,p} of groups[kind]||[]){
   if(!acceptedIds.has(i.id))continue;
   kids.push({id:'plain:'+i.id+':kids',name:kind==='oats'?'Plain porridge with water':'Plain '+kind,audience:'kids',portions:1,note:'A familiar fallback. No sauce, seasoning or extras assumed. This alone is not a balanced meal.',ingredients:[{itemId:i.id,amount:p.serving/p.grams}]});
 }
 // Alternate child and adult options so shared staples cannot all go to adults first.
 const combined=[];for(let i=0;i<Math.max(adult.length,kids.length);i++){if(kids[i])combined.push(kids[i]);if(adult[i])combined.push(adult[i]);}
 return combined;
}
root.ReservesPlanner={profile,household,suggest};
})(globalThis);
