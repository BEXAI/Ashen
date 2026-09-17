/** One finger owns a gesture until it ends; a second finger cannot steal it. */
export class PointerOwner {
  private pointerId: number | null = null;

  start(pointerId: number) {
    if (this.pointerId !== null) return false;
    this.pointerId = pointerId;
    return true;
  }

  owns(pointerId: number) { return this.pointerId === pointerId; }

  reset() {
    const previous = this.pointerId;
    this.pointerId = null;
    return previous;
  }
}

export function stickPosition(dx: number, dy: number, radius: number) {
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) {
    return { x: 0, y: 0, thumbX: 0, thumbY: 0, sprint: false };
  }
  const reach = Math.min(1, distance / radius);
  const strength = Math.max(0, (reach - 0.12) / 0.88);
  const directionX = distance ? dx / distance : 0;
  const directionY = distance ? dy / distance : 0;
  return {
    x: directionX * strength,
    y: directionY * strength,
    thumbX: directionX * reach * radius,
    thumbY: directionY * reach * radius,
    sprint: reach >= 0.95,
  };
}
