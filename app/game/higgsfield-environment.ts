import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HIGGSFIELD_MODELS = ['arch', 'pillar', 'trim', 'ember-shrine', 'torch-sconce'] as const;
export type HiggsfieldModel = typeof HIGGSFIELD_MODELS[number];
export type HiggsfieldTarget = {
  kind: HiggsfieldModel;
  root: T.Object3D;
  fallback: T.Object3D[];
  room: string;
  roomZ: number;
  roomDepth: number;
  flame?: T.Object3D;
  light?: T.Object3D;
};
type Part = { geometry: T.BufferGeometry; material: T.Material };
type Template = { parts: Part[]; anchors: Map<string, T.Vector3> };
type ModelLoader = (kind: HiggsfieldModel) => Promise<T.Group>;

function disposeParts(parts: Part[]) {
  const materials = new Set(parts.map(part => part.material));
  const textures = new Set<T.Texture>();
  for (const part of parts) part.geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof T.Texture) textures.add(value);
    material.dispose();
  }
  textures.forEach(texture => texture.dispose());
}

function disposeSource(scene: T.Group, materials: boolean) {
  const parts = new Map<T.BufferGeometry, T.Material[]>();
  scene.traverse(object => {
    if (object instanceof T.Mesh) parts.set(object.geometry, Array.isArray(object.material) ? object.material : [object.material]);
  });
  if (materials) {
    disposeParts([...parts].flatMap(([geometry, values]) => values.map(material => ({ geometry, material }))));
  } else parts.forEach((_, geometry) => geometry.dispose());
}

// Merge static geometry by material once, then instance it separately in each room.
// Review lights and cameras never enter the game, and semantic anchors remain usable.
export function prepareHiggsfieldTemplate(source: T.Group): Template {
  source.updateMatrixWorld(true);
  const anchors = new Map<string, T.Vector3>();
  const buckets = new Map<T.Material, T.BufferGeometry[]>();
  const parts: Part[] = [];
  try {
    source.traverse(object => {
      if (object.userData.semantic_anchor) anchors.set(object.name, object.getWorldPosition(new T.Vector3()));
      if (!(object instanceof T.Mesh)) return;
      if (object instanceof T.SkinnedMesh || Array.isArray(object.material)) throw new Error('Expected a static single-material Jutsu primitive.');
      let geometry = object.geometry.clone();
      if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
      geometry.applyMatrix4(object.matrixWorld);
      for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(key)) geometry.deleteAttribute(key);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      if (!geometry.attributes.uv) geometry.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      const bucket = buckets.get(object.material) ?? [];
      bucket.push(geometry); buckets.set(object.material, bucket);
    });
    for (const [material, geometries] of buckets) {
      const geometry = mergeGeometries(geometries, false);
      if (!geometry) throw new Error('Could not merge Jutsu geometry.');
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      parts.push({ geometry, material });
    }
    if (!parts.length) throw new Error('Empty Jutsu model.');
    disposeSource(source, false);
    return { parts, anchors };
  } catch (error) {
    parts.forEach(part => part.geometry.dispose());
    disposeSource(source, true);
    throw error;
  } finally {
    buckets.forEach(geometries => geometries.forEach(geometry => geometry.dispose()));
  }
}

export class HiggsfieldEnvironment {
  private disposed = false;
  private templates: Template[] = [];
  private batches: { group: T.Group; meshes: T.InstancedMesh[]; roomZ: number; range: number }[] = [];
  private playerZ = 51;
  private pending: Promise<{ loaded: HiggsfieldModel[]; failed: HiggsfieldModel[] }> | null = null;

  constructor(
    private scene: T.Scene,
    private targets: HiggsfieldTarget[],
    private invalidate: () => void = () => {},
    private loadModel: ModelLoader = async kind => (await new GLTFLoader().loadAsync(`/assets/higgsfield-jutsu/${kind}.glb`)).scene,
  ) {}

  load() {
    if (this.pending) return this.pending;
    this.pending = this.loadAll();
    return this.pending;
  }

  private async loadAll() {
    const loaded: HiggsfieldModel[] = [], failed: HiggsfieldModel[] = [];
    await Promise.all(HIGGSFIELD_MODELS.map(async kind => {
      try {
        const source = await this.loadModel(kind);
        if (this.disposed) { disposeSource(source, true); return; }
        const template = prepareHiggsfieldTemplate(source);
        this.templates.push(template);
        const targets = this.targets.filter(target => target.kind === kind);
        const rooms = new Map<string, HiggsfieldTarget[]>();
        for (const target of targets) {
          target.root.updateWorldMatrix(true, false);
          const room = rooms.get(target.room) ?? []; room.push(target); rooms.set(target.room, room);
        }
        for (const [room, placements] of rooms) {
          const group = new T.Group(); group.name = `Higgsfield:${kind}:${room}`;
          const meshes = template.parts.map(part => {
            const mesh = new T.InstancedMesh(part.geometry, part.material, placements.length);
            placements.forEach((target, index) => mesh.setMatrixAt(index, target.root.matrixWorld));
            mesh.instanceMatrix.needsUpdate = true;
            mesh.computeBoundingBox(); mesh.computeBoundingSphere();
            mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
          });
          this.batches.push({ group, meshes, roomZ: placements[0].roomZ, range: placements[0].roomDepth / 2 + 24 });
          this.scene.add(group);
        }
        // Switch only after the entire model has loaded and its instances exist.
        for (const target of targets) {
          target.fallback.forEach(object => { object.visible = false; });
          for (const [name, effect] of [['FlameOrigin', target.flame], ['LightOrigin', target.light]] as const) {
            const anchor = template.anchors.get(name);
            if (!anchor || !effect?.parent) continue;
            const position = target.root.localToWorld(anchor.clone());
            effect.parent.worldToLocal(position); effect.position.copy(position);
          }
        }
        loaded.push(kind); this.updateVisibility(this.playerZ); this.invalidate();
      } catch { if (!this.disposed) failed.push(kind); }
    }));
    return { loaded, failed };
  }

  updateVisibility(playerZ: number) {
    this.playerZ = playerZ;
    for (const batch of this.batches) batch.group.visible = Math.abs(playerZ - batch.roomZ) <= batch.range;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const batch of this.batches) {
      batch.group.removeFromParent(); batch.meshes.forEach(mesh => mesh.dispose());
    }
    this.templates.forEach(template => disposeParts(template.parts));
    this.targets.forEach(target => target.fallback.forEach(object => { object.visible = true; }));
    this.batches = []; this.templates = [];
  }
}
