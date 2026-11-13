/**
 * Contracts Mode & "Last Cargo" Logistics Raid Simulation.
 *
 * Implements:
 * - Cargo state machine: available -> loading -> carried -> unloading -> delivered
 * - Explicit loading interaction (stop within 1.5 cells, press E / Cargo button for 2s;
 *   movement or leaving range cancels, damage does not)
 * - Automatic delivery pad unloading (remain stationary on pad for 2s; movement pauses,
 *   leaving pad resets progress)
 * - Explicit extraction on pad after 2 or 3 deliveries (3s countdown; leaving pad cancels,
 *   damage or movement inside pad does not reset, fighting remains possible)
 * - Idempotent per-attempt delivery payouts (1500 each) and extraction settlement
 *   (3000 for >=2, +2500 bonus for 3/3)
 * - Event-triggered finite encounter scheduler (budget of 24 across G0..G4, max 6 live,
 *   6s gate warning, packets of <=2 every 4s except G0's two opening packets of 3,
 *   8s post-delivery admission pause)
 * - Contract objective orders (northern patrol, alarm search, cargo court checkpoints,
 *   return lane overwatch, split pursuit/delivery intercept)
 */

import { GRID_SIZE, TILE_SIZE } from '../game/constants.js';
import { EnemyClass } from '../game/tanks.js';

export const CARGO_STATUS = Object.freeze({
  AVAILABLE: 'available',
  LOADING: 'loading',
  CARRIED: 'carried',
  UNLOADING: 'unloading',
  ARMED: 'armed',
  DELIVERED: 'delivered',
});

export const CONTRACT_TYPES = Object.freeze({
  CARGO_RECOVERY: 'cargo_recovery',
  SABOTAGE_PROTOCOL: 'sabotage_protocol',
});

export const CONTRACT_PAYOUTS = Object.freeze({
  PER_CARGO: 1500,
  EXTRACTION_BASE: 3000,
  THIRD_CARGO_BONUS: 2500,
});

export const CONTRACT_TIMING = Object.freeze({
  LOAD_SEC: 2.0,
  UNLOAD_SEC: 2.0,
  ARM_SEC: 2.5,
  DETONATE_SEC: 8.0,
  BLAST_RADIUS_CELLS: 3.0,
  EXTRACT_SEC: 3.0,
  LOAD_RANGE_CELLS: 1.5,
  GATE_WARNING_SEC: 6.0,
  PACKET_INTERVAL_SEC: 4.0,
  POST_DELIVERY_PAUSE_SEC: 8.0,
  MAX_PACKET_SIZE: 2,
  MAX_LIVE_ENEMIES: 6,
  MAX_ATTACKERS: 3,
  REQUIRED_DELIVERIES: 2,
});

export const LAST_CARGO_GATES = Object.freeze({
  west: Object.freeze({
    id: 'west',
    label: 'WEST GATE',
    shortLabel: 'WEST',
    row: 0,
    col: 7,
    entryTarget: Object.freeze({ row: 3, col: 7 }),
    flankGateId: 'center',
  }),
  center: Object.freeze({
    id: 'center',
    label: 'CENTER GATE',
    shortLabel: 'CENTER',
    row: 0,
    col: 20,
    entryTarget: Object.freeze({ row: 3, col: 20 }),
    flankGateId: 'west',
  }),
  east: Object.freeze({
    id: 'east',
    label: 'EAST GATE',
    shortLabel: 'EAST',
    row: 0,
    col: 32,
    entryTarget: Object.freeze({ row: 3, col: 32 }),
    flankGateId: 'center',
  }),
});

export const LAST_CARGO_CONTAINERS = Object.freeze([
  Object.freeze({
    id: 'cargo-a',
    slot: 1,
    code: 'A',
    name: 'Cargo A · Rail Depot',
    shortName: 'RAIL DEPOT',
    row: 14,
    col: 9,
    gateId: 'west',
    accentHex: '#38bdf8',
    searchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 7 }),
      Object.freeze({ row: 9, col: 8 }),
      Object.freeze({ row: 14, col: 9 }),
      Object.freeze({ row: 22, col: 10 }),
    ]),
    altSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 9, col: 15 }),
      Object.freeze({ row: 14, col: 11 }),
      Object.freeze({ row: 14, col: 9 }),
    ]),
    waterSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 10, col: 17 }),
      Object.freeze({ row: 16, col: 14 }),
      Object.freeze({ row: 14, col: 9 }),
    ]),
    checkpoints: Object.freeze([
      Object.freeze({ row: 12, col: 9, zone: Object.freeze({ row: 2, col: 1 }) }),
      Object.freeze({ row: 16, col: 10, zone: Object.freeze({ row: 2, col: 1 }) }),
    ]),
  }),
  Object.freeze({
    id: 'cargo-b',
    slot: 2,
    code: 'B',
    name: 'Cargo B · Pump Island',
    shortName: 'PUMP ISLAND',
    row: 22,
    col: 20,
    gateId: 'center',
    accentHex: '#f59e0b',
    searchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 10, col: 20 }),
      Object.freeze({ row: 16, col: 17 }),
      Object.freeze({ row: 22, col: 20 }),
    ]),
    altSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 7 }),
      Object.freeze({ row: 11, col: 13 }),
      Object.freeze({ row: 17, col: 15 }),
      Object.freeze({ row: 22, col: 20 }),
    ]),
    waterSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 13, col: 23 }),
      Object.freeze({ row: 16, col: 23 }),
      Object.freeze({ row: 22, col: 20 }),
    ]),
    checkpoints: Object.freeze([
      Object.freeze({ row: 17, col: 16, zone: Object.freeze({ row: 2, col: 2 }) }),
      Object.freeze({ row: 25, col: 21, zone: Object.freeze({ row: 4, col: 3 }) }),
    ]),
  }),
  Object.freeze({
    id: 'cargo-c',
    slot: 3,
    code: 'C',
    name: 'Cargo C · Container Yard',
    shortName: 'CONTAINER YARD',
    row: 9,
    col: 30,
    gateId: 'east',
    accentHex: '#a855f7',
    searchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 32 }),
      Object.freeze({ row: 8, col: 31 }),
      Object.freeze({ row: 9, col: 30 }),
      Object.freeze({ row: 14, col: 29 }),
    ]),
    altSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 8, col: 25 }),
      Object.freeze({ row: 9, col: 30 }),
      Object.freeze({ row: 13, col: 33 }),
    ]),
    waterSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 11, col: 24 }),
      Object.freeze({ row: 13, col: 27 }),
      Object.freeze({ row: 9, col: 30 }),
    ]),
    checkpoints: Object.freeze([
      Object.freeze({ row: 11, col: 29, zone: Object.freeze({ row: 1, col: 4 }) }),
      Object.freeze({ row: 14, col: 31, zone: Object.freeze({ row: 2, col: 5 }) }),
    ]),
  }),
]);

