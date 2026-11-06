// Observable status of one engine/model, consumed by React via useSyncExternalStore.

export const STATUS = {
  unknown: { label: '…', tone: 'muted' },
  checking: { label: 'Tikrinama…', tone: 'info' },
  unsupported: { label: 'Nepalaikoma', tone: 'bad' },
  downloadable: { label: 'Galima atsisiųsti', tone: 'warn' },
  downloading: { label: 'Siunčiama…', tone: 'info' },
  ready: { label: 'Paruošta', tone: 'ok' },
  loaded: { label: 'Paruošta · atmintyje', tone: 'ok' },
  cloud: { label: 'Debesyje', tone: 'cloud' },
  error: { label: 'Klaida', tone: 'bad' },
};

export class ModelController {
  #state = { status: 'unknown', progress: null, detail: '', busy: false };
  #listeners = new Set();

  getSnapshot = () => this.#state;

  subscribe = (listener) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  update(patch) {
    this.#state = { ...this.#state, ...patch };
    this.#listeners.forEach((l) => l());
  }

  /** Runs an action and reports any error on the controller instead of throwing. */
  async act(fn) {
    try {
      await fn();
    } catch (err) {
      this.update({ busy: false, status: 'error', progress: null, detail: err?.message ?? String(err) });
    }
  }
}
