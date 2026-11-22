/**
 * Post-battle & career achievements evaluation, profile persistence helpers,
 * incoming challenge parsing, and social-media share payload builder.
 */

import { pageUrl } from '../app/routes.js';
import { N_, t } from '../i18n/index.js';

const DEFAULT_SHARE_ORIGIN = 'https://battletank.online';

const ACHIEVEMENT_DEFS = Object.freeze([
  {
    id: 'sector_cleared',
    title: N_('Sector Secured'),
    description: N_('Win a campaign or assault sector.'),
    icon: '🎖️',
    rarity: 'common',
    rewardCredits: 100,
    matches: (ctx) => ctx.isVictory && !ctx.isContract && !ctx.isSurvival,
  },
  {
    id: 'boss_slayer',
    title: N_('Boss Slayer'),
    description: N_('Destroy a Sector Boss.'),
    icon: '👑',
    rarity: 'epic',
    rewardCredits: 250,
    matches: (ctx) =>
      (ctx.isVictory && Boolean(ctx.currentSector?.rules?.spawnSectorBossOnClear)) ||
      ctx.survivalBosses >= 1,
  },
  {
    id: 'full_extraction',
    title: N_('Full Extraction'),
    description: N_('Extract 3/3 cargo in a Contract.'),
    icon: '📦',
    rarity: 'epic',
    rewardCredits: 250,
    matches: (ctx) => ctx.isVictory && ctx.isContract && ctx.deliveredCount >= 3,
  },
  {
    id: 'contract_extracted',
    title: N_('Contract Fulfilled'),
    description: N_('Extract from a Contract.'),
    icon: '💼',
    rarity: 'common',
    rewardCredits: 100,
    matches: (ctx) => ctx.isVictory && ctx.isContract && ctx.deliveredCount < 3,
  },
  {
    id: 'deadeye',
    title: N_('Deadeye'),
    description: N_('90%+ accuracy with 8+ hits.'),
    icon: '🔭',
    rarity: 'epic',
    rewardCredits: 250,
    matches: (ctx) => ctx.accuracy >= 90 && ctx.shotsHit >= 8,
  },
  {
    id: 'sharpshooter',
    title: N_('Sharpshooter'),
    description: N_('75%+ accuracy with 5+ hits.'),
    icon: '🎯',
    rarity: 'rare',
    rewardCredits: 150,
    matches: (ctx) =>
      ctx.accuracy >= 75 && ctx.shotsHit >= 5 && !(ctx.accuracy >= 90 && ctx.shotsHit >= 8),
  },
  {
    id: 'ace_commander',
    title: N_('Ace Commander'),
    description: N_('20+ kills in one battle.'),
    icon: '⚡',
    rarity: 'epic',
    rewardCredits: 250,
    matches: (ctx) => ctx.kills >= 20,
  },
  {
    id: 'tank_hunter',
    title: N_('Tank Hunter'),
    description: N_('8+ kills in one battle.'),
    icon: '🔥',
    rarity: 'common',
    rewardCredits: 100,
    matches: (ctx) => ctx.kills >= 8 && ctx.kills < 20,
  },
  {
    id: 'unscathed',
    title: N_('Unscathed'),
    description: N_('Win with 100% hull integrity.'),
    icon: '💎',
    rarity: 'epic',
    rewardCredits: 250,
    matches: (ctx) => ctx.isVictory && ctx.hpRatio >= 1,
  },
  {
    id: 'iron_survivor',
    title: N_('Iron Survivor'),
    description: N_('Win with 75%+ hull integrity.'),
    icon: '🛡️',
    rarity: 'rare',
    rewardCredits: 150,
    matches: (ctx) => ctx.isVictory && ctx.hpRatio >= 0.75 && ctx.hpRatio < 1,
  },
  {
    id: 'against_all_odds',
    title: N_('Against All Odds'),
    description: N_('Win with ≤25% hull integrity.'),
    icon: '🩹',
    rarity: 'rare',
    rewardCredits: 150,
    matches: (ctx) => ctx.isVictory && ctx.hpRatio > 0 && ctx.hpRatio <= 0.25,
  },
  {
    id: 'hq_guardian',
    title: N_('HQ Guardian'),
    description: N_('Win Defense with HQ intact.'),
    icon: '🏰',
    rarity: 'rare',
    rewardCredits: 150,
    matches: (ctx) => ctx.isVictory && Boolean(ctx.hud?.defeatOnBaseLoss) && Boolean(ctx.hud?.baseAlive),
  },
  {
    id: 'demolitionist',
    title: N_('Demolitionist'),
    description: N_('Smash 25+ battlefield blocks.'),
    icon: '💥',
    rarity: 'rare',
    rewardCredits: 150,
    matches: (ctx) => ctx.blocksDestroyed >= 25,
  },
  {
    id: 'scavenger',
    title: N_('Field Scavenger'),
    description: N_('Collect 3+ supply drops.'),
    icon: '🧰',
    rarity: 'common',
    rewardCredits: 100,
    matches: (ctx) => ctx.autoCollectedCount >= 3,
  },
  {
    id: 'wave_breaker',
    title: N_('Wave Breaker'),
    description: N_('Clear 5+ Survival waves.'),
    icon: '🌊',
    rarity: 'rare',
    rewardCredits: 150,
    matches: (ctx) => ctx.isSurvival && ctx.wavesCleared >= 5,
  },
  {
    id: 'record_breaker',
    title: N_('Record Breaker'),
    description: N_('New personal Survival record.'),
    icon: '⭐',
    rarity: 'epic',
    rewardCredits: 250,
    matches: (ctx) =>
      ctx.isSurvival &&
      Boolean(
        ctx.recordSummary?.isNewWaveRecord ||
          ctx.recordSummary?.isNewKillRecord ||
          ctx.recordSummary?.isNewTimeRecord
      ),
  },
  {
    id: 'veteran_gunner',
    title: N_('Veteran Gunner'),
    description: N_('50 career hostile kills.'),
    icon: '🪖',
    rarity: 'common',
    rewardCredits: 100,
    matches: (ctx) => ctx.careerKills >= 50,
  },
  {
    id: 'armored_legend',
    title: N_('Armored Legend'),
    description: N_('250 career hostile kills.'),
    icon: '🏆',
    rarity: 'rare',
    rewardCredits: 200,
    matches: (ctx) => ctx.careerKills >= 250,
  },
  {
    id: 'war_machine',
    title: N_('War Machine'),
    description: N_('1,000 career hostile kills.'),
    icon: '💀',
    rarity: 'epic',
    rewardCredits: 300,
    matches: (ctx) => ctx.careerKills >= 1000,
  },
  {
    id: 'tier5_engineer',
    title: N_('Tier V Engineer'),
    description: N_('All 5 systems at Tier V.'),
    icon: '⚙️',
    rarity: 'epic',
    rewardCredits: 300,
    matches: (ctx) =>
      ctx.upgrades.cannon >= 5 &&
      ctx.upgrades.chassis >= 5 &&
      ctx.upgrades.frame >= 5 &&
      ctx.upgrades.engine >= 5 &&
      ctx.upgrades.armor >= 5,
  },
  {
    id: 'campaign_conqueror',
    title: N_('Campaign Conqueror'),
    description: N_('Clear all Campaign sectors.'),
    icon: '🗺️',
    rarity: 'epic',
    rewardCredits: 300,
    matches: (ctx) =>
      ctx.totalCampaignMissions > 0 && ctx.completedCampaignCount >= ctx.totalCampaignMissions,
  },
]);

