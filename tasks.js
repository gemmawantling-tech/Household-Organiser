/* Carry-over is a view of the original dated action, never a copied task. */
(function(root){
  function validDate(value) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);
    return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d;
  }
  function overdue(state, when, today, sections) {
    if(when!==today||!validDate(when))return [];
    const result=[];
    for(const [key,items] of Object.entries(state.custom||{})) {
      const split=key.indexOf('|'),sourceDate=key.slice(0,split),section=key.slice(split+1);
      if(split<0||!validDate(sourceDate)||sourceDate>=when||!sections.includes(section)||!Array.isArray(items))continue;
      for(const item of items) {
        if(!item||typeof item.id!=='string')continue;
        const originalKey=`${sourceDate}|${section}|${item.id}`;
        if(state.completed?.[originalKey]||state.removed?.[originalKey])continue;
        result.push({section,item:{...item,origin:'date',sourceDate}});
      }
    }
    return result.sort((a,b)=>a.item.sourceDate.localeCompare(b.item.sourceDate)||a.item.id.localeCompare(b.item.id));
  }
  root.HouseholdTasks={overdue};
})(globalThis);
