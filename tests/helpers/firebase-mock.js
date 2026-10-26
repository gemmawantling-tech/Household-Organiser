export const seed = {
  custom: {
    "2026-10-18|Today's Jobs": [{ id: "keep-task", text: "Keep task" }],
  },
  completed: { keep: true },
  shopping: {},
  removed: {},
  starred: {},
  owners: {},
  events: [
    {
      id: "legacy",
      title: "Legacy booking",
      date: "2026-10-18",
      note: "Original notes",
      unknown: "keep",
    },
    { id: "birthday", title: "Birthday", date: "2000-10-18", repeat: "yearly" },
  ],
};
export const firestore = `
const clone=x=>JSON.parse(JSON.stringify(x));
globalThis.mockData=${JSON.stringify(seed)};globalThis.mockGiftPlans={};
const listeners=new Set();
const snapshot=ref=>ref.parts[2]==='giftPlanners'?{exists:()=>!!mockGiftPlans[ref.parts[3]],data:()=>({data:clone(mockGiftPlans[ref.parts[3]])})}:{exists:()=>true,data:()=>({data:clone(mockData)})};
export const getFirestore=()=>({});export const enableMultiTabIndexedDbPersistence=async()=>{};
export const doc=(...args)=>({parts:args.slice(1)});
export const serverTimestamp=()=>0;
export async function getDoc(ref){return ref.parts[0]==='profiles'?{exists:()=>true,data:()=>({householdId:'shared'})}:snapshot(ref)}
export const setDoc=()=>{throw Error('Unexpected overwrite')};
export function onSnapshot(ref,callback){const entry={ref,callback};listeners.add(entry);callback(snapshot(ref));return()=>listeners.delete(entry)}
export async function runTransaction(db,fn){if(globalThis.mockOffline)throw Error('Offline');const result=await fn({get:async ref=>snapshot(ref),update:(ref,patch)=>{if(patch['data.events'])mockData.events=clone(patch['data.events']);if(patch.data)mockData=clone(patch.data)},set:(ref,value)=>{if(ref.parts[2]!=='giftPlanners')throw Error('Unexpected creation');mockGiftPlans[ref.parts[3]]=clone(value.data)}});for(const {ref,callback}of listeners)callback(snapshot(ref));return result}
`;
export const auth = `export const getAuth=()=>({currentUser:{uid:'gemma',emailVerified:true}});export const onAuthStateChanged=(auth,fn)=>fn(auth.currentUser);export const signInWithEmailAndPassword=()=>{},createUserWithEmailAndPassword=()=>{},sendEmailVerification=()=>{},sendPasswordResetEmail=()=>{},signOut=()=>{},reload=()=>{};`;
export const storage = `export const getStorage=()=>({});export const ref=(s,path)=>({fullPath:path});globalThis.mockFiles=new Map();export const uploadBytes=async(ref,file)=>{mockFiles.set(ref.fullPath,file)};export const getBlob=async ref=>mockFiles.get(ref.fullPath);export const deleteObject=async ref=>mockFiles.delete(ref.fullPath);`;
