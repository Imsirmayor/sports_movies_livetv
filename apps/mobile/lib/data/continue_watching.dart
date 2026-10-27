import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class ContinueWatchEntry {
  ContinueWatchEntry({
    required this.id,
    required this.title,
    required this.position,
    required this.duration,
    required this.route,
    required this.updatedAt,
    this.poster,
  });

  final String id;
  final String title;
  final double position;
  final double duration;
  final String route;
  final int updatedAt;
  final String? poster;

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'position': position,
        'duration': duration,
        'route': route,
        'updatedAt': updatedAt,
        'poster': poster,
      };

  factory ContinueWatchEntry.fromJson(Map<String, dynamic> json) {
    return ContinueWatchEntry(
      id: json['id'] as String,
      title: json['title'] as String,
      position: (json['position'] as num).toDouble(),
      duration: (json['duration'] as num?)?.toDouble() ?? 0,
      route: json['route'] as String,
      updatedAt: (json['updatedAt'] as num?)?.toInt() ?? 0,
      poster: json['poster'] as String?,
    );
  }
}

class ContinueWatchingStore {
  ContinueWatchingStore(this._prefs);

  final SharedPreferences _prefs;
  static const _key = 'bowa.continueWatching.v1';
  static const _max = 24;
  static const _minSave = 15.0;
  static const _completeRatio = 0.95;

  List<ContinueWatchEntry> list() {
    final raw = _prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list
          .whereType<Map<String, dynamic>>()
          .map(ContinueWatchEntry.fromJson)
          .toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> save(ContinueWatchEntry entry) async {
    if (entry.position < _minSave) return;
    if (entry.duration > 0 &&
        entry.position / entry.duration >= _completeRatio) {
      await remove(entry.id);
      return;
    }
    final items = list().where((e) => e.id != entry.id).toList();
    items.insert(0, entry);
    await _prefs.setString(
      _key,
      jsonEncode(items.take(_max).map((e) => e.toJson()).toList()),
    );
  }

  Future<void> remove(String id) async {
    final items = list().where((e) => e.id != id).toList();
    await _prefs.setString(
      _key,
      jsonEncode(items.map((e) => e.toJson()).toList()),
    );
  }
}

class MyListStore {
  MyListStore(this._prefs);

  final SharedPreferences _prefs;
  static const _key = 'bowa.myList.v1';

  List<Map<String, dynamic>> list() {
    final raw = _prefs.getString(_key);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.whereType<Map<String, dynamic>>().toList();
    } catch (_) {
      return [];
    }
  }

  bool contains(String id) => list().any((e) => e['id'] == id);

  Future<void> toggle({
    required String id,
    required String title,
    required String type,
    String? poster,
    required String route,
  }) async {
    final items = list();
    final idx = items.indexWhere((e) => e['id'] == id);
    if (idx >= 0) {
      items.removeAt(idx);
    } else {
      items.insert(0, {
        'id': id,
        'title': title,
        'type': type,
        'poster': poster,
        'route': route,
        'addedAt': DateTime.now().millisecondsSinceEpoch,
      });
    }
    await _prefs.setString(_key, jsonEncode(items));
  }
}
