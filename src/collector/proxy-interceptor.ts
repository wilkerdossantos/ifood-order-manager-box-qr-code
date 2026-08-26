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

      this.server.listen(this.options.config.proxyPort, '127.0.0.1', () => {
        this.options.logger.info('HTTP(S) proxy listening', {
          port: this.options.config.proxyPort,
        });
        resolve();
      });

      this.server.on('error', reject);
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
    const [hostname, portStr] = (req.url || '').split(':');
    const port = parseInt(portStr || '443', 10);

    if (!hostname || !this.shouldProxyHost(hostname)) {
      this.tunnelDirect(hostname, port, clientSocket, head);
      return;
    }

    const { cert, key } = this.createHostCertificate(hostname);

    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');

    const tlsServer = tls.createServer({ cert, key }, (tlsSocket) => {
      this.handleTlsClient(tlsSocket, hostname, port);
    });

    tlsServer.on('error', () => clientSocket.destroy());
    tlsServer.emit('connection', clientSocket);
  }

  private tunnelDirect(
    hostname: string,
    port: number,
    clientSocket: net.Socket,
    head: Buffer,
  ): void {
    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });
    serverSocket.on('error', () => clientSocket.end());
  }

  private handleTlsClient(tlsSocket: tls.TLSSocket, hostname: string, port: number): void {
    let pending: Buffer = Buffer.alloc(0);

    tlsSocket.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]) as Buffer;
      this.processPendingRequests(tlsSocket, pending, hostname, port, (remaining) => {
        pending = remaining;
      });
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
    const [method, reqPath] = lines[0].split(' ');
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
        res.on('end', () => {
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

          clientSocket.write(`${statusLine}${resHeaders}\r\n\r\n`);
          clientSocket.write(responseBody);
        });
      },
    );

    req.on('error', () => clientSocket.end());
    if (body.length > 0) req.write(body);
    req.end();
  }
}
