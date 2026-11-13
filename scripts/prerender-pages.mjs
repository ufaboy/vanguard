/**
 * Pre-renders the initial HTML structure into `<div id="root">...</div>` for all 10 pages
 * so static content and menu shells are served directly in HTML before JS executes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderPageShell } from '../public/src/app/shell.js';
import { CAMPAIGN_MISSIONS } from '../public/src/game/campaign.js';
import { renderAbout } from '../public/src/views/about.js';
import { renderCampaign } from '../public/src/views/campaign.js';
import { renderContact } from '../public/src/views/contact.js';
import { renderContracts } from '../public/src/views/contracts.js';
import { renderHowToPlay } from '../public/src/views/how-to-play.js';
import { renderPrivacyPolicy } from '../public/src/views/privacy-policy.js';
import { renderSurvival } from '../public/src/views/survival.js';

function wrapGameShell(pageId, innerHtml) {
  return `
    <div id="game-shell" class="relative w-screen h-screen overflow-hidden bg-[#0B0F17] text-[#F8FAFC] select-none font-sans">
      <!-- 100% Full-bleed 3D WebGL Canvas Mount -->
      <div id="canvas-mount" class="fixed inset-0 w-full h-full cursor-crosshair"></div>

      <!-- Top-Left Compact Telemetry Bar -->
      <!-- Top-Left Hull HP, Turret & Sector Telemetry -->
      <header id="top-telemetry" class="hidden fixed top-3 left-4 z-20 flex flex-col gap-1.5 pointer-events-none"></header>

      <!-- Top-Center Live Azimuth Compass -->
      <div id="top-compass" class="hidden fixed top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none"></div>

      <!-- Top-Right APS Status & Utility Controls -->
      <div id="top-controls" class="hidden fixed top-3 right-4 z-20 flex flex-col items-end gap-1.5"></div>

      <!-- Bottom-Right Circular Tactical Radar -->
      <div id="sensor-minimap" class="hidden fixed bottom-3 right-4 z-20 pointer-events-none"></div>

      <!-- Contract Cargo & Gate Warning HUD -->
      <div id="contract-hud" class="hidden fixed top-40 left-4 z-20 flex flex-col gap-2 max-w-[min(560px,92vw)]"></div>

      <!-- Contextual Contract Interaction / Extraction Control Bar -->
      <div id="contract-action-bar" class="hidden fixed bottom-24 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center"></div>

      <!-- Boss Condition Banner -->
      <div id="boss-banner" class="hidden fixed top-20 left-1/2 -translate-x-1/2 z-20 w-[min(560px,90vw)] bg-[#0B0F17]/95 border border-red-500/70 px-5 py-3 rounded shadow-2xl"></div>

      <!-- Observed Target Condition Badge -->
      <div id="target-badge" class="hidden fixed top-36 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#0B0F17]/95 border border-teal-500/70 px-4 py-1.5 rounded text-xs font-mono uppercase tracking-wider shadow-lg"></div>

      <!-- Tactical Status Toast -->
      <div id="status-toast" class="hidden fixed top-48 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-[#0B0F17]/95 border border-amber-500/70 px-5 py-2 rounded text-xs font-mono uppercase tracking-[0.12em] text-amber-300 shadow-lg"></div>

      <!-- Active Combat Modifiers Strip -->
      <div id="modifiers-strip" class="hidden fixed top-24 right-4 z-20 flex flex-col gap-1.5 items-end pointer-events-none"></div>

      <!-- Interactive 3D Codex & Proving Grounds Studio Overlay [I] -->
      <div id="codex-modal" class="hidden codex-overlay"></div>

      <!-- Modular Tank Hangar, Workshop & 5x5 Engineering Drawer [U] -->
      <div id="upgrade-drawer" class="hidden hangar-shell" role="dialog" aria-modal="true" aria-label="Vehicle maintenance hangar"></div>

      <!-- Bottom Docked Tactical HUD (Speed/Gear + Weapons/Reload/Modules) -->
      <footer id="bottom-hud" class="hidden fixed bottom-3 left-4 right-48 z-20 flex items-end justify-between gap-3 pointer-events-none"></footer>

      <!-- Modal Overlays: Menu, Pause, Victory, Game Over -->
      <div id="status-modal" class="fixed inset-0 z-30 menu-screen" data-page="${pageId}">
        ${innerHtml}
      </div>
    </div>
  `.trim();
}

const PAGES = [
  {
    file: 'public/how-to-play.html',
    render: () =>
      renderPageShell({
        activePage: 'how-to-play',
        title: 'How to Play',
        subtitle: 'Field Manual & Tactical Controls',
        className: 'how-to-play-content',
        bodyHtml: renderHowToPlay(),
      }),
  },
  {
    file: 'public/about.html',
    render: () =>
      renderPageShell({
        activePage: 'about',
        title: 'About Battle Tank',
        subtitle: 'Project Overview & Architecture',
        className: 'about-content',
        bodyHtml: renderAbout(),
      }),
  },
  {
    file: 'public/privacy-policy.html',
    render: () =>
      renderPageShell({
        activePage: 'privacy-policy',
        title: 'Privacy Policy',
        subtitle: 'Classification & Data Protections',
        className: 'privacy-content',
        bodyHtml: renderPrivacyPolicy(),
      }),
  },
  {
    file: 'public/contact.html',
    render: () =>
      renderPageShell({
        activePage: 'contact',
        title: 'Command Inquiries',
        subtitle: 'Signal HQ & Operations',
        className: 'contact-content',
        bodyHtml: renderContact(),
      }),
  },
  {
    file: 'public/campaign.html',
    render: () =>
      renderPageShell({
        activePage: 'campaign',
        title: 'Road to the capital',
        subtitle: 'Seven Regions Tactical Campaign',
        showBack: true,
        className: 'campaign-content',
        bodyHtml: renderCampaign(CAMPAIGN_MISSIONS[0].id, []),
      }),
  },
  {
    file: 'public/survival.html',
    render: () =>
      renderPageShell({
        activePage: 'survival',
        title: 'Endless survival',
        subtitle: 'The Iron Crucible',
        showBack: true,
        className: 'campaign-content',
        bodyHtml: renderSurvival(null),
      }),
  },
  {
    file: 'public/contracts.html',
    render: () =>
      renderPageShell({
        activePage: 'contracts',
        title: 'Tactical contracts',
        subtitle: 'High-Stakes Extraction & Sabotage',
        showBack: true,
        className: 'campaign-content',
        bodyHtml: renderContracts('', []),
      }),
  },
  {
    file: 'public/battlefield.html',
    render: () =>
      wrapGameShell(
        'battlefield',
        renderPageShell({
          activePage: 'battlefield',
          title: 'Battlefield',
          subtitle: 'Deploying Tactical Arena…',
          showBack: true,
          bodyHtml: '<p class="menu-lead">Initializing 3D tactical arena…</p>',
        })
      ),
  },
  {
    file: 'public/codex.html',
    render: () =>
      wrapGameShell(
        'codex',
        renderPageShell({
          activePage: 'codex',
          title: 'Tactical Codex',
          subtitle: '3D Vehicle, Weapon & Surface Showcase',
          showBack: true,
          bodyHtml: '<p class="menu-lead">Initializing 3D vehicle, weapon, and terrain showcase…</p>',
        })
      ),
  },
];

const ROOT_RE = /<div id="root">(?:<!-- prerender:start -->[\s\S]*?<!-- prerender:end -->)?<\/div>\s*(?=<noscript>)/;

for (const page of PAGES) {
  const filePath = path.resolve(process.cwd(), page.file);
  const html = fs.readFileSync(filePath, 'utf8');
  if (!ROOT_RE.test(html)) {
    throw new Error(`Could not find <div id="root">...</div> before <noscript> in ${page.file}`);
  }
  const rendered = page.render().trim();
  const updated = html.replace(
    ROOT_RE,
    () => `<div id="root"><!-- prerender:start -->\n${rendered}\n    <!-- prerender:end --></div>\n    `
  );
  fs.writeFileSync(filePath, updated, 'utf8');
  console.log(`Prerendered ${page.file}`);
}
