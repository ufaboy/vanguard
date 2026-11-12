/** Privacy Policy view: local storage usage, hosting logs, and third-party links. */
import { PAGE_PATHS } from '../app/routes.js';

export function renderPrivacyPolicy() {
  return `
    <p class="menu-lead">BATTLE TANK is designed to run directly in your web browser without player accounts, logins, or personal profile collection.</p>
    <div class="menu-policy">
      <section>
        <h2>1. Local Browser Storage</h2>
        <p>To save your game progress and preferences between sessions, BATTLE TANK stores data locally on your device using browser storage (<code>localStorage</code> and <code>sessionStorage</code>). This data stays on your device and is not transmitted to us:</p>
        <ul>
          <li>Campaign mission unlocks, contract completions, credits, and survival high scores.</li>
          <li>Tank loadout, 5-track component upgrade tiers, and equipped optional modules (<code>iron_vanguard_upgrades_v3</code> and save repository keys).</li>
          <li>Audio, camera preset, graphics quality, and FPS cap preferences (<code>iron_vanguard_settings_v1</code>).</li>
        </ul>
        <p style="margin-top:10px;">You can delete all locally saved data at any time by clearing site data in your browser settings.</p>
      </section>
      <section>
        <h2>2. Server &amp; Hosting Logs</h2>
        <p>BATTLE TANK is served as a static web application. Like standard web hosting providers, our hosting infrastructure (Cloudflare Pages) may automatically process basic technical request metadata—such as IP address, browser user-agent, requested URL, and timestamp—for security, DDoS protection, and reliable delivery.</p>
      </section>
      <section>
        <h2>3. Advertising, Cookies &amp; Third-Party Vendors</h2>
        <p>BATTLE TANK uses <strong>Google AdSense</strong> and <strong>Google H5 Games Ads</strong> to display advertisements (such as optional rewarded video ads and between-mission ad breaks). Third-party vendors, including Google, use cookies or local device identifiers to serve ads based on a user’s prior visits to this website or other websites.</p>
        <ul>
          <li>Google’s use of advertising cookies enables it and its partners to serve ads based on your visit to BATTLE TANK and/or other sites on the Internet.</li>
          <li>You may opt out of personalized advertising by visiting <a href="https://adssettings.google.com/" target="_blank" rel="noopener noreferrer">Google Ads Settings</a>.</li>
          <li>You can learn more about how Google processes data on partner sites in <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">Google’s Privacy &amp; Terms</a>.</li>
        </ul>
        <p style="margin-top:10px;">Pages may also link to external platforms such as GitHub for source code or issue reporting; any external website you visit is governed by its own privacy policy.</p>
      </section>
      <section>
        <h2>4. Children’s Privacy</h2>
        <p>We do not knowingly collect personally identifiable information from anyone, including children under 13, because the game operates without accounts, forms, or personal data collection.</p>
      </section>
      <section>
        <h2>5. Policy Updates &amp; Contact</h2>
        <p>If this policy changes in the future (for example, if online leaderboards or optional analytics are introduced), this page will be updated accordingly. For any privacy questions, please visit our <a href="${PAGE_PATHS.contact}">Contact</a> page.</p>
      </section>
    </div>
  `;
}

