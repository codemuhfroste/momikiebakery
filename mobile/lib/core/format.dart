import 'package:intl/intl.dart';

final _peso = NumberFormat.currency(locale: 'en', symbol: '₱', decimalDigits: 2);
final _time = DateFormat('h:mm a');
final _dateTime = DateFormat('MMM d, h:mm a');

String peso(num value) => _peso.format(value);

/// Whole numbers without decimals ("3"), otherwise up to three — grams, for
/// things sold by the kg ("1.5", "0.35").
String qty(num value) =>
    value == value.roundToDouble() ? value.toInt().toString() : value.toStringAsFixed(3).replaceAll(RegExp(r'0+$'), '');

/// Kilos to the gram.
double round3(num value) => (value * 1000).round() / 1000;

/// The store runs on Philippine time (UTC+8, no daylight saving).
DateTime manila(DateTime t) => t.toUtc().add(const Duration(hours: 8));

String timeOfDay(DateTime t) => _time.format(manila(t));
String dateTime(DateTime t) => _dateTime.format(manila(t));
String manilaDate(DateTime t) => DateFormat('yyyy-MM-dd').format(manila(t));

/// "Oct 3, 2026, 11:04 PM" — the website's formatDateTime.
String longDateTime(DateTime t) => DateFormat('MMM d, y, h:mm a').format(manila(t));
