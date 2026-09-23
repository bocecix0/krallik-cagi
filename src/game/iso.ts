/** Isometric 2:1 projection helpers. World "screen space" is in pixels at zoom 1. */
export const TW = 64;
export const TH = 32;

export function toScreenX(x: number, y: number) {
  return ((x - y) * TW) / 2;
}
export function toScreenY(x: number, y: number) {
  return ((x + y) * TH) / 2;
}
export function toTile(sx: number, sy: number) {
  const a = sx / (TW / 2);
  const b = sy / (TH / 2);
  return { x: (b + a) / 2, y: (b - a) / 2 };
}

export interface Camera {
  x: number; // world px at viewport center
  y: number;
  zoom: number;
  vw: number; // viewport size in dp
  vh: number;
}

export function worldToView(cam: Camera, wx: number, wy: number) {
  return { x: (wx - cam.x) * cam.zoom + cam.vw / 2, y: (wy - cam.y) * cam.zoom + cam.vh / 2 };
}
export function viewToWorld(cam: Camera, vx: number, vy: number) {
  return { x: (vx - cam.vw / 2) / cam.zoom + cam.x, y: (vy - cam.vh / 2) / cam.zoom + cam.y };
}

export function clampCamera(cam: Camera, size: number) {
  const minX = toScreenX(0, size);
  const maxX = toScreenX(size, 0);
  const maxY = toScreenY(size, size);
  cam.zoom = Math.max(0.45, Math.min(2.2, cam.zoom));
  cam.x = Math.max(minX + 40, Math.min(maxX - 40, cam.x));
  cam.y = Math.max(0, Math.min(maxY, cam.y));
}
