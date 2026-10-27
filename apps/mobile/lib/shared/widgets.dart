import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app/theme.dart';

class PulseLogo extends StatelessWidget {
  const PulseLogo({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 26.0 : 30.0;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: Image.asset(
            'assets/brand/pulse-stream-icon.png',
            width: size,
            height: size,
            fit: BoxFit.cover,
            errorBuilder: (context, error, stackTrace) => Container(
              width: size,
              height: size,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(8),
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF4A90E2), Color(0xFF7B61FF)],
                ),
              ),
              child: const Icon(Icons.graphic_eq_rounded, size: 16, color: Colors.white),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text.rich(
          TextSpan(
            children: [
              TextSpan(
                text: 'PULSE ',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: compact ? 15 : 17,
                  color: Colors.white,
                  letterSpacing: 0.2,
                ),
              ),
              TextSpan(
                text: 'STREAM',
                style: TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: compact ? 15 : 17,
                  color: AppColors.accent,
                  letterSpacing: 0.2,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class PulseAppBar extends StatelessWidget implements PreferredSizeWidget {
  const PulseAppBar({
    super.key,
    this.showBack = false,
    this.title,
    this.onSearch,
    this.onProfile,
  });

  final bool showBack;
  final Widget? title;
  final VoidCallback? onSearch;
  final VoidCallback? onProfile;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      leading: showBack
          ? IconButton(
              icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
              onPressed: () => Navigator.of(context).maybePop(),
            )
          : null,
      title: title ?? const PulseLogo(),
      titleSpacing: showBack ? 0 : 16,
      actions: [
        IconButton(
          tooltip: 'Cast',
          onPressed: () {},
          icon: const Icon(Icons.cast_rounded, size: 22),
        ),
        IconButton(
          tooltip: 'Search',
          onPressed: onSearch ?? () => context.push('/search'),
          icon: const Icon(Icons.search_rounded, size: 24),
        ),
        Padding(
          padding: const EdgeInsets.only(right: 12),
          child: GestureDetector(
            onTap: onProfile ?? () => context.push('/settings'),
            child: CircleAvatar(
              radius: 15,
              backgroundColor: AppColors.profile,
              child: const Icon(Icons.person, size: 18, color: Colors.white),
            ),
          ),
        ),
      ],
    );
  }
}

class SectionHeader extends StatelessWidget {
  const SectionHeader({
    super.key,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.leading,
    this.accentBar,
  });

  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final Widget? leading;
  /// Colored vertical bar before the title (Pulse Stream mock).
  final Color? accentBar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 12),
      child: Row(
        children: [
          if (accentBar != null) ...[
            Container(
              width: 4,
              height: subtitle != null ? 36 : 22,
              decoration: BoxDecoration(
                color: accentBar,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(width: 10),
          ],
          if (leading != null) ...[leading!, const SizedBox(width: 8)],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.textMuted,
                        ),
                  ),
              ],
            ),
          ),
          if (actionLabel != null && onAction != null)
            GestureDetector(
              onTap: onAction,
              child: Text(
                actionLabel!,
                style: const TextStyle(
                  color: AppColors.accent,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class StateMessage extends StatelessWidget {
  const StateMessage({
    super.key,
    required this.title,
    this.message,
    this.icon = Icons.info_outline,
    this.action,
    this.tone = StateTone.neutral,
  });

  final String title;
  final String? message;
  final IconData icon;
  final Widget? action;
  final StateTone tone;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      StateTone.error => AppColors.danger,
      StateTone.warn => AppColors.warn,
      StateTone.neutral => AppColors.textMuted,
    };
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: color),
            const SizedBox(height: 12),
            Text(
              title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppColors.textMuted,
                    ),
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: 16),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

enum StateTone { neutral, warn, error }

class LiveBadge extends StatelessWidget {
  const LiveBadge({super.key, this.label = 'LIVE', this.filled = true});

  final String label;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: filled ? AppColors.accent : Colors.black.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(6),
        border: filled ? null : Border.all(color: AppColors.accent),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: filled ? Colors.white : AppColors.accent,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.6,
              color: filled ? Colors.white : AppColors.accent,
            ),
          ),
        ],
      ),
    );
  }
}

class SoftBadge extends StatelessWidget {
  const SoftBadge({
    super.key,
    required this.label,
    this.color = AppColors.bgSubtle,
    this.textColor = Colors.white,
  });

  final String label;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: textColor,
        ),
      ),
    );
  }
}

class PulsePillBar extends StatelessWidget {
  const PulsePillBar({
    super.key,
    required this.labels,
    required this.selectedIndex,
    required this.onSelected,
    this.showLiveDotAt,
  });

