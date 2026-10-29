import { SportEventDetail } from "@/components/SportEventDetail";

type Props = { params: Promise<{ eventId: string }> };

export default async function SportEventRoute({ params }: Props) {
  const { eventId } = await params;
  return <SportEventDetail eventId={decodeURIComponent(eventId)} />;
}
