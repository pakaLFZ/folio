/**
 * The running server's state: workspace, hub, one manifest per deck, the lazy
 * watchers, and the publishing of every change as a stream event.
 */
import { watchTree, type TreeWatcher } from "./treewatch.js";
import { summarize } from "@folio/core";
import { join } from "node:path";
import { relative } from "./posixpath.js";
import type { WorkspaceConfig } from "./config.js";
import type { DeckStore } from "./deckstore.js";
import { WORKSPACE_CHANNEL, watchDeckFolders } from "./deckwatch.js";
import { WarningService } from "./checks.js";
import { Hub } from "./hub.js";
import { DeckManifest } from "./manifest.js";
import { ViewingRegistry } from "./viewing.js";
import { settler } from "./settle.js";
import { LazyWatchers, watchDeck } from "./watcher.js";
import { Workspace } from "./workspace.js";

/** Quiet time after a pack file's last event before packs are reloaded: one reload for an editor's burst of writes. */
const PACK_SETTLE_MS = 150;

export type Listener = (token: string, type: string, data: unknown) => void;

export class FolioApp {
  readonly workspace: Workspace;
  readonly hub = new Hub();
  readonly warnings: WarningService;
  readonly manifests = new Map<string, DeckManifest>();
  /** What each open editor tab shows, in memory only. */
  readonly viewing = new ViewingRegistry();
  private readonly watchers: LazyWatchers;
  private packWatcher: TreeWatcher | null = null;
  private deckWatcher: TreeWatcher | null = null;
  private readonly listeners: Listener[] = [];

  /**
   * Open a workspace and wire its watchers to the hub.
   *
   * @param config - the workspace configuration.
   */
  constructor(readonly config: WorkspaceConfig) {
    this.workspace = new Workspace(config);
    this.warnings = new WarningService(this.workspace);
    this.watchers = new LazyWatchers((token) => this.startDeckWatcher(token));
    this.hub.onInterest = (token, watching) => token !== WORKSPACE_CHANNEL && this.watchers.interest(token, watching);
    this.hub.onDetach = () => this.viewing.keepStreamed((token) => this.hub.carries(token));
  }

  /**
   * Subscribe to every change the app publishes (used by the queue and checks).
   *
   * @param listener - called with deck token, event type and payload.
   */
  listen(listener: Listener): void {
    this.listeners.push(listener);
  }

  /**
   * Publish an event to browsers and in-process listeners.
   *
   * @param token - the deck token.
   * @param type - the event type.
   * @param data - the payload.
   */
  emit(token: string, type: string, data: unknown): void {
    this.hub.publish(token, type, data);
    for (const l of this.listeners) l(token, type, data);
  }

  /**
   * Tell in-process listeners only (the queue), not the browsers.
   *
   * @param token - the deck token.
   * @param type - the event type, e.g. `measured`.
   * @param data - the payload.
   */
  notify(token: string, type: string, data: unknown): void {
    for (const l of this.listeners) l(token, type, data);
  }

  /**
   * A deck's manifest, created on first use.
   *
   * @param store - the deck.
   * @returns its manifest.
   */
  manifestOf(store: DeckStore): DeckManifest {
    let m = this.manifests.get(store.token);
    if (!m) {
      m = new DeckManifest(store);
      this.manifests.set(store.token, m);
    }
    return m;
  }

  /**
   * Re-read one slide and publish it if its revision moved.
   *
   * @param store - the deck.
   * @param id - the slide id.
   */
  slideTouched(store: DeckStore, id: string): void {
    const result = this.manifestOf(store).refresh(id);
    if (!result) return;
    this.emit(store.token, "slide", { ...result.change, entry: result.entry });
    if (!result.change.removed) this.publishWarnings(store, id, null);
  }

  /**
   * Recompute a slide's warnings and publish them.
   *
   * @param measured - a fresh measurement, or null to reuse the stored one.
   */
  publishWarnings(store: DeckStore, id: string, measured: import("@folio/core").SlideMeasurement | null): void {
    const warnings = this.warnings.slideWarnings(store, id, measured);
    this.emit(store.token, "warnings", { slide: id, warnings });
  }

  /**
   * The manifest, guaranteed current: an unwatched deck may have been changed
   * by a CLI writer since it was last read, so it is re-read first.
   *
   * @param store - the deck.
   * @returns the manifest entries in order.
   */
  freshManifest(store: DeckStore) {
    const manifest = this.manifestOf(store);
    if (!this.watchers.isActive(store.token)) {
      store.reloadDeck();
      for (const id of store.slideIds()) manifest.refresh(id);
    }
    return manifest.list();
  }

  /** The deck's vocabulary bank changed: every slide's FOLIO-VOC-001 is recomputed and published. */
  vocabularyTouched(store: DeckStore): void {
    for (const id of store.slideIds()) this.publishWarnings(store, id, null);
    this.emit(store.token, "vocabulary", {});
  }

  /** Re-read `deck.json` and publish the new order. */
  deckTouched(store: DeckStore): void {
    store.reloadDeck();
    this.emit(store.token, "order", { order: store.slideIds(), title: store.deck.title });
  }

  private startDeckWatcher(token: string): TreeWatcher | null {
    const store = this.workspace.decks.get(token);
    if (!store) return null;
    this.manifestOf(store);
    return watchDeck(store.dir, {
      slideChanged: (id) => this.slideTouched(store, id),
      deckChanged: () => this.deckTouched(store),
      otherChanged: (path, version) => {
        const rel = relative(store.dir, path);
        if (rel === "vocabulary.md") this.vocabularyTouched(store);
        this.emit(token, "file", { path: rel, v: version });
      },
    });
  }

  /**
   * Watch the templates folder; a pack change reloads packs and tells every
   * deck that uses the changed pack.
   */
  watchPacks(): void {
    this.packWatcher = watchTree(this.config.templatesDir, { ignoreInitial: true, depth: 4, ignored: (p) => /__pycache__|\.tmp$/.test(p) });
    let timer: NodeJS.Timeout | null = null;
    const changed = new Set<string>();
    const touch = settler(({ path }) => {
      changed.add(relative(this.config.templatesDir, path).split("/")[0] ?? "");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        this.workspace.reloadPacks();
        for (const store of this.workspace.decks.values()) {
          const pack = this.workspace.packOf(store);
          if (pack && changed.has(relative(this.config.templatesDir, pack.dir))) this.emit(store.token, "pack", { pack: pack.pack.name, version: pack.pack.version });
        }
        changed.clear();
      }, PACK_SETTLE_MS);
    });
    this.packWatcher.on("all", (event, path) => event.endsWith("Dir") || touch(path));
  }

  /**
   * Mount and unmount decks as their folders come and go while the server
   * runs, and publish each deck's row on the workspace channel.
   */
  watchDecks(): void {
    this.deckWatcher = watchDeckFolders(this.workspace, this.hub);
  }

  /** Counters shown on the landing page; services replace this function. */
  deckSummary: (store: DeckStore) => { openComments: number; warnings: { error: number; warning: number; note: number } } = (store) => {
    const s = summarize(this.warnings.deckWarnings(store));
    return { openComments: 0, warnings: { error: s.error, warning: s.warning, note: s.note } };
  };

  /** Path of a deck-relative file. */
  deckPath(store: DeckStore, rel: string): string {
    return join(store.dir, rel);
  }

  /** Stop watchers and streams. */
  async close(): Promise<void> {
    this.hub.close();
    this.viewing.closeAll();
    await this.watchers.closeAll();
    await this.packWatcher?.close();
    await this.deckWatcher?.close();
  }
}
