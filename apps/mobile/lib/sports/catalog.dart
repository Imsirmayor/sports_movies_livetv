import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/errors.dart';
import 'html_client.dart';
import 'listing.dart';
import 'sites_config.dart';

export 'listing.dart';

final htmlClientProvider = Provider<HtmlClient>((ref) => HtmlClient());

final sportsCatalogProvider = FutureProvider<SportsCatalog>((ref) async {
  final client = ref.watch(htmlClientProvider);
  return fetchSportsCatalog(getText: client.getText);
});

Future<SportsCatalog> fetchSportsCatalog({required HtmlGet getText}) async {
  final sites = parseSitesConfig(
    sportsSitesJson,
  ).where((site) => site.enabled).toList();
  if (sites.isEmpty) {
    throw SportsScrapeException('The sports sites JSON has no enabled sites.');
  }

  final hits = <ListedEvent>[];
  final failures = <String>[];
  final jobs = <Future<void> Function()>[];

  for (final site in sites) {
    for (final listUrl in site.listUrls) {
      jobs.add(() async {
        try {
          final html = await getText(
            listUrl,
            headers: {'Referer': site.referer},
          );
          final page = Uri.parse(listUrl);
          hits.addAll(parseListingHtml(html: html, pageUrl: page, site: site));
        } catch (e) {
          failures.add(
            e is SportsScrapeException ? e.message : 'Could not fetch $listUrl',
          );
        }
      });
    }
  }

  await _runPool(4, jobs);
  if (hits.isEmpty && failures.isNotEmpty) {
    throw SportsScrapeException(failures.first);
  }
  return SportsCatalog.group(hits);
}

Future<void> _runPool(int limit, List<Future<void> Function()> jobs) async {
  if (jobs.isEmpty) return;
  var next = 0;
  Future<void> worker() async {
    while (true) {
      final index = next;
      next += 1;
      if (index >= jobs.length) return;
      await jobs[index]();
    }
  }

  final workers = jobs.length < limit ? jobs.length : limit;
  await Future.wait(List.generate(workers, (_) => worker()));
}
