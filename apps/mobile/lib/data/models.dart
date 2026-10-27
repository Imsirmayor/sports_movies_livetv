class HealthStatus {
  HealthStatus({
    required this.status,
    required this.service,
    required this.timestamp,
    required this.ffmpegAvailable,
    required this.mediaRootConfigured,
    required this.activeSessions,
    this.sportsProvider,
    this.catalogConfigured,
  });

  final String status;
  final String service;
  final String timestamp;
  final bool ffmpegAvailable;
  final bool mediaRootConfigured;
  final int activeSessions;
  final String? sportsProvider;
  final bool? catalogConfigured;

  factory HealthStatus.fromJson(Map<String, dynamic> json) {
    return HealthStatus(
      status: json['status'] as String? ?? 'ok',
      service: json['service'] as String? ?? 'frankenstein-api',
      timestamp: json['timestamp'] as String? ?? '',
      ffmpegAvailable: json['ffmpegAvailable'] as bool? ?? false,
      mediaRootConfigured: json['mediaRootConfigured'] as bool? ?? false,
      activeSessions: (json['activeSessions'] as num?)?.toInt() ?? 0,
      sportsProvider: json['sportsProvider'] as String?,
      catalogConfigured: json['catalogConfigured'] as bool?,
    );
  }
}

class CatalogTitle {
  CatalogTitle({
    required this.id,
    required this.name,
    required this.type,
    this.year,
    this.poster,
  });

  final String id;
  final String name;
  final String type;
  final String? year;
  final String? poster;

  factory CatalogTitle.fromJson(Map<String, dynamic> json) {
    return CatalogTitle(
      id: json['id'] as String,
      name: json['name'] as String,
      type: json['type'] as String? ?? 'movie',
      year: json['year'] as String?,
      poster: json['poster'] as String?,
    );
  }
}

class CatalogListResponse {
  CatalogListResponse({required this.items, required this.providerConfigured});

  final List<CatalogTitle> items;
  final bool providerConfigured;

  factory CatalogListResponse.fromJson(Map<String, dynamic> json) {
    final raw = json['items'] as List<dynamic>? ?? const [];
    return CatalogListResponse(
      items: raw
          .whereType<Map<String, dynamic>>()
          .map(CatalogTitle.fromJson)
          .toList(),
      providerConfigured: json['providerConfigured'] as bool? ?? false,
    );
  }
}

class CatalogSearchResponse {
  CatalogSearchResponse({
    required this.query,
    required this.items,
    required this.providerConfigured,
  });

  final String query;
  final List<CatalogTitle> items;
  final bool providerConfigured;

  factory CatalogSearchResponse.fromJson(Map<String, dynamic> json) {
    final raw = json['items'] as List<dynamic>? ?? const [];
    return CatalogSearchResponse(
      query: json['query'] as String? ?? '',
      items: raw
          .whereType<Map<String, dynamic>>()
          .map(CatalogTitle.fromJson)
          .toList(),
      providerConfigured: json['providerConfigured'] as bool? ?? false,
    );
  }
}

class CatalogStreamOption {
  CatalogStreamOption({
    required this.index,
    required this.name,
    required this.label,
    required this.resolution,
    required this.codec,
    required this.sizeBytes,
    required this.seeders,
    required this.language,
    this.cached = false,
    this.locallyCached = false,
  });

  final int index;
  final String name;
  final String label;
  final int resolution;
  final String codec;
  final num sizeBytes;
  final int seeders;
  final String language;
  final bool cached;
  final bool locallyCached;

  factory CatalogStreamOption.fromJson(Map<String, dynamic> json) {
    return CatalogStreamOption(
      index: (json['index'] as num).toInt(),
      name: json['name'] as String? ?? '',
      label: json['label'] as String? ?? '',
      resolution: (json['resolution'] as num?)?.toInt() ?? 0,
      codec: json['codec'] as String? ?? '',
      sizeBytes: json['sizeBytes'] as num? ?? 0,
      seeders: (json['seeders'] as num?)?.toInt() ?? 0,
      language: json['language'] as String? ?? '',
      cached: json['cached'] as bool? ?? false,
      locallyCached: json['locallyCached'] as bool? ?? false,
    );
  }
}