export const LAST_CARGO_DELIVERY_PAD = Object.freeze({
  rowMin: 34,
  rowMax: 36,
  colMin: 18,
  colMax: 21,
  centerRow: 35,
  centerCol: 19.5,
});

/**
 * Finite encounter schedule of 24 enemies across G0..G4.
 * Exact roster: 7 STANDARD, 6 SCOUT, 3 ARMOR, 2 HOVER, 2 HOWITZER, 2 STRIKER, 1 ENGINEER, 1 JAMMER = 24.
 */
export const LAST_CARGO_GROUPS = Object.freeze({
  G0: Object.freeze({
    id: 'G0',
    trigger: 'contract_start',
    label: 'G0 // TERMINAL PATROL DEPLOYED',
    assignment: 'northern_patrol',
    roster: Object.freeze([
      EnemyClass.STANDARD,
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
      EnemyClass.SCOUT,
      EnemyClass.HOWITZER,
      EnemyClass.ENGINEER,
    ]),
    packets: Object.freeze([
      Object.freeze([EnemyClass.STANDARD, EnemyClass.STANDARD, EnemyClass.SCOUT]),
      Object.freeze([EnemyClass.SCOUT, EnemyClass.HOWITZER, EnemyClass.ENGINEER]),
    ]),
  }),
  G1: Object.freeze({
    id: 'G1',
    trigger: 'first_cargo_loaded',
    label: 'G1 // TERMINAL ALARM — INTERCEPTORS INBOUND',
    assignment: 'alarm_search',
    roster: Object.freeze([
      EnemyClass.SCOUT,
      EnemyClass.SCOUT,
      EnemyClass.HOVER,
      EnemyClass.STANDARD,
    ]),
  }),
  G2: Object.freeze({
    id: 'G2',
    trigger: 'first_delivery_completed',
    label: 'G2 // ROUTE CHECKPOINT GARRISON INBOUND',
    assignment: 'cargo_checkpoints',
    roster: Object.freeze([
      EnemyClass.ARMOR,
      EnemyClass.ARMOR,
      EnemyClass.STANDARD,
      EnemyClass.STANDARD,
      EnemyClass.JAMMER,
    ]),
  }),
  G3: Object.freeze({
    id: 'G3',
    trigger: 'second_cargo_loaded',
    label: 'G3 // RETURN LANE OVERWATCH INBOUND',
    assignment: 'return_overwatch',
    roster: Object.freeze([
      EnemyClass.STRIKER,
      EnemyClass.HOWITZER,
      EnemyClass.STANDARD,
      EnemyClass.STANDARD,
    ]),
  }),
  G4: Object.freeze({
    id: 'G4',
    trigger: 'third_cargo_loaded',
    label: 'G4 // FINAL PURSUIT SQUADRON INBOUND',
    assignment: 'final_pursuit',
    roster: Object.freeze([
      EnemyClass.ARMOR,
      EnemyClass.STRIKER,
      EnemyClass.HOVER,
      EnemyClass.SCOUT,
      EnemyClass.SCOUT,
    ]),
  }),
});

export const LAST_CARGO_CONTRACT = Object.freeze({
  id: 'contract-last-cargo',
  contractType: CONTRACT_TYPES.CARGO_RECOVERY,
  code: 'CONTRACT-01 // LOGISTICS RAID',
  name: 'Last Cargo',
  subtitle: 'RIVER TERMINAL DATA RECOVERY',
  theme: 'Industrial River Terminal · 40×40',
  targetDuration: '8–12 minutes (no global timer)',
  difficulty: 'High (Late-Game Tier III–V)',
  summary:
    'Recover two of three sealed data containers from a river terminal and extract from the southern delivery pad. The third container is an optional high-risk run for bonus credits.',
  containers: LAST_CARGO_CONTAINERS,
  deliveryPad: LAST_CARGO_DELIVERY_PAD,
  gates: LAST_CARGO_GATES,
  groups: LAST_CARGO_GROUPS,
  payouts: CONTRACT_PAYOUTS,
  timing: CONTRACT_TIMING,
  landmarks: Object.freeze([
    Object.freeze({ id: 'west-rail-gantry', kind: 'rail_gantry', row: 11, col: 9, label: 'WEST RAIL GANTRY' }),
    Object.freeze({ id: 'island-pump-assembly', kind: 'pump_assembly', row: 17, col: 21, label: 'ISLAND PUMP STATION' }),
    Object.freeze({ id: 'east-cargo-crane', kind: 'cargo_crane', row: 8, col: 32, label: 'EAST CARGO CRANE' }),
  ]),
});

const BLACKOUT_RELAYS = Object.freeze([
  Object.freeze({
    id: 'relay-alpha',
    slot: 1,
    code: 'A',
    name: 'Relay Alpha · West Listening Array',
    shortName: 'WEST ARRAY',
    row: 13,
    col: 8,
    gateId: 'west',
    accentHex: '#a855f7',
    searchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 7 }),
      Object.freeze({ row: 8, col: 8 }),
      Object.freeze({ row: 13, col: 8 }),
      Object.freeze({ row: 17, col: 9 }),
    ]),
    altSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 9, col: 14 }),
      Object.freeze({ row: 13, col: 10 }),
      Object.freeze({ row: 13, col: 8 }),
    ]),
    waterSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 7 }),
      Object.freeze({ row: 10, col: 8 }),
      Object.freeze({ row: 13, col: 8 }),
    ]),
    checkpoints: Object.freeze([
      Object.freeze({ row: 11, col: 8, zone: Object.freeze({ row: 1, col: 1 }) }),
      Object.freeze({ row: 16, col: 9, zone: Object.freeze({ row: 2, col: 1 }) }),
    ]),
  }),
  Object.freeze({
    id: 'relay-bravo',
    slot: 2,
    code: 'B',
    name: 'Relay Bravo · Central ECM Citadel',
    shortName: 'ECM CITADEL',
    row: 16,
    col: 19,
    gateId: 'center',
    accentHex: '#38bdf8',
    searchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 10, col: 19 }),
      Object.freeze({ row: 16, col: 19 }),
      Object.freeze({ row: 25, col: 19 }),
    ]),
    altSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 7 }),
      Object.freeze({ row: 11, col: 14 }),
      Object.freeze({ row: 16, col: 19 }),
    ]),
    waterSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 13, col: 23 }),
      Object.freeze({ row: 16, col: 19 }),
    ]),
    checkpoints: Object.freeze([
      Object.freeze({ row: 14, col: 18, zone: Object.freeze({ row: 2, col: 3 }) }),
      Object.freeze({ row: 23, col: 19, zone: Object.freeze({ row: 3, col: 3 }) }),
    ]),
  }),
  Object.freeze({
    id: 'relay-charlie',
    slot: 3,
    code: 'C',
    name: 'Relay Charlie · East Uplink Bunker',
    shortName: 'UPLINK BUNKER',
    row: 9,
    col: 31,
    gateId: 'east',
    accentHex: '#f43f5e',
    searchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 32 }),
      Object.freeze({ row: 7, col: 31 }),
      Object.freeze({ row: 9, col: 31 }),
      Object.freeze({ row: 14, col: 31 }),
    ]),
    altSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 8, col: 26 }),
      Object.freeze({ row: 9, col: 31 }),
    ]),
    waterSearchRoute: Object.freeze([
      Object.freeze({ row: 4, col: 20 }),
      Object.freeze({ row: 12, col: 24 }),
      Object.freeze({ row: 9, col: 31 }),
    ]),
    checkpoints: Object.freeze([
      Object.freeze({ row: 11, col: 31, zone: Object.freeze({ row: 1, col: 5 }) }),
      Object.freeze({ row: 15, col: 31, zone: Object.freeze({ row: 2, col: 5 }) }),
    ]),
  }),
]);

