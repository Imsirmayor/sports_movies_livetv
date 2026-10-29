import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../shared/widgets.dart';

class LibraryScreen extends ConsumerWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(myListProvider);
    final continueWatching = ref.watch(continueWatchingProvider);

    return Scaffold(
      appBar: const PulseAppBar(),
      body: RefreshIndicator(
        color: AppColors.accent,
        onRefresh: () async {
          ref.read(myListProvider.notifier).refresh();
          ref.read(continueWatchingProvider.notifier).refresh();
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(
                'My List',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w900,
                    ),
              ),
            ),
            const SectionHeader(
              title: 'Saved on this device',
              subtitle: 'Bookmarks stay on this phone — no cloud account yet.',
            ),
            if (list.isEmpty)
              const StateMessage(
                title: 'My List is empty',
                message: 'Tap the bookmark on movie posters to save titles.',
                icon: Icons.bookmark_border,
              )
            else
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: list.length,
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 3,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.52,
                  ),
                  itemBuilder: (context, i) {
                    final item = list[i];
                    final id = item['id']?.toString() ?? '';
                    final title = item['title']?.toString() ?? 'Title';
                    final route = item['route']?.toString() ?? '/';
                    final poster = item['poster'] as String?;
                    final type = item['type']?.toString() ?? '';
                    return PosterCard(
                      title: title,
                      subtitle: type,
                      posterUrl: poster,
                      width: double.infinity,
                      height: 150,
                      showBookmark: true,
                      onBookmark: () {
                        ref.read(myListProvider.notifier).toggle(
                              id: id,
                              title: title,
                              type: type,
                              poster: poster,
                              route: route,
                            );
                      },
                      onTap: () => context.push(route),
                    );
                  },
                ),
              ),
            if (continueWatching.isNotEmpty) ...[
              const SectionHeader(title: 'Continue Watching'),
              ...continueWatching.map((e) {
                return Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Material(
                    color: AppColors.bgPanel,
                    borderRadius: BorderRadius.circular(AppRadii.card),
                    child: ListTile(
                      leading: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: SizedBox(
                          width: 56,
                          height: 56,
                          child: e.poster == null
                              ? Container(color: AppColors.bgElevated)
                              : CachedNetworkImage(
                                  imageUrl: e.poster!,
                                  fit: BoxFit.cover,
                                ),
                        ),
                      ),
                      title: Text(
                        e.title,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      subtitle: Text(
                        '${(e.position / 60).floor()}m watched',
                        style: const TextStyle(color: AppColors.textMuted),
                      ),
                      trailing: const CircleAvatar(
                        backgroundColor: AppColors.accent,
                        radius: 16,
                        child: Icon(Icons.play_arrow, color: Colors.white, size: 18),
                      ),
                      onTap: () => context.push(e.route),
                    ),
                  ),
                );
              }),
            ],
          ],
        ),
      ),
    );
  }
}
