/** Shared by runtime materials and production asset pruning. */
/** @param {string} family @param {string} kind @param {string} quality */
export function surfaceAsset(family,kind,quality){
  const dungeon=family==='floor'||family==='wall';
  return `/assets/${dungeon?'dungeon':'4k'}/${family}-${kind}${quality==='high'?'':quality==='low'&&dungeon?'-1k':'-2k'}.webp`;
}

/** @param {string} family @param {string} kind @param {string} quality */
export function runtimeSurfaceAsset(family,kind,quality){
  // Preserve a 4K floor color map; data maps and distant masonry use 2K on Ultra.
  const selected=quality==='high'&&(family==='wall'||family==='floor'&&kind!=='diff')?'medium':quality;
  return surfaceAsset(family,kind,selected);
}

/** Dynamic material maps are not dependencies of the baked room GLBs. */
export function dungeonSurfaceAssets(){
  return [...new Set(['floor','wall'].flatMap(family=>
    ['diff','normal','arm'].flatMap(kind=>
      ['low','medium','high'].map(quality=>runtimeSurfaceAsset(family,kind,quality)))))];
}
