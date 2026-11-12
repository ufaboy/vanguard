import { TankGameEngine } from '/src/game/engine.js';
import { ModelFactory } from '/src/game/models.js';
import { TileType, GameStatus } from '/src/game/types.js';

const report = data => fetch('/__results', { method: 'POST', body: JSON.stringify(data) });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const nextFrame = () => new Promise(requestAnimationFrame);
const runtimeErrors = [];
window.addEventListener('error', event => runtimeErrors.push(event.message));
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)));
try {
  // The same frozen full map, procedural tanks, camera and renderer in every run.
  // Avoid asynchronous tank swaps contaminating a terrain-only comparison.
  const loadPlayer = ModelFactory.prototype.loadPlayerGlbModel;
  const loadEnemies = ModelFactory.prototype.ensureEnemyModels;
  ModelFactory.prototype.loadPlayerGlbModel = () => {};
  ModelFactory.prototype.ensureEnemyModels = () => {};
  TankGameEngine.prototype.startLoop = () => {};
  const engine = new TankGameEngine(document.querySelector('#stage'), () => {}, { quality: 'high' });
  await engine.modelFactory.brickModelsReady;
  if (!engine.modelFactory.brickModels.states.size) await engine.modelFactory.brickModels.load();
  engine.modelFactory.onBrickModelsReady = null;
  const renderer = engine.renderer;
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER);
  const samples = [];
  const warmupFrames = engine.isSoftwareGl ? 6 : 12;
  const measuredFrames = engine.isSoftwareGl ? 30 : 60;
  const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)];
  for (const damaged of [false, true]) {
    for (const mode of (engine.isSoftwareGl ? ['procedural', 'blender'] : ['procedural', 'blender', 'blender', 'procedural'])) {
      engine.modelFactory.useBlenderBricks = mode === 'blender';
      engine.loadSector(0, false);
      engine.status = GameStatus.PAUSED;
      engine.camera.position.set(28, 34, 28);
      engine.camera.lookAt(0, 0, 0);
      engine.camera.updateMatrixWorld();
      const bricks = engine.grid.flat().filter(cell => cell.type === TileType.BRICK);
      if (damaged) bricks.forEach((cell, i) => {
        if (i % 4 === 0) engine.destroyTileCell(cell);
        else engine.damageTileCell(cell, i % 4, ...Object.values(engine.gridToWorld(cell.row, cell.col)));
      });
      engine.fx.clear();
      engine.tileBatcher.sync();
      for (let i = 0; i < warmupFrames; i++) { renderer.render(engine.scene, engine.camera); gl.finish(); await nextFrame(); }
      const timings = [], intervals = [];
      let previous = await nextFrame();
      for (let i = 0; i < measuredFrames; i++) {
        const begin = performance.now();
        renderer.render(engine.scene, engine.camera);
        gl.finish();
        timings.push(performance.now() - begin);
        const now = await nextFrame();
        intervals.push(now - previous);
        previous = now;
      }
      const result = { mode, damaged, bricks: bricks.length, calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures, medianRenderMs: quantile(timings, 0.5),
        p95RenderMs: quantile(timings, 0.95), medianFrameMs: quantile(intervals, 0.5) };
      samples.push(result);
      if (mode === 'blender' && damaged) {
        renderer.render(engine.scene, engine.camera);
        await fetch('/__screenshot', { method: 'POST', body: JSON.stringify({ image: renderer.domElement.toDataURL('image/png') }) });
      }
      console.log(JSON.stringify(result));
      await fetch('/__progress', { method: 'POST', body: JSON.stringify(result) });
      await pause(150);
    }
  }
  // Restore real tank loading and smoke-test the live simulation after measurements.
  ModelFactory.prototype.loadPlayerGlbModel = loadPlayer;
  ModelFactory.prototype.ensureEnemyModels = loadEnemies;
  engine.modelFactory.useBlenderBricks = !engine.isSoftwareGl;
  engine.loadSector(0, false);
  if (!engine.isSoftwareGl) loadPlayer.call(engine.modelFactory);
  await pause(2500);
  engine.status = GameStatus.PLAYING;
  for (let i = 0; i < 120; i++) {
    engine.clock.update();
    engine.update(1 / 60);
    if (i % 30 === 0) engine.tryPlayerFire();
  }
  engine.tileBatcher.sync();
  engine.camera.position.set(28, 34, 28);
  engine.camera.lookAt(0, 0, 0);
  renderer.render(engine.scene, engine.camera);
  const result = { gpu, software: engine.isSoftwareGl, width: 1280, height: 720,
    pixelRatio: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled,
    method: `Frozen mission 01; identical procedural tanks; ${engine.isSoftwareGl ? 'AB' : 'ABBA'} order; ${warmupFrames} warmup and ${measuredFrames} measured frames. Render-call wall time includes a gl.finish request but is not a GPU timer; RAF intervals measure observed frame pacing. Not uncapped gameplay FPS.`,
    smoke: { simulationSteps: 120, runtimeErrors, defaultBrickModel: engine.modelFactory.useBlenderBricks ? 'blender' : 'procedural',
      playerGlbLoaded: Boolean(engine.modelFactory.playerGlbParts) }, samples };
  document.querySelector('#results').textContent = JSON.stringify(result, null, 2);
  await report(result);
} catch (error) {
  document.querySelector('#results').textContent = error.stack;
  await report({ error: error.stack });
}
