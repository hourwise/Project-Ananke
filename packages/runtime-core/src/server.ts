import { Gateway } from './index.js';

function configuredPort(): number {
  const value = process.env.ANANKE_PORT ?? '3000';
  if (!/^\d+$/.test(value)) throw new Error('ANANKE_PORT must be a valid TCP port number');
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('ANANKE_PORT must be between 1 and 65535');
  }
  return port;
}

// Development credentials are opt-in. Without them the gateway starts for
// inspection but denies governed execution until an authenticator is supplied
// by an embedding application.
new Gateway({
  port: configuredPort(),
  developmentMode: process.env.ANANKE_DEVELOPMENT_MODE === 'true',
}).start();
