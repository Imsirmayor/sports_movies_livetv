import 'dart:async';

import 'package:flutter/material.dart';

import '../app/theme.dart';

/// Formats a kickoff ISO timestamp into a live "Starts in …" label.
String formatMatchCountdown(String? iso, {DateTime? now}) {
  if (iso == null || iso.isEmpty) return 'Time TBD';
  final start = DateTime.tryParse(iso)?.toUtc();
  if (start == null) return 'Time TBD';
  final n = (now ?? DateTime.now()).toUtc();
  var delta = start.difference(n);
  if (delta.isNegative || delta.inSeconds <= 0) return 'Starting now';
  final days = delta.inDays;
  final hours = delta.inHours % 24;
  final mins = delta.inMinutes % 60;
  final secs = delta.inSeconds % 60;
  if (days > 0) return 'Starts in ${days}d ${hours}h';
  if (delta.inHours > 0) {
    return 'Starts in ${delta.inHours}h ${mins.toString().padLeft(2, '0')}m';
  }
  if (mins > 0) return 'Starts in ${mins}m ${secs.toString().padLeft(2, '0')}s';
  return 'Starts in ${secs}s';
}

class MatchCountdownLabel extends StatefulWidget {
  const MatchCountdownLabel({
    super.key,
    required this.startTime,
    this.status,
    this.style,
    this.onElapsed,
    this.pill = false,
    this.expand = false,
  });

  final String? startTime;
  final String? status;
  final TextStyle? style;
  final VoidCallback? onElapsed;
  /// Coral pill background — use on listing cards so kickoff is obvious.
  final bool pill;
  final bool expand;

  @override
  State<MatchCountdownLabel> createState() => _MatchCountdownLabelState();
}

class _MatchCountdownLabelState extends State<MatchCountdownLabel> {
  Timer? _timer;
  late DateTime _now;
  bool _fired = false;

  @override
  void initState() {
    super.initState();
    _now = DateTime.now();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
      _maybeFire();
    });
  }

  void _maybeFire() {
    if (_fired || widget.onElapsed == null) return;
    final start = DateTime.tryParse(widget.startTime ?? '');
    if (start == null) return;
    if (!start.toUtc().isAfter(DateTime.now().toUtc())) {
      _fired = true;
      widget.onElapsed!();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final live = widget.status == 'live';
    final text = live
        ? 'LIVE NOW'
        : formatMatchCountdown(widget.startTime, now: _now);
    final style = (widget.style ?? const TextStyle()).copyWith(
      color: widget.pill
          ? Colors.white
          : (live ? AppColors.accent : AppColors.accentStrong),
      fontWeight: FontWeight.w800,
      fontFeatures: const [FontFeature.tabularFigures()],
    );

    final label = Text(text, style: style, textAlign: TextAlign.center);

    if (!widget.pill) return label;

    return Container(
      width: widget.expand ? double.infinity : null,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: live ? AppColors.accent : AppColors.bgElevated,
        borderRadius: BorderRadius.circular(AppRadii.sm),
        border: live
            ? null
            : Border.all(color: AppColors.accent.withValues(alpha: 0.45)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: widget.expand ? MainAxisSize.max : MainAxisSize.min,
        children: [
          Icon(
            live ? Icons.play_arrow_rounded : Icons.schedule_rounded,
            size: 18,
            color: live ? Colors.white : AppColors.accentStrong,
          ),
          const SizedBox(width: 8),
          Flexible(child: label),
        ],
      ),
    );
  }
}
