import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import TicketDetailPageClient from './TicketDetailPageClient';

const INTERNAL_API_URL =
  process.env.INTERNAL_API_URL ?? 'http://localhost:4000/api/v1';

interface Props {
  params: { projectId: string; ticketNum: string };
}

export default async function TicketDetailPage({ params }: Props) {
  const { projectId, ticketNum } = params;

  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('trakk_session');

  if (!sessionCookie) {
    redirect('/login');
  }

  // INTERNAL_API_URL already ends in /api/v1 (see the dashboard layout).
  const res = await fetch(
    `${INTERNAL_API_URL}/projects/${projectId}`,
    {
      headers: { Cookie: `trakk_session=${sessionCookie.value}` },
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    redirect(`/projects/${projectId}`);
  }

  const { project } = await res.json();

  return (
    <TicketDetailPageClient
      projectId={projectId}
      projectKey={project.key}
      ticketNumber={Number(ticketNum)}
    />
  );
}
