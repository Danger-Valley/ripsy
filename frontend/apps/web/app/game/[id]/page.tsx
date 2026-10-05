import { notFound } from 'next/navigation';
import { normalizeRoomCode } from '@rps/core/invitations';
import GameContent from './game-content';
import { InviteLanding } from './invite-landing';
import { getInviteInstallLinks } from '../../invite-install-links';

export default async function GamePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string; stay?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!/^[a-f0-9]{8}$/i.test(id)) notFound();
  const code = normalizeRoomCode(id)!;
  // No game/socket hooks mount on the install path: scanning cannot claim a slot.
  return query.invite === '1'
    ? <InviteLanding gameId={code} links={getInviteInstallLinks()} stay={query.stay === '1'} />
    : <GameContent />;
}
