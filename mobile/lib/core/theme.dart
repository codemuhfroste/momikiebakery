import 'package:flutter/material.dart';

/// The website's design tokens (src/app/globals.css plus the Tailwind colours
/// it uses), so the app and the site look the same. Sizes elsewhere are the
/// site's CSS pixels: the tablet's logical pixels match a browser's 1:1.
class Brand {
  // globals.css
  static const page = Color(0xFFF3F5F9); // --background
  static const surface = Colors.white;
  static const ink = Color(0xFF0F172A);
  static const muted = Color(0xFF5B6577);
  static const line = Color(0xFFE1E6EE);
  static const navy = Color(0xFF1D3A8A); // --brand
  static const navyHover = Color(0xFF152C6B); // --brand-dark
  static const navySoft = Color(0xFFEEF2FB); // --brand-soft
  static const gold = Color(0xFFD4A62A); // --accent
  static const navyDark = Color(0xFF0F1D3D); // --sidebar

  // Tailwind palette
  static const slate50 = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate400 = Color(0xFF94A3B8);
  static const slate500 = Color(0xFF64748B);
  static const slate700 = Color(0xFF334155);
  static const slate800 = Color(0xFF1E293B);
  static const slate900 = Color(0xFF0F172A);
  static const emerald50 = Color(0xFFECFDF5);
  static const emerald200 = Color(0xFFA7F3D0);
  static const emerald700 = Color(0xFF047857);
  static const emerald800 = Color(0xFF065F46);
  static const emerald900 = Color(0xFF064E3B);
  static const emerald950 = Color(0xFF022C22);
  static const amber50 = Color(0xFFFFFBEB);
  static const amber200 = Color(0xFFFDE68A);
  static const amber400 = Color(0xFFFBBF24);
  static const amber700 = Color(0xFFB45309);
  static const amber800 = Color(0xFF92400E);
  static const amber900 = Color(0xFF78350F);
  static const amber950 = Color(0xFF451A03);
  static const red50 = Color(0xFFFEF2F2);
  static const red200 = Color(0xFFFECACA);
  static const red600 = Color(0xFFDC2626);
  static const red700 = Color(0xFFB91C1C);
  static const blue50 = Color(0xFFEFF6FF);
  static const blue200 = Color(0xFFBFDBFE);
  static const blue800 = Color(0xFF1E40AF);
  static const blue900 = Color(0xFF1E3A8A);

  // Older names used around the app.
  static const good = emerald700;
  static const warn = amber700;
  static const bad = red700;

  /// Tailwind's `shadow-sm`.
  static const shadowSm = [
    BoxShadow(color: Color(0x1A000000), blurRadius: 3, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x1A000000), blurRadius: 2, spreadRadius: -1, offset: Offset(0, 1)),
  ];
  static const shadowLg = [
    BoxShadow(color: Color(0x1A000000), blurRadius: 15, spreadRadius: -3, offset: Offset(0, 10)),
    BoxShadow(color: Color(0x1A000000), blurRadius: 6, spreadRadius: -4, offset: Offset(0, 4)),
  ];

  /// Tailwind's `lg` breakpoint: the sidebar layout from here up.
  static const wide = 1024.0;
}

/// `tabular-nums`, for money and counts that line up.
const tabular = [FontFeature.tabularFigures()];

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: Brand.navy, primary: Brand.navy, surface: Colors.white);
  OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
    borderRadius: BorderRadius.circular(6),
    borderSide: BorderSide(color: c, width: w),
  );
  return ThemeData(
    useMaterial3: true,
    fontFamily: 'Geist',
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.page,
    splashFactory: InkSparkle.splashFactory,
    textTheme: const TextTheme(
      bodyMedium: TextStyle(fontSize: 14, color: Brand.ink, height: 20 / 14),
      bodySmall: TextStyle(fontSize: 12, color: Brand.muted, height: 16 / 12),
      bodyLarge: TextStyle(fontSize: 16, color: Brand.ink, height: 24 / 16),
    ),
    // The website's inputCls.
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      hintStyle: const TextStyle(color: Brand.slate400, fontSize: 14),
      border: border(Brand.line),
      enabledBorder: border(Brand.line),
      focusedBorder: border(Brand.navy, 1.5),
      errorBorder: border(Brand.red600),
    ),
    textSelectionTheme: const TextSelectionThemeData(cursorColor: Brand.navy),
    dividerTheme: const DividerThemeData(color: Brand.line, thickness: 1, space: 1),
    datePickerTheme: const DatePickerThemeData(
      backgroundColor: Colors.white,
      headerBackgroundColor: Brand.navy,
      headerForegroundColor: Colors.white,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating, backgroundColor: Brand.slate800),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Brand.navy),
  );
}
