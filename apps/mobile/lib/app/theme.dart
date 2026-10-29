import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// PULSE STREAM mobile design system (mockups — not the web Bowa theme).
abstract final class AppColors {
  static const bgPage = Color(0xFF0F0F11);
  static const bgPanel = Color(0xFF1A1A1E);
  static const bgElevated = Color(0xFF232328);
  static const bgSubtle = Color(0xFF2C2C32);
  static const border = Color(0xFF33333A);
  static const textPrimary = Color(0xFFFFFFFF);
  static const textMuted = Color(0xFFA0A0A8);
  static const accent = Color(0xFFFF4D55);
  static const accentStrong = Color(0xFFFF6B72);
  static const accentSoft = Color(0x33FF4D55);
  static const gold = Color(0xFFE8C36A);
  static const success = Color(0xFF3DDC97);
  static const warn = Color(0xFFFBBF24);
  static const danger = Color(0xFFFF6B72);
  static const profile = Color(0xFFFF7A85);
}

abstract final class AppRadii {
  static const card = 16.0;
  static const control = 999.0;
  static const sm = 12.0;
  static const md = 14.0;
}

abstract final class AppSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 12.0;
  static const lg = 16.0;
  static const xl = 24.0;
  static const xxl = 32.0;
}

ThemeData buildAppTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    scaffoldBackgroundColor: AppColors.bgPage,
    colorScheme: const ColorScheme.dark(
      primary: AppColors.accent,
      secondary: AppColors.accentStrong,
      surface: AppColors.bgPanel,
      error: AppColors.danger,
      onPrimary: Colors.white,
      onSurface: AppColors.textPrimary,
    ),
  );

  final textTheme = GoogleFonts.interTextTheme(base.textTheme).apply(
    bodyColor: AppColors.textPrimary,
    displayColor: AppColors.textPrimary,
  );

  return base.copyWith(
    textTheme: textTheme,
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.bgPage,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      titleTextStyle: textTheme.titleLarge?.copyWith(
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
      iconTheme: const IconThemeData(color: AppColors.textPrimary),
    ),
    cardTheme: CardThemeData(
      color: AppColors.bgPanel,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.bgElevated,
      selectedColor: AppColors.accent,
      disabledColor: AppColors.bgSubtle,
      labelStyle: textTheme.labelLarge?.copyWith(
        color: AppColors.textPrimary,
        fontWeight: FontWeight.w600,
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      shape: const StadiumBorder(),
      side: BorderSide.none,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.bgElevated,
      hintStyle: const TextStyle(color: AppColors.textMuted),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.sm),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.sm),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadii.sm),
        borderSide: const BorderSide(color: AppColors.accent),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.accent,
        foregroundColor: Colors.white,
        minimumSize: const Size(48, 48),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sm),
        ),
        textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.textPrimary,
        backgroundColor: AppColors.bgElevated.withValues(alpha: 0.7),
        minimumSize: const Size(48, 48),
        side: BorderSide.none,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.sm),
        ),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: const Color(0xFF121214),
      elevation: 0,
      height: 68,
      indicatorColor: Colors.transparent,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return textTheme.labelSmall?.copyWith(
          color: selected ? AppColors.accent : AppColors.textMuted,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          fontSize: 11,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          color: selected ? AppColors.accent : AppColors.textMuted,
          size: 24,
        );
      }),
    ),
    dividerColor: AppColors.border,
    snackBarTheme: SnackBarThemeData(
      backgroundColor: AppColors.bgElevated,
      contentTextStyle: textTheme.bodyMedium,
      behavior: SnackBarBehavior.floating,
    ),
  );
}
