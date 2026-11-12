/**
 * Pre-renders the initial HTML structure into `<div id="root">...</div>` for all 10 pages
 * so static content and menu shells are served directly in HTML before JS executes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderPageShell } from '../public/src/app/shell.js';
import { CAMPAIGN_MISSIONS } from '../public/src/game/campaign.js';
import { CONTRACTS_CATALOG } from '../public/src/sim/index.js';
import { renderAbout } from '../public/src/views/about.js';
import { renderCampaign } from '../public/src/views/campaign.js';
import { renderContact } from '../public/src/views/contact.js';
import { renderContracts } from '../public/src/views/contracts.js';
import { renderHome } from '../public/src/views/home.js';
import { renderHowToPlay } from '../public/src/views/how-to-play.js';
import { renderPrivacyPolicy } from '../public/src/views/privacy-policy.js';
import { renderSurvival } from '../public/src/views/survival.js';

function wrapMenuScreen(pageId, innerHtml) {
  return `<div id="status-modal" class="fixed inset-0 z-30 flex items-center justify-center bg-[#06090F]/95 p-4 menu-screen" data-page="${pageId}">${innerHtml}</div>`;
}

const PAGES = [
  {
    file: 'public/index.html',
    render: () => renderHome(),
  },
  {
    file: 'public/how-to-play.html',
    render: () =>
      renderPageShell({
        activePage: 'how-to-play',
        title: 'How to Play',
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
        className: 'privacy-content',
        bodyHtml: renderPrivacyPolicy(),
      }),
  },
  {
    file: 'public/contact.html',
    render: () =>
      renderPageShell({
        activePage: 'contact',
        title: 'Contact',
        className: 'contact-content',
        bodyHtml: renderContact(),
      }),
  },
  {
    file: 'public/campaign.html',
    render: () =>
      wrapMenuScreen(
        'campaign',
        renderPageShell({
          activePage: 'campaign',
          title: 'Road to the capital',
          showBack: false,
          className: 'campaign-content',
          bodyHtml: renderCampaign(CAMPAIGN_MISSIONS[0].id, []),
        })
      ),
  },
  {
    file: 'public/survival.html',
    render: () =>
      wrapMenuScreen(
        'survival',
        renderPageShell({
          activePage: 'survival',
          title: 'Endless survival',
          className: 'campaign-content',
          bodyHtml: renderSurvival(null),
        })
      ),
  },
  {
    file: 'public/contract.html',
    render: () =>
      wrapMenuScreen(
        'contracts',
        renderPageShell({
          activePage: 'contract',
          title: 'Tactical contracts',
          className: 'campaign-content',
          bodyHtml: renderContracts(CONTRACTS_CATALOG[0]?.id || 'contract-last-cargo', []),
        })
      ),
  },
  {
    file: 'public/hangar.html',
    render: () =>
      wrapMenuScreen(
        'hangar',
        renderPageShell({
          activePage: 'hangar',
          title: 'Hangar & Workshop',
          bodyHtml: '<p class="menu-lead">Initializing 3D Hangar bay and component workshop…</p>',
        })
      ),
  },
  {
    file: 'public/codex.html',
    render: () =>
      wrapMenuScreen(
        'codex',
        renderPageShell({
          activePage: 'codex',
          title: '3D Codex',
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
