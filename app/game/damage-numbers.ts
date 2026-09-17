import * as T from 'three';

export const DAMAGE_NUMBER_CAP = 8;
export const DAMAGE_NUMBER_LIFETIME = .65;
/** Consume resolved events, never nominal attack damage. */
export type DamageNumberEvent = {
  id: string;
  targetId: string;
  outcome: 'damaged' | 'evaded' | 'shielded';
  healthDelta: number;
  point: { x: number; y: number; z: number };
};
type Slot = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  texture: T.CanvasTexture;
  sprite: T.Sprite;
  targetId: string;
  eventId: string;
  serial: number;
  age: number;
  baseY: number;
};
type Options = { createCanvas?: () => HTMLCanvasElement | null };

/** Browser-only surfaces are lazy. Importing/constructing during SSR is safe.
 * Owns only its sprites, materials and textures; has no combat-state reference.
 */
export class DamageNumbers {
  private slots: Slot[] = [];
  private serial = 0;
  private disposed = false;
  private readonly createCanvas: () => HTMLCanvasElement | null;

  constructor(private readonly parent: T.Object3D, options: Options = {}) {
    this.createCanvas = options.createCanvas ?? (() => typeof document === 'undefined' ? null : document.createElement('canvas'));
  }

  emit(event: DamageNumberEvent): boolean {
    if (this.disposed || event.outcome !== 'damaged' || !Number.isFinite(event.healthDelta) || event.healthDelta <= 0 ||
        ![event.point.x, event.point.y, event.point.z].every(Number.isFinite)) return false;
    if (this.slots.some(s => s.sprite.visible && s.eventId === event.id)) return false;
    let slot = this.slots.find(s => s.sprite.visible && s.targetId === event.targetId)
      ?? this.slots.find(s => !s.sprite.visible);
    if (!slot && this.slots.length < DAMAGE_NUMBER_CAP) slot = this.makeSlot();
    if (!slot && this.slots.length) slot = this.slots.reduce((a, b) => a.serial < b.serial ? a : b);
    if (!slot) return false;
    const { context: ctx, canvas } = slot;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 64px system-ui, sans-serif'; ctx.lineJoin = 'round';
    ctx.lineWidth = 9; ctx.strokeStyle = '#151319'; ctx.fillStyle = '#fff3cf';
    // Avoid displaying zero for a positive fractional loss. Ordinary integer HP stays exact.
    const amount = Number(event.healthDelta.toFixed(2)) || Number(event.healthDelta.toPrecision(2));
    const label = `−${amount}`;
    ctx.strokeText(label, 128, 64, 240); ctx.fillText(label, 128, 64, 240);
    slot.texture.needsUpdate = true;
    slot.targetId = event.targetId; slot.eventId = event.id; slot.serial = ++this.serial; slot.age = 0;
    slot.baseY = event.point.y + .25;
    slot.sprite.position.set(event.point.x, slot.baseY, event.point.z);
    slot.sprite.material.opacity = 1; slot.sprite.visible = true;
    return true;
  }

  update(dt: number, reducedMotion = false): void {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    for (const slot of this.slots) {
      if (!slot.sprite.visible) continue;
      slot.age += elapsed;
      if (slot.age >= DAMAGE_NUMBER_LIFETIME) { slot.sprite.visible = false; continue; }
      const u = slot.age / DAMAGE_NUMBER_LIFETIME;
      slot.sprite.position.y = slot.baseY + (reducedMotion ? 0 : .35 * u);
      slot.sprite.material.opacity = u < .6 ? 1 : (1 - u) / .4;
    }
  }

  reset(): void { for (const slot of this.slots) slot.sprite.visible = false; }
  get activeCount(): number { return this.slots.filter(s => s.sprite.visible).length; }
  get allocatedCount(): number { return this.slots.length; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.slots) {
      slot.sprite.removeFromParent(); slot.texture.dispose(); slot.sprite.material.dispose();
    }
    this.slots.length = 0;
  }

  private makeSlot(): Slot | undefined {
    const canvas = this.createCanvas();
    if (!canvas) return undefined;
    canvas.width = 256; canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
    texture.minFilter = T.LinearFilter; texture.magFilter = T.LinearFilter; texture.generateMipmaps = false;
    const material = new T.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: true, toneMapped: false });
    const sprite = new T.Sprite(material); sprite.name = 'resolved damage number'; sprite.scale.set(1.15, .575, 1);
    sprite.visible = false; this.parent.add(sprite);
    const slot: Slot = { canvas, context, texture, sprite, targetId: '', eventId: '', serial: 0, age: 0, baseY: 0 };
    this.slots.push(slot); return slot;
  }
}
