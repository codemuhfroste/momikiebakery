// Flutter versions of the website's building blocks (src/components/ui.tsx):
// PageHeader, Card, Stat, Badge, Tabs, tables, buttons and inputs — same
// sizes, colours and spacing, so a screen here reads like the same page on
// the site.
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../core/theme.dart';

// ------------------------------------------------------------------ text

const tSm = TextStyle(fontSize: 14, height: 20 / 14, color: Brand.ink);
const tXs = TextStyle(fontSize: 12, height: 16 / 12, color: Brand.muted);
const tMuted = TextStyle(fontSize: 14, height: 20 / 14, color: Brand.muted);
const tLabel = TextStyle(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w500, color: Brand.ink);

/// The website's `labelCls`: a field label with the 6px gap under it.
class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(text, style: tLabel),
  );
}

// ------------------------------------------------------------------ icons

/// The website's line icons (NavLinks.tsx and friends): 24x24 paths drawn
/// with a 1.7px rounded stroke.
class WebIcon extends StatelessWidget {
  const WebIcon(this.path, {super.key, this.size = 18, this.color = Brand.ink, this.stroke = 1.7});
  final String path;
  final double size;
  final Color color;
  final double stroke;

  static String _hex(Color c) => '#${c.toARGB32().toRadixString(16).padLeft(8, '0').substring(2)}';

  @override
  Widget build(BuildContext context) => SvgPicture.string(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${_hex(color)}" '
    'stroke-opacity="${(color.a).toStringAsFixed(3)}" stroke-width="$stroke" stroke-linecap="round" stroke-linejoin="round">'
    '<path d="$path"/></svg>',
    width: size,
    height: size,
  );
}

class Icons2 {
  static const dashboard = 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-3H4z';
  static const products = 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8';
  static const inventory = 'M3 7h18M5 7v13h14V7M9 11h6';
  static const eod = 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h4';
  static const report = 'M4 20V10M10 20V4M16 20v-7M22 20H2';
  static const staff = 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6';
  static const printer = 'M7 8V4h10v4M7 17H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z';
  static const scanner = 'M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M7 9v6M10 9v6M14 9v6M17 9v6';
  static const register = 'M4 6h16v12H4zM4 10h16M8 15h3';
  static const sales = 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6';
  static const credit =
      'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3 3-5 6-5s6 2 6 5M14 15.5c.6-.3 1.3-.5 2-.5 3 0 6 2 6 5';
  static const sync = 'M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18zM12 11v5M9.5 13.5L12 16l2.5-2.5';
  static const audit = 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4';
  static const search = 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5';
  static const close = 'M6 6l12 12M18 6L6 18';
  static const menu = 'M4 7h16M4 12h16M4 17h16';
  static const warning = 'M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z';
  static const calendar = 'M5 5h14v15H5zM5 10h14M9 3v4M15 3v4';
  static const chevronDown = 'M6 9l6 6 6-6';
}

// ------------------------------------------------------------------ logo

/// The gold "M" square from the sidebar and sign-in page.
class MLogo extends StatelessWidget {
  const MLogo({super.key, this.size = 36, this.radius = 6, this.shadow = false});
  final double size;
  final double radius;
  final bool shadow;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: Brand.gold,
      borderRadius: BorderRadius.circular(radius),
      boxShadow: shadow ? const [BoxShadow(color: Color(0x33000000), blurRadius: 15, offset: Offset(0, 8))] : null,
    ),
    child: Text(
      'M',
      style: TextStyle(fontFamily: 'serif', fontSize: size * 0.5, fontWeight: FontWeight.w700, color: Brand.navyDark, height: 1),
    ),
  );
}

// ------------------------------------------------------------------ layout

