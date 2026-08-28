import type { ServiceConfig } from '../config/types.js';
import { shouldIngestUrl } from '../utils/strings.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { OrderCache } from './order-cache.js';
import { IngestDeduper } from './ingest-deduper.js';

interface CdpTarget {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl?: string;
  type: string;
}

interface LastPayload {
  url: string;
  data: unknown;
  at: number;
}

interface AttachedSession {
  sessionId: string;
  targetId: string;
  url: string;
}

const GESTOR_URL_RE = /gestordepedidos|ifood\.com/i;

export class CdpCollector {
  private ws: WebSocket | null = null;
  private msgId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private connected = false;
  private lastPayloadAt = 0;
  private availableTargets: string[] = [];
  private attachedSessions = new Map<string, AttachedSession>();
  private deduper = new IngestDeduper();

  constructor(
    private config: ServiceConfig,
    private cache: OrderCache,
    private logger: Logger,
    private activity: ActivityLog,
  ) {}

  isConnected(): boolean {
    return this.connected;
  }

  getAvailableTargets(): string[] {
    return [...this.availableTargets];
  }

  getAttachedSessionCount(): number {
    return this.attachedSessions.size;
  }

  start(): void {
    if (!this.config.cdpEnabled) return;
    this.running = true;
    this.scheduleReconnect(0);
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.attachedSessions.clear();
    this.deduper.reset();
  }

