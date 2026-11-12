/** Charges required to stop one hostile projectile; zero means it cannot be stopped. */
export function apsInterceptCost(threat) {
  if (threat.fromPlayer || threat.isFlame || threat.weaponId === 'FLAMETHROWER' || threat.weaponId === 'TITAN_RAIL') return 0;
  if (threat.isMissile || threat.weaponId === 'HYDRA_MLRS') return 1;
  if (['CANNON_Mk4', 'CANNON_Mk5', 'HOWITZER', 'BOSS_DUAL', 'INFERNO_THERMO'].includes(threat.weaponId)) return 2;
  if (['CANNON_Mk1', 'CANNON_Mk2', 'CANNON_Mk3', 'AUTOCANNON'].includes(threat.weaponId)) return 1;
  return threat.isHeavy ? 2 : 1;
}

/** Boss onboard APS intercepts incoming player ATGMs only (not cannon shells). */
export function bossApsCanIntercept(threat) {
  return Boolean(threat?.fromPlayer && threat?.isMissile);
}
