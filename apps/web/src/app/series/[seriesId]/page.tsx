import { SeriesDetail } from "@/components/SeriesDetail";

type Props = { params: Promise<{ seriesId: string }> };

export default async function SeriesDetailRoute({ params }: Props) {
  const { seriesId } = await params;
  return <SeriesDetail imdbId={decodeURIComponent(seriesId)} />;
}