function buildEvalContext({
  hud,
  currentSector,
  accuracy,
  playerSave = null,
  upgrades = null,
  totalCampaignMissions = 38,
}) {
  const gameMode = hud?.gameMode || currentSector?.gameMode || 'extermination';
  const isVictory = hud?.status === 'VICTORY';
  const isContract = gameMode === 'contract';
  const isSurvival = gameMode === 'survival';
  const maxHp = Math.max(1, Number(hud?.playerMaxHp) || 1);
  const hp = Math.max(0, Number(hud?.playerHp) || 0);
  const sv = hud?.survival || {};
  const rec = sv.recordSummary || null;
  const s = hud?.lastSettlementSummary || {};
  const completedKeys = Object.keys(playerSave?.completedMissions || {}).filter((id) =>
    id.startsWith('mission_')
  );

  return {
    hud,
    currentSector,
    isVictory,
    isContract,
    isSurvival,
    accuracy: Number.isFinite(accuracy) ? accuracy : 0,
    shotsHit: Number(hud?.shotsHit) || 0,
    kills: Number(hud?.kills) || 0,
    blocksDestroyed: Number(hud?.blocksDestroyed) || 0,
    hpRatio: hp / maxHp,
    deliveredCount: Number(s.deliveredCount) || 0,
    autoCollectedCount: Number(s.autoCollectedCount) || 0,
    wavesCleared: Number(rec?.wavesCleared ?? sv.wavesCleared) || 0,
    survivalBosses: Number(rec?.bossesDefeated ?? sv.bossesDefeated) || 0,
    recordSummary: rec,
    careerKills: Number(playerSave?.stats?.totalKills) || 0,
    upgrades: upgrades || { cannon: 1, chassis: 1, frame: 1, engine: 1, armor: 1 },
    completedCampaignCount: completedKeys.length,
    totalCampaignMissions: Number(totalCampaignMissions) || 0,
  };
}