/// The website's PageHeader: title, subtitle, actions on the right, and a
/// rule underneath.
class PageHeader extends StatelessWidget {
  const PageHeader({super.key, required this.title, this.subtitle, this.actions = const []});
  final String title;
  final String? subtitle;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 24, height: 32 / 24, fontWeight: FontWeight.w600, color: Brand.ink),
        ),
        if (subtitle != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 768),
              child: Text(subtitle!, style: tMuted),
            ),
          ),
      ],
    );
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.only(bottom: 20),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Brand.line)),
      ),
      width: double.infinity,
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.end,
        spacing: 12,
        runSpacing: 12,
        children: [
          heading,
          if (actions.isNotEmpty) Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: actions),
        ],
      ),
    );
  }
}

/// `Card`: white, rounded-xl, hairline border, small shadow.
class WebCard extends StatelessWidget {
  const WebCard({super.key, required this.child, this.padding, this.radius = 12, this.borderColor = Brand.line});
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double radius;
  final Color borderColor;
  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: borderColor),
      boxShadow: Brand.shadowSm,
    ),
    child: child,
  );
}

/// `CardHeader`: a titled strip across the top of a card.
class CardHeader extends StatelessWidget {
  const CardHeader({super.key, required this.title, this.description, this.actions});
  final String title;
  final String? description;
  final Widget? actions;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Brand.line)),
    ),
    child: Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: Brand.ink),
              ),
              if (description != null) Text(description!, style: tXs),
            ],
          ),
        ),
        ?actions,
      ],
    ),
  );
}

enum StatTone { normal, warn, bad }

/// `Stat`: a figure on a card.
class StatCard extends StatelessWidget {
  const StatCard({super.key, required this.label, required this.value, this.hint, this.tone = StatTone.normal});
  final String label;
  final String value;
  final String? hint;
  final StatTone tone;
  @override
  Widget build(BuildContext context) => WebCard(
    padding: const EdgeInsets.all(20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: tMuted),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 24,
            height: 32 / 24,
            fontWeight: FontWeight.w600,
            fontFeatures: tabular,
            color: switch (tone) {
              StatTone.warn => Brand.amber700,
              StatTone.bad => Brand.red700,
              _ => Brand.ink,
            },
          ),
        ),
        if (hint != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(hint!, style: tXs),
          ),
      ],
    ),
  );
}

/// The site's stat grid: 1 column on phones, 2 from 640px, 4 from 1280px
/// (decided by the screen width, like Tailwind's breakpoints).
class StatGrid extends StatelessWidget {
  const StatGrid({super.key, required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final cols = w >= 1280 ? 4 : (w >= 640 ? 2 : 1);
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: LayoutBuilder(
        builder: (context, c) {
          final itemW = (c.maxWidth - 16 * (cols - 1)) / cols;
          return Wrap(
            spacing: 16,
            runSpacing: 16,
            children: [for (final s in children) SizedBox(width: itemW, child: s)],
          );
        },
      ),
    );
  }
}

enum Tone { neutral, good, warn, bad, info }

/// `Badge`.
class WebBadge extends StatelessWidget {
  const WebBadge(this.text, {super.key, this.tone = Tone.neutral});
  final String text;
  final Tone tone;

  static (Color, Color, Color) colors(Tone t) => switch (t) {
    Tone.good => (Brand.emerald50, Brand.emerald700, Brand.emerald200),
    Tone.warn => (Brand.amber50, Brand.amber800, Brand.amber200),
    Tone.bad => (Brand.red50, Brand.red700, Brand.red200),
    Tone.info => (Brand.blue50, Brand.blue800, Brand.blue200),
    Tone.neutral => (Brand.slate100, Brand.slate700, Brand.slate200),
  };

  @override
  Widget build(BuildContext context) {
    final (bg, fg, ring) = colors(tone);
    // IntrinsicWidth: a table column never shrinks a badge onto two lines
    // (or clips it) — it stays one line, as on the website.
    return IntrinsicWidth(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: ring),
        ),
        child: Text(
          text,
          softWrap: false,
          style: TextStyle(fontSize: 12, height: 16 / 12, fontWeight: FontWeight.w500, color: fg),
        ),
      ),
    );
  }
}

