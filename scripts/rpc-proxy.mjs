import net from 'node:net';

const listenHost = process.env.RPC_PROXY_HOST ?? '0.0.0.0';
const listenPort = Number(process.env.RPC_PROXY_PORT ?? '8547');
const targetHost = process.env.RPC_TARGET_HOST ?? '127.0.0.1';
const targetPort = Number(process.env.RPC_TARGET_PORT ?? '8545');

const server = net.createServer((clientSocket) => {
  const upstreamSocket = net.createConnection({
    host: targetHost,
    port: targetPort,
  });

  clientSocket.pipe(upstreamSocket);
  upstreamSocket.pipe(clientSocket);

  const destroyBoth = () => {
    clientSocket.destroy();
    upstreamSocket.destroy();
  };

  clientSocket.on('error', destroyBoth);
  upstreamSocket.on('error', destroyBoth);
  clientSocket.on('close', () => upstreamSocket.end());
  upstreamSocket.on('close', () => clientSocket.end());
});

server.on('error', (error) => {
  console.error(`RPC proxy error: ${error.message}`);
  process.exitCode = 1;
});

server.listen(listenPort, listenHost, () => {
  console.log(`RPC proxy listening on ${listenHost}:${listenPort} -> ${targetHost}:${targetPort}`);
});
