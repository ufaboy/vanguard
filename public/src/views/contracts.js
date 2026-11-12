/** Contracts screen: logistics raid and sabotage operations briefing. */
import { CONTRACTS_CATALOG, CONTRACT_TYPES, LAST_CARGO_CONTRACT } from '../sim/contract.js';

export function renderContracts(selectedContractId, completedMissions = {}) {
  const selected =
    CONTRACTS_CATALOG.find((item) => item.id === selectedContractId) || LAST_CARGO_CONTRACT;
  const completed = Boolean(completedMissions?.[selected.id]);
  const isSabotage = selected.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
  const accentColor = isSabotage ? '#a855f7' : '#38bdf8';

  const contractCards = CONTRACTS_CATALOG.map((item) => {
    const isSelected = item.id === selected.id;
    const isDone = Boolean(completedMissions?.[item.id]);
    const itemSabotage = item.contractType === CONTRACT_TYPES.SABOTAGE_PROTOCOL;
    const borderCls = isSelected
      ? itemSabotage
        ? 'border-purple-400 bg-purple-950/35 ring-1 ring-purple-400/60'
        : 'border-sky-400 bg-sky-950/35 ring-1 ring-sky-400/60'
      : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-500';
    const badgeCls = itemSabotage
      ? 'text-purple-300 border-purple-500/50 bg-purple-950/80'
      : 'text-sky-300 border-sky-500/50 bg-sky-950/80';
    return `
      <button
        type="button"
        data-action="select-contract"
        data-contract="${item.id}"
        class="w-full text-left p-3.5 rounded border ${borderCls} transition cursor-pointer flex flex-col gap-1.5"
      >
        <div class="flex items-center justify-between gap-2 font-mono text-[11px]">
          <span class="px-2 py-0.5 rounded border ${badgeCls} font-bold">${item.code}</span>
          <span class="${isDone ? 'text-emerald-400 font-bold' : 'text-amber-300'}">${isDone ? '✓ COMPLETED' : 'UP TO $10,000'}</span>
        </div>
        <div class="text-base font-bold text-white flex items-center justify-between">
          <span>${item.name}</span>
          <span class="text-xs font-mono text-slate-400">${item.subtitle}</span>
        </div>
        <p class="text-xs text-slate-300 leading-relaxed m-0">${item.summary}</p>
      </button>
    `;
  }).join('');

  const cargoItems = selected.containers
    .map(
      (c) =>
        `<li><span><strong>${c.slot}${c.slot === 3 ? ' ★' : ''} · ${c.name}</strong> <small>(${c.row}, ${c.col}) · ${c.gateId.toUpperCase()} GATE</small></span><strong>+$${selected.payouts.PER_CARGO}</strong></li>`
    )
    .join('');

  const groupItems = Object.values(selected.groups)
    .map((g) => {
      const counts = {};
      for (const t of g.roster) {
        const key = String(t).toUpperCase();
        counts[key] = (counts[key] || 0) + 1;
      }
      const summary = Object.entries(counts)
        .map(([k, v]) => `${v}× ${k}`)
        .join(', ');
      return `<li><span><strong>${g.id}</strong> · ${g.assignment.replaceAll('_', ' ')} <small>(${summary})</small></span><strong>${g.roster.length} units</strong></li>`;
    })
    .join('');

  const rulesSection = isSabotage
    ? `<dl class="mt-4 space-y-2 text-xs font-mono text-slate-300">
        <div>
          <dt class="text-purple-400 uppercase">1. Plant Demolition Charge [E]</dt>
          <dd>Stop within 1.5 cells of an armored Radar/ECM Relay and press <strong>[E]</strong> (or the Arm button) for <strong>2.5 seconds</strong>. Movement or leaving range cancels arming; enemy hits do not.</dd>
        </div>
        <div>
          <dt class="text-rose-400 uppercase">2. 8.0s Blast Fuse & Shockwave Clearance</dt>
          <dd>Once armed, an <strong>8.0-second countdown fuse</strong> starts with a red 3-cell blast ring. Clear the blast radius before detonation! The explosion destroys the relay, shatters nearby walls/enemies, and immediately secures <strong>+$1,500</strong>.</dd>
        </div>
        <div>
          <dt class="text-emerald-400 uppercase">3. Deliberate Southern Extraction [E]</dt>
          <dd>After <strong>2 relays</strong> are demolished, drive onto the southern extraction pad (rows 30–32, cols 16–19) and press <strong>[E]</strong> (3.0s countdown). Extracting at 2/3 pays <strong>$6,000</strong> total; demolishing all 3 relays and extracting pays <strong>$10,000</strong> total.</dd>
        </div>
      </dl>`
    : `<dl class="mt-4 space-y-2 text-xs font-mono text-slate-300">
        <div>
          <dt class="text-amber-400 uppercase">1. Explicit Cargo Loading [E]</dt>
          <dd>Stop within 1.5 cells of a sealed data capsule and press <strong>[E]</strong> (or the Cargo button) for 2.0 seconds. Movement or leaving range cancels loading; enemy hits do not.</dd>
        </div>
        <div>
          <dt class="text-sky-400 uppercase">2. Southern Delivery Pad Unloading</dt>
          <dd>Drive onto the southern delivery pad (rows 30–32, cols 16–19) and hold position for 2.0 seconds. Movement pauses unloading; leaving the pad resets progress. Each delivered container immediately secures <strong>+$1,500</strong>.</dd>
        </div>
        <div>
          <dt class="text-emerald-400 uppercase">3. Deliberate Extraction [E]</dt>
          <dd>After 2 deliveries, the <strong>Extract [E]</strong> control unlocks on the pad (3.0s countdown). Leaving the pad cancels extraction; taking damage or fighting on the pad does not. Extracting at 2/3 pays <strong>$6,000</strong> total; delivering all 3 and extracting pays <strong>$10,000</strong> total.</dd>
        </div>
      </dl>`;

  return `<p class="menu-lead">High-stakes tactical operations with explicit objectives and extraction rules.<br>Select a contract below, complete at least 2 of 3 primary objectives, and decide whether to extract or risk the 3rd target for a massive bonus.</p>
  <div class="campaign-summary">
    <span>${CONTRACTS_CATALOG.length} ACTIVE CONTRACTS</span>
    <span>◈ 2 OF 3 OBJECTIVES REQUIRED</span>
    <span>★ 3RD OBJECTIVE BONUS (+$4,000)</span>
    <span>✓ OBJECTIVE CREDITS SECURED IMMEDIATELY</span>
  </div>
  <div class="campaign-layout">
    <section class="menu-card" aria-label="Contract operations list">
      <span class="menu-kicker">AVAILABLE OPERATIONS</span>
      <h2>Select Tactical Contract</h2>
      <div class="mt-3 flex flex-col gap-3">
        ${contractCards}
      </div>
      <div class="mt-5 pt-4 border-t border-slate-800">
        <span class="menu-kicker">${selected.code} // RULES OF ENGAGEMENT</span>
        ${rulesSection}
      </div>
    </section>

    <aside class="campaign-brief" aria-label="Selected contract briefing" style="--chapter-color:${accentColor}">
      <div class="menu-kicker">${selected.code}</div>
      <h2>${selected.name}</h2>
      <p class="campaign-theme">${selected.theme} · ${selected.targetDuration}</p>
      <dl>
        <dt>${isSabotage ? 'Radar & ECM Relays (Demolish 2, 3rd Optional ★)' : 'Data Containers (Deliver 2, 3rd Optional ★)'}</dt>
        <dd><ul class="campaign-roster">${cargoItems}</ul></dd>
        <dt>Payout Structure (Idempotent Per Attempt)</dt>
        <dd>
          <ul class="campaign-roster">
            <li><span>${isSabotage ? 'Each demolished relay (secured on detonation)' : 'Each delivered container (secured immediately)'}</span><strong>+$${selected.payouts.PER_CARGO}</strong></li>
            <li><span>Successful extraction (at least 2 completed)</span><strong>+$${selected.payouts.EXTRACTION_BASE}</strong></li>
            <li><span>Full 3/3 extraction bonus ★</span><strong>+$${selected.payouts.THIRD_CARGO_BONUS}</strong></li>
          </ul>
        </dd>
        <dt>Encounter Schedule · 24 Tanks Finite Budget (Max 6 Live)</dt>
        <dd><ul class="campaign-roster">${groupItems}</ul></dd>
        <dt>Target Difficulty</dt>
        <dd>${selected.difficulty}</dd>
      </dl>
      <div class="campaign-planned">
        <strong>${completed ? 'COMPLETED · REPLAYABLE' : 'READY TO DEPLOY'}</strong>
        <p>Eliminating all enemies never completes the contract. Abort or defeat preserves already secured objective payouts and kill bounties.</p>
      </div>
      <button class="menu-primary" data-action="start-contract" data-contract="${selected.id}">${completed ? 'Replay' : 'Deploy'} ${selected.name} →</button>
      <div class="campaign-brief-nav">
        <a class="menu-secondary" href="/hangar">Hangar &amp; Workshop</a>
        <a class="menu-secondary" href="/">← Main menu</a>
      </div>
    </aside>
  </div>`;
}