/// `Notice`: a coloured explanation box.
class NoticeBox extends StatelessWidget {
  const NoticeBox({super.key, required this.child, this.tone = Tone.info});
  final Widget child;
  final Tone tone;
  @override
  Widget build(BuildContext context) {
    final (bg, fg, border) = switch (tone) {
      Tone.warn => (Brand.amber50, Brand.amber900, Brand.amber200),
      Tone.good => (Brand.emerald50, Brand.emerald900, Brand.emerald200),
      Tone.bad => (Brand.red50, Brand.red700, Brand.red200),
      _ => (Brand.blue50, Brand.blue900, Brand.blue200),
    };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: border),
      ),
      child: DefaultTextStyle.merge(
        style: TextStyle(color: fg, fontSize: 14, height: 20 / 14),
        child: child,
      ),
    );
  }
}

/// `Tabs`: underlined filter tabs.
class WebTabs<T> extends StatelessWidget {
  const WebTabs({super.key, required this.tabs, required this.active, required this.onSelect});
  final List<(T, String)> tabs;
  final T active;
  final ValueChanged<T> onSelect;
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(bottom: 16),
    decoration: const BoxDecoration(
      border: Border(bottom: BorderSide(color: Brand.line)),
    ),
    child: Wrap(
      spacing: 4,
      children: [
        for (final (key, label) in tabs)
          InkWell(
            onTap: () => onSelect(key),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: key == active ? Brand.navy : Colors.transparent, width: 2)),
              ),
              child: Text(
                label,
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500, color: key == active ? Brand.navy : Brand.muted),
              ),
            ),
          ),
      ],
    ),
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 48),
    child: Center(
      child: Text(text, textAlign: TextAlign.center, style: tMuted),
    ),
  );
}

// ------------------------------------------------------------------ tables

class Col {
  const Col(this.header, {this.right = false, this.flex = 1});
  final String header;
  final bool right;
  final double flex;
}

/// The site's tables (Lingkod style): small uppercase grey headings, one rule
/// under them, hairlines between rows. Columns size to their content and
/// share any spare width.
class WebTable extends StatelessWidget {
  const WebTable({super.key, required this.columns, required this.rows, this.onRowTap});
  final List<Col> columns;
  final List<List<Widget>> rows;
  final ValueChanged<int>? onRowTap;

  @override
  Widget build(BuildContext context) {
    Widget cell(Widget child, int col, {required bool head, int? row}) {
      final c = columns[col];
      Widget inner = Padding(
        padding: EdgeInsets.symmetric(horizontal: 12, vertical: head ? 8 : 12),
        child: Align(alignment: c.right ? Alignment.centerRight : Alignment.centerLeft, child: child),
      );
      if (!head && onRowTap != null) {
        inner = TableRowInkWell(onTap: () => onRowTap!(row!), child: inner);
      }
      return TableCell(verticalAlignment: TableCellVerticalAlignment.middle, child: inner);
    }

    final table = Table(
      defaultColumnWidth: const IntrinsicColumnWidth(flex: 1),
      columnWidths: {for (var i = 0; i < columns.length; i++) i: IntrinsicColumnWidth(flex: columns[i].flex)},
      children: [
        TableRow(
          decoration: const BoxDecoration(
            border: Border(bottom: BorderSide(color: Brand.line)),
          ),
          children: [
            for (var i = 0; i < columns.length; i++)
              cell(
                Text(
                  columns[i].header.toUpperCase(),
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: Brand.slate500, letterSpacing: 0.3),
                ),
                i,
                head: true,
              ),
          ],
        ),
        for (var r = 0; r < rows.length; r++)
          TableRow(
            decoration: BoxDecoration(
              border: r == rows.length - 1 ? null : const Border(bottom: BorderSide(color: Brand.slate100)),
            ),
            children: [
              for (var i = 0; i < columns.length; i++)
                cell(
                  DefaultTextStyle.merge(style: tSm, child: rows[r][i]),
                  i,
                  head: false,
                  row: r,
                ),
            ],
          ),
      ],
    );
    // Like an HTML table: columns share the width and long text wraps. On
    // phone-sized screens it scrolls sideways instead of squeezing.
    // Fills the card width, letting columns shrink and text wrap; only if
    // even that doesn't fit does it scroll sideways (like the site's tables).
    return LayoutBuilder(builder: (context, c) => _SideScroll(child: _AtLeastMinWidth(width: c.maxWidth, child: table)));
  }
}

