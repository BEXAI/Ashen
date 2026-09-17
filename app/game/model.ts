import { z } from 'zod';
import { GATES, gateOpen, ROOMS } from './dungeon';
import { HERO_IDS, DEFAULT_HERO, type HeroId } from './character-roster';
export const heroSchema=z.enum(HERO_IDS);

export const WORLD = {
 shrines:[{id:'cinder',name:'Cinder Shrine',x:11,z:12},{id:'dusk',name:'Dusk Shrine',x:-13,z:-16},{id:'crown',name:'Crown Shrine',x:11,z:-42}],
 chests:[{id:'ruins',x:-12,z:26},{id:'river',x:14,z:-5},{id:'tower',x:-12,z:-31},{id:'gate',x:12,z:-60}],
 enemies:[{id:'w1',x:-7,z:23},{id:'w2',x:8,z:20},{id:'w3',x:0,z:12},{id:'w4',x:-9,z:-8},{id:'w5',x:8,z:-13},{id:'w6',x:0,z:-17},{id:'w7',x:-7,z:-35},{id:'w8',x:7,z:-39},{id:'w9',x:0,z:-44},{id:'king',x:0,z:-69}],
} satisfies {
 shrines:{id:Progress['shrines'][number];name:string;x:number;z:number}[];
 chests:{id:Progress['chests'][number];x:number;z:number}[];
 enemies:{id:Progress['defeated'][number];x:number;z:number}[];
};
export const progressSchema = z.object({
  version:z.literal(1), runId:z.string().uuid(), name:z.string().trim().min(1).max(22), hero:heroSchema.optional(),
  x:z.number().finite().min(-93).max(93), z:z.number().finite().min(-90).max(76),
  health:z.number().finite().min(0).max(500), mana:z.number().finite().min(0).max(100),
  xp:z.number().int().min(0).max(10000), souls:z.number().int().min(0).max(100000),
  potions:z.number().int().min(0).max(5), blade:z.number().int().min(0).max(4), armor:z.number().int().min(0).max(4),
  talked:z.boolean(), shrines:z.array(z.enum(['cinder','dusk','crown'])).max(3),
  chests:z.array(z.enum(['ruins','river','tower','gate'])).max(4),
  defeated:z.array(z.enum(['w1','w2','w3','w4','w5','w6','w7','w8','w9','king'])).max(10),
  checkpoint:z.enum(['camp','cinder','dusk','crown']), playtime:z.number().finite().min(0).max(1000000),
  won:z.boolean(),
}).strict().superRefine((p,ctx)=>{
  for(const k of ['shrines','chests','defeated'] as const) if(new Set(p[k]).size!==p[k].length) ctx.addIssue({code:'custom',message:'Duplicate world object',path:[k]});
  if(p.won && !p.defeated.includes('king')) ctx.addIssue({code:'custom',message:'The king must be defeated'});
});
export type Progress = z.infer<typeof progressSchema>;
export function newProgress(name='The Wanderer',hero:HeroId=DEFAULT_HERO): Progress {
  const runId=typeof crypto.randomUUID==='function'?crypto.randomUUID():uuidFromRandomBytes();
  return {version:1,runId,name,hero,x:0,z:51,health:140,mana:100,xp:0,souls:0,potions:3,blade:0,armor:0,talked:false,shrines:[],chests:[],defeated:[],checkpoint:'camp',playtime:0,won:false};
}
function uuidFromRandomBytes(){const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export function level(p:Progress) { return Math.min(10,1+Math.floor(p.xp/180)); }
export function maxHealth(p:Progress) { return 140+(level(p)-1)*20+p.armor*20; }
export function damage(p:Progress) { return 26+p.blade*8+(level(p)-1)*3; }
export function upgradeCost(rank:number) { return 60+rank*60; }
export function objective(p:Progress) {
  if(p.won) return {title:'A new flame rises',detail:'Dungeon cleared. Your ember endures.',x:0,z:-69};
  if(!p.talked) return {title:'A dying flame',detail:'Speak to the Keeper at the campfire.',x:-4,z:43};
  for(let i=0;i<GATES.length;i++){
    if(gateOpen(i,p))continue;
    const remaining=WORLD.enemies.filter(e=>GATES[i].enemies.some(id=>id===e.id)&&!p.defeated.includes(e.id));
    if(remaining.length)return {title:`Clear ${ROOMS[i+1].name}`,detail:`Defeat the chamber wardens · ${3-remaining.length} / 3`,x:remaining[0].x,z:remaining[0].z};
    const shrine=WORLD.shrines[i];return {title:'Break the chamber seal',detail:`Awaken ${shrine.name} to descend.`,x:shrine.x,z:shrine.z};
  }
  return {title:'The hollow crown',detail:'Break the final seal. Defeat the Hollow King.',x:0,z:-69};
}
