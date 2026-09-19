/**
 * progress.js — Silent progress tracker for long-running commands.
 *
 * Previously sent a separate "⏳ Processing..." text message that was edited
 * over time, then the actual result was sent as a second message — causing
 * double messages. Now silent: the reaction lifecycle (withReactionStatus)
 * handles visual feedback via ⏳→✅/❌ reactions. This class is kept for API
 * compatibility so existing plugins don't break, but it no longer sends
 * any text messages.
 *
 * Usage (unchanged API):
 *   const progress = new DownloadProgress(sock, jid, m);
 *   await progress.start('Downloading audio');  // no-op, just stores label
 *   // ... do work ...
 *   await progress.done('✅ Download complete!');  // no-op
 *   // or: await progress.fail('❌ Download failed: reason');  // no-op
 */

export class DownloadProgress {
  constructor(sock, jid, quoted, opts = {}) {
    this.sock = sock;
    this.jid = jid;
    this.quoted = quoted;
    this.intervalMs = opts.intervalMs ?? 4000;
    this._sent = null;
    this._timer = null;
    this._startTime = 0;
    this._label = 'Processing';
  }

  _formatElapsed() {
    const sec = Math.floor((Date.now() - this._startTime) / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  async _edit(text) {
    // No-op: we no longer send/edit text messages.
    // The reaction lifecycle handles visual feedback.
  }

  async start(label = 'Processing') {
    this._label = label;
    this._startTime = Date.now();
    // No message sent — silent. Reaction lifecycle shows ⏳.
  }

  async done(message) {
    this._stop();
    // No message sent — the plugin's result message IS the done indicator.
  }

  async fail(message) {
    this._stop();
    // Caller should throw or send its own error message.
  }

  _stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

export default DownloadProgress;
