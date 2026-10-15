import { Component, computed, input } from '@angular/core';
import type { ChartSpec } from '../../domain/ai-tools';
import { formatBRL } from '../../domain/money';

const W = 320;
const H = 180;
const PAD = { top: 12, right: 8, bottom: 28, left: 44 };
const COLORS = ['var(--cofre-gold)', 'var(--cofre-loan)', 'var(--cofre-gain)', 'var(--cofre-debt)'];

/** Desenha um ChartSpec já validado (barras, linhas ou pizza) em SVG. */
@Component({
  selector: 'app-chart',
  template: `
    <figure>
      <figcaption>{{ spec().title }}</figcaption>
      <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" role="img" [attr.aria-label]="spec().title">
        @if (spec().kind === 'pie') {
          @for (s of slices(); track $index) {
            <path [attr.d]="s.d" [attr.fill]="colors[$index % colors.length]" stroke="var(--cofre-surface)" stroke-width="2" />
          }
        } @else {
          @for (t of ticks(); track $index) {
            <line [attr.x1]="pad.left" [attr.x2]="w - pad.right" [attr.y1]="t.y" [attr.y2]="t.y" stroke="var(--cofre-line)" />
            <text [attr.x]="pad.left - 4" [attr.y]="t.y + 3" text-anchor="end" class="axis">{{ t.label }}</text>
          }
          @for (l of xLabels(); track $index) {
            <text [attr.x]="l.x" [attr.y]="h - 10" text-anchor="middle" class="axis">{{ l.label }}</text>
          }
          @if (spec().kind === 'bar') {
            @for (b of bars(); track $index) {
              <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" [attr.fill]="b.color" rx="3" />
            }
          } @else {
            @for (l of lines(); track $index) {
              <polyline [attr.points]="l.points" fill="none" [attr.stroke]="l.color" stroke-width="2.5" stroke-linejoin="round" />
            }
          }
        }
      </svg>
      @if (spec().series.length > 1 || spec().kind === 'pie') {
        <ul class="legend">
          @for (item of legend(); track $index) {
            <li><i [style.background]="colors[$index % colors.length]"></i>{{ item }}</li>
          }
        </ul>
      }
    </figure>
  `,
  styles: `
    figure { margin: 0; }
    figcaption { font-weight: 600; font-size: 14px; margin-bottom: 6px; }
    svg { width: 100%; height: auto; display: block; }
    .axis { font-size: 9px; fill: var(--cofre-muted); font-family: var(--cofre-num); }
    .legend { list-style: none; padding: 0; margin: 6px 0 0; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--cofre-muted); }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
  `,
})
export class ChartComponent {
  readonly spec = input.required<ChartSpec>();
  readonly w = W;
  readonly h = H;
  readonly pad = PAD;
  readonly colors = COLORS;

  private fmt(v: number): string {
    const u = this.spec().unit;
    if (u === 'brl') return Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : formatBRL(Math.round(v * 100)).replace('R$ ', '');
    if (u === 'percent') return `${Math.round(v * 10) / 10}%`;
    return String(Math.round(v * 100) / 100);
  }

  private readonly range = computed(() => {
    const all = this.spec().series.flatMap((s) => s.values);
    const max = Math.max(0, ...all);
    const min = Math.min(0, ...all);
    return { min, max: max === min ? min + 1 : max };
  });

  private y(v: number): number {
    const { min, max } = this.range();
    return PAD.top + (H - PAD.top - PAD.bottom) * (1 - (v - min) / (max - min));
  }

  private x(i: number): number {
    const n = this.spec().labels.length;
    const inner = W - PAD.left - PAD.right;
    return PAD.left + inner * ((i + 0.5) / n);
  }

  readonly ticks = computed(() => {
    const { min, max } = this.range();
    return [0, 0.5, 1].map((f) => {
      const v = min + (max - min) * f;
      return { y: this.y(v), label: this.fmt(v) };
    });
  });

  readonly xLabels = computed(() => {
    const labels = this.spec().labels;
    const step = Math.ceil(labels.length / 8); // evita rótulos sobrepostos
    return labels.map((label, i) => ({ x: this.x(i), label: label.slice(0, 8) })).filter((_, i) => i % step === 0);
  });

  readonly bars = computed(() => {
    const s = this.spec();
    const slot = (W - PAD.left - PAD.right) / s.labels.length;
    const bw = (slot * 0.7) / s.series.length;
    return s.series.flatMap((series, si) =>
      series.values.map((v, i) => {
        const y0 = this.y(0);
        const y1 = this.y(v);
        return { x: PAD.left + slot * i + slot * 0.15 + bw * si, y: Math.min(y0, y1), w: bw, h: Math.max(1, Math.abs(y0 - y1)), color: COLORS[si % COLORS.length] };
      }),
    );
  });

  readonly lines = computed(() =>
    this.spec().series.map((s, si) => ({
      color: COLORS[si % COLORS.length],
      points: s.values.map((v, i) => `${this.x(i)},${this.y(v)}`).join(' '),
    })),
  );

  readonly slices = computed(() => {
    const values = this.spec().series[0].values;
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2, cy = H / 2, r = H / 2 - 8;
    let a0 = -Math.PI / 2;
    return values.map((v) => {
      const a1 = a0 + (v / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const d = v >= total
        ? `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`
        : `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
      a0 = a1;
      return { d };
    });
  });

  readonly legend = computed(() => {
    const s = this.spec();
    if (s.kind === 'pie') {
      const total = s.series[0].values.reduce((a, b) => a + b, 0) || 1;
      return s.labels.map((l, i) => `${l} · ${Math.round((s.series[0].values[i] / total) * 100)}%`);
    }
    return s.series.map((x) => x.name);
  });
}
