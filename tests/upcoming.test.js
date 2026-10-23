import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const remove=html.slice(html.indexOf('function removeTask('),html.indexOf('let shownToday='));
const week=html.slice(html.indexOf('function renderWeek('),html.indexOf('function addTaskButton('));
function node(tag,cls,text){return {tag,cls,text,children:[],dataset:{},append(...children){this.children.push(...children)},replaceChildren(){this.children=[]},setAttribute(key,value){this[key]=value}}}
test('upcoming tasks expose deletion, confirm before saving, and retain other tasks and events',()=>{
 const item={id:'custom:hair',text:'Molly haircut',origin:'date'},other={id:'custom:office',text:'Office',origin:'date'};
 const boxes={weekItems:node(),weekCount:node()};let confirmed=false,saves=0,renders=0;
 const state={removed:{},completed:{},starred:{},events:[{id:'booking',date:'2026-10-24',title:'Haircut booking'}]};
 const context=vm.createContext({state,selected:new Date(2026,9,24),sections:["Today's Jobs"],DAYS:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],parseISO:s=>new Date(s+'T12:00:00'),iso:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,HouseholdEvents:{between:()=>state.events},itemsFor:(section,when)=>when==='2026-10-24'?[item,other].filter(i=>!state.removed[when+'|'+section+'|'+i.id]):[],taskKey:(i,s,w)=>w+'|'+s+'|'+i.id,ownerOf:()=> 'Gemma',ownerBadge:()=>node(),el:node,$:id=>boxes[id],confirm:()=>confirmed,save:()=>saves++,render:()=>renders++,goto(){},openEvent(){}});
 vm.runInContext(remove+week+';renderWeek()',context);
 const eventRow=boxes.weekItems.children.find(row=>row.children.some(child=>child.cls==='upcoming-entry'));assert.equal(eventRow.children.length,1);assert.equal(eventRow.children[0].text,'Sat · Haircut booking');
 assert.ok(boxes.weekItems.children[0].children.some(child=>child.text==='Sat · Molly haircut'));
 const buttons=boxes.weekItems.children.flatMap(row=>row.children).filter(n=>n.cls==='upcoming-remove');assert.equal(buttons.length,2);assert.equal(buttons[0]['aria-label'],'Delete Molly haircut');
 buttons[0].onclick();assert.equal(saves,0);assert.deepEqual(state.removed,{});
 confirmed=true;buttons[0].onclick();assert.equal(saves,1);assert.equal(renders,1);assert.equal(state.removed["2026-10-24|Today's Jobs|custom:hair"],true);
 vm.runInContext('renderWeek()',context);assert.equal(boxes.weekItems.children.length,2);assert.equal(state.events.length,1);assert.equal(Object.keys(state.removed).length,1);
});
