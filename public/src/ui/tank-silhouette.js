/**
 * Bottom-left tactical tank damage silhouette (top-down paper-doll).
 * Reflects subsystem integrity, armor panel state, and persistent component faults.
 */

function getTier(ratio, status, hasFault) {
  if (status === 'destroyed' || ratio <= 0.25) return 'crit';
  if (status === 'damaged' || ratio < 0.7 || hasFault) return 'warn';
  return 'ok';
}

function subsystemTier(sub, hasFault = false) {
  if (!sub) return hasFault ? 'warn' : 'ok';
  const ratio = sub.hp / Math.max(1, sub.maxHp || 100);
  return getTier(ratio, sub.status, hasFault);
}

function panelTier(panel, defaultMax, hasFault = false) {
  if (!panel) return hasFault ? 'warn' : 'ok';
  if (panel.destroyed) return 'crit';
  const max = panel.maxIntegrity || defaultMax;
  const ratio = panel.integrity / Math.max(1, max);
  return getTier(ratio, null, hasFault);
}

function worstTier(a, b) {
  const rank = { ok: 0, warn: 1, crit: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function buildTrackPads(x, count = 16) {
  const pads = [];
  const startY = 39;
  const step = 7.1;
  for (let i = 0; i < count; i += 1) {
    const y = (startY + i * step).toFixed(1);
    pads.push(`<rect class="ts-track-pad" x="${x}" y="${y}" width="11" height="5.2" rx="1"/>`);
  }
  return pads.join('');
}

const LEFT_TRACK_PADS = buildTrackPads(25.5);
const RIGHT_TRACK_PADS = buildTrackPads(87.5);

export function renderTankSilhouette(hud) {
  const sub = hud?.subsystems || {};
  const panels = hud?.playerArmorPanels || {};
  const faults = hud?.componentDamage || {};

  const leftTrackState = subsystemTier(sub.leftTrack, Boolean(faults.chassis));
  const rightTrackState = subsystemTier(sub.rightTrack, Boolean(faults.chassis));
  const engineState = subsystemTier(sub.engine, Boolean(faults.engine));
  const cannonState = subsystemTier(sub.cannon, Boolean(faults.cannon));
  const turretState = worstTier(
    worstTier(subsystemTier(sub.turretDrive), subsystemTier(sub.stabilizer)),
    panelTier(panels.SOCKET_ARMOR_TURRET, 85)
  );
  const frontState = panelTier(
    panels.SOCKET_ARMOR_FRONT,
    100,
    Boolean(faults.frame || faults.armor)
  );
  const leftHullState = panelTier(panels.SOCKET_ARMOR_LEFT, 70, Boolean(faults.armor));
  const rightHullState = panelTier(panels.SOCKET_ARMOR_RIGHT, 70, Boolean(faults.armor));

  return `
    <div class="hud-card hud-silhouette-card" aria-label="Tank Damage Silhouette">
      <svg class="ts-svg" viewBox="0 0 124 170" width="116" height="159" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ts-grad-ok" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#5d8a32"/>
            <stop offset="100%" stop-color="#3a591e"/>
          </linearGradient>
          <linearGradient id="ts-grad-warn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#92400e"/>
          </linearGradient>
          <linearGradient id="ts-grad-crit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ef4444"/>
            <stop offset="100%" stop-color="#7f1d1d"/>
          </linearGradient>
          <linearGradient id="ts-track-ok" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#363a40"/>
            <stop offset="50%" stop-color="#4e545c"/>
            <stop offset="100%" stop-color="#32363b"/>
          </linearGradient>
          <filter id="ts-glow-warn" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#f59e0b" flood-opacity="0.7"/>
          </filter>
          <filter id="ts-glow-crit" x="-25%" y="-25%" width="150%" height="150%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.6" flood-color="#ef4444" flood-opacity="0.85"/>
          </filter>
        </defs>

        <!-- Chamfered dark backdrop frame -->
        <polygon
          class="ts-frame-outline"
          points="12,3 112,3 121,12 121,158 112,167 12,167 3,158 3,12"
        />

        <!-- Outer hull nose bevel -->
        <polyline class="ts-hull-bevel" points="37,35 46,22 78,22 87,35"/>

        <!-- Front Glacis Plate -->
        <g class="ts-part ts-state-${frontState}" data-part="front">
          <polygon
            class="ts-armor-fill ts-outline"
            points="39,36 47,26 77,26 85,36 85,54 76,54 76,47 48,47 48,54 39,54"
          />
          <line class="ts-detail-line" x1="45" y1="30" x2="55" y2="30"/>
          <line class="ts-detail-line" x1="69" y1="30" x2="79" y2="30"/>
          <circle class="ts-rivet" cx="42" cy="50.5" r="0.9"/>
          <circle class="ts-rivet" cx="82" cy="50.5" r="0.9"/>
        </g>

        <!-- Left Track -->
        <g class="ts-track ts-state-${leftTrackState}" data-part="left-track">
          <polygon
            class="ts-track-shell ts-outline"
            points="27,34 38,34 38,160 27,160 24,154 24,40"
          />
          ${LEFT_TRACK_PADS}
        </g>

        <!-- Right Track -->
        <g class="ts-track ts-state-${rightTrackState}" data-part="right-track">
          <polygon
            class="ts-track-shell ts-outline"
            points="86,34 97,34 100,40 100,154 97,160 86,160"
          />
          ${RIGHT_TRACK_PADS}
        </g>

        <!-- Left Side Hull / Sponson -->
        <g class="ts-part ts-state-${leftHullState}" data-part="left-hull">
          <polygon
            class="ts-armor-fill ts-outline"
            points="39,96 48,101 48,136 41,143 39,141"
          />
          <line class="ts-detail-line" x1="42" y1="106" x2="42" y2="132"/>
        </g>

        <!-- Right Side Hull / Sponson -->
        <g class="ts-part ts-state-${rightHullState}" data-part="right-hull">
          <polygon
            class="ts-armor-fill ts-outline"
            points="85,96 76,101 76,136 83,143 85,141"
          />
          <line class="ts-detail-line" x1="82" y1="106" x2="82" y2="132"/>
        </g>

        <!-- Center Engine Deck -->
        <g class="ts-part ts-state-${engineState}" data-part="engine-deck">
          <rect class="ts-armor-fill ts-outline" x="50" y="99" width="24" height="28" rx="1"/>
          <rect class="ts-detail-box" x="56" y="109" width="12" height="8" rx="0.8"/>
          <circle class="ts-rivet" cx="52.5" cy="101.5" r="0.8"/>
          <circle class="ts-rivet" cx="71.5" cy="101.5" r="0.8"/>
          <circle class="ts-rivet" cx="52.5" cy="124.5" r="0.8"/>
          <circle class="ts-rivet" cx="71.5" cy="124.5" r="0.8"/>
        </g>

        <!-- Rear Radiator Grille & Lower Plate (Engine) -->
        <g class="ts-part ts-state-${engineState}" data-part="engine">
          <polygon
            class="ts-armor-fill ts-outline"
            points="49,130 75,130 82,138 77,149 47,149 42,138"
          />
          <line class="ts-louver" x1="51" y1="133" x2="51" y2="146"/>
          <line class="ts-louver" x1="54" y1="133" x2="54" y2="146"/>
          <line class="ts-louver" x1="57" y1="133" x2="57" y2="146"/>
          <line class="ts-louver" x1="60" y1="133" x2="60" y2="146"/>
          <line class="ts-louver" x1="63" y1="133" x2="63" y2="146"/>
          <line class="ts-louver" x1="66" y1="133" x2="66" y2="146"/>
          <line class="ts-louver" x1="69" y1="133" x2="69" y2="146"/>
          <line class="ts-louver" x1="72" y1="133" x2="72" y2="146"/>
          <polygon
            class="ts-armor-fill ts-outline"
            points="43,152 81,152 83,159 41,159"
          />
          <rect class="ts-detail-box" x="49" y="155" width="7" height="4"/>
          <rect class="ts-detail-box" x="68" y="155" width="7" height="4"/>
        </g>

        <!-- Turret -->
        <g class="ts-part ts-state-${turretState}" data-part="turret">
          <polygon
            class="ts-armor-fill ts-outline"
            points="51,48 73,48 79,57 83,61 83,84 78,94 69,99 55,99 46,94 41,84 41,61 45,57"
          />
          <rect class="ts-detail-box ts-outline-thin" x="55" y="67" width="14" height="14" rx="1"/>
          <line class="ts-detail-line" x1="46" y1="62" x2="50" y2="57"/>
          <line class="ts-detail-line" x1="78" y1="62" x2="74" y2="57"/>
          <circle class="ts-rivet" cx="46" cy="87" r="0.9"/>
          <circle class="ts-rivet" cx="78" cy="87" r="0.9"/>
        </g>

        <!-- Cannon & Mantlet (static pointing up) -->
        <g class="ts-part ts-state-${cannonState}" data-part="cannon">
          <rect class="ts-armor-fill ts-outline" x="57.5" y="42" width="9" height="13" rx="1"/>
          <rect class="ts-armor-fill ts-outline" x="59.5" y="12" width="5" height="30"/>
          <rect class="ts-armor-fill ts-outline" x="58.5" y="4" width="7" height="8" rx="1"/>
          <line class="ts-detail-line" x1="59.5" y1="7" x2="64.5" y2="7"/>
          <line class="ts-detail-line" x1="59.5" y1="9.5" x2="64.5" y2="9.5"/>
        </g>
      </svg>
    </div>
  `;
}

