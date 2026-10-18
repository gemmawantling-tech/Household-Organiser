/* Shared date/file helpers. Recurrences never create or migrate stored events. */
(function (root) {
  const types = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
  const maxBytes = 10 * 1024 * 1024;
  function parse(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(0); date.setFullYear(y, m - 1, d); date.setHours(12, 0, 0, 0);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
  }
  const iso = d => `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function occurs(event, day) {
    const start = parse(event.date), target = parse(day);
    if (!start || !target || day < event.date) return false;
    if (!event.repeat || event.repeat === 'none') return event.date === day;
    if (event.repeat === 'weekly') {
      // UTC calendar days avoid DST making a week 167 or 169 hours long.
      return (Date.UTC(target.getFullYear(),target.getMonth(),target.getDate()) - Date.UTC(start.getFullYear(),start.getMonth(),start.getDate())) / 86400000 % 7 === 0;
    }
    if (!['monthly','yearly'].includes(event.repeat)) return event.date === day;
    if (event.repeat === 'yearly' && start.getMonth() !== target.getMonth()) return false;
    const last = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
    return target.getDate() === Math.min(start.getDate(), last);
  }
  function between(events, from, to) {
    const day = parse(from), end = parse(to), result = [];
    if (!day || !end || day > end) return result;
    // Callers request at most a 90-day calendar window.
    for (let n=0; day <= end && n < 366; n++, day.setDate(day.getDate()+1)) {
      const date = iso(day);
      for (const event of events) if (occurs(event, date)) result.push({...event, date, seriesDate:event.date});
    }
    return result.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||''));
  }
  function validateFile(file) {
    if (!types.includes(file.type)) throw Error('Choose a PDF, PNG, JPEG or WebP file.');
    if (!file.size || file.size > maxBytes) throw Error('Files must be between 1 byte and 10 MB.');
    return file;
  }
  function patchEvent(events, eventId, patch, attachment) {
    const result = events.slice(), index = result.findIndex(e=>e.id === eventId);
    if (attachment && index < 0) throw Error('This event was removed. Reopen the calendar.');
    const current = index < 0 ? {id:eventId} : result[index];
    const next = {...current, ...patch, id:eventId};
    if (attachment) next.attachments = [...(current.attachments || []), attachment];
    if (index < 0) result.push(next); else result[index] = next;
    return result;
  }
  // Apply only local changes to the current server document. In particular a task
  // tick must never replace newly added events or attachments on the other phone.
  function mergeChanges(current, previous, next) {
    if (JSON.stringify(previous) === JSON.stringify(next)) return current;
    if (Array.isArray(previous) && Array.isArray(next)) {
      // Event records have stable IDs. Other arrays retain the existing semantics.
      if ([...previous,...next].every(x=>x && typeof x.id === 'string')) {
        const result = (Array.isArray(current) ? current : []).slice();
        for (const old of previous) if (!next.some(x=>x.id===old.id)) {
          const i=result.findIndex(x=>x.id===old.id); if(i>=0)result.splice(i,1);
        }
        for (const item of next) {
          const old=previous.find(x=>x.id===item.id),i=result.findIndex(x=>x.id===item.id);
          if (JSON.stringify(old)===JSON.stringify(item)) continue;
          const merged=mergeChanges(i<0?{}:result[i],old||{},item);
          if(i<0)result.push(merged);else result[i]=merged;
        }
        return result;
      }
      return next;
    }
    if (previous && next && typeof previous==='object' && typeof next==='object' && !Array.isArray(previous) && !Array.isArray(next)) {
      const result={...(current||{})};
      for(const key of new Set([...Object.keys(previous),...Object.keys(next)])) {
        if(JSON.stringify(previous[key])===JSON.stringify(next[key]))continue;
        if(!(key in next))delete result[key];
        else result[key]=mergeChanges(current?.[key],previous[key],next[key]);
      }
      return result;
    }
    return next;
  }
  root.HouseholdEvents = {occurs, between, validateFile, patchEvent, mergeChanges, maxBytes};
})(globalThis);