  private scheduleReconnect(delayMs: number): void {
    if (!this.running || this.connected) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connectLoop(), delayMs);
  }

  private connectLoop(): void {
    if (!this.running || this.connected) return;

    this.tryConnect()
      .catch((err) => {
        this.logger.debug('[CDP] Gestor não encontrado na porta de debug', {
          port: this.config.cdpPort,
          error: err instanceof Error ? err.message : String(err),
          dica: 'Execute .\\scripts\\enable-gestor-debug.ps1 e reinicie o Gestor',
        });
      })
      .finally(() => {
        if (!this.running || this.connected) return;
        this.scheduleReconnect(this.config.cdpReconnectSeconds * 1000);
      });
  }

  private async tryConnect(): Promise<void> {
    const port = this.config.cdpPort;
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`CDP HTTP ${res.status}`);

    const targets = (await res.json()) as CdpTarget[];
    this.availableTargets = targets.map((t) => `${t.type}: ${t.title} (${t.url.slice(0, 60)})`);

    const browser = targets.find((t) => t.type === 'browser' && t.webSocketDebuggerUrl);
    const page = this.pickTarget(targets);

    if (browser?.webSocketDebuggerUrl) {
      await this.openBrowserWebSocket(browser, page);
    } else if (page?.webSocketDebuggerUrl) {
      await this.openPageWebSocket(page);
    } else {
      throw new Error(
        `Nenhum target CDP do Gestor (${targets.length} targets). URLs: ${targets.map((t) => t.url).join(', ').slice(0, 200)}`,
      );
    }
  }

  private pickTarget(targets: CdpTarget[]): CdpTarget | undefined {
    const withWs = targets.filter((t) => t.webSocketDebuggerUrl && (t.type === 'page' || t.type === 'webview'));
    if (withWs.length === 0) return undefined;

    const gestor = withWs.find((t) => GESTOR_URL_RE.test(t.url));
    if (gestor) return gestor;

    const httpPage = withWs.find((t) => /^https?:\/\//i.test(t.url));
    if (httpPage) return httpPage;

    return withWs[0];
  }

  private isGestorTarget(url: string, type: string): boolean {
    return (type === 'page' || type === 'webview') && GESTOR_URL_RE.test(url);
  }

  private openBrowserWebSocket(browser: CdpTarget, primaryPage?: CdpTarget): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(browser.webSocketDebuggerUrl!);
      this.ws = ws;

      ws.onopen = async () => {
        try {
          this.connected = true;
          await this.send('Target.setDiscoverTargets', { discover: true });
          await this.send('Target.setAutoAttach', {
            autoAttach: true,
            waitForDebuggerOnStart: false,
            flatten: true,
          });

          if (primaryPage) {
            await this.attachAndSetupTarget(primaryPage.id, primaryPage.url);
          }

          this.startPayloadPolling();

          this.logger.info('[CDP] Conectado ao Gestor (multi-target)', {
            primary: primaryPage?.title || browser.title,
          });
          resolve();
        } catch (err) {
          this.connected = false;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      this.setupWebSocketHandlers(ws, reject);
    });
  }

  private openPageWebSocket(page: CdpTarget): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(page.webSocketDebuggerUrl!);
      this.ws = ws;

      ws.onopen = async () => {
        try {
          this.connected = true;
          await this.send('Network.enable', {});
          await this.send('Runtime.enable', {});
          await this.injectNetworkHooks();
          this.startPayloadPolling();

          this.logger.info('[CDP] Conectado ao Gestor de Pedidos', {
            title: page.title,
            url: page.url.slice(0, 80),
          });
          resolve();
        } catch (err) {
          this.connected = false;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };

      this.setupWebSocketHandlers(ws, reject);
    });
  }

  private setupWebSocketHandlers(ws: WebSocket, reject: (err: Error) => void): void {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as {
          id?: number;
          result?: unknown;
          error?: { message: string };
          method?: string;
          params?: Record<string, unknown>;
          sessionId?: string;
        };

        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
          return;
        }

        if (msg.method === 'Target.attachedToTarget') {
          void this.handleTargetAttached(msg.params || {});
          return;
        }

        if (msg.method === 'Target.detachedFromTarget') {
          const sessionId = msg.params?.sessionId as string | undefined;
          if (sessionId) this.attachedSessions.delete(sessionId);
          return;
        }

        const sessionId = msg.sessionId;

        if (msg.method === 'Network.responseReceived') {
          void this.handleResponseReceived(msg.params || {}, sessionId);
        }
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      this.attachedSessions.clear();
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.running) {
        this.logger.warn('[CDP] Conexão perdida — tentando reconectar...');
        this.scheduleReconnect(2000);
      }
    };

    ws.onerror = () => {
      if (!this.connected) {
        reject(new Error('CDP WebSocket error'));
      }
    };
  }

  private async handleTargetAttached(params: Record<string, unknown>): Promise<void> {
    const sessionId = params.sessionId as string | undefined;
    const targetInfo = params.targetInfo as { targetId?: string; url?: string; type?: string } | undefined;
    if (!sessionId || !targetInfo?.url) return;

    const url = targetInfo.url;
    const type = targetInfo.type || 'page';
    if (!this.isGestorTarget(url, type)) return;

    this.attachedSessions.set(sessionId, {
      sessionId,
      targetId: targetInfo.targetId || '',
      url,
    });

    try {
      await this.send('Network.enable', {}, sessionId);
      await this.send('Runtime.enable', {}, sessionId);
      await this.injectNetworkHooks(sessionId);

      this.logger.debug('[CDP] Target anexado', { url: url.slice(0, 80), sessionId });
    } catch (err) {
      this.logger.debug('[CDP] Falha ao configurar target', {
        url: url.slice(0, 60),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async attachAndSetupTarget(targetId: string, url: string): Promise<void> {
    try {
      const result = (await this.send('Target.attachToTarget', {
        targetId,
        flatten: true,
      })) as { sessionId?: string };

      if (result?.sessionId) {
        this.attachedSessions.set(result.sessionId, {
          sessionId: result.sessionId,
          targetId,
          url,
        });
        await this.send('Network.enable', {}, result.sessionId);
        await this.send('Runtime.enable', {}, result.sessionId);
        await this.injectNetworkHooks(result.sessionId);
      }
    } catch {
      // fallback: autoAttach will pick up targets
    }
  }

  private startPayloadPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      void this.pollInjectedPayload();
    }, 2000);
  }

  private async pollInjectedPayload(): Promise<void> {
    if (!this.connected) return;

    const sessions = [...this.attachedSessions.values()];
    if (sessions.length === 0) {
      await this.pollSessionPayload(undefined);
      return;
    }

    for (const session of sessions) {
      await this.pollSessionPayload(session.sessionId);
    }
  }

  private async pollSessionPayload(sessionId?: string): Promise<void> {
    try {
      const result = (await this.send(
        'Runtime.evaluate',
        {
          expression: 'window.__ifoodQrLastPayload || null',
          returnByValue: true,
        },
        sessionId,
      )) as { result?: { value?: LastPayload | null } };

      const payload = result?.result?.value;
      if (!payload?.data || !payload.url) return;
      if (payload.at <= this.lastPayloadAt) return;

      this.lastPayloadAt = payload.at;
      this.ingestFromCdp(payload.data, payload.url, 'fetch-hook');
    } catch {
      // session may be gone
    }
  }

  private send(
    method: string,
    params: Record<string, unknown>,
    sessionId?: string,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('CDP not connected'));
        return;
      }
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      const message: Record<string, unknown> = { id, method, params };
      if (sessionId) message.sessionId = sessionId;
      this.ws.send(JSON.stringify(message));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 15000);
    });
  }

  private async injectNetworkHooks(sessionId?: string): Promise<void> {
    const pattern = this.config.ingestUrlPattern;
    const script = `
      (function() {
        if (window.__ifoodQrHooked) return;
        window.__ifoodQrHooked = true;
        const re = new RegExp(${JSON.stringify(pattern)}, 'i');

        function capture(url, data) {
          if (!re.test(url) || !data) return;
          window.__ifoodQrLastPayload = { url, data, at: Date.now() };
        }

        const origFetch = window.fetch;
        window.fetch = async function(...args) {
          const res = await origFetch.apply(this, args);
          try {
            const url = String(args[0]?.url || args[0] || '');
            if (re.test(url)) {
              res.clone().json().then(d => capture(url, d)).catch(() => {});
            }
          } catch(e) {}
          return res;
        };

        const origOpen = XMLHttpRequest.prototype.open;
        const origSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this.__ifoodQrUrl = String(url || '');
          return origOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function(...args) {
          const url = this.__ifoodQrUrl || '';
          this.addEventListener('load', function() {
            if (!re.test(this.__ifoodQrUrl || '')) return;
            try { capture(this.__ifoodQrUrl, JSON.parse(this.responseText)); } catch(e) {}
          });
          return origSend.apply(this, args);
        };
      })();
    `;
    await this.send('Runtime.evaluate', { expression: script }, sessionId);
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: script }, sessionId);
  }

  private async handleResponseReceived(
    params: Record<string, unknown>,
    sessionId?: string,
  ): Promise<void> {
    const response = params.response as { url?: string } | undefined;
    const requestId = params.requestId as string | undefined;
    const url = response?.url || '';
    if (!requestId || !shouldIngestUrl(url, this.config.ingestUrlPattern)) return;

    try {
      const bodyResult = (await this.send(
        'Network.getResponseBody',
        { requestId },
        sessionId,
      )) as {
        body?: string;
        base64Encoded?: boolean;
      };
      if (!bodyResult?.body) return;

      let text = bodyResult.body;
      if (bodyResult.base64Encoded) {
        text = Buffer.from(bodyResult.body, 'base64').toString('utf-8');
      }

      const parsed = JSON.parse(text);
      this.ingestFromCdp(parsed, url, 'network');
    } catch {
      // non-json or body not available yet
    }
  }

  private ingestFromCdp(parsed: unknown, url: string, via: string): void {
    const captured = this.cache.ingestPayload(parsed);
    if (captured.length === 0) return;
    if (!this.deduper.shouldIngest(captured)) return;

    this.activity.ordersIngested(captured, 'cdp', url);
    this.logger.info(`[CDP] Pedido capturado (${via})`, {
      url: url.length > 100 ? url.slice(0, 100) + '...' : url,
      count: captured.length,
      displayId: captured[0]?.displayId,
    });
  }
}
