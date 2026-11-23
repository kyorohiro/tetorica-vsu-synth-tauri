const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { setImmediate } = require('node:timers/promises');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(resolve(__dirname, '../desktop/desktop-interface.js'), 'utf8');

function browser(origin, response = () => '/saved/tetorica.zip', framed = false) {
  const calls = [];
  const status = {};
  const window = { __TAURI_INTERNALS__: { invoke(command, packet) {
    calls.push([command, new Uint8Array(packet)]);
    return Promise.resolve().then(response);
  } } };
  window.top = framed ? {} : window;
  class Anchor {
    click() { this.browserClick = true; }
  }
  let blobCount = 0;
  const URL = {
    createObjectURL: () => `blob:mock-${++blobCount}`,
    revokeObjectURL() {},
  };
  runInNewContext(source, {
    window, location: new globalThis.URL(origin), HTMLAnchorElement: Anchor,
    URL, TextEncoder, Blob, document: { getElementById: id => id === 'status' ? status : null },
  });
  function link(bytes, download) {
    return Object.assign(new Anchor(), { href: URL.createObjectURL(new Blob([bytes])), download });
  }
  return { calls, status, link, revoke: URL.revokeObjectURL };
}

test('the packaged webview sends the original data to the native save command', async () => {
  const { calls, status, link, revoke } = browser('tauri://localhost');
  const bytes = Uint8Array.of(0, 2, 128, 255);
  const anchor = link(bytes, 'test.zip');
  anchor.click();
  revoke(anchor.href);
  await setImmediate();
  assert.equal(anchor.browserClick, undefined);
  const [[command, packet]] = calls;
  const metadataLength = new DataView(packet.buffer).getUint32(0, true);
  assert.equal(command, 'save_export_binary');
  assert.deepEqual(JSON.parse(new TextDecoder().decode(packet.slice(4, 4 + metadataLength))), { filename: 'test.zip' });
  assert.deepEqual(packet.slice(4 + metadataLength), bytes);
  assert.equal(status.textContent, 'Saved /saved/tetorica.zip');
});

test('the WebView2 origin has the same save bridge and reports cancellation and errors', async () => {
  const cancelled = browser('http://tauri.localhost', () => null);
  cancelled.link('WAV', 'test.wav').click();
  const failed = browser('https://tauri.localhost', () => { throw new Error('disk full'); });
  failed.link('ZIP', 'test.zip').click();
  await setImmediate();
  assert.equal(cancelled.status.textContent, 'Save cancelled.');
  assert.match(failed.status.textContent, /Could not save: .*disk full/);
});

test('other pages and ordinary links keep the default click behavior', () => {
  for (const page of [browser('https://tauri.localhost.example'), browser('tauri://localhost', undefined, true)]) {
    const link = page.link('data', 'file.zip');
    link.click();
    assert(link.browserClick);
    assert.equal(page.calls.length, 0);
  }
  const page = browser('tauri://localhost');
  const link = page.link('data', '');
  link.click();
  assert(link.browserClick);
  assert.equal(page.calls.length, 0);
});