const BLACKOUT_GROUPS = Object.freeze({
  G0: Object.freeze({
    id: 'G0',
    trigger: 'contract_start',
    label: 'G0 // RELAY PERIMETER GARRISON DEPLOYED',
    assignment: 'northern_patrol',
    roster: Object.freeze([
      EnemyClass.STANDARD,
      EnemyClass.SCOUT,
      EnemyClass.SCOUT,
      EnemyClass.JAMMER,
      EnemyClass.HOWITZER,
      EnemyClass.ENGINEER,
    ]),
    packets: Object.freeze([
      Object.freeze([EnemyClass.STANDARD, EnemyClass.SCOUT, EnemyClass.JAMMER]),
      Object.freeze([EnemyClass.SCOUT, EnemyClass.HOWITZER, EnemyClass.ENGINEER]),
    ]),
  }),
  G1: Object.freeze({
    id: 'G1',
    trigger: 'first_charge_armed',
    label: 'G1 // DEMOLITION ALARM — STEALTH HUNTERS INBOUND',
    assignment: 'alarm_search',
    roster: Object.freeze([
      EnemyClass.SCOUT,
      EnemyClass.STEALTH,
      EnemyClass.STANDARD,
      EnemyClass.HOVER,
    ]),
  }),
  G2: Object.freeze({
    id: 'G2',
    trigger: 'first_relay_destroyed',
    label: 'G2 // ECM BLACKOUT QRF — BREACHERS INBOUND',
    assignment: 'cargo_checkpoints',
    roster: Object.freeze([
      EnemyClass.ARMOR,
      EnemyClass.JAMMER,
      EnemyClass.STANDARD,
      EnemyClass.SAPPER,
      EnemyClass.FLAMETHROWER,
    ]),
  }),
  G3: Object.freeze({
    id: 'G3',
    trigger: 'second_charge_armed',
    label: 'G3 // EXTRACTION CORRIDOR BLOCKADE INBOUND',
    assignment: 'return_overwatch',
    roster: Object.freeze([
      EnemyClass.STRIKER,
      EnemyClass.HOWITZER,
      EnemyClass.STEALTH,
      EnemyClass.STANDARD,
    ]),
  }),
  G4: Object.freeze({
    id: 'G4',
    trigger: 'third_charge_armed',
    label: 'G4 // TOTAL BLACKOUT TERMINATION SQUAD INBOUND',
    assignment: 'final_pursuit',
    roster: Object.freeze([
      EnemyClass.ARMOR,
      EnemyClass.ARMOR,
      EnemyClass.STRIKER,
      EnemyClass.KAMIKAZE,
      EnemyClass.SCOUT,
    ]),
  }),
});

const BLACKOUT_PROTOCOL_CONTRACT = Object.freeze({
  id: 'contract-blackout-protocol',
  contractType: CONTRACT_TYPES.SABOTAGE_PROTOCOL,
  code: 'CONTRACT-02 // SABOTAGE RAID',
  name: 'Blackout Protocol',
  subtitle: 'RADAR & ECM RELAY DEMOLITION',
  theme: 'Armored Comms & ECM Array · 40×40',
  targetDuration: '7–11 minutes (8.0s blast fuses)',
  difficulty: 'Very High (Stealth / Jammer / Breacher QRF)',
  summary:
    'Infiltrate the northern communications array, plant timed demolition charges [E] on at least two of three armored radar/ECM relays, clear the 3-cell blast zone before the 8-second fuse detonates, and extract from the southern pad.',
  containers: BLACKOUT_RELAYS,
  deliveryPad: LAST_CARGO_DELIVERY_PAD,
  gates: LAST_CARGO_GATES,
  groups: BLACKOUT_GROUPS,
  payouts: CONTRACT_PAYOUTS,
  timing: CONTRACT_TIMING,
  landmarks: Object.freeze([
    Object.freeze({ id: 'west-listening-dish', kind: 'rail_gantry', row: 11, col: 8, label: 'WEST LISTENING ARRAY' }),
    Object.freeze({ id: 'central-ecm-citadel', kind: 'pump_assembly', row: 15, col: 19, label: 'CENTRAL ECM CITADEL' }),
    Object.freeze({ id: 'east-uplink-bunker', kind: 'cargo_crane', row: 8, col: 31, label: 'EAST UPLINK BUNKER' }),
  ]),
});

export const CONTRACTS_CATALOG = Object.freeze([
  LAST_CARGO_CONTRACT,
  BLACKOUT_PROTOCOL_CONTRACT,
]);

/** Splits a roster into packets of at most `maxPerPacket` units. */
function chunkPackets(roster, maxPerPacket = CONTRACT_TIMING.MAX_PACKET_SIZE) {
  const packets = [];
  for (let i = 0; i < roster.length; i += maxPerPacket) {
    packets.push(roster.slice(i, i + maxPerPacket));
  }
  return packets;
}

/** Chooses fixed primary and flanking north gates when a group is queued. */
function chooseGroupGates(contractState, groupId, contextCargoId = null) {
  const gates = LAST_CARGO_GATES;
  if (groupId === 'G0') {
    return { primaryGateId: 'center', secondaryGateId: 'west', tertiaryGateId: 'east' };
  }
  if (groupId === 'G2') {
    const remaining = contractState.containers.filter((c) => c.status !== CARGO_STATUS.DELIVERED);
    const primaryGateId = remaining[0]?.gateId || 'center';
    const secondaryGateId = remaining[1]?.gateId || gates[primaryGateId]?.flankGateId || 'east';
    return { primaryGateId, secondaryGateId };
  }
  const cargo =
    contractState.containers.find((c) => c.id === contextCargoId) ||
    contractState.containers.find((c) => c.id === contractState.carriedCargoId) ||
    contractState.containers[0];
  const primaryGateId = cargo?.gateId || 'center';
  const secondaryGateId = gates[primaryGateId]?.flankGateId || 'center';
  return { primaryGateId, secondaryGateId };
}