/** Increments persistent career statistics in playerSave after a battle. */
export function updateCareerStats(playerSave, { kills = 0, blocksDestroyed = 0, isVictory = false } = {}) {
  if (!playerSave || typeof playerSave !== 'object') return null;
  if (!playerSave.stats || typeof playerSave.stats !== 'object' || Array.isArray(playerSave.stats)) {
    playerSave.stats = {
      totalKills: 0,
      totalBattles: 0,
      totalVictories: 0,
      totalBlocksDestroyed: 0,
    };
  }
  playerSave.stats.totalKills = (Number(playerSave.stats.totalKills) || 0) + Math.max(0, Number(kills) || 0);
  playerSave.stats.totalBattles = (Number(playerSave.stats.totalBattles) || 0) + 1;
  if (isVictory) {
    playerSave.stats.totalVictories = (Number(playerSave.stats.totalVictories) || 0) + 1;
  }
  playerSave.stats.totalBlocksDestroyed =
    (Number(playerSave.stats.totalBlocksDestroyed) || 0) + Math.max(0, Number(blocksDestroyed) || 0);
  return playerSave.stats;
}

/** Evaluates which achievements were earned in the concluded battle. */
export function evaluateBattleAchievements({
  hud,
  currentSector,
  accuracy = 0,
  unlockedMap = {},
  playerSave = null,
  upgrades = null,
  totalCampaignMissions = 38,
}) {
  const ctx = buildEvalContext({
    hud,
    currentSector,
    accuracy,
    playerSave,
    upgrades,
    totalCampaignMissions,
  });
  const earned = [];
  const newlyUnlockedIds = [];
  let totalBonusCredits = 0;

  for (const def of ACHIEVEMENT_DEFS) {
    if (!def.matches(ctx)) continue;
    const isNew = !unlockedMap?.[def.id];
    if (isNew) {
      newlyUnlockedIds.push(def.id);
      totalBonusCredits += def.rewardCredits;
    }
    earned.push({
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      rarity: def.rarity,
      rewardCredits: def.rewardCredits,
      isNew,
    });
  }

  return { earned, newlyUnlockedIds, totalBonusCredits };
}

/** Records earned achievements into playerSave.achievements in-place. */
export function recordUnlockedAchievements(playerSave, earned = [], now = Date.now()) {
  if (!playerSave || typeof playerSave !== 'object') return {};
  if (!playerSave.achievements || typeof playerSave.achievements !== 'object' || Array.isArray(playerSave.achievements)) {
    playerSave.achievements = {};
  }
  for (const item of earned) {
    const prev = playerSave.achievements[item.id];
    if (prev && typeof prev === 'object') {
      prev.count = (Number(prev.count) || 1) + 1;
      prev.lastEarnedAt = now;
    } else {
      playerSave.achievements[item.id] = {
        unlockedAt: now,
        lastEarnedAt: now,
        count: 1,
      };
    }
  }
  return playerSave.achievements;
}

/** Returns the full achievement catalog merged with the player's unlock history. */
export function getAchievementsCatalog(unlockedMap = {}) {
  return ACHIEVEMENT_DEFS.map((def) => {
    const rec = unlockedMap?.[def.id];
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      rarity: def.rarity,
      rewardCredits: def.rewardCredits,
      unlocked: Boolean(rec),
      unlockedAt: rec?.unlockedAt || null,
      count: Number(rec?.count) || 0,
    };
  });
}

function normalizeShareOrigin(origin) {
  if (typeof origin === 'string' && /^https?:\/\//i.test(origin)) {
    return origin.replace(/\/+$/, '');
  }
  return DEFAULT_SHARE_ORIGIN;
}

const SHARE_XOR_KEY = [0x49, 0x56, 0x54, 0x32, 0x36, 0x4b, 0x71, 0x9b];

