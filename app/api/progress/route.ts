import { gameDb } from '@/db/game';
import { playerIdentity } from './identity';
import { newProgress, progressSchema, heroSchema, maxHealth, upgradeCost } from '@/app/game/model';

export const dynamic='force-dynamic';
function json(value:unknown,status=200,cookie?:string) { const headers=new Headers({'Cache-Control':'no-store'});if(cookie)headers.set('Set-Cookie',cookie);return Response.json(value,{status,headers}); }
function validOrigin(request:Request) {
  const origin=request.headers.get('Origin');
  return (!origin||origin===new URL(request.url).origin) && request.headers.get('Sec-Fetch-Site')!=='cross-site';
}
async function payload(request:Request) {
  if(Number(request.headers.get('Content-Length')??0)>16000) throw new Error('Payload too large');
  const text=await request.text(); if(text.length>16000) throw new Error('Payload too large'); return JSON.parse(text);
}
export async function GET(request:Request) {
  const {user,guest,cookie}=await playerIdentity(request);
  const reply=(value:Record<string,unknown>,status=200)=>json({...value,guest},status,cookie);
  try {
    const row=await gameDb().prepare('SELECT state, revision, updated_at FROM game_saves WHERE user_id = ?').bind(user).first<{state:string,revision:number,updated_at:string}>();
    return reply(row?{state:JSON.parse(row.state),revision:row.revision,updatedAt:row.updated_at}:{state:null,revision:0});
  } catch(e) { console.error('Load game failed',e); return reply({error:'Your save could not be loaded. Please retry.'},503); }
}
export async function PUT(request:Request) {
  const {user,guest,cookie}=await playerIdentity(request);
  const reply=(value:Record<string,unknown>,status=200)=>json({...value,guest},status,cookie);
  if(!validOrigin(request)) return reply({error:'Request origin rejected.'},403);
  try {
    const body=await payload(request); const parsed=progressSchema.safeParse(body.state);
    if(!parsed.success||!Number.isInteger(body.revision)||body.revision<1) return reply({error:'Invalid save.'},400);
    const state=parsed.data; state.health=Math.min(state.health,maxHealth(state));
    const now=new Date().toISOString();
    const row=await gameDb().prepare('UPDATE game_saves SET state = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? AND json_extract(state, \'$.runId\') = ? RETURNING revision').bind(JSON.stringify(state),now,user,body.revision,state.runId).first<{revision:number}>();
    if(!row) return reply({error:'Another tab has updated this journey. Reload before saving.',conflict:true},409);
    return reply({revision:row.revision,updatedAt:now});
  } catch(e) { if(e instanceof SyntaxError||e instanceof Error&&e.message==='Payload too large') return reply({error:'Invalid save request.'},400); console.error('Save game failed',e);return reply({error:'Cloud save unavailable. Your current session is still playable.'},503); }
}
export async function POST(request:Request) {
  const {user,guest,cookie}=await playerIdentity(request);
  const reply=(value:Record<string,unknown>,status=200)=>json({...value,guest},status,cookie);
  if(!validOrigin(request)) return reply({error:'Request origin rejected.'},403);
  try {
    const body=await payload(request); const db=gameDb();
    if(body.action==='new') {
      if(!Number.isInteger(body.revision)||body.revision<0) return reply({error:'Invalid revision.'},400);
      const hero=heroSchema.optional().safeParse(body.hero);
      if(!hero.success)return reply({error:'Choose a valid wanderer.'},400);
      const state=newProgress(typeof body.name==='string'?body.name.trim().slice(0,22)||'The Wanderer':'The Wanderer',hero.data);
      const now=new Date().toISOString(); let row;
      if(body.revision===0) row=await db.prepare('INSERT INTO game_saves (user_id, state, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING RETURNING revision').bind(user,JSON.stringify(state),now).first<{revision:number}>();
      else row=await db.prepare('UPDATE game_saves SET state = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision').bind(JSON.stringify(state),now,user,body.revision).first<{revision:number}>();
      if(!row) return reply({error:'Your cloud save changed. Reload before starting again.',conflict:true},409);
      return reply({state,revision:row.revision,updatedAt:now});
    }
    if(body.action==='upgrade'&&(body.kind==='blade'||body.kind==='armor')) {
      const row=await db.prepare('SELECT state, revision FROM game_saves WHERE user_id = ?').bind(user).first<{state:string,revision:number}>();
      if(!row||row.revision!==body.revision) return reply({error:'Your save changed. Reload and try again.',conflict:true},409);
      const state=progressSchema.parse(JSON.parse(row.state)); const kind=body.kind as 'blade'|'armor';
      if(state[kind]>=4) return reply({error:'This equipment is already fully upgraded.'},400);
      const cost=upgradeCost(state[kind]); if(state.souls<cost) return reply({error:'Gather more embers first.'},400);
      state.souls-=cost; state[kind]++; if(kind==='armor') state.health=Math.min(state.health+20,maxHealth(state));
      const now=new Date().toISOString();
      const updated=await db.prepare('UPDATE game_saves SET state = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ? RETURNING revision').bind(JSON.stringify(state),now,user,row.revision).first<{revision:number}>();
      if(!updated) return reply({error:'Your save changed. Please reload.',conflict:true},409);
      return reply({state,revision:updated.revision,updatedAt:now});
    }
    return reply({error:'Unknown action.'},400);
  } catch(e) { if(e instanceof SyntaxError||e instanceof Error&&e.message==='Payload too large') return reply({error:'Invalid request.'},400); console.error('Game action failed',e);return reply({error:'Your journey could not be updated. Please retry.'},503); }
}
