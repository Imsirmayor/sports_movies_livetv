import { CatalogMovieDetail } from "@/components/CatalogMovieDetail";

type Props = { params: Promise<{ imdbId: string }> };

export default async function CatalogMovieRoute({ params }: Props) {
  const { imdbId } = await params;
  return <CatalogMovieDetail imdbId={decodeURIComponent(imdbId)} />;
}