function fnv1a16(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0xffff;
}

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(bin)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(token) {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4);
  if (typeof atob === 'function') {
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/** Encodes a battle share object into a compact, tamper-checked opaque token. */
export function encodeShareToken(payload) {
  const json = JSON.stringify(payload);
  const raw = new TextEncoder().encode(json);
  const chk = fnv1a16(raw);
  const out = new Uint8Array(raw.length + 2);
  out[0] = (chk >>> 8) & 0xff;
  out[1] = chk & 0xff;
  for (let i = 0; i < raw.length; i++) {
    out[i + 2] = raw[i] ^ SHARE_XOR_KEY[i % SHARE_XOR_KEY.length];
  }
  return toBase64Url(out);
}

/** Decodes and verifies an opaque share token; returns null if invalid or tampered. */
export function decodeShareToken(token) {
  if (!token || typeof token !== 'string' || token.length < 4) return null;
  try {
    const bytes = fromBase64Url(token);
    if (bytes.length < 3) return null;
    const expectedChk = ((bytes[0] << 8) | bytes[1]) >>> 0;
    const raw = new Uint8Array(bytes.length - 2);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = bytes[i + 2] ^ SHARE_XOR_KEY[i % SHARE_XOR_KEY.length];
    }
    if (fnv1a16(raw) !== expectedChk) return null;
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Builds a shareable URL and social media post text for the battle result. */
export function buildBattleSharePayload({
  hud,
  currentSector,
  accuracy = 0,
  earnedAchievements = [],
  origin = '',
}) {
  const baseOrigin = normalizeShareOrigin(origin);
  const gameMode = hud?.gameMode || currentSector?.gameMode || 'extermination';
  const isVictory = hud?.status === 'VICTORY';
  const isContract = gameMode === 'contract';
  const isSurvival = gameMode === 'survival';
  const sectorName = t(currentSector?.name || 'Sector');
  const missionId = currentSector?.mapId || '';
  const kills = Number(hud?.kills) || 0;
  const acc = Math.max(0, Math.min(100, Math.round(Number(accuracy) || 0)));

  const achIds = earnedAchievements.map((a) => a.id).filter(Boolean).slice(0, 6);

  let path = pageUrl('campaign', {
    c: encodeShareToken({
      m: 'c',
      id: missionId || 'mission_01',
      r: isVictory ? 1 : 0,
      k: kills,
      a: acc,
      ach: achIds,
    }),
  });

  let headline = isVictory
    ? t('VICTORY in {sector}', { sector: sectorName })
    : t('BATTLE REPORT in {sector}', { sector: sectorName });
  if (isSurvival) {
    const sv = hud?.survival || {};
    const rec = sv.recordSummary || {};
    const waveReached = rec.waveReached ?? sv.wave ?? 1;
    const wavesCleared = rec.wavesCleared ?? sv.wavesCleared ?? 0;
    path = pageUrl('survival', {
      c: encodeShareToken({
        m: 's',
        w: waveReached,
        k: kills,
        ach: achIds,
      }),
    });
    headline = t('SURVIVAL RUN in {sector}: Wave {wave} ({cleared} cleared)', { sector: sectorName, wave: waveReached, cleared: wavesCleared });
  } else if (isContract) {
    const delivered = hud?.lastSettlementSummary?.deliveredCount ?? 0;
    path = pageUrl('contracts', {
      c: encodeShareToken({
        m: 'k',
        id: missionId || 'contract-last-cargo',
        r: isVictory ? 1 : 0,
        g: delivered,
        k: kills,
        ach: achIds,
      }),
    });
    headline = isVictory
      ? t('CONTRACT EXTRACTED — {sector} ({delivered}/3 cargo)', { sector: sectorName, delivered })
      : t('CONTRACT REPORT — {sector} ({delivered}/3 cargo)', { sector: sectorName, delivered });
  }

  const url = new URL(path, `${baseOrigin}/`).href;
  const medalNames = earnedAchievements.slice(0, 3).map((a) => t(a.title));
  const medalPart = medalNames.length > 0 ? ` | ${t('Medals: {list}', { list: medalNames.join(', ') })}` : '';
  const statsPart = isSurvival
    ? t('{kills} hostiles destroyed', { kills })
    : t('{kills} hostiles destroyed | {acc}% accuracy', { kills, acc });
  const title = `BATTLE TANK — ${headline}`;
  const text = `${headline}! ${statsPart}${medalPart} — ${t('Play BATTLE TANK:')}`;

  return {
    url,
    title,
    text,
    fullText: `${text} ${url}`,
  };
}

/** Builds direct social-network share intent URLs for a battle share payload. */
export function buildSocialShareLinks(payload) {
  const url = encodeURIComponent(payload?.url || DEFAULT_SHARE_ORIGIN);
  const text = encodeURIComponent(payload?.text || t('Play BATTLE TANK!'));
  const title = encodeURIComponent(payload?.title || `BATTLE TANK — ${t('Battle Report')}`);
  return {
    telegramUrl: `https://t.me/share/url?url=${url}&text=${text}`,
    xUrl: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
    redditUrl: `https://www.reddit.com/submit?url=${url}&title=${title}`,
  };
}

/** Parses incoming share query parameters to display an async challenge banner. */
export function parseBattleShareChallenge(searchString = '', pageHint = '') {
  if (!searchString) return null;
  const params = new URLSearchParams(searchString.startsWith('?') ? searchString : `?${searchString}`);
  const token = params.get('c');
  const data = token ? decodeShareToken(token) : null;
  if (!data) return null;

  const killsNum = Number(data.k);
  const accNum = Number(data.a);
  const waveNum = Number(data.w);
  const cargoNum = Number(data.g);
  const achIds = Array.isArray(data.ach) ? data.ach : [];
  const achievements = achIds
    .map((id) => ACHIEVEMENT_DEFS.find((d) => d.id === id))
    .filter(Boolean)
    .map((d) => ({
      id: d.id,
      title: d.title,
      description: d.description,
      icon: d.icon,
      rarity: d.rarity,
    }));

  if (data.m === 's' || pageHint === 'survival') {
    const parts = [];
    const metrics = [];
    if (Number.isFinite(waveNum) && waveNum > 0) {
      parts.push(`Wave ${waveNum}`);
      metrics.push({ label: 'WAVE REACHED', value: `WAVE ${waveNum}`, tone: 'amber' });
    }
    if (Number.isFinite(killsNum) && killsNum >= 0) {
      parts.push(`${killsNum} kills`);
      metrics.push({ label: 'HOSTILES DESTROYED', value: String(killsNum), tone: 'emerald' });
    }
    if (parts.length === 0) return null;
    return {
      mode: 'survival',
      missionId: 'paris_last_stand',
      title: 'SURVIVAL CHALLENGE',
      subtitle: 'PARIS: LAST STAND // DEFEND THE ELYSEE PALACE',
      statsText: parts.join(' · '),
      metrics,
      achievements,
      ctaLabel: 'ACCEPT CHALLENGE',
    };
  }

  if (data.m === 'k' || pageHint === 'contracts') {
    const parts = [];
    const metrics = [
      { label: 'OUTCOME', value: data.r ? 'EXTRACTED' : 'FAILED', tone: data.r ? 'emerald' : 'red' },
    ];
    parts.push(data.r ? 'Extracted' : 'Failed run');
    if (Number.isFinite(cargoNum) && cargoNum >= 0) {
      parts.push(`${cargoNum}/3 cargo`);
      metrics.push({ label: 'CARGO', value: `${cargoNum} / 3`, tone: 'sky' });
    }
    if (Number.isFinite(killsNum) && killsNum >= 0) {
      parts.push(`${killsNum} kills`);
      metrics.push({ label: 'HOSTILES', value: String(killsNum), tone: 'amber' });
    }
    return {
      mode: 'contract',
      missionId: data.id || 'contract-last-cargo',
      title: 'CONTRACT CHALLENGE',
      subtitle: (data.id || 'TACTICAL CONTRACT').replace(/^contract-/, '').replace(/-/g, ' ').toUpperCase(),
      statsText: parts.join(' · '),
      metrics,
      achievements,
      ctaLabel: 'ACCEPT CHALLENGE',
    };
  }

  const parts = [];
  const metrics = [
    { label: 'OUTCOME', value: data.r ? 'VICTORY' : 'DEFEAT', tone: data.r ? 'emerald' : 'red' },
  ];
  parts.push(data.r ? 'Victory' : 'Battle report');
  if (Number.isFinite(killsNum) && killsNum >= 0) {
    parts.push(`${killsNum} kills`);
    metrics.push({ label: 'HOSTILES', value: String(killsNum), tone: 'amber' });
  }
  if (Number.isFinite(accNum) && accNum >= 0) {
    parts.push(`${accNum}% accuracy`);
    metrics.push({ label: 'ACCURACY', value: `${accNum}%`, tone: 'sky' });
  }
  return {
    mode: 'campaign',
    missionId: data.id || 'mission_01',
    title: 'CAMPAIGN CHALLENGE',
    subtitle: (data.id || 'mission_01').replace(/_/g, ' ').toUpperCase(),
    statsText: parts.join(' · '),
    metrics,
    achievements,
    ctaLabel: 'ACCEPT CHALLENGE',
  };
}
