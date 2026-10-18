// The fragment stays out of HTTP requests and referrer headers.
const KEY = 'household-pending-invitation-v1';
const idPattern = /^(?:[0-9a-f]{36}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export function parseInvitation(value) {
  const parts = String(value).split(':');
  if (parts.length !== 2 || !parts.every(x => idPattern.test(x))) throw Error('This invitation is invalid. Ask your partner for a new link.');
  return {id: parts[0], code: parts[1]};
}
export function invitationLink(id, code, href = location.href) {
  parseInvitation(`${id}:${code}`);
  const url = new URL(href);
  url.search = '';
  url.hash = new URLSearchParams({invite: `${id}:${code}`}).toString();
  return url.href;
}
export function captureInvitation() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('invite')) {
    const value = params.get('invite');
    // Remove the secret even when it is malformed.
    history.replaceState(null, '', location.pathname + location.search);
    try { sessionStorage.removeItem(KEY); } catch {}
    const invite = parseInvitation(value);
    try { sessionStorage.setItem(KEY, JSON.stringify(invite)); } catch {}
    return invite;
  }
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY));
    return stored ? parseInvitation(`${stored.id}:${stored.code}`) : null;
  } catch { return null; }
}
export function clearInvitation() { try { sessionStorage.removeItem(KEY); } catch {} }
export async function copyInvitation(input, button) {
  try {
    await navigator.clipboard.writeText(input.value);
    button.textContent = 'Link copied — paste into WhatsApp';
  } catch {
    input.focus(); input.select();
    button.textContent = 'Select and copy the link above';
  }
}
// Reads are checked in one transaction: never replace a profile or membership.
export async function joinExistingHousehold({db, doc, runTransaction, serverTimestamp, user, id, code}) {
  if (!user?.emailVerified) throw Error('Verify your email before joining.');
  parseInvitation(`${id}:${code}`);
  await user.getIdToken(true);
  await runTransaction(db, async tx => {
    const profileRef = doc(db, 'profiles', user.uid);
    const memberRef = doc(db, 'households', id, 'members', user.uid);
    const profile = await tx.get(profileRef);
    const member = await tx.get(memberRef);
    if (profile.exists() && profile.data().householdId !== id) throw Error('Your account already belongs to another household. Sign in with the account you want to invite.');
    if (member.exists()) {
      if (!profile.exists()) tx.set(profileRef, {householdId: id, email: user.email});
      return;
    }
    tx.set(memberRef, {uid: user.uid, email: user.email, role: 'member', inviteCode: code, joinedAt: serverTimestamp()});
    if (!profile.exists()) tx.set(profileRef, {householdId: id, email: user.email});
  });
}
export async function createNewHousehold({db, doc, runTransaction, serverTimestamp, user, id, code, name}) {
  if (!user?.emailVerified) throw Error('Verify your email first.');
  await user.getIdToken(true);
  await runTransaction(db, async tx => {
    const profileRef=doc(db,'profiles',user.uid), houseRef=doc(db,'households',id);
    const profile=await tx.get(profileRef);
    if(profile.exists()) throw Error('Your account already has a household. Sign in again to open it.');
    tx.set(houseRef,{name,ownerUid:user.uid,inviteCode:code,createdAt:serverTimestamp()});
    tx.set(doc(db,'households',id,'members',user.uid),{uid:user.uid,email:user.email,role:'owner',joinedAt:serverTimestamp()});
    tx.set(profileRef,{householdId:id,email:user.email});
  });
}
