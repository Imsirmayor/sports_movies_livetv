import { MovieDetail } from "@/components/MovieDetail";

type Props = { params: Promise<{ movieId: string }> };

export default async function MovieRoute({ params }: Props) {
  const { movieId } = await params;
  return <MovieDetail movieId={decodeURIComponent(movieId)} />;
}
