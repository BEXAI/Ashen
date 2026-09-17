import * as T from 'three';
import type { FloorPoint, HazardSnapshot } from './hazards';

export type HazardSurface = {
  groundHeight: (x: number, z: number) => number;
  /** True only if the entire floor triangle is permitted. Must include gates/throne when clipping VFX. */
  triangleAllowed: (a: FloorPoint, b: FloorPoint, c: FloorPoint) => boolean;
};
export type HazardRenderOptions = { reducedMotion?: boolean; quality?: 'low' | 'high' | 'auto'; particlesDisabled?: boolean };
const SECTORS = 64, RADIAL_STEPS = 8;
type GroundGeometry = { geometry: T.BufferGeometry; sectorEnds: number[] };

/** One pooled warning/eruption. No wall/cosmetic delta is accepted, so hit stop cannot desynchronize it. */
export class HazardPresentation {
  readonly group = new T.Group();
  readonly warning = new T.Group();
  readonly eruption = new T.Group();
  private id: string | null = null;
  private disposed = false;
  private readonly darkMaterial = new T.MeshBasicMaterial({ color: '#21170f', transparent: true, opacity: .95, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  private readonly outlineMaterial = new T.MeshBasicMaterial({ color: '#fff5ba', transparent: true, opacity: 1, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  private readonly fillMaterial = new T.MeshBasicMaterial({ color: '#ffd16c', transparent: true, opacity: .13, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  private readonly progressMaterial = new T.MeshBasicMaterial({ color: '#ffe9a0', transparent: true, opacity: .25, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  private readonly fireMaterial = new T.MeshBasicMaterial({ color: '#ff791f', transparent: true, opacity: .75, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false });
  private readonly coreMaterial = new T.MeshBasicMaterial({ color: '#ffe8a0', transparent: true, opacity: .6, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false });
  private outline: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private dark: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private fill: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private progress: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>;
  private sectorEnds: number[] = [];
  private spires: T.Mesh<T.ConeGeometry, T.MeshBasicMaterial>[] = [];
  private spireAllowed: boolean[] = [];
  constructor(scene: T.Scene, private surface: HazardSurface) {
    this.group.name = 'authoritative boss floor warning';
    this.warning.name = 'hazard warning'; this.eruption.name = 'hazard eruption';
    this.dark = new T.Mesh(new T.BufferGeometry(), this.darkMaterial);
    this.outline = new T.Mesh(new T.BufferGeometry(), this.outlineMaterial);
    this.fill = new T.Mesh(new T.BufferGeometry(), this.fillMaterial);
    this.progress = new T.Mesh(new T.BufferGeometry(), this.progressMaterial);
    this.dark.name = 'warning contrast edge'; this.outline.name = 'warning exact disk rim';
    this.fill.name = 'warning full footprint'; this.progress.name = 'warning game-time fill';
    for (const [index, mesh] of [this.dark, this.fill, this.progress, this.outline].entries()) {
      mesh.renderOrder = 10 + index; mesh.frustumCulled = false; this.warning.add(mesh);
    }
    const cone = new T.ConeGeometry(1, 1, 8, 1, true); cone.translate(0, .5, 0);
    for (let i = 0; i < 3; i++) {
      const mesh = new T.Mesh(cone, i === 0 ? this.coreMaterial : this.fireMaterial);
      mesh.name = `bounded eruption spire ${i}`; mesh.renderOrder = 15; this.spires.push(mesh); this.eruption.add(mesh);
    }
    this.group.add(this.warning, this.eruption); this.group.visible = false; scene.add(this.group);
  }
  private geometry(snapshot: HazardSnapshot, inner: number, outer: number, heightOffset: number, radialSteps: number): GroundGeometry {
    const vertices: number[] = [], sectorEnds: number[] = [];
    const point = (r: number, a: number): FloorPoint => ({ x: snapshot.center.x + Math.cos(a) * r, z: snapshot.center.z + Math.sin(a) * r });
    const triangle = (a: FloorPoint, b: FloorPoint, c: FloorPoint) => {
      if (!this.surface.triangleAllowed(a, b, c)) return;
      const heights = [a, b, c].map(p => this.surface.groundHeight(p.x, p.z));
      if (!heights.every(Number.isFinite)) return;
      for (const [i, p] of [a, b, c].entries()) vertices.push(p.x, heights[i] + heightOffset, p.z);
    };
    for (let sector = 0; sector < SECTORS; sector++) {
      const a = sector * Math.PI * 2 / SECTORS, b = (sector + 1) * Math.PI * 2 / SECTORS;
      for (let step = 0; step < radialSteps; step++) {
        const r0 = snapshot.radius * (inner + (outer - inner) * step / radialSteps);
        const r1 = snapshot.radius * (inner + (outer - inner) * (step + 1) / radialSteps);
        const p0 = point(r0, a), p1 = point(r1, a), p2 = point(r1, b), p3 = point(r0, b);
        triangle(p0, p1, p2); if (r0 > 0) triangle(p0, p2, p3);
      }
      sectorEnds.push(vertices.length / 3);
    }
    const geometry = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    if (vertices.length) geometry.computeBoundingSphere();
    return { geometry, sectorEnds };
  }
  private prepare(snapshot: HazardSnapshot) {
    const assign = (mesh: T.Mesh<T.BufferGeometry, T.MeshBasicMaterial>, surface: GroundGeometry) => {
      mesh.geometry.dispose(); mesh.geometry = surface.geometry;
    };
    // Every rim lies inside the authoritative radius. No invisible expansion of the warning boundary.
    assign(this.dark, this.geometry(snapshot, .915, 1, .027, 1));
    assign(this.outline, this.geometry(snapshot, .962, 1, .033, 1));
    assign(this.fill, this.geometry(snapshot, 0, .955, .028, RADIAL_STEPS));
    const progress = this.geometry(snapshot, 0, .955, .031, RADIAL_STEPS);
    this.sectorEnds = progress.sectorEnds; assign(this.progress, progress);
    const offsets = [[0, 0], [-.28, .12], [.24, -.16]];
    this.spireAllowed = offsets.map(([x, z], index) => {
      const center = { x: snapshot.center.x + x * snapshot.radius, z: snapshot.center.z + z * snapshot.radius };
      const r = snapshot.radius * (index === 0 ? .22 : .17);
      // Conservative footprint box: if either whole triangle leaves legal floor, omit this decorative spire.
      const a = { x: center.x - r, z: center.z - r }, b = { x: center.x + r, z: center.z - r };
      const c = { x: center.x + r, z: center.z + r }, d = { x: center.x - r, z: center.z + r };
      const y = this.surface.groundHeight(center.x, center.z);
      this.spires[index].position.set(center.x, Number.isFinite(y) ? y + .04 : 0, center.z);
      return Number.isFinite(y) && this.surface.triangleAllowed(a, b, c) && this.surface.triangleAllowed(a, c, d);
    });
    this.id = snapshot.id;
  }
  update(snapshot: HazardSnapshot | null, options: HazardRenderOptions = {}) {
    if (this.disposed) return;
    if (!snapshot) { this.group.visible = false; this.id = null; return; }
    if (snapshot.id !== this.id) this.prepare(snapshot);
    this.group.visible = true;
    this.group.userData.hazardId = snapshot.id;
    this.group.userData.gameTime = snapshot.gameTime;
    this.group.userData.phase = snapshot.phase;
    this.warning.visible = snapshot.phase === 'warning'; this.eruption.visible = snapshot.phase === 'active';
    const progress = Math.max(0, Math.min(1, snapshot.warningProgress));
    this.progress.geometry.setDrawRange(0, progress <= 0 ? 0 : this.sectorEnds[Math.min(SECTORS - 1, Math.ceil(progress * SECTORS) - 1)] ?? 0);
    this.fillMaterial.opacity = .10 + progress * .08;
    this.progressMaterial.opacity = .24 + progress * .08;
    // No blinking or quality-dependent warning suppression. Reduced motion still has visible progress.
    this.outlineMaterial.opacity = 1;
    const age = Math.max(0, Math.min(1, snapshot.activeProgress));
    const envelope = Math.sin(Math.PI * Math.max(.08, age));
    this.fireMaterial.opacity = (1 - age) * .58; this.coreMaterial.opacity = (1 - age) * .70;
    for (let i = 0; i < this.spires.length; i++) {
      const spire = this.spires[i];
      // The central eruption marker always remains; optional flames alone respond to quality preferences.
      spire.visible = this.spireAllowed[i] && (i === 0 || !(options.reducedMotion || options.particlesDisabled || options.quality === 'low'));
      const width = snapshot.radius * (i === 0 ? .22 : .17);
      const height = options.reducedMotion ? .38 : (.32 + envelope * (i === 0 ? 1.6 : 1.05));
      spire.scale.set(width, height, width);
    }
  }
  reset() { this.group.visible = false; this.id = null; }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.group.removeFromParent();
    for (const mesh of [this.dark, this.outline, this.fill, this.progress]) mesh.geometry.dispose();
    this.spires[0].geometry.dispose();
    for (const material of [this.darkMaterial, this.outlineMaterial, this.fillMaterial, this.progressMaterial, this.fireMaterial, this.coreMaterial]) material.dispose();
  }
}
