/** Contact view: bug reports, feedback channels, and support resources. */
import { PAGE_PATHS } from '../app/routes.js';

export function renderContact() {
  return `
    <p class="menu-lead">Have a bug report, balance suggestion, or question about IRON VANGUARD? Use the channels below to reach the project maintainer.</p>
    <div class="menu-grid">
      <article class="menu-card" style="cursor:default">
        <span class="menu-kicker">BUG REPORTS &amp; FEEDBACK</span>
        <strong>GitHub Issues</strong>
        <p>Report gameplay bugs, rendering issues, or balance feedback directly on the project tracker. Please include your browser, graphics quality setting, and mission or mode.</p>
        <a class="menu-secondary" href="https://github.com/ufaboy/vanguard/issues" target="_blank" rel="noopener noreferrer">Open Issue Tracker ↗</a>
      </article>
      <article class="menu-card" style="cursor:default">
        <span class="menu-kicker">PROJECT REPOSITORY</span>
        <strong>Source &amp; Releases</strong>
        <p>Browse release notes, engineering documentation, and recent updates for IRON VANGUARD on GitHub.</p>
        <a class="menu-secondary" href="https://github.com/ufaboy/vanguard" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>
      </article>
      <article class="menu-card" style="cursor:default">
        <span class="menu-kicker">PLAYER SUPPORT</span>
        <strong>Controls &amp; Mechanics</strong>
        <p>Looking for keyboard shortcuts, directional armor rules, APS charge costs, or upgrade tips? Check the field manual first.</p>
        <a class="menu-secondary" href="${PAGE_PATHS.howToPlay}">Read How to Play →</a>
      </article>
      <article class="menu-card" style="cursor:default">
        <span class="menu-kicker">DATA &amp; PRIVACY</span>
        <strong>Privacy Inquiries</strong>
        <p>All saves and settings stay in your browser’s local storage. Read full details on data handling and hosting logs.</p>
        <a class="menu-secondary" href="${PAGE_PATHS.privacyPolicy}">Privacy Policy →</a>
      </article>
    </div>
  `;
}

