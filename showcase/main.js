import { CAMERA_LABELS } from '../public/src/app/state.js';
import { TankGameEngine } from '../public/src/game/engine/engineCore.js';
import { pregenerateTextures } from '../public/src/game/render/texture-gen.js';
import { SECTORS, normalizeMapDefinition } from '../public/src/game/levels.js';
import { GameStatus } from '../public/src/game/types.js';
import { sound } from '../public/src/game/sound.js';
import { setHidden } from '../public/src/ui/dom-helpers.js';
import { renderNorthUpSensorMinimap } from '../public/src/ui/minimap.js';
import { renderBattlefieldHud } from '../public/src/ui/battle-hud.js';
import { buildShowcaseMapDefinition } from './showcase-map.js';
import { ShowcaseDirector } from './director.js';

async function initShowcase() {
  const mountEl = document.getElementById('canvas-mount');
  const fadeEl = document.getElementById('scene-fade');
  if (!mountEl) return;

  // Mute audio by default for clean automated promo playback without browser autoplay warnings.
  sound.enabled = false;

  const rawShowcaseMap = buildShowcaseMapDefinition();
  const showcaseSector = normalizeMapDefinition(rawShowcaseMap, SECTORS.length);
  const showcaseSectorIndex = SECTORS.length;
  SECTORS.push(showcaseSector);

  const state = {
    cameraPreset: 'ISOMETRIC',
    missileFpvEnabled: false,
    hardMode: false,
    soundEnabled: false,
    graphicsQuality: 'high',
    fpsCap: 60,
    hudCollapsed: false,
    upgrades: { cannon: 2, chassis: 2, frame: 2, engine: 2, armor: 2 },
    hud: {
      status: GameStatus.PLAYING,
      sectorId: showcaseSectorIndex,
      gameMode: 'extermination',
      playerHp: 22,
      playerMaxHp: 22,
      shotsFired: 0,
      shotsHit: 0,
    },
  };

  let director = null;
  let pregenerated = null;
  try {
    pregenerated = pregenerateTextures();
  } catch {
    pregenerated = null;
  }

  const renderHud = (snapshot, syncedUpgrades) => {
    state.hud = snapshot;
    if (syncedUpgrades) state.upgrades = syncedUpgrades;

    for (const id of ['top-telemetry', 'top-compass', 'top-controls', 'modifiers-strip', 'sensor-minimap', 'bottom-hud']) {
      setHidden(document.getElementById(id), false);
    }

    const hpPercent = Math.max(0, Math.min(140, (snapshot.playerHp / Math.max(1, snapshot.playerMaxHp)) * 100));
    const isOverhealed = snapshot.playerHp > snapshot.playerMaxHp;
    const isLowHp = snapshot.playerHp / Math.max(1, snapshot.playerMaxHp) < 0.33;

    renderNorthUpSensorMinimap(snapshot);
    renderBattlefieldHud({
      state,
      hud: snapshot,
      upgrades: state.upgrades,
      currentSector: showcaseSector,
      cameraLabels: CAMERA_LABELS,
      hpPercent,
      isOverhealed,
      isLowHp,
    });
  };

  const engine = new TankGameEngine(mountEl, renderHud, {
    quality: 'high',
    fpsCap: 60,
    pregeneratedTextures: pregenerated,
    scriptedMode: true,
    onBeforeStep: (dt) => {
      director?.step(dt);
    },
  });

  await engine.waitForSectorModels(showcaseSectorIndex);
  engine.airSupportController?.preloadGlbModels?.();
  engine.reconDroneController?.preloadGlbModel?.();

  director = new ShowcaseDirector(engine, showcaseSectorIndex, {
    onFade: (opacity) => {
      if (fadeEl) fadeEl.style.opacity = String(opacity);
    },
  });

  director.start();
}

initShowcase();