class CatalogStreamsResponse {
  CatalogStreamsResponse({
    required this.imdbId,
    required this.provider,
    required this.streams,
  });

  final String imdbId;
  final String provider;
  final List<CatalogStreamOption> streams;

  factory CatalogStreamsResponse.fromJson(Map<String, dynamic> json) {
    final raw = json['streams'] as List<dynamic>? ?? const [];
    return CatalogStreamsResponse(
      imdbId: json['imdbId'] as String? ?? '',
      provider: json['provider'] as String? ?? '',
      streams: raw
          .whereType<Map<String, dynamic>>()
          .map(CatalogStreamOption.fromJson)
          .toList(),
    );
  }
}

class SeriesEpisode {
  SeriesEpisode({
    required this.season,
    required this.episode,
    required this.name,
    this.overview,
    this.released,
  });

  final int season;
  final int episode;
  final String name;
  final String? overview;
  final String? released;

  factory SeriesEpisode.fromJson(Map<String, dynamic> json) {
    return SeriesEpisode(
      season: (json['season'] as num).toInt(),
      episode: (json['episode'] as num).toInt(),
      name: json['name'] as String? ?? '',
      overview: json['overview'] as String?,
      released: json['released'] as String?,
    );
  }
}

class SeriesMeta {
  SeriesMeta({
    required this.id,
    required this.name,
    required this.type,
    this.year,
    this.poster,
    required this.episodes,
    required this.seasons,
  });

  final String id;
  final String name;
  final String type;
  final String? year;
  final String? poster;
  final List<SeriesEpisode> episodes;
  final List<int> seasons;

  factory SeriesMeta.fromJson(Map<String, dynamic> json) {
    final eps = json['episodes'] as List<dynamic>? ?? const [];
    final seasons = json['seasons'] as List<dynamic>? ?? const [];
    return SeriesMeta(
      id: json['id'] as String,
      name: json['name'] as String,
      type: json['type'] as String? ?? 'series',
      year: json['year'] as String?,
      poster: json['poster'] as String?,
      episodes: eps
          .whereType<Map<String, dynamic>>()
          .map(SeriesEpisode.fromJson)
          .toList(),
      seasons: seasons.map((e) => (e as num).toInt()).toList(),
    );
  }
}

class SportEventScore {
  SportEventScore({this.home, this.away});

  final int? home;
  final int? away;

  factory SportEventScore.fromJson(Map<String, dynamic>? json) {
    if (json == null) return SportEventScore();
    return SportEventScore(
      home: (json['home'] as num?)?.toInt(),
      away: (json['away'] as num?)?.toInt(),
    );
  }
}

class SportEvent {
  SportEvent({
    required this.id,
    required this.sport,
    required this.competition,
    required this.competitionId,
    required this.title,
    this.homeTeam,
    this.awayTeam,
    this.startTime,
    required this.status,
    this.score,
    required this.provider,
    required this.streamAvailability,
    this.embedUrl,
  });

  final String id;
  final String sport;
  final String competition;
  final String competitionId;
  final String title;
  final String? homeTeam;
  final String? awayTeam;
  final String? startTime;
  final String status;
  final SportEventScore? score;
  final String provider;
  final String streamAvailability;
  final String? embedUrl;

  bool get isPlayable =>
      streamAvailability == 'available' || streamAvailability == 'fixture';

  bool get isLive => status == 'live';

  String get displayTitle {
    final home = homeTeam?.trim();
    final away = awayTeam?.trim();
    if (home != null &&
        home.isNotEmpty &&
        away != null &&
        away.isNotEmpty) {
      return '$home vs $away';
    }
    // Normalize titles that already use a vs-like separator.
    final vsMatch = RegExp(r'\s+v(?:ersus)?\.?\s+', caseSensitive: false)
        .firstMatch(title);
    if (vsMatch != null) {
      final left = title.substring(0, vsMatch.start).trim();
      final right = title.substring(vsMatch.end).trim();
      if (left.isNotEmpty && right.isNotEmpty) return '$left vs $right';
    }
    return title;
  }

