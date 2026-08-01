// Dev-only pause flag, set by the Marksman markup tool's GameAdapter (main.tsx) while its overlay is
// open. Not game state — never touches the reducer/account — just gates the controller's own tick
// timers below so annotating a frame doesn't keep simulating underneath it. Marksman only mounts
// behind `import.meta.env.DEV`, so this stays permanently false in a shipped build.
let paused = false;

export function setMarksmanPaused(v: boolean): void {
  paused = v;
}

export function isMarksmanPaused(): boolean {
  return paused;
}
