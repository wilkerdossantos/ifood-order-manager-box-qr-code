import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';

import forge from 'node-forge';

import type { ServiceConfig } from '../config/types.js';
import { shouldIngestUrl } from '../utils/strings.js';
import type { Logger } from '../utils/logger.js';
import type { ActivityLog } from '../utils/activity-log.js';
import type { OrderCache } from './order-cache.js';

interface ProxyInterceptorOptions {
  config: ServiceConfig;
  cache: OrderCache;
  logger: Logger;
  activity: ActivityLog;
  certDir: string;
}

/** Prevents ECONNRESET / EPIPE from crashing the process as unhandled socket errors. */
function guardSocket(socket: net.Socket, logger: Logger, label: string): void {
  if ((socket as net.Socket & { __ifoodQrGuarded?: boolean }).__ifoodQrGuarded) return;
  (socket as net.Socket & { __ifoodQrGuarded?: boolean }).__ifoodQrGuarded = true;

  socket.on('error', (err: NodeJS.ErrnoException) => {
    const benign = err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ECANCELED';
    if (benign) {
      logger.debug('[PROXY] Conexão encerrada', { label, code: err.code });
      return;
    }
    logger.debug('[PROXY] Erro de socket', { label, code: err.code, error: err.message });
  });
}

function safeWrite(socket: net.Socket, data: string | Buffer, logger: Logger, label: string): void {
  if (socket.destroyed || !socket.writable) return;
  try {
    socket.write(data);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    logger.debug('[PROXY] Falha ao escrever na conexão', { label, code });
  }
}

function safeEnd(socket: net.Socket): void {
  if (socket.destroyed) return;
  try {
    socket.end();
  } catch {
    // ignore
  }
}

function safeDestroy(socket: net.Socket): void {
  if (socket.destroyed) return;
  try {
    socket.destroy();
  } catch {
    // ignore
  }
}

export class ProxyInterceptor {
  private server: http.Server | null = null;
  private caCertPath: string;
  private caKeyPath: string;

  constructor(private options: ProxyInterceptorOptions) {
    this.caCertPath = path.join(options.certDir, 'ca-cert.pem');
    this.caKeyPath = path.join(options.certDir, 'ca-key.pem');
  }

  getCaCertPath(): string {
    return this.caCertPath;
  }