  factory SportEvent.fromJson(Map<String, dynamic> json) {
    return SportEvent(
      id: json['id'] as String,
      sport: json['sport'] as String? ?? '',
      competition: json['competition'] as String? ?? '',
      competitionId: json['competitionId'] as String? ?? '',
      title: json['title'] as String? ?? '',
      homeTeam: json['homeTeam'] as String?,
      awayTeam: json['awayTeam'] as String?,
      startTime: json['startTime'] as String?,
      status: json['status'] as String? ?? 'unknown',
      score: SportEventScore.fromJson(json['score'] as Map<String, dynamic>?),
      provider: json['provider'] as String? ?? '',
      streamAvailability: json['streamAvailability'] as String? ?? 'unavailable',
      embedUrl: json['embedUrl'] as String?,
    );
  }
}

class SportsListResponse {
  SportsListResponse({
    required this.sports,
    required this.competitions,
    required this.provider,
    required this.providerConfigured,
  });

  final List<String> sports;
  final List<Map<String, dynamic>> competitions;
  final String provider;
  final bool providerConfigured;

  factory SportsListResponse.fromJson(Map<String, dynamic> json) {
    final sports = json['sports'] as List<dynamic>? ?? const [];
    final comps = json['competitions'] as List<dynamic>? ?? const [];
    return SportsListResponse(
      sports: sports.map((e) => e.toString()).toList(),
      competitions: comps.whereType<Map<String, dynamic>>().toList(),
      provider: json['provider'] as String? ?? '',
      providerConfigured: json['providerConfigured'] as bool? ?? false,
    );
  }
}

class SportEventsResponse {
  SportEventsResponse({required this.events, this.ambiguous = false});

  final List<SportEvent> events;
  final bool ambiguous;

  factory SportEventsResponse.fromJson(Map<String, dynamic> json) {
    final raw = json['events'] as List<dynamic>? ?? const [];
    return SportEventsResponse(
      events: raw
          .whereType<Map<String, dynamic>>()
          .map(SportEvent.fromJson)
          .toList(),
      ambiguous: json['ambiguous'] as bool? ?? false,
    );
  }
}

class PlaybackCapabilities {
  PlaybackCapabilities({required this.seek, required this.pause});

  final bool seek;
  final bool pause;

  factory PlaybackCapabilities.fromJson(Map<String, dynamic>? json) {
    return PlaybackCapabilities(
      seek: json?['seek'] as bool? ?? true,
      pause: json?['pause'] as bool? ?? true,
    );
  }
}

class PlaybackSession {
  PlaybackSession({
    required this.sessionId,
    this.mediaId,
    this.eventId,
    required this.kind,
    required this.capabilities,
    required this.status,
    this.playlistUrl,
    required this.createdAt,
    required this.updatedAt,
    this.errorCode,
    this.errorMessage,
    this.ffmpegPid,
  });

  final String sessionId;
  final String? mediaId;
  final String? eventId;
  final String kind;
  final PlaybackCapabilities capabilities;
  final String status;
  final String? playlistUrl;
  final String createdAt;
  final String updatedAt;
  final String? errorCode;
  final String? errorMessage;
  final int? ffmpegPid;

  bool get isReady => status == 'ready' && playlistUrl != null;
  bool get isFailed => status == 'failed';
  bool get isStarting => status == 'starting';

  factory PlaybackSession.fromJson(Map<String, dynamic> json) {
    return PlaybackSession(
      sessionId: json['sessionId'] as String,
      mediaId: json['mediaId'] as String?,
      eventId: json['eventId'] as String?,
      kind: json['kind'] as String? ?? 'vod',
      capabilities: PlaybackCapabilities.fromJson(
        json['capabilities'] as Map<String, dynamic>?,
      ),
      status: json['status'] as String? ?? 'starting',
      playlistUrl: json['playlistUrl'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      updatedAt: json['updatedAt'] as String? ?? '',
      errorCode: json['errorCode'] as String?,
      errorMessage: json['errorMessage'] as String?,
      ffmpegPid: (json['ffmpegPid'] as num?)?.toInt(),
    );
  }
}