  final List<String> labels;
  final int selectedIndex;
  final ValueChanged<int> onSelected;
  final int? showLiveDotAt;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 42,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: labels.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final selected = i == selectedIndex;
          return GestureDetector(
            onTap: () => onSelected(i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: selected ? AppColors.accent : AppColors.bgElevated,
                borderRadius: BorderRadius.circular(AppRadii.control),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (showLiveDotAt == i) ...[
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: selected ? Colors.white : AppColors.accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                  ],
                  Text(
                    labels[i],
                    style: TextStyle(
                      color: selected ? Colors.white : AppColors.textPrimary,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Alias used by older screens.
class FilterChipBar extends PulsePillBar {
  const FilterChipBar({
    super.key,
    required super.labels,
    required super.selectedIndex,
    required super.onSelected,
    super.showLiveDotAt,
  });
}

class PosterCard extends StatelessWidget {
  const PosterCard({
    super.key,
    required this.title,
    this.subtitle,
    this.posterUrl,
    this.badge,
    this.rating,
    this.onTap,
    this.width = 128,
    this.height = 190,
    this.showBookmark = false,
    this.onBookmark,
  });

  final String title;
  final String? subtitle;
  final String? posterUrl;
  final String? badge;
  final String? rating;
  final VoidCallback? onTap;
  final double width;
  final double height;
  final bool showBookmark;
  final VoidCallback? onBookmark;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: width == double.infinity ? null : width,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.sm),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final bounded = constraints.maxHeight.isFinite;
            final textBlock = 8.0 + 36.0 + (subtitle != null ? 16.0 : 0.0);
            final useFlex = bounded && constraints.maxHeight < height + textBlock;

            Widget poster({required double? posterHeight}) {
              return ClipRRect(
                borderRadius: BorderRadius.circular(AppRadii.sm),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ColoredBox(
                      color: AppColors.bgElevated,
                      child: posterUrl == null || posterUrl!.isEmpty
                          ? const Center(
                              child: Icon(
                                Icons.movie,
                                color: AppColors.textMuted,
                              ),
                            )
                          : CachedNetworkImage(
                              imageUrl: posterUrl!,
                              fit: BoxFit.cover,
                              width: double.infinity,
                              height: double.infinity,
                              errorWidget: (context, url, error) => const Center(
                                child: Icon(
                                  Icons.broken_image,
                                  color: AppColors.textMuted,
                                ),
                              ),
                            ),
                    ),
                    if (badge != null)
                      Positioned(
                        top: 8,
                        left: 8,
                        child: SoftBadge(
                          label: badge!,
                          color: AppColors.accent,
                        ),
                      ),
                    if (rating != null)
                      Positioned(
                        top: 8,
                        left: badge == null ? 8 : null,
                        right: badge != null ? 8 : null,
                        child: SoftBadge(
                          label: '★ $rating',
                          color: Colors.black.withValues(alpha: 0.65),
                        ),
                      ),
                    if (showBookmark)
                      Positioned(
                        top: 4,
                        right: 4,
                        child: IconButton(
                          visualDensity: VisualDensity.compact,
                          onPressed: onBookmark,
                          icon: const Icon(Icons.bookmark_border, size: 18),
                        ),
                      ),
                  ],
                ),
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: useFlex ? MainAxisSize.max : MainAxisSize.min,
              children: [
                if (useFlex)
                  Expanded(child: poster(posterHeight: null))
                else
                  SizedBox(
                    width: width == double.infinity ? null : width,
                    height: height,
                    child: poster(posterHeight: height),
                  ),
                const SizedBox(height: 8),
                Text(
                  title,
                  maxLines: useFlex ? 1 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                        height: 1.2,
                      ),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: AppColors.textMuted,
                          fontSize: 11,
                        ),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class HorizontalPosterRow extends StatelessWidget {
  const HorizontalPosterRow({
    super.key,
    required this.children,
    this.height = 268,
  });

  final List<Widget> children;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: children.length,
        separatorBuilder: (context, index) => const SizedBox(width: 12),
        itemBuilder: (context, i) => SizedBox(
          height: height,
          child: children[i],
        ),
      ),
    );
  }
}

class PulsePrimaryButton extends StatelessWidget {
  const PulsePrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon = Icons.play_arrow_rounded,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData icon;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final child = FilledButton.icon(
      onPressed: onPressed,
      icon: Icon(icon),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.accent,
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sm),
        ),
      ),
    );
    return expand ? SizedBox(width: double.infinity, child: child) : child;
  }
}

class PulseGhostButton extends StatelessWidget {
  const PulseGhostButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: onPressed,
      icon: Icon(icon ?? Icons.add, size: 18),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        backgroundColor: Colors.white.withValues(alpha: 0.12),
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sm),
        ),
      ),
    );
  }
}
