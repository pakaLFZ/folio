/**
 * The held port: listen on the first free port of the band (on `127.0.0.1`
 * and `::1` both for loopback) and pass every request through to the app
 * behind it. The listeners and the browsers' connections stay open while the
 * app is swapped; a request that arrives while no app is ready waits instead
 * of being refused
 * (`spec/live/server-and-addresses.md`).
 */
import { Agent, createServer, request, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PORT_BAND } from "./server.js";

export interface PortHolder {
  port: number;
  hosts: string[];
  /** Pass new requests to the app on this loopback port; null holds them. */
  setTarget(port: number | null): void;
  /** Add a fresh loopback address for a new VS Code tunnel. */
  freshForwardPort(): Promise<number>;
  close(): Promise<void>;
}

interface Target {
  port: number;
  agent: Agent;
}

const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade"]);
const endToEnd = (headers: IncomingHttpHeaders) => Object.fromEntries(Object.entries(headers).filter(([name]) => !HOP_BY_HOP.has(name)));

/** Pass one request to the app and its answer back; a 502 when the app does not answer. */
function forward(req: IncomingMessage, res: ServerResponse, target: Target): void {
  const options = { host: "127.0.0.1", port: target.port, method: req.method, path: req.url, headers: endToEnd(req.headers), agent: target.agent };
  const upstream = request(options, (answer) => {
    res.writeHead(answer.statusCode ?? 502, endToEnd(answer.headers)).flushHeaders();
    answer.pipe(res);
  });
  upstream.on("error", (error) => {
    if (res.headersSent) return void res.destroy();
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" }).end(`folio: the app behind this port did not answer: ${error.message}\n`);
  });
  res.on("close", () => res.writableFinished || upstream.destroy());
  req.pipe(upstream);
}

/** Listen on one address; the error code when it cannot. */
function listenOn(server: Server, port: number, host: string): Promise<string | null> {
  return new Promise((resolve) => {
    const failed = (error: NodeJS.ErrnoException) => resolve(error.code ?? "EUNKNOWN");
    server.once("error", failed);
    server.listen({ port, host }, () => (server.off("error", failed), resolve(null)));
  });
}

const closeServer = (server: Server) => new Promise<void>((resolve) => (server.listening ? server.close(() => resolve()) : resolve()));

/**
 * Bind the same port on the main host and, for loopback, `::1`.
 *
 * @returns the listening servers, or null when the port is taken on either.
 */
async function bindPort(make: () => Server, port: number, host: string): Promise<{ servers: Server[]; port: number } | null> {
  const main = make();
  if (await listenOn(main, port, host)) return null;
  const bound = (main.address() as { port: number }).port;
  if (host !== "127.0.0.1") return { servers: [main], port: bound };
  const six = make();
  const refused = await listenOn(six, bound, "::1");
  if (refused === "EADDRINUSE") return (await closeServer(main), null);
  return { servers: refused ? [main] : [main, six], port: bound };
}

/**
 * Hold the first free port of the band and pass requests to a target.
 *
 * @param host - the bind address; `127.0.0.1` also binds `::1` where it exists.
 * @param first - the first port of the band; 0 lets the system pick.
 * @returns the holder. Throws when every port of the band is taken.
 */
export async function holdPort(host: string, first: number): Promise<PortHolder> {
  let target: Target | null = null;
  const waiting: Array<() => void> = [];
  const make = () => {
    const server = createServer((req, res) => (target ? forward(req, res, target) : waiting.push(() => forward(req, res, target!))));
    server.keepAliveTimeout = 65_000;
    return server;
  };
  for (let i = 0; i < PORT_BAND; i += 1) {
    const got = await bindPort(make, first === 0 ? 0 : first + i, host);
    if (!got) continue;
    const servers = [...got.servers];
    return {
      port: got.port,
      hosts: got.servers.map((s) => (s.address() as { address: string }).address),
      setTarget: (port) => {
        target = port === null ? null : { port, agent: new Agent({ keepAlive: true }) };
        if (target) for (const pass of waiting.splice(0)) pass();
      },
      freshForwardPort: async () => {
        const bridge = make();
        const failed = await listenOn(bridge, 0, "127.0.0.1");
        if (failed) throw new Error(`cannot bind a fresh forward port: ${failed}`);
        servers.push(bridge);
        return (bridge.address() as { port: number }).port;
      },
      close: async () => {
        const closing = servers.map(closeServer);
        for (const server of servers) server.closeAllConnections();
        await Promise.all(closing);
      },
    };
  }
  throw new Error(first === 0 ? `no free port on ${host}` : `ports ${first} to ${first + PORT_BAND - 1} are all in use on ${host}`);
}
