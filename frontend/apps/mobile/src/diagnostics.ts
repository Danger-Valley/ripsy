import type { ClientDiagnosticEvent } from '@rps/game-client/socket';

export function reportClientDiagnostic(event: ClientDiagnosticEvent) {
  console.info(JSON.stringify(event));
}