  ensureCertificates(): void {
    fs.mkdirSync(this.options.certDir, { recursive: true });
    if (fs.existsSync(this.caCertPath) && fs.existsSync(this.caKeyPath)) return;

    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

    const attrs = [
      { name: 'commonName', value: 'iFood QR Service CA' },
      { name: 'organizationName', value: 'iFood QR Service' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true },
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    fs.writeFileSync(this.caCertPath, forge.pki.certificateToPem(cert));
    fs.writeFileSync(this.caKeyPath, forge.pki.privateKeyToPem(keys.privateKey));
    this.options.logger.info('CA certificate generated', { path: this.caCertPath });
  }

  start(): Promise<void> {
    this.ensureCertificates();

    return new Promise((resolve, reject) => {
      this.server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('iFood QR Service Proxy');
      });

      this.server.on('connect', (req, clientSocket, head) => {
        this.handleConnect(req, clientSocket as net.Socket, head);
      });

      this.server.once('error', reject);

      this.server.listen(this.options.config.proxyPort, '127.0.0.1', () => {
        this.server?.off('error', reject);
        this.server?.on('error', (err) => {
          this.options.logger.warn('[PROXY] Erro no servidor HTTP', { error: err.message });
        });
        this.options.logger.info('HTTP(S) proxy listening', {
          port: this.options.config.proxyPort,
        });
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
    });
  }

  private shouldProxyHost(hostname: string): boolean {
    return this.options.config.proxyHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  }

  private getCaMaterials(): { caCert: forge.pki.Certificate; caKey: forge.pki.PrivateKey } {
    const caCert = forge.pki.certificateFromPem(fs.readFileSync(this.caCertPath, 'utf-8'));
    const caKey = forge.pki.privateKeyFromPem(fs.readFileSync(this.caKeyPath, 'utf-8'));
    return { caCert, caKey };
  }

  private createHostCertificate(hostname: string): { cert: string; key: string } {
    const { caCert, caKey } = this.getCaMaterials();
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = Date.now().toString(16);
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    cert.setSubject([{ name: 'commonName', value: hostname }]);
    cert.setIssuer(caCert.subject.attributes);
    cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 2, value: hostname }] }]);
    cert.sign(caKey as forge.pki.rsa.PrivateKey, forge.md.sha256.create());

    return {
      cert: forge.pki.certificateToPem(cert),
      key: forge.pki.privateKeyToPem(keys.privateKey),
    };
  }

  private handleConnect(
    req: http.IncomingMessage,
    clientSocket: net.Socket,
    head: Buffer,
  ): void {
    guardSocket(clientSocket, this.options.logger, 'client-connect');

    const [hostname, portStr] = (req.url || '').split(':');
    const port = parseInt(portStr || '443', 10);

    const useMitm =
      this.options.config.mitmEnabled &&
      hostname &&
      this.shouldProxyHost(hostname);

    if (!useMitm) {
      this.tunnelDirect(hostname, port, clientSocket, head);
      return;
    }

    this.handleConnectMitm(hostname, port, clientSocket);
  }

  /**
   * MITM HTTPS — só use com mitmEnabled=true e certificado CA instalado.
   * Pode falhar com Electron; prefira electron-store watcher no Gestor Desktop.
   */
  private handleConnectMitm(hostname: string, port: number, clientSocket: net.Socket): void {
    try {
      const { cert, key } = this.createHostCertificate(hostname);

      safeWrite(
        clientSocket,
        'HTTP/1.1 200 Connection Established\r\n\r\n',
        this.options.logger,
        'connect-response',
      );

      const tlsSocket = new tls.TLSSocket(clientSocket, {
        isServer: true,
        cert,
        key,
        rejectUnauthorized: false,
      });

      guardSocket(tlsSocket, this.options.logger, 'tls-client');
      tlsSocket.on('secure', () => {
        this.handleTlsClient(tlsSocket, hostname, port);
      });
      tlsSocket.on('error', (err) => {
        this.options.logger.debug('[PROXY] MITM TLS error, falling back to tunnel', {
          hostname,
          error: err.message,
        });
        safeDestroy(clientSocket);
      });
    } catch (err) {
      this.options.logger.debug('[PROXY] MITM failed, using direct tunnel', {
        hostname,
        error: err instanceof Error ? err.message : String(err),
      });
      this.tunnelDirect(hostname, port, clientSocket, Buffer.alloc(0));
    }
  }

  private tunnelDirect(
    hostname: string,
    port: number,
    clientSocket: net.Socket,
    head: Buffer,
  ): void {
    if (!hostname) {
      safeDestroy(clientSocket);
      return;
    }

    const serverSocket = net.connect(port, hostname, () => {
      safeWrite(
        clientSocket,
        'HTTP/1.1 200 Connection Established\r\n\r\n',
        this.options.logger,
        'tunnel-response',
      );
      if (head.length > 0) serverSocket.write(head);

      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    guardSocket(serverSocket, this.options.logger, 'tunnel-server');

    serverSocket.on('error', () => safeEnd(clientSocket));
    clientSocket.on('close', () => safeDestroy(serverSocket));
    serverSocket.on('close', () => safeDestroy(clientSocket));
  }

  private handleTlsClient(tlsSocket: tls.TLSSocket, hostname: string, port: number): void {
    let pending: Buffer = Buffer.alloc(0);

    tlsSocket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]) as Buffer;
      this.processPendingRequests(tlsSocket, pending, hostname, port, (remaining) => {
        pending = remaining;
      });
    });

    tlsSocket.on('close', () => {
      pending = Buffer.alloc(0);
    });
  }

  private processPendingRequests(
    clientSocket: net.Socket,
    buffer: Buffer,
    hostname: string,
    port: number,
    setRemaining: (buf: Buffer) => void,
  ): void {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;

    const headerText = buffer.subarray(0, headerEnd).toString('utf-8');
    const body = buffer.subarray(headerEnd + 4);
    const lines = headerText.split('\r\n');
    const requestLine = lines[0] || '';
    const parts = requestLine.split(' ');
    const method = parts[0] || 'GET';
    const reqPath = parts[1] || '/';
    const url = `https://${hostname}${reqPath}`;

    const headers: Record<string, string> = {};
    for (const line of lines.slice(1)) {
      const idx = line.indexOf(':');
      if (idx > 0) headers[line.slice(0, idx).toLowerCase()] = line.slice(idx + 1).trim();
    }

    const contentLength = parseInt(headers['content-length'] || '0', 10);
    let requestBody = body;
    if (body.length < contentLength) {
      setRemaining(buffer);
      return;
    }
    if (contentLength > 0) {
      requestBody = body.subarray(0, contentLength);
      setRemaining(body.subarray(contentLength));
    } else {
      setRemaining(Buffer.alloc(0));
    }

    this.forwardRequest(method, url, headers, requestBody, clientSocket, hostname, port);
  }

  private logProxyTraffic(method: string, url: string): void {
    if (!this.options.config.logProxyTraffic) return;
    if (!shouldIngestUrl(url, this.options.config.ingestUrlPattern)) return;
    this.options.activity.proxyRequest(method, url);
  }

  private forwardRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: Buffer,
    clientSocket: net.Socket,
    hostname: string,
    port: number,
  ): void {
    if (clientSocket.destroyed) return;

    this.logProxyTraffic(method, url);

    if (shouldIngestUrl(url, this.options.config.ingestUrlPattern) && body.length > 0) {
      try {
        const captured = this.options.cache.ingestPayload(JSON.parse(body.toString('utf-8')));
        if (captured.length > 0) {
          this.options.activity.ordersIngested(captured, 'proxy', url);
        }
      } catch {
        // ignore
      }
    }

    const parsed = new URL(url);
    delete headers.host;

    const req = https.request(
      {
        hostname,
        port,
        path: parsed.pathname + parsed.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on('data', (c) => chunks.push(c));
        res.on('error', (err) => {
          this.options.logger.debug('[PROXY] Erro na resposta upstream', {
            url,
            error: err.message,
          });
          safeDestroy(clientSocket);
        });

        res.on('end', () => {
          if (clientSocket.destroyed) return;

          const responseBody = Buffer.concat(chunks);

          if (shouldIngestUrl(url, this.options.config.ingestUrlPattern)) {
            try {
              const captured = this.options.cache.ingestPayload(
                JSON.parse(responseBody.toString('utf-8')),
              );
              if (captured.length > 0) {
                this.options.activity.ordersIngested(captured, 'proxy', url);
              }
            } catch {
              // ignore
            }
          }

          const statusLine = `HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n`;
          const resHeaders = Object.entries(res.headers)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\r\n');

          safeWrite(
            clientSocket,
            `${statusLine}${resHeaders}\r\n\r\n`,
            this.options.logger,
            'response-headers',
          );
          safeWrite(clientSocket, responseBody, this.options.logger, 'response-body');
        });
      },
    );

    req.on('error', (err) => {
      this.options.logger.debug('[PROXY] Erro na requisição upstream', {
        url,
        error: err.message,
      });
      safeEnd(clientSocket);
    });

    if (body.length > 0) req.write(body);
    req.end();
  }
}