/** Builds the contract-level movement assignment (route + home zone) for a spawned unit. */
export function buildContractUnitAssignment(contractState, groupEntry, unitType, unitIndex) {
  const { id: groupId, contextCargoId, primaryGateId, secondaryGateId } = groupEntry;
  const gateId = unitIndex % 2 === 0 ? primaryGateId : secondaryGateId || primaryGateId;
  const gate = LAST_CARGO_GATES[gateId] || LAST_CARGO_GATES.center;
  const defCatalog = contractState?.objectiveCatalog || LAST_CARGO_CONTAINERS;

  if (groupId === 'G0') {
    const g0Routes = [
      // West terminal patrol
      [
        { row: 3, col: 5 },
        { row: 8, col: 5 },
        { row: 11, col: 9 },
        { row: 7, col: 12 },
      ],
      // Central terminal approach patrol
      [
        { row: 3, col: 18 },
        { row: 8, col: 18 },
        { row: 11, col: 15 },
        { row: 9, col: 21 },
      ],
      // East container yard approach patrol
      [
        { row: 3, col: 30 },
        { row: 7, col: 29 },
        { row: 11, col: 26 },
        { row: 8, col: 23 },
      ],
    ];
    const route = g0Routes[unitIndex % g0Routes.length];
    const last = route.at(-1);
    return {
      groupId,
      kind: 'northern_patrol',
      gateId: unitIndex % 3 === 0 ? 'west' : unitIndex % 3 === 1 ? 'center' : 'east',
      patrolRoute: route.map((c) => ({ ...c })),
      homeZone: { row: Math.floor(last.row / 6), col: Math.floor(last.col / 6) },
    };
  }

  if (groupId === 'G1') {
    const cargo =
      defCatalog.find((c) => c.id === contextCargoId) || defCatalog[0];
    const isHover = unitType === EnemyClass.HOVER;
    const useAlt = unitIndex % 2 === 1;
    const baseRoute = isHover
      ? cargo.waterSearchRoute
      : useAlt
      ? cargo.altSearchRoute
      : cargo.searchRoute;
    return {
      groupId,
      kind: 'alarm_search',
      gateId: isHover ? 'center' : useAlt ? gate.flankGateId : cargo.gateId,
      patrolRoute: baseRoute.map((c) => ({ ...c })),
      homeZone: { row: Math.floor(cargo.row / 6), col: Math.floor(cargo.col / 6) },
      alarmTarget: { row: cargo.row, col: cargo.col },
    };
  }

  if (groupId === 'G2') {
    const remaining = contractState.containers
      .filter((c) => c.status !== CARGO_STATUS.DELIVERED)
      .map((c) => defCatalog.find((def) => def.id === c.id))
      .filter(Boolean);
    const targetCargo = remaining[unitIndex % Math.max(1, remaining.length)] || defCatalog[1];
    const cp = targetCargo.checkpoints[unitIndex % targetCargo.checkpoints.length];
    const g = LAST_CARGO_GATES[targetCargo.gateId] || gate;
    return {
      groupId,
      kind: 'cargo_checkpoints',
      gateId: g.id,
      patrolRoute: [
        { ...g.entryTarget },
        { row: Math.min(10, Math.floor((g.entryTarget.row + cp.row) / 2)), col: cp.col },
        { row: cp.row, col: cp.col },
      ],
      homeZone: { ...cp.zone },
      checkpointCell: { row: cp.row, col: cp.col },
    };
  }

  if (groupId === 'G3') {
    // Overwatch areas near open return lanes (west, center-west, center-east, east)
    const overwatchLanes = [
      { gateId: 'west', route: [{ row: 4, col: 7 }, { row: 14, col: 8 }, { row: 25, col: 10 }], zone: { row: 4, col: 1 } },
      { gateId: 'center', route: [{ row: 4, col: 20 }, { row: 12, col: 17 }, { row: 24, col: 16 }], zone: { row: 4, col: 2 } },
      { gateId: 'center', route: [{ row: 4, col: 20 }, { row: 12, col: 23 }, { row: 25, col: 24 }], zone: { row: 4, col: 4 } },
      { gateId: 'east', route: [{ row: 4, col: 32 }, { row: 14, col: 32 }, { row: 25, col: 30 }], zone: { row: 4, col: 5 } },
    ];
    const lane = overwatchLanes[unitIndex % overwatchLanes.length];
    return {
      groupId,
      kind: 'return_overwatch',
      gateId: lane.gateId,
      patrolRoute: lane.route.map((c) => ({ ...c })),
      homeZone: { ...lane.zone },
    };
  }

  // G4: divides between northern pursuit route and a route toward delivery approaches
  // (leaving at least one drivable exit open)
  const cargo =
    defCatalog.find((c) => c.id === contextCargoId) || defCatalog[2];
  if (unitIndex < 2) {
    // Delivery approach intercept (takes one side approach, never sealing all exits)
    const interceptSide = cargo.gateId === 'west' ? 'west' : 'east';
    const route =
      interceptSide === 'west'
        ? [
            { row: 4, col: 7 },
            { row: 15, col: 7 },
            { row: 28, col: 11 },
            { row: 31, col: 15 },
          ]
        : [
            { row: 4, col: 32 },
            { row: 15, col: 32 },
            { row: 28, col: 28 },
            { row: 31, col: 24 },
          ];
    const last = route.at(-1);
    return {
      groupId,
      kind: 'delivery_intercept',
      gateId: interceptSide,
      patrolRoute: route,
      homeZone: { row: Math.floor(last.row / 6), col: Math.floor(last.col / 6) },
    };
  }

  // Northern pursuit route through the cargo court
  return {
    groupId,
    kind: 'northern_pursuit',
    gateId: cargo.gateId,
    patrolRoute: cargo.searchRoute.map((c) => ({ ...c })),
    homeZone: { row: Math.floor(cargo.row / 6), col: Math.floor(cargo.col / 6) },
  };
}

