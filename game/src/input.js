// EMBERLINE — input.js: keyboard + mouse + pointer lock. One object, read by
// the fixed-step sim; the sim never touches DOM events directly.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const input = {
    keys, mouseDX: 0, mouseDY: 0, firing: false, locked: false,
    // edge-triggered actions consumed by the sim each step:
    pressed: new Set(),
  };
  function code(e) { return e.code; }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) { keys.add(e.code); input.pressed.add(e.code); }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.mouseDX += e.movementX; input.mouseDY += e.movementY;
  });
  // Listen on window, not just the canvas: while pointer lock is held the
  // locked element still gets the event, but a window listener also catches
  // clicks that land on HUD layers above the canvas.
  window.addEventListener('mousedown', (e) => { if (e.button === 0) input.firing = true; });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.firing = false; });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(input.locked);
  });
  input.requestLock = () => { if (!input.locked) canvas.requestPointerLock(); };
  input.exitLock = () => { if (document.pointerLockElement) document.exitPointerLock(); };
  input.consume = (c) => { const had = input.pressed.has(c); input.pressed.delete(c); return had; };
  input.endStep = () => { input.mouseDX = 0; input.mouseDY = 0; input.pressed.clear(); };
  return input;
}
