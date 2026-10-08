export type BackendDiagnosticEvent =
  | { level: 'info'; event: 'server.started'; port: number }
  | { level: 'info'; event: 'server.shutdown'; signal: string }
  | { level: 'info'; event: 'session.issued'; renewed: boolean }
  | { level: 'warn'; event: 'session.rejected' }
  | { level: 'error'; event: 'redis.error'; client: 'commands' | 'subscriber' }
  | { level: 'info'; event: 'socket.connected'; openSockets: number }
  | { level: 'info'; event: 'socket.authenticated'; openSockets: number }
  | { level: 'warn'; event: 'socket.rejected'; code: 'authentication' | 'invalid_message' | 'protocol_version' }
  | { level: 'info'; event: 'socket.closed'; code: number; authenticated: boolean; openSockets: number }
  | { level: 'info'; event: 'command.completed'; action: string; durationMs: number; outcome: 'success' | 'failure' }
  | { level: 'info'; event: 'broadcast.completed'; durationMs: number; recipients: number }
  | { level: 'error'; event: 'broadcast.failed'; durationMs: number }
  | { level: 'error'; event: 'clock.expiration_failed' }
  | { level: 'error'; event: 'pack.recovery_delayed' | 'pack.recovery_failed' }
  | { level: 'info'; event: 'push.enabled' | 'push.disabled' | 'push.registered' | 'push.unregistered' }
  | { level: 'warn'; event: 'push.registration_rejected'; status: number }
  | { level: 'info' | 'error'; event: 'push.completed' | 'push.failed'; recipients: number }
  | { level: 'error'; event: 'push.configuration_invalid' };

type DiagnosticWriter = (line: string) => void;

export function createBackendDiagnostics(writer: DiagnosticWriter = line => console.log(line)) {
  return (diagnostic: BackendDiagnosticEvent) => {
    writer(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'backend',
      ...diagnostic,
    }));
  };
}
