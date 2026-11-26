import test from 'node:test';
import assert from 'node:assert/strict';

const { pageUrl, battlefieldUrl, resolveLegacyHashRedirect } = await import('../public/src/app/routes.js');

function withPath(pathname, fn) {
  const previous = globalThis.location;
  globalThis.location = { pathname };
  try {
    fn();
  } finally {
    if (previous === undefined) delete globalThis.location;
    else globalThis.location = previous;
  }
}

/** Resolves a relative link against the page it is used on. */
const resolve = (href, pathname) => new URL(href, `https://example.test${pathname}`).pathname;

test('clean-URL site never links to .html pages', () => {
  withPath('/battlefield', () => {
    for (const page of ['index', 'campaign', 'survival', 'contracts', 'howToPlay', 'walkthrough', 'changelog']) {
      assert.doesNotMatch(pageUrl(page), /\.html/, page);
    }
    assert.equal(resolve(pageUrl('index'), '/battlefield'), '/');
    assert.equal(resolve(pageUrl('unknown-page'), '/battlefield'), '/');
    assert.doesNotMatch(resolveLegacyHashRedirect('#/about'), /\.html/);
  });
});

test('translated pages reach the battlefield at the site root in every locale', () => {
  for (const locale of ['es', 'pt-br', 'de', 'fr']) {
    const from = `/${locale}/campaign`;
    withPath(from, () => {
      assert.equal(resolve(battlefieldUrl('mission_01'), from), '/battlefield', locale);
      assert.equal(resolve(pageUrl('changelog'), from), '/changelog', locale);
      // Translated twins stay inside the locale directory.
      assert.equal(resolve(pageUrl('enemies'), from), `/${locale}/enemies`, locale);
    });
  }
});

test('itch.io build keeps .html links', () => {
  withPath('/html/123/campaign.html', () => {
    assert.equal(pageUrl('campaign'), './campaign.html');
    assert.equal(battlefieldUrl('m1'), './battlefield.html?mission=m1');
  });
});