/// Sideways scrolling with a visible scrollbar (shown only when there is more
/// to see), like a browser's.
class _SideScroll extends StatefulWidget {
  const _SideScroll({required this.child});
  final Widget child;
  @override
  State<_SideScroll> createState() => _SideScrollState();
}

class _SideScrollState extends State<_SideScroll> {
  final _controller = ScrollController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scrollbar(
    controller: _controller,
    thumbVisibility: true,
    child: SingleChildScrollView(
      controller: _controller,
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.only(bottom: 6),
      child: widget.child,
    ),
  );
}

/// Lays its child out at [width], or at the child's narrowest possible width
/// if that is wider.
class _AtLeastMinWidth extends SingleChildRenderObjectWidget {
  const _AtLeastMinWidth({required this.width, required super.child});
  final double width;

  @override
  RenderObject createRenderObject(BuildContext context) => _RenderAtLeastMinWidth(width);

  @override
  void updateRenderObject(BuildContext context, _RenderAtLeastMinWidth renderObject) => renderObject.width = width;
}

class _RenderAtLeastMinWidth extends RenderProxyBox {
  _RenderAtLeastMinWidth(this._width);
  double _width;
  set width(double value) {
    if (value == _width) return;
    _width = value;
    markNeedsLayout();
  }

  @override
  void performLayout() {
    final w = math.max(_width, child!.getMinIntrinsicWidth(double.infinity));
    child!.layout(BoxConstraints.tightFor(width: w), parentUsesSize: true);
    size = constraints.constrain(child!.size);
  }
}

/// TableControls: search box and sort menu on top of a table card.
class TableControls extends StatelessWidget {
  const TableControls({
    super.key,
    required this.hint,
    required this.onQuery,
    required this.sortLabel,
    required this.sortOptions,
    required this.onSort,
  });
  final String hint;
  final ValueChanged<String> onQuery;
  final String sortLabel;
  final List<String> sortOptions;
  final ValueChanged<int> onSort;

  @override
  Widget build(BuildContext context) {
    final search = TextField(
      onChanged: onQuery,
      style: tSm,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Padding(
          padding: EdgeInsets.all(10),
          child: WebIcon(Icons2.search, size: 16, color: Brand.muted, stroke: 2),
        ),
        prefixIconConstraints: const BoxConstraints(minWidth: 36),
      ),
    );
    final sort = PopupMenuButton<int>(
      onSelected: onSort,
      color: Colors.white,
      itemBuilder: (_) => [
        for (var i = 0; i < sortOptions.length; i++)
          PopupMenuItem(
            value: i,
            child: Text(sortOptions[i], style: tSm),
          ),
      ],
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: Brand.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text('Sort: $sortLabel', style: tSm, overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(width: 8),
            const WebIcon(Icons2.chevronDown, size: 14, color: Brand.ink, stroke: 2),
          ],
        ),
      ),
    );
    return Container(
      color: Brand.slate50.withValues(alpha: 0.6),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      // Side by side when there's room, stacked when not (the site's flex-wrap).
      child: LayoutBuilder(
        builder: (context, c) => c.maxWidth < 480
            ? Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  search,
                  const SizedBox(height: 8),
                  Align(alignment: Alignment.centerLeft, child: sort),
                ],
              )
            : Row(
                children: [
                  Expanded(child: search),
                  const SizedBox(width: 8),
                  sort,
                ],
              ),
      ),
    );
  }
}

// ------------------------------------------------------------------ buttons

enum BtnKind { primary, secondary, danger }

