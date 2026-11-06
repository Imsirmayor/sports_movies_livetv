class ParsedTiming {
  const ParsedTiming({
    required this.startTime,
    required this.status,
    required this.isLive,
  });

  final String? startTime;
  final String status;
  final bool isLive;
}

const _placeholderZaman = 1640451600;

String stripHtml(String html) {
  return html
      .replaceAll(RegExp(r'<[^>]*>'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

/// Convert relative countdown text into milliseconds from now.
int? parseRelativeCountdownMs(String label) {
  final text = stripHtml(label).toLowerCase();
  if (text.isEmpty) return null;
  if (RegExp(r'^live\b').hasMatch(text) || text == 'live now') return 0;

  var m = RegExp(
    r'(\d+)\s*(?:days?|d)\s*(?:and\s*)?(\d+)?\s*(?:hours?|hrs?|h)?\s*(?:from\s+now|away)?',
  ).firstMatch(text);
  if (m != null && RegExp(r'day|d\b').hasMatch(text)) {
    final days = int.parse(m.group(1)!);
    final hours = m.group(2) != null ? int.parse(m.group(2)!) : 0;
    return (days * 24 + hours) * 3600000;
  }

  m = RegExp(
    r'(\d+)\s*(?:hours?|hrs?|h)\s*(?:from\s+now|away)?',
  ).firstMatch(text);
  if (m != null) return int.parse(m.group(1)!) * 3600000;

  m = RegExp(
    r'(\d+)\s*(?:minutes?|mins?|m)\s*(?:from\s+now|away)?',
  ).firstMatch(text);
  if (m != null) return int.parse(m.group(1)!) * 60000;

  m = RegExp(
    r'in\s+(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?',
    caseSensitive: false,
  ).firstMatch(text);
  if (m != null) {
    return (int.parse(m.group(1)!) * 60 +
            (m.group(2) != null ? int.parse(m.group(2)!) : 0)) *
        60000;
  }

  m = RegExp(
    r'starts?\s+in\s+(\d+)\s*h(?:ours?)?\s*(\d+)?\s*m?',
    caseSensitive: false,
  ).firstMatch(text);
  if (m != null) {
    return (int.parse(m.group(1)!) * 60 +
            (m.group(2) != null ? int.parse(m.group(2)!) : 0)) *
        60000;
  }

  return null;
}

ParsedTiming resolveMatchTiming({
  int? dataZaman,
  String? label,
  bool btnLive = false,
  int? nowMs,
}) {
  final now = nowMs ?? DateTime.now().millisecondsSinceEpoch;
  final text = label ?? '';
  final textLive = RegExp(
    r'\blive\b',
    caseSensitive: false,
  ).hasMatch(stripHtml(text));
  final isLive = btnLive || textLive;

  if (isLive) {
    return ParsedTiming(
      startTime: DateTime.fromMillisecondsSinceEpoch(
        now,
        isUtc: true,
      ).toIso8601String(),
      status: 'live',
      isLive: true,
    );
  }

  final zaman = dataZaman;
  if (zaman != null && zaman != _placeholderZaman && zaman > 1000000000) {
    final ms = zaman < 1000000000000 ? zaman * 1000 : zaman;
    if (ms > now - 2 * 86400000 && ms < now + 60 * 86400000) {
      final live = ms <= now + 60000;
      return ParsedTiming(
        startTime: DateTime.fromMillisecondsSinceEpoch(
          ms,
          isUtc: true,
        ).toIso8601String(),
        status: live ? 'live' : 'upcoming',
        isLive: live,
      );
    }
  }

  final relative = parseRelativeCountdownMs(text);
  if (relative != null) {
    final start = now + relative;
    final live = relative <= 60000;
    return ParsedTiming(
      startTime: DateTime.fromMillisecondsSinceEpoch(
        start,
        isUtc: true,
      ).toIso8601String(),
      status: live ? 'live' : 'upcoming',
      isLive: live,
    );
  }

  return const ParsedTiming(startTime: null, status: 'upcoming', isLive: false);
}

bool isSaatZamanLive(String classes, String innerHtml) {
  if (RegExp(r'\bbtn-live\b', caseSensitive: false).hasMatch(classes)) {
    return true;
  }
  return RegExp(
    r'\blive\b',
    caseSensitive: false,
  ).hasMatch(stripHtml(innerHtml));
}
