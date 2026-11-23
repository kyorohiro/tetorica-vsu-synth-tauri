// SPDX-License-Identifier: BSD-3-Clause
(() => {
  'use strict';
  const local = (location.protocol === 'tauri:' && location.hostname === 'localhost') ||
    (['http:', 'https:'].includes(location.protocol) && location.hostname === 'tauri.localhost');
  if (window.top !== window || !local || typeof window.__TAURI_INTERNALS__?.invoke !== 'function') return;

  const maxBytes = 128 * 1024 * 1024;
  const maxHeaderBytes = 4096;
  const status = text => {
    const element = document.getElementById('status');
    if (element) element.textContent = text;
  };
  async function saveExport(blob, filename) {
    if (blob.size > maxBytes) throw new Error('Export exceeds 128 MiB');
    const header = new TextEncoder().encode(JSON.stringify({ filename }));
    if (header.byteLength > maxHeaderBytes) throw new Error('Export header exceeds 4096 bytes');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const packet = new Uint8Array(4 + header.byteLength + bytes.byteLength);
    new DataView(packet.buffer).setUint32(0, header.byteLength, true);
    packet.set(header, 4);
    packet.set(bytes, 4 + header.byteLength);
    return window.__TAURI_INTERNALS__.invoke('save_export_binary', packet.buffer);
  }

  const blobs = new Map();
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = object => {
    const url = create(object);
    if (object instanceof Blob) blobs.set(url, object);
    return url;
  };
  URL.revokeObjectURL = url => {
    blobs.delete(url);
    return revoke(url);
  };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const blob = blobs.get(this.href);
    if (!this.download || !blob) return click.call(this);
    void saveExport(blob, this.download)
      .then(path => status(path ? `Saved ${path}` : 'Save cancelled.'))
      .catch(error => status(`Could not save: ${String(error)}`));
  };
})();