/// btnPrimary / btnSecondary / btnDanger, with the site's press-in scale.
class WebButton extends StatefulWidget {
  const WebButton(
    this.label, {
    super.key,
    required this.onPressed,
    this.kind = BtnKind.primary,
    this.icon,
    this.busy = false,
    this.expand = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    this.fontSize = 14,
    this.radius = 6,
    this.fontWeight = FontWeight.w500,
  });
  final String label;
  final VoidCallback? onPressed;
  final BtnKind kind;
  final Widget? icon;
  final bool busy;
  final bool expand;
  final EdgeInsets padding;
  final double fontSize;
  final double radius;
  final FontWeight fontWeight;

  @override
  State<WebButton> createState() => _WebButtonState();
}

class _WebButtonState extends State<WebButton> {
  bool _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null && !widget.busy;
    final (bg, fg, border) = switch (widget.kind) {
      BtnKind.primary => (Brand.navy, Colors.white, Brand.navy),
      BtnKind.secondary => (Colors.white, Brand.ink, Brand.line),
      BtnKind.danger => (Colors.white, Brand.red700, Brand.red200),
    };
    final content = Row(
      mainAxisSize: widget.expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (widget.busy) ...[
          SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: fg)),
          const SizedBox(width: 8),
        ] else if (widget.icon != null) ...[
          widget.icon!,
          const SizedBox(width: 8),
        ],
        Flexible(
          child: Text(
            widget.label,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: widget.fontSize, fontWeight: widget.fontWeight, color: fg, fontFeatures: tabular),
          ),
        ),
      ],
    );
    return Opacity(
      opacity: enabled || widget.busy ? 1 : 0.5,
      child: AnimatedScale(
        scale: _down ? 0.97 : 1,
        duration: const Duration(milliseconds: 150),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(widget.radius),
            border: Border.all(color: border),
            boxShadow: widget.kind == BtnKind.danger ? null : Brand.shadowSm,
          ),
          child: Material(
            type: MaterialType.transparency,
            borderRadius: BorderRadius.circular(widget.radius),
            child: InkWell(
              borderRadius: BorderRadius.circular(widget.radius),
              onTap: enabled ? widget.onPressed : null,
              onHighlightChanged: (v) => setState(() => _down = v),
              child: Padding(padding: widget.padding, child: content),
            ),
          ),
        ),
      ),
    );
  }
}

/// A text link styled like the site's brand links.
class WebLink extends StatelessWidget {
  const WebLink(this.text, {super.key, required this.onTap, this.style});
  final String text;
  final VoidCallback? onTap;
  final TextStyle? style;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Text(
      text,
      style: (style ?? tSm).copyWith(color: Brand.navy, fontWeight: FontWeight.w500),
    ),
  );
}

/// The site's modal (Modal.tsx): a white panel with a titled header.
Future<T?> showWebDialog<T>(
  BuildContext context, {
  required String title,
  String? description,
  required Widget Function(BuildContext) body,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Close',
    barrierColor: Brand.slate900.withValues(alpha: 0.5),
    transitionDuration: const Duration(milliseconds: 220),
    transitionBuilder: (_, a, _, child) => FadeTransition(
      opacity: a,
      child: ScaleTransition(
        scale: Tween(begin: 0.96, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)),
        child: child,
      ),
    ),
    pageBuilder: (ctx, _, _) => SafeArea(
      child: Center(
        child: Padding(
          padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + MediaQuery.viewInsetsOf(ctx).bottom),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 672),
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(8),
              elevation: 12,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    padding: const EdgeInsets.fromLTRB(24, 16, 12, 16),
                    decoration: const BoxDecoration(
                      border: Border(bottom: BorderSide(color: Brand.line)),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, color: Brand.ink),
                              ),
                              if (description != null)
                                Padding(
                                  padding: const EdgeInsets.only(top: 2),
                                  child: Text(description, style: tMuted),
                                ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: () => Navigator.of(ctx).pop(),
                          icon: const WebIcon(Icons2.close, size: 20, color: Brand.muted, stroke: 2),
                        ),
                      ],
                    ),
                  ),
                  Flexible(
                    child: SingleChildScrollView(padding: const EdgeInsets.fromLTRB(24, 20, 24, 20), child: body(ctx)),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
