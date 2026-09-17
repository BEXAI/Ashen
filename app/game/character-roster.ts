/** September 8, 2026 Higgsfield originals, matched to the supplied screenshot. */
export const HERO_IDS = ['lion-knight','dusk-rogue','sage','silver-knight','ranger','knife-rogue'] as const;
export type HeroId = typeof HERO_IDS[number];
export type RosterId = HeroId|'golem'|'shrouded-skeleton'|'frost-mage'|'ember-dragon'|'ogre'|'reaper'|'skeleton-warrior'|'spider'|'lich'|'goblin';
export type CombatStyle = 'blade'|'staff'|'bow'|'claws';
export const ROSTER: Record<RosterId,{name:string;sourceId:string;style:CombatStyle;description:string}> = {
 'lion-knight':{name:'Lion Knight',sourceId:'db95c2d3-580c-43c5-ab3b-58ee75def5cb',style:'blade',description:'Weathered steel and the burgundy banner of a fallen order.'},
 'dusk-rogue':{name:'Dusk Rogue',sourceId:'853d2fdc-06d5-4cfc-888a-ccd2f3d9f202',style:'blade',description:'Dark leather, silver pauldrons, and a blade for the descent.'},
 sage:{name:'Ember Sage',sourceId:'880f9069-e695-4dc2-aaed-b5ae3ef026eb',style:'staff',description:'A wandering sage with a flame-tipped staff.'},
 'silver-knight':{name:'Silver Knight',sourceId:'5cbfe6bf-e3d1-4d07-849a-203e77d1b94b',style:'blade',description:'Silver plate, a torn red cloak, and an unbroken oath.'},
 ranger:{name:'Green Ranger',sourceId:'0beed7ce-bd60-4a35-8f57-489368a80bb4',style:'bow',description:'A green-cloaked archer from beyond the Hollow Keep.'},
 'knife-rogue':{name:'Knife Rogue',sourceId:'3e01be62-ba68-4862-84c2-91f017008f6b',style:'blade',description:'A knife-bearing wanderer in black leather and a gray cloak.'},
 golem:{name:'Moss Golem',sourceId:'496924e4-b505-4aab-8808-2cded9eb400a',style:'claws',description:'Ancient stone awakened beneath the keep.'},
 'shrouded-skeleton':{name:'Shrouded Dead',sourceId:'a732cfc0-9551-4032-ba6e-72459f309878',style:'claws',description:'Bare bones beneath a gray burial shroud.'},
 'frost-mage':{name:'Frost Necromancer',sourceId:'6017ddf3-a2d9-4524-8a4f-cfc2fd3d52f7',style:'staff',description:'A bone-armored mage carrying an icy blue staff.'},
 'ember-dragon':{name:'The Hollow King',sourceId:'5a3ddbf0-342f-4ec5-91a4-7c57e1e17ddd',style:'claws',description:'A chained dragon with ember-lit ribs and tattered wings.'},
 ogre:{name:'Ironhide Ogre',sourceId:'e4f73d18-4dda-4d66-8bc5-1f163c44cf9d',style:'blade',description:'A hulking club-bearer in rusted armor.'},
 reaper:{name:'Dusk Reaper',sourceId:'ae17a6dd-ffae-472e-b762-c9cb6ed2e584',style:'blade',description:'A floating shroud and a sweeping scythe.'},
 'skeleton-warrior':{name:'Crypt Shieldbearer',sourceId:'4bbdba2a-302d-428e-bc0c-3566bd84bde8',style:'blade',description:'A sword and painted shield in the hands of the dead.'},
 spider:{name:'Crypt Spider',sourceId:'c4010a07-000c-439c-b8da-2a200549f97a',style:'claws',description:'Eight legs, mottled hide, and glistening fangs.'},
 lich:{name:'Crowned Lich',sourceId:'3e9a9a70-5514-4bc1-b84a-8f09917ecefe',style:'staff',description:'A skeletal crown above purple robes and a crystal staff.'},
 goblin:{name:'Cleaver Goblin',sourceId:'2cfd6662-d8e7-4ca5-9b80-bbe276ee6cae',style:'blade',description:'A sharp-toothed scavenger armed with a broad cleaver.'},
};
export const ENEMY_ROSTER = {w1:'goblin',w2:'skeleton-warrior',w3:'shrouded-skeleton',w4:'spider',w5:'frost-mage',w6:'ogre',w7:'golem',w8:'reaper',w9:'lich',king:'ember-dragon'} as const satisfies Record<string,RosterId>;
export const DEFAULT_HERO:HeroId='lion-knight';
export const portraitUrl=(id:RosterId)=>`/assets/roster/september-8/portraits/${id}.webp`;
export const CROWN_FILM_URL='/assets/roster/september-8/crown-film.mp4';

export const approachDistance=(id:RosterId)=>id==='ember-dragon'?3.2:ROSTER[id].style==='staff'?8:id==='goblin'?1.25:id==='reaper'?1.9:ROSTER[id].style==='claws'?1.25:2.1;