/** Creates a fresh per-attempt runtime state for a Contract operation. */
export function createContractState(contractDef = LAST_CARGO_CONTRACT, gridToWorld = null) {
  const halfArena = (GRID_SIZE * TILE_SIZE) / 2;
  const toWorld =
    gridToWorld ||
    ((row, col) => ({
      x: (col + 0.5) * TILE_SIZE - halfArena,
      z: (row + 0.5) * TILE_SIZE - halfArena,
    }));

  const containers = contractDef.containers.map((def) => {
    const pos = toWorld(def.row, def.col);
    return {
      id: def.id,
      slot: def.slot,
      code: def.code,
      name: def.name,
      shortName: def.shortName,
      row: def.row,
      col: def.col,
      x: pos.x,
      z: pos.z,
      gateId: def.gateId,
      accentHex: def.accentHex,
      status: CARGO_STATUS.AVAILABLE,
      progress: 0,
      fuseTimer: 0,
      fuseDuration: CONTRACT_TIMING.DETONATE_SEC,
      rewardPaid: false,
    };
  });

  const pad = contractDef.deliveryPad;
  const padMin = toWorld(pad.rowMin, pad.colMin);
  const padMax = toWorld(pad.rowMax, pad.colMax);

  const state = {
    contractId: contractDef.id,
    contractType: contractDef.contractType || CONTRACT_TYPES.CARGO_RECOVERY,
    name: contractDef.name,
    code: contractDef.code,
    objectiveCatalog: contractDef.containers,
    groupsCatalog: contractDef.groups || LAST_CARGO_GROUPS,
    containers,
    carriedCargoId: null,
    activeLoadingCargoId: null,
    deliveredCount: 0,
    distinctLoadedIds: [],
    firstDeliveryTriggered: false,
    deliveryPad: {
      ...pad,
      minRow: pad.rowMin,
      maxRow: pad.rowMax,
      minCol: pad.colMin,
      maxCol: pad.colMax,
      minX: Math.min(padMin.x, padMax.x) - 1.0,
      maxX: Math.max(padMin.x, padMax.x) + 1.0,
      minZ: Math.min(padMin.z, padMax.z) - 1.0,
      maxZ: Math.max(padMin.z, padMax.z) + 1.0,
      centerX: (padMin.x + padMax.x) * 0.5,
      centerZ: (padMin.z + padMax.z) * 0.5,
    },
    extraction: {
      available: false,
      active: false,
      progress: 0,
      duration: CONTRACT_TIMING.EXTRACT_SEC,
      completed: false,
    },
    scheduler: {
      triggeredGroups: [],
      queue: [],
      postDeliveryPauseTimer: 0,
      totalBudget: 24,
      totalSpawned: 0,
      waitingAtCap: false,
    },
  };

  // Queue G0 immediately at contract start
  triggerContractGroup(state, 'G0', null);
  return state;
}

/** Queues a group (G0..G4) at most once in trigger order. */
export function triggerContractGroup(contractState, groupId, contextCargoId = null) {
  const sched = contractState?.scheduler;
  const groupsCatalog = contractState?.groupsCatalog || LAST_CARGO_GROUPS;
  const groupDef = groupsCatalog[groupId];
  if (!sched || !groupDef) return false;
  if (sched.triggeredGroups.includes(groupId)) return false;

  sched.triggeredGroups.push(groupId);
  const gates = chooseGroupGates(contractState, groupId, contextCargoId);
  const packets = groupDef.packets
    ? groupDef.packets.map((p) => [...p])
    : chunkPackets(groupDef.roster, CONTRACT_TIMING.MAX_PACKET_SIZE);

  const isG0 = groupId === 'G0';
  sched.queue.push({
    id: groupId,
    label: groupDef.label,
    assignment: groupDef.assignment,
    contextCargoId,
    primaryGateId: gates.primaryGateId,
    secondaryGateId: gates.secondaryGateId,
    // G0 enters at contract start without a 6-second pre-warning; G1..G4 warn 6s before entry
    warningTimer: isG0 ? 0 : CONTRACT_TIMING.GATE_WARNING_SEC,
    warned: isG0,
    packets,
    packetCursor: 0,
    unitCursorInPacket: 0,
    unitSpawnIndex: 0,
    packetCooldown: 0,
    completed: false,
  });
  return true;
}

/** Checks whether world coordinates (x, z) are inside the Southern Delivery Pad. */
export function isOnDeliveryPad(contractState, x, z) {
  const pad = contractState?.deliveryPad;
  if (!pad) return false;
  return x >= pad.minX && x <= pad.maxX && z >= pad.minZ && z <= pad.maxZ;
}

