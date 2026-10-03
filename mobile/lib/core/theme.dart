import 'package:flutter/material.dart';

// Same palette as the website: navy for actions, gold accent, cool slate page.
class Brand {
  static const navy = Color(0xFF1D3A8A);
  static const navyDark = Color(0xFF0F1D3D);
  static const gold = Color(0xFFD4A62A);
  static const page = Color(0xFFF3F5F9);
  static const line = Color(0xFFE1E6EE);
  static const ink = Color(0xFF0F172A);
  static const muted = Color(0xFF5B6577);
  static const good = Color(0xFF047857);
  static const warn = Color(0xFFB45309);
  static const bad = Color(0xFFB91C1C);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: Brand.navy, primary: Brand.navy, surface: Colors.white);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.page,
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.navyDark,
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Brand.line)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      isDense: true,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Brand.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: Brand.line)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.navy,
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(backgroundColor: Colors.white, indicatorColor: Color(0xFFE8EDFA)),
  );
}
