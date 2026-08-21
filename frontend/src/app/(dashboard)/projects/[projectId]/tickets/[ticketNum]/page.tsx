import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import TicketDetailPageClient from './TicketDetailPageClient';

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

  const res = await fetch(
    `${process.env.INTERNAL_API_URL}/api/v1/projects/${projectId}`,
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