/** Returns the available/loading container or relay within 1.5 cells of (x, z), or null. */
export function findNearbyAvailableCargo(contractState, x, z, tileSize = 2.0) {
  if (!contractState || contractState.carriedCargoId) return null;
  if (
    contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL &&
    contractState.containers.some((c) => c.status === CARGO_STATUS.ARMED)
  ) {
    return null;
  }
  const maxDist = CONTRACT_TIMING.LOAD_RANGE_CELLS * tileSize;
  let best = null;
  let bestDist = Infinity;
  for (const c of contractState.containers) {
    if (c.status !== CARGO_STATUS.AVAILABLE && c.status !== CARGO_STATUS.LOADING) continue;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d <= maxDist && d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** Explicitly starts loading a nearby available container or arming a relay charge (key E or button). */
export function startCargoLoading(contractState, x, z, isMoving = false, tileSize = 2.0) {
  const isSabotage = contractState?.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
  if (!contractState || contractState.carriedCargoId || isMoving) {
    return {
      started: false,
      reason: isSabotage
        ? 'Stop within 1.5 cells of a relay to plant demolition charge'
        : 'Cannot load while moving or carrying cargo',
    };
  }
  if (isSabotage && contractState.containers.some((c) => c.status === CARGO_STATUS.ARMED)) {
    return { started: false, reason: 'Clear the blast radius — active demolition charge ticking!' };
  }
  const cargo = findNearbyAvailableCargo(contractState, x, z, tileSize);
  if (!cargo) {
    return {
      started: false,
      reason: isSabotage
        ? 'No relay node within 1.5 cells'
        : 'No available cargo within 1.5 cells',
    };
  }
  if (cargo.status === CARGO_STATUS.LOADING) {
    return { started: true, cargoId: cargo.id, alreadyLoading: true };
  }
  cargo.status = CARGO_STATUS.LOADING;
  cargo.progress = 0;
  contractState.activeLoadingCargoId = cargo.id;
  return { started: true, cargoId: cargo.id };
}

/** Explicitly starts the 3-second extraction countdown on the delivery pad. */
export function startContractExtraction(contractState, x, z) {
  if (!contractState) return { started: false, reason: 'No active contract' };
  const isSabotage = contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
  if (contractState.deliveredCount < CONTRACT_TIMING.REQUIRED_DELIVERIES) {
    return {
      started: false,
      reason: isSabotage
        ? 'Demolish at least 2 radar relays first'
        : 'Deliver at least 2 containers first',
    };
  }
  if (contractState.carriedCargoId) {
    return { started: false, reason: 'Finish unloading current cargo first' };
  }
  if (isSabotage && contractState.containers.some((c) => c.status === CARGO_STATUS.ARMED)) {
    return { started: false, reason: 'Wait for armed demolition charge to detonate first' };
  }
  if (!isOnDeliveryPad(contractState, x, z)) {
    return { started: false, reason: 'Must be on the Southern Extraction Pad' };
  }
  if (contractState.extraction.active) {
    return { started: true, alreadyActive: true };
  }
  contractState.extraction.active = true;
  contractState.extraction.progress = 0;
  return { started: true };
}

/**
 * Steps cargo loading / demolition charge arming, fuse countdowns, delivery pad unloading, and extraction timers.
 * Returns discrete events that occurred during this step.
 */
export function stepContractCargo(
  contractState,
  dt,
  { playerX, playerZ, isMoving, tileSize = 2.0 }
) {
  const events = {
    loadCancelled: null,
    loadedCargo: null,
    armedCargo: null,
    detonatedCargo: null,
    triggeredGroup: null,
    unloadStarted: null,
    unloadReset: null,
    deliveredCargo: null,
    extractCancelled: false,
    extracted: false,
  };
  if (!contractState || dt <= 0) return events;
  const isSabotage = contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
  const requiredHoldSec = isSabotage ? CONTRACT_TIMING.ARM_SEC : CONTRACT_TIMING.LOAD_SEC;

  // 1. Active loading / charge arming check
  if (contractState.activeLoadingCargoId) {
    const cargo = contractState.containers.find((c) => c.id === contractState.activeLoadingCargoId);
    const maxDist = CONTRACT_TIMING.LOAD_RANGE_CELLS * tileSize;
    const inRange = cargo && Math.hypot(playerX - cargo.x, playerZ - cargo.z) <= maxDist;
    if (!cargo || cargo.status !== CARGO_STATUS.LOADING || isMoving || !inRange) {
      if (cargo && cargo.status === CARGO_STATUS.LOADING) {
        cargo.status = CARGO_STATUS.AVAILABLE;
        cargo.progress = 0;
      }
      contractState.activeLoadingCargoId = null;
      events.loadCancelled = cargo?.id || null;
    } else {
      cargo.progress = Math.min(requiredHoldSec, cargo.progress + dt);
      if (cargo.progress >= requiredHoldSec) {
        cargo.progress = 0;
        contractState.activeLoadingCargoId = null;

        if (isSabotage) {
          cargo.status = CARGO_STATUS.ARMED;
          cargo.fuseTimer = CONTRACT_TIMING.DETONATE_SEC;
          cargo.fuseDuration = CONTRACT_TIMING.DETONATE_SEC;
          events.armedCargo = cargo;
        } else {
          cargo.status = CARGO_STATUS.CARRIED;
          contractState.carriedCargoId = cargo.id;
          events.loadedCargo = cargo;
        }

        if (!contractState.distinctLoadedIds.includes(cargo.id)) {
          contractState.distinctLoadedIds.push(cargo.id);
          const count = contractState.distinctLoadedIds.length;
          const groupId = count === 1 ? 'G1' : count === 2 ? 'G3' : count === 3 ? 'G4' : null;
          if (groupId && triggerContractGroup(contractState, groupId, cargo.id)) {
            events.triggeredGroup = groupId;
          }
        }
      }
    }
  }

  // 1b. Sabotage armed fuse countdown -> detonation
  if (isSabotage) {
    for (const c of contractState.containers) {
      if (c.status !== CARGO_STATUS.ARMED || c.id === events.armedCargo?.id) continue;
      c.fuseTimer = Math.max(0, c.fuseTimer - dt);
      if (c.fuseTimer <= 0) {
        c.status = CARGO_STATUS.DELIVERED;
        c.fuseTimer = 0;
        contractState.deliveredCount = contractState.containers.filter(
          (item) => item.status === CARGO_STATUS.DELIVERED
        ).length;
        contractState.extraction.available =
          contractState.deliveredCount >= CONTRACT_TIMING.REQUIRED_DELIVERIES;
        contractState.scheduler.postDeliveryPauseTimer =
          CONTRACT_TIMING.POST_DELIVERY_PAUSE_SEC;
        events.deliveredCargo = c;
        events.detonatedCargo = c;

        if (contractState.deliveredCount === 1 && !contractState.firstDeliveryTriggered) {
          contractState.firstDeliveryTriggered = true;
          if (triggerContractGroup(contractState, 'G2', c.id)) {
            events.triggeredGroup = 'G2';
          }
        }
      }
    }
  }

  // 2. Carried / Unloading on Southern Delivery Pad
  const onPad = isOnDeliveryPad(contractState, playerX, playerZ);
  if (contractState.carriedCargoId) {
    const carried = contractState.containers.find((c) => c.id === contractState.carriedCargoId);
    if (carried) {
      if (onPad) {
        if (carried.status === CARGO_STATUS.CARRIED) {
          carried.status = CARGO_STATUS.UNLOADING;
          carried.progress = 0;
          events.unloadStarted = carried;
        }
        // Movement pauses unloading; stationary advances it
        if (!isMoving) {
          carried.progress = Math.min(CONTRACT_TIMING.UNLOAD_SEC, carried.progress + dt);
          if (carried.progress >= CONTRACT_TIMING.UNLOAD_SEC) {
            carried.status = CARGO_STATUS.DELIVERED;
            carried.progress = 0;
            contractState.carriedCargoId = null;
            contractState.deliveredCount = contractState.containers.filter(
              (c) => c.status === CARGO_STATUS.DELIVERED
            ).length;
            contractState.extraction.available =
              contractState.deliveredCount >= CONTRACT_TIMING.REQUIRED_DELIVERIES;
            contractState.scheduler.postDeliveryPauseTimer =
              CONTRACT_TIMING.POST_DELIVERY_PAUSE_SEC;
            events.deliveredCargo = carried;

            if (contractState.deliveredCount === 1 && !contractState.firstDeliveryTriggered) {
              contractState.firstDeliveryTriggered = true;
              if (triggerContractGroup(contractState, 'G2', carried.id)) {
                events.triggeredGroup = 'G2';
              }
            }
          }
        }
      } else if (carried.status === CARGO_STATUS.UNLOADING) {
        // Leaving the pad resets current unload progress
        carried.status = CARGO_STATUS.CARRIED;
        carried.progress = 0;
        events.unloadReset = carried;
      }
    }
  }

  // 3. Explicit extraction countdown on the pad
  if (contractState.extraction.active) {
    if (!onPad || contractState.carriedCargoId) {
      contractState.extraction.active = false;
      contractState.extraction.progress = 0;
      events.extractCancelled = true;
    } else {
      contractState.extraction.progress = Math.min(
        CONTRACT_TIMING.EXTRACT_SEC,
        contractState.extraction.progress + dt
      );
      if (contractState.extraction.progress >= CONTRACT_TIMING.EXTRACT_SEC) {
        contractState.extraction.active = false;
        contractState.extraction.completed = true;
        events.extracted = true;
      }
    }
  }

  return events;
}

/**
 * Steps the finite 24-enemy encounter scheduler.
 * - Pauses new entry admissions for 8s after a cargo delivery.
 * - Shows gate warning 6s before a group's first attempted entry.
 * - Processes groups in trigger order, admitting at most 2 units per packet (except G0's 3-unit packets)
 *   with at least 4s between packets.
 * - Never exceeds the 6-live-enemy cap or the 24-unit total budget.
 */
export function stepContractScheduler(
  contractState,
  dt,
  liveEnemyCount,
  trySpawnUnit,
  onGateWarning = null
) {
  const sched = contractState?.scheduler;
  if (!sched || dt <= 0) return;

  if (sched.postDeliveryPauseTimer > 0) {
    sched.postDeliveryPauseTimer = Math.max(0, sched.postDeliveryPauseTimer - dt);
  }

  // Advance warning timers on queued groups; pause clock if postDeliveryPauseTimer > 0?
  // Note: "After a cargo delivery, pause new entry admissions for 8 seconds. Existing enemies continue
  // to fight; this is not an invulnerability period. The warning and packet clocks pause with the simulation and Hangar."
  for (const group of sched.queue) {
    if (group.completed) continue;
    if (group.packetCooldown > 0) {
      group.packetCooldown = Math.max(0, group.packetCooldown - dt);
    }
    // Wait until postDeliveryPauseTimer allows the 6-second warning window before entry
    if (sched.postDeliveryPauseTimer > group.warningTimer && !group.warned) {
      continue;
    }
    if (!group.warned) {
      group.warned = true;
      if (typeof onGateWarning === 'function') {
        onGateWarning(group);
      }
    }
    if (group.warningTimer > 0) {
      group.warningTimer = Math.max(0, group.warningTimer - dt);
    }
  }

  const head = sched.queue.find((g) => !g.completed);
  if (!head) {
    sched.waitingAtCap = false;
    return;
  }

  if (head.warningTimer > 0 || sched.postDeliveryPauseTimer > 0) {
    sched.waitingAtCap = false;
    return;
  }

  if (liveEnemyCount >= CONTRACT_TIMING.MAX_LIVE_ENEMIES) {
    sched.waitingAtCap = true;
    return;
  }
  sched.waitingAtCap = false;

  if (head.packetCooldown > 0) return;

  const packet = head.packets[head.packetCursor];
  if (!packet) {
    head.completed = true;
    return;
  }

  // Attempt to admit remaining units in the current packet up to live cap
  while (
    head.unitCursorInPacket < packet.length &&
    liveEnemyCount < CONTRACT_TIMING.MAX_LIVE_ENEMIES &&
    sched.totalSpawned < sched.totalBudget
  ) {
    const unitType = packet[head.unitCursorInPacket];
    const assignment = buildContractUnitAssignment(
      contractState,
      head,
      unitType,
      head.unitSpawnIndex
    );
    const spawned = trySpawnUnit(unitType, assignment, head);
    if (!spawned) {
      // Gate temporarily blocked: retain queue position and retry shortly
      head.packetCooldown = 0.6;
      return;
    }
    head.unitCursorInPacket++;
    head.unitSpawnIndex++;
    sched.totalSpawned++;
    liveEnemyCount++;
  }

  if (head.unitCursorInPacket >= packet.length) {
    head.packetCursor++;
    head.unitCursorInPacket = 0;
    if (head.packetCursor >= head.packets.length) {
      head.completed = true;
      const nextGroup = sched.queue.find((g) => !g.completed);
      if (nextGroup) {
        nextGroup.packetCooldown = Math.max(
          nextGroup.packetCooldown,
          CONTRACT_TIMING.PACKET_INTERVAL_SEC
        );
      }
    } else {
      head.packetCooldown = CONTRACT_TIMING.PACKET_INTERVAL_SEC;
    }
  }
}

/**
 * Atomically and idempotently commits the 1500-credit payout for a delivered container
 * in the current mission attempt (`missionRun`).
 */
export function commitContractCargoDelivery(playerSave, missionRun, cargoId) {
  if (!playerSave || !missionRun || !cargoId) {
    return { paid: false, amount: 0, totalCargoCredits: 0 };
  }
  missionRun.deliveredCargoFlags ||= {};
  missionRun.contractCargoCredits ||= 0;

  if (missionRun.deliveredCargoFlags[cargoId]) {
    return {
      paid: false,
      amount: 0,
      totalCargoCredits: missionRun.contractCargoCredits,
    };
  }

  const amount = CONTRACT_PAYOUTS.PER_CARGO;
  missionRun.deliveredCargoFlags[cargoId] = true;
  missionRun.contractCargoCredits += amount;
  playerSave.credits = (playerSave.credits || 0) + amount;

  return {
    paid: true,
    amount,
    totalCargoCredits: missionRun.contractCargoCredits,
  };
}

/**
 * Atomically and idempotently settles a contract attempt at extraction or defeat/abort.
 * - Already delivered container credits were secured at delivery time and are NOT paid a second time.
 * - Successful extraction with >=2 delivered pays +3000 completion credits.
 * - Successful extraction with all 3 delivered pays +2500 additional bonus credits.
 * - Defeat or abort preserves already delivered cargo payments and kill credits, but pays 0 completion/bonus.
 */
export function settleContractMission({
  playerSave,
  missionRun,
  outcome = 'victory',
}) {
  if (!playerSave || !missionRun) {
    return {
      isContract: true,
      outcome,
      deliveredCount: 0,
      cargoCreditsSecured: 0,
      extractionBonus: 0,
      thirdCargoBonus: 0,
      creditsGained: 0,
      totalObjectiveCredits: 0,
      autoCollectedCount: 0,
      lostCount: 0,
    };
  }

  const deliveredIds = Object.keys(missionRun.deliveredCargoFlags || {});
  const deliveredCount = deliveredIds.length;
  const cargoCreditsSecured =
    missionRun.contractCargoCredits ?? deliveredCount * CONTRACT_PAYOUTS.PER_CARGO;

  if (missionRun.rewardsCommitted) {
    return (
      missionRun.lastSettlement || {
        isContract: true,
        outcome: missionRun.status || outcome,
        deliveredCount,
        cargoCreditsSecured,
        extractionBonus: missionRun.extractionBonusPaid || 0,
        thirdCargoBonus: missionRun.thirdCargoBonusPaid || 0,
        creditsGained:
          cargoCreditsSecured +
          (missionRun.extractionBonusPaid || 0) +
          (missionRun.thirdCargoBonusPaid || 0),
        totalObjectiveCredits:
          cargoCreditsSecured +
          (missionRun.extractionBonusPaid || 0) +
          (missionRun.thirdCargoBonusPaid || 0),
        autoCollectedCount: 0,
        lostCount: Math.max(0, 3 - deliveredCount),
      }
    );
  }

  const isSuccess =
    outcome === 'victory' && deliveredCount >= CONTRACT_TIMING.REQUIRED_DELIVERIES;
  const extractionBonus = isSuccess ? CONTRACT_PAYOUTS.EXTRACTION_BASE : 0;
  const thirdCargoBonus =
    isSuccess && deliveredCount >= 3 ? CONTRACT_PAYOUTS.THIRD_CARGO_BONUS : 0;
  const settlementAddition = extractionBonus + thirdCargoBonus;

  playerSave.credits = (playerSave.credits || 0) + settlementAddition;
  missionRun.status = outcome;
  missionRun.rewardsCommitted = true;
  missionRun.extractionBonusPaid = extractionBonus;
  missionRun.thirdCargoBonusPaid = thirdCargoBonus;

  const totalObjectiveCredits = cargoCreditsSecured + settlementAddition;
  const summary = {
    isContract: true,
    outcome,
    deliveredCount,
    cargoCreditsSecured,
    extractionBonus,
    thirdCargoBonus,
    // Total objective credits earned across this contract attempt (deliveries + extraction)
    creditsGained: totalObjectiveCredits,
    settlementAddition,
    totalObjectiveCredits,
    autoCollectedCount: 0,
    lostCount: Math.max(0, 3 - deliveredCount),
  };
  missionRun.lastSettlement = summary;
  return summary;
}

/** Builds a serializable HUD snapshot of the active contract state. */
export function buildContractHudSnapshot(contractState, playerX, playerZ, tileSize = 2.0) {
  if (!contractState) return null;
  const onPad = isOnDeliveryPad(contractState, playerX, playerZ);
  const nearbyCargo = findNearbyAvailableCargo(contractState, playerX, playerZ, tileSize);
  const carriedCargo = contractState.carriedCargoId
    ? contractState.containers.find((c) => c.id === contractState.carriedCargoId)
    : null;
  const loadingCargo = contractState.activeLoadingCargoId
    ? contractState.containers.find((c) => c.id === contractState.activeLoadingCargoId)
    : null;

  const activeHead = contractState.scheduler.queue.find((g) => !g.completed) || null;
  let gateWarning = null;
  if (activeHead) {
    const primaryGate = LAST_CARGO_GATES[activeHead.primaryGateId] || LAST_CARGO_GATES.center;
    const secondaryGate = LAST_CARGO_GATES[activeHead.secondaryGateId] || null;
    const remainingUnits = activeHead.packets
      .slice(activeHead.packetCursor)
      .reduce(
        (sum, pkt, idx) =>
          sum + (idx === 0 ? pkt.length - activeHead.unitCursorInPacket : pkt.length),
        0
      );
    gateWarning = {
      groupId: activeHead.id,
      label: activeHead.label,
      gateLabel: primaryGate.shortLabel,
      primaryGate: primaryGate.shortLabel,
      secondaryGate:
        secondaryGate && secondaryGate.id !== primaryGate.id ? secondaryGate.shortLabel : null,
      gateTimer: activeHead.warningTimer,
      warningSec: Math.ceil(activeHead.warningTimer),
      isWarning: activeHead.warningTimer > 0,
      waitingAtCap: Boolean(contractState.scheduler.waitingAtCap),
      postDeliveryPauseSec: Math.ceil(contractState.scheduler.postDeliveryPauseTimer),
      remainingUnits,
      remainingPackets: activeHead.packets.length - activeHead.packetCursor,
      previewUnits: activeHead.packets[activeHead.packetCursor] || [],
      nextPacket: activeHead.packets[activeHead.packetCursor] || [],
    };
  }

  const isSabotage = contractState.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
  const holdDuration = isSabotage ? CONTRACT_TIMING.ARM_SEC : CONTRACT_TIMING.LOAD_SEC;
  const armedCargo = isSabotage
    ? contractState.containers.find((c) => c.status === CARGO_STATUS.ARMED) || null
    : null;

  return {
    contractId: contractState.contractId,
    contractType: contractState.contractType || CONTRACT_TYPES.CARGO_RECOVERY,
    isSabotage,
    name: contractState.name,
    code: contractState.code,
    deliveredCount: contractState.deliveredCount,
    minRequiredDeliveries: CONTRACT_TIMING.REQUIRED_DELIVERIES,
    requiredDeliveries: CONTRACT_TIMING.REQUIRED_DELIVERIES,
    carriedCargoId: contractState.carriedCargoId,
    onDeliveryPad: onPad,
    canLoadCargo: Boolean(nearbyCargo && !contractState.carriedCargoId && !armedCargo),
    nearbyCargo: nearbyCargo
      ? {
          id: nearbyCargo.id,
          slot: nearbyCargo.slot,
          code: nearbyCargo.code,
          shortName: nearbyCargo.shortName,
          status: nearbyCargo.status,
          progress: nearbyCargo.progress,
          duration: holdDuration,
        }
      : null,
    loadingCargo: loadingCargo
      ? {
          id: loadingCargo.id,
          slot: loadingCargo.slot,
          code: loadingCargo.code,
          shortName: loadingCargo.shortName,
          progress: loadingCargo.progress,
          duration: holdDuration,
        }
      : null,
    armedCargo: armedCargo
      ? {
          id: armedCargo.id,
          slot: armedCargo.slot,
          code: armedCargo.code,
          shortName: armedCargo.shortName,
          fuseTimer: armedCargo.fuseTimer,
          fuseDuration: armedCargo.fuseDuration || CONTRACT_TIMING.DETONATE_SEC,
          x: armedCargo.x,
          z: armedCargo.z,
          inBlastZone:
            Math.hypot(playerX - armedCargo.x, playerZ - armedCargo.z) <=
            CONTRACT_TIMING.BLAST_RADIUS_CELLS * tileSize,
        }
      : null,
    carriedCargo: carriedCargo
      ? {
          id: carriedCargo.id,
          slot: carriedCargo.slot,
          code: carriedCargo.code,
          shortName: carriedCargo.shortName,
          status: carriedCargo.status,
          progress: carriedCargo.progress,
          duration: CONTRACT_TIMING.UNLOAD_SEC,
          unloadProgress: carriedCargo.progress,
          unloadDuration: CONTRACT_TIMING.UNLOAD_SEC,
        }
      : null,
    canExtract:
      onPad &&
      !contractState.carriedCargoId &&
      !armedCargo &&
      contractState.deliveredCount >= CONTRACT_TIMING.REQUIRED_DELIVERIES,
    extraction: { ...contractState.extraction },
    deliveryPad: { ...contractState.deliveryPad },
    containers: contractState.containers.map((c) => ({
      id: c.id,
      slot: c.slot,
      code: c.code,
      name: c.name,
      shortName: c.shortName,
      row: c.row,
      col: c.col,
      x: c.x,
      z: c.z,
      accentHex: c.accentHex,
      status: c.status,
      progress: c.progress,
      fuseTimer: c.fuseTimer || 0,
      fuseDuration: c.fuseDuration || CONTRACT_TIMING.DETONATE_SEC,
      rewardPaid: c.rewardPaid,
    })),
    gateWarning,
    totalSpawned: contractState.scheduler.totalSpawned,
    totalBudget: contractState.scheduler.totalBudget,
  };
}
