/**
 * Generates a 1200x630 PNG battle report card on an offscreen HTML5 Canvas
 * for downloading or sharing via Web Share API.
 */

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function generateBattleShareCardBlob({
  hud,
  currentSector,
  accuracy = 0,
  earnedAchievements = [],
}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const isVictory = hud?.status === 'VICTORY';
  const gameMode = hud?.gameMode || currentSector?.gameMode || 'extermination';
  const isSurvival = gameMode === 'survival';
  const isContract = gameMode === 'contract';
  const sectorName = (currentSector?.name || 'Sector').toUpperCase();
  const accent = isVictory ? '#10B981' : isSurvival ? '#F59E0B' : '#EF4444';

  // Background
  ctx.fillStyle = '#070B12';
  ctx.fillRect(0, 0, 1200, 630);

  // Subtle tactical grid
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 1200; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 630);
    ctx.stroke();
  }
  for (let y = 0; y <= 630; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1200, y);
    ctx.stroke();
  }

  // Outer frame
  drawRoundedRect(ctx, 28, 28, 1144, 574, 14);
  ctx.fillStyle = 'rgba(11, 15, 23, 0.94)';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Header kicker & outcome pill
  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('BATTLE TANK // TACTICAL SORTIE REPORT', 64, 78);

  const badgeText = isVictory
    ? isContract
      ? 'CONTRACT EXTRACTED'
      : 'VICTORY'
    : isSurvival
    ? 'SURVIVAL RUN'
    : 'DEFEAT';
  ctx.font = 'bold 18px monospace';
  const badgeW = ctx.measureText(badgeText).width + 36;
  drawRoundedRect(ctx, 1136 - badgeW, 50, badgeW, 38, 8);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.fillStyle = '#070B12';
  ctx.fillText(badgeText, 1136 - badgeW + 18, 75);

  // Sector title
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText(sectorName, 64, 140, 1070);

  // Key stats row
  const kills = Number(hud?.kills) || 0;
  const acc = Math.max(0, Math.min(100, Math.round(Number(accuracy) || 0)));
  const blocks = Number(hud?.blocksDestroyed) || 0;
  const s = hud?.lastSettlementSummary || {};
  const sv = hud?.survival || {};
  const rec = sv.recordSummary || {};

  const stats = isSurvival
    ? [
        { label: 'WAVE REACHED', value: `WAVE ${rec.waveReached ?? sv.wave ?? 1}`, color: '#FBBF24' },
        { label: 'HOSTILES DESTROYED', value: `${kills}`, color: '#34D399' },
        { label: 'BOSSES DEFEATED', value: `${rec.bossesDefeated ?? sv.bossesDefeated ?? 0}`, color: '#F87171' },
        { label: 'BLOCKS SMASHED', value: `${blocks}`, color: '#38BDF8' },
      ]
    : isContract
    ? [
        { label: 'CARGO DELIVERED', value: `${s.deliveredCount ?? 0} / 3`, color: '#38BDF8' },
        { label: 'HOSTILES DESTROYED', value: `${kills}`, color: '#34D399' },
        { label: 'ACCURACY', value: `${acc}%`, color: '#FBBF24' },
        { label: 'CREDITS EARNED', value: `+$${s.totalObjectiveCredits ?? s.cargoCreditsSecured ?? 0}`, color: '#34D399' },
      ]
    : [
        { label: 'HOSTILES DESTROYED', value: `${kills}`, color: '#34D399' },
        { label: 'ACCURACY', value: `${acc}%`, color: '#38BDF8' },
        { label: 'CREDITS RECOVERED', value: `+$${s.creditsGained ?? 0}`, color: '#FBBF24' },
        { label: 'BLOCKS SMASHED', value: `${blocks}`, color: '#A78BFA' },
      ];

  const boxW = 252;
  const boxGap = 18;
  stats.forEach((st, idx) => {
    const bx = 64 + idx * (boxW + boxGap);
    const by = 176;
    drawRoundedRect(ctx, bx, by, boxW, 104, 10);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#94A3B8';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(st.label, bx + 18, by + 34);

    ctx.fillStyle = st.color;
    ctx.font = 'bold 34px monospace';
    ctx.fillText(st.value, bx + 18, by + 80);
  });

  // Achievements section
  ctx.fillStyle = '#FBBF24';
  ctx.font = 'bold 16px monospace';
  ctx.fillText(
    `BATTLEFIELD ACHIEVEMENTS (${earnedAchievements.length})`,
    64,
    324
  );

  if (earnedAchievements.length === 0) {
    drawRoundedRect(ctx, 64, 342, 1072, 168, 10);
    ctx.fillStyle = '#0F172A';
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.stroke();
    ctx.fillStyle = '#94A3B8';
    ctx.font = '20px monospace';
    ctx.fillText('No medals earned this sortie — deploy again to claim commendations.', 92, 432);
  } else {
    const shown = earnedAchievements.slice(0, 6);
    const cardW = 344;
    const cardH = 78;
    shown.forEach((ach, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const cx = 64 + col * (cardW + 20);
      const cy = 342 + row * (cardH + 14);
      drawRoundedRect(ctx, cx, cy, cardW, cardH, 10);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      ctx.strokeStyle =
        ach.rarity === 'epic' ? '#F59E0B' : ach.rarity === 'rare' ? '#38BDF8' : '#10B981';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = '28px sans-serif';
      ctx.fillText(ach.icon || '🎖️', cx + 16, cy + 48);

      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(ach.title, cx + 58, cy + 34, cardW - 74);

      ctx.fillStyle = '#94A3B8';
      ctx.font = '13px monospace';
      ctx.fillText(ach.description, cx + 58, cy + 57, cardW - 74);
    });
  }

  // Footer
  ctx.fillStyle = '#64748B';
  ctx.font = '16px monospace';
  const loadoutLine = `${hud?.cannonName || 'Cannon'} · ${hud?.chassisName || 'Chassis'} · ${hud?.armorName || 'Armor'}`;
  ctx.fillText(loadoutLine, 64, 566, 760);

  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('battletank.online', 926, 566);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export async function downloadBattleShareCard(options) {
  const blob = await generateBattleShareCardBlob(options);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'battle-tank-report.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

