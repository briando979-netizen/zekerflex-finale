import net from "node:net";
import tls from "node:tls";

// ---------------------------------------------------------------------------
// Minimal SMTP client - zero dependencies, same spirit as the from-scratch
// Web Push implementation. Speaks enough SMTP to deliver a single message:
// EHLO, optional STARTTLS, AUTH (LOGIN / PLAIN), MAIL FROM, RCPT TO, DATA.
//
// Works against any SMTP server the box can reach: a local catcher (Mailpit /
// MailHog on :1025), a self-hosted Postfix, or an external relay. Nothing here
// touches the database, Redis, sessions or the audit trail.
// ---------------------------------------------------------------------------

const NUL = String.fromCharCode(0);
const CRLF = "\r\n";

export interface SmtpConfig {
  host: string;
  port: number;
  /** implicit TLS (usually port 465). STARTTLS is auto-negotiated otherwise. */
  secure: boolean;
  user?: string;
  pass?: string;
  /** seconds */
  timeout?: number;
  /** EHLO hostname */
  clientName?: string;
}

export interface SmtpEnvelope {
  from: string; // bare address
  to: string[]; // bare addresses
  /** full RFC 822 message (headers + blank line + body) */
  raw: string;
}

class SmtpError extends Error {}

function readReply(
  sock: net.Socket | tls.TLSSocket,
  timeoutMs: number,
): Promise<{ code: number; lines: string[] }> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const onData = (d: Buffer) => {
      buf += d.toString("utf8");
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve({ code: Number(last.slice(0, 3)), lines });
      }
    };
    const onErr = (e: Error) => {
      cleanup();
      reject(e);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new SmtpError("SMTP read timeout"));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      sock.off("data", onData);
      sock.off("error", onErr);
    }
    sock.on("data", onData);
    sock.on("error", onErr);
  });
}

async function cmd(
  sock: net.Socket | tls.TLSSocket,
  line: string,
  expect: number[],
  timeoutMs: number,
): Promise<{ code: number; lines: string[] }> {
  sock.write(line + CRLF);
  const reply = await readReply(sock, timeoutMs);
  if (!expect.includes(reply.code)) {
    throw new SmtpError(`SMTP: "${line.split(" ")[0]}" -> ${reply.lines.join(" | ")}`);
  }
  return reply;
}

export async function sendViaSmtp(cfg: SmtpConfig, envelope: SmtpEnvelope): Promise<void> {
  const timeoutMs = (cfg.timeout ?? 20) * 1000;
  const clientName = cfg.clientName || "zekerflex.com";

  const connect = (): Promise<net.Socket | tls.TLSSocket> =>
    new Promise((resolve, reject) => {
      const s = cfg.secure
        ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: false })
        : net.connect({ host: cfg.host, port: cfg.port });
      const t = setTimeout(() => {
        s.destroy();
        reject(new SmtpError(`SMTP connect timeout (${cfg.host}:${cfg.port})`));
      }, timeoutMs);
      s.once(cfg.secure ? "secureConnect" : "connect", () => {
        clearTimeout(t);
        resolve(s);
      });
      s.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });

  let sock = await connect();
  try {
    const greeting = await readReply(sock, timeoutMs);
    if (greeting.code !== 220) throw new SmtpError(`SMTP greeting: ${greeting.lines.join(" ")}`);

    let ehlo = await cmd(sock, `EHLO ${clientName}`, [250], timeoutMs);
    let caps = ehlo.lines.join(" ").toUpperCase();

    if (!cfg.secure && caps.includes("STARTTLS")) {
      await cmd(sock, "STARTTLS", [220], timeoutMs);
      sock = await new Promise<tls.TLSSocket>((resolve, reject) => {
        const upgraded = tls.connect(
          { socket: sock as net.Socket, servername: cfg.host, rejectUnauthorized: false },
          () => resolve(upgraded),
        );
        upgraded.once("error", reject);
      });
      ehlo = await cmd(sock, `EHLO ${clientName}`, [250], timeoutMs);
      caps = ehlo.lines.join(" ").toUpperCase();
    }

    if (cfg.user && cfg.pass) {
      if (caps.includes("AUTH") && caps.includes("PLAIN")) {
        const token = Buffer.from(NUL + cfg.user + NUL + cfg.pass, "utf8").toString("base64");
        await cmd(sock, `AUTH PLAIN ${token}`, [235], timeoutMs);
      } else if (caps.includes("AUTH")) {
        await cmd(sock, "AUTH LOGIN", [334], timeoutMs);
        await cmd(sock, Buffer.from(cfg.user, "utf8").toString("base64"), [334], timeoutMs);
        await cmd(sock, Buffer.from(cfg.pass, "utf8").toString("base64"), [235], timeoutMs);
      }
    }

    await cmd(sock, `MAIL FROM:<${envelope.from}>`, [250], timeoutMs);
    for (const rcpt of envelope.to) {
      await cmd(sock, `RCPT TO:<${rcpt}>`, [250, 251], timeoutMs);
    }
    await cmd(sock, "DATA", [354], timeoutMs);

    const body = envelope.raw.replace(/\r?\n/g, CRLF).replace(/\r\n\./g, `${CRLF}..`);
    sock.write(body);
    if (!body.endsWith(CRLF)) sock.write(CRLF);
    sock.write(`.${CRLF}`);
    const done = await readReply(sock, timeoutMs);
    if (done.code !== 250) throw new SmtpError(`SMTP DATA rejected: ${done.lines.join(" ")}`);

    try {
      await cmd(sock, "QUIT", [221], 5000);
    } catch {
      /* server hung up after 250 — the message is already accepted */
    }
  } finally {
    sock.destroy();
  }
}
