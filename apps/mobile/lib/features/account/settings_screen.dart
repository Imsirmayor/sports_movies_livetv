import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late final TextEditingController _base;
  late final TextEditingController _token;
  late final TextEditingController _addon;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final cfg = ref.read(appConfigProvider);
    _base = TextEditingController(text: cfg.apiBaseUrl);
    _token = TextEditingController(text: cfg.apiToken);
    _addon = TextEditingController(text: cfg.stremioAddonUrl);
  }

  @override
  void dispose() {
    _base.dispose();
    _token.dispose();
    _addon.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await ref.read(appConfigProvider.notifier).update(
            apiBaseUrl: _base.text.trim(),
            apiToken: _token.text.trim(),
            stremioAddonUrl: _addon.text.trim(),
          );
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Saved settings')));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'API connection',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const Text(
            'Sports and ads still use the Frankenstein API. '
            'Movies and series load titles from Cinemeta on the phone and do not need it. '
            'Use 10.0.2.2 for the Android emulator host loopback.',
            style: TextStyle(color: AppColors.textMuted),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _base,
            decoration: const InputDecoration(
              labelText: 'API base URL',
              hintText: 'http://10.0.2.2:8787',
            ),
            keyboardType: TextInputType.url,
            autocorrect: false,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _token,
            decoration: const InputDecoration(
              labelText: 'API token',
              hintText: 'Same value as API_TOKEN in .env',
            ),
            obscureText: true,
            autocorrect: false,
          ),
          const SizedBox(height: 28),
          Text(
            'Movies and series',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const Text(
            'Posters, titles, and episodes come from Cinemeta. '
            'Paste the full Torrentio addon URL (the one that includes RealDebrid) '
            'so the app can fetch a direct video link. It is stored on this device only.',
            style: TextStyle(color: AppColors.textMuted),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _addon,
            decoration: const InputDecoration(
              labelText: 'Torrentio addon URL',
              hintText: 'https://torrentio.strem.fun/realdebrid=…',
            ),
            keyboardType: TextInputType.url,
            autocorrect: false,
            obscureText: true,
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: Text(_saving ? 'Saving…' : 'Save'),
          ),
        ],
      ),
    );
  }
}
