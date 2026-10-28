export interface MapFullscreenState { expanded: boolean; fallback: boolean; busy: boolean }

/** Fullscreen the document so dialogs/popovers portalled to body remain visible. */
export class MapFullscreen {
  private state: MapFullscreenState = { expanded: false, fallback: false, busy: false };
  private ownsNative = false;
  private disposed = false;
  private entry = 0;
  constructor(private doc: Document, private changed: (state: MapFullscreenState) => void) {
    doc.addEventListener('fullscreenchange', this.synchronize);
  }
  private publish(state: MapFullscreenState) { this.state = state; if (!this.disposed) this.changed(state); }
  private synchronize = () => {
    if (this.ownsNative && this.doc.fullscreenElement !== this.doc.documentElement) {
      this.ownsNative = false; this.publish({ expanded: false, fallback: false, busy: false });
    }
  };
  async toggle() {
    if (this.state.busy || this.disposed) return;
    if (this.state.expanded) { await this.close(); return; }
    const entry = ++this.entry;
    this.publish({ expanded: false, fallback: false, busy: true });
    try {
      if (this.doc.fullscreenElement || !this.doc.documentElement.requestFullscreen || this.doc.fullscreenEnabled === false) throw new Error('Fullscreen unavailable');
      this.ownsNative = true;
      await this.doc.documentElement.requestFullscreen();
      if (this.disposed || entry !== this.entry) {
        if (this.ownsNative && this.doc.fullscreenElement === this.doc.documentElement) {
          try { await this.doc.exitFullscreen(); }
          catch { this.publish({ expanded: true, fallback: false, busy: false }); return; }
        }
        this.ownsNative = false;
        this.publish({ expanded: false, fallback: false, busy: false }); return;
      }
      if (this.doc.fullscreenElement !== this.doc.documentElement) {
        this.ownsNative = false; this.publish({ expanded: false, fallback: false, busy: false }); return;
      }
      this.publish({ expanded: true, fallback: false, busy: false });
    } catch {
      this.ownsNative = false;
      if (this.disposed || entry !== this.entry) {
        this.publish({ expanded: false, fallback: false, busy: false }); return;
      }
      this.publish({ expanded: true, fallback: true, busy: false });
    }
  }
  async close() {
    ++this.entry;
    if (this.state.busy) {
      // Retain ownership until the pending request settles and can be released.
      this.publish({ expanded: false, fallback: false, busy: true }); return;
    }
    if (this.ownsNative && this.doc.fullscreenElement === this.doc.documentElement) {
      try { await this.doc.exitFullscreen(); } catch { return; }
    }
    this.ownsNative = false; this.publish({ expanded: false, fallback: false, busy: false });
  }
  dispose() {
    ++this.entry;
    this.disposed = true; this.doc.removeEventListener('fullscreenchange', this.synchronize);
    if (this.ownsNative && this.doc.fullscreenElement === this.doc.documentElement) void this.doc.exitFullscreen().catch(() => undefined);
  }
}
