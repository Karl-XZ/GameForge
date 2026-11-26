"""Cheap, deterministic visual evidence for the critic.

DeepSeek-flash can look at screenshots, but a model alone is lenient about placeholder art (it called a
rectangle-robot "restrained, refined neon"). These numbers anchor the critique: they are measured from the
code and from the live canvas, never claimed by a model.
"""
import re

PRIMITIVE = ('fillRect', 'strokeRect', 'clearRect', 'arc(')
DETAIL = ('bezierCurveTo', 'quadraticCurveTo', 'lineTo', 'ellipse(', 'roundRect', 'createLinearGradient',
          'createRadialGradient', 'createPattern', 'drawImage', 'putImageData', 'shadowBlur', 'globalCompositeOperation',
          'Path2D', 'rotate(', 'setTransform', 'filter =')
FEEL = {
    'camera': r'camera|cam\.|viewport|scrollX|offsetX',
    'particles': r'particle',
    'screen_shake': r'shake',
    'coyote_time': r'coyote',
    'jump_buffer': r'jump\s*buffer|jumpBuffer|bufferTime',
    'parallax': r'parallax|layers?\s*\[',
    'audio': r'AudioContext|webkitAudioContext|oscillator',
    'animation_frames': r'frame\s*(index|count|timer)|animFrame|animTimer|walkCycle|sprite\s*frame',
    'easing_or_tween': r'ease|lerp|tween',
    'hit_feedback': r'hitstop|hitStop|flash|invuln|knockback',
}


def code_stats(html):
    text = html or ''
    primitive = {name.rstrip('('): text.count(name) for name in PRIMITIVE}
    detail = {name.rstrip('(').strip(' ='): text.count(name) for name in DETAIL}
    total_primitive, total_detail = sum(primitive.values()), sum(detail.values())
    feel = {k: bool(re.search(v, text, re.I)) for k, v in FEEL.items()}
    return {
        'chars': len(text),
        'primitiveCalls': total_primitive,
        'detailCalls': total_detail,
        'primitiveShare': round(total_primitive / max(1, total_primitive + total_detail), 3),
        'primitive': primitive,
        'detail': {k: v for k, v in detail.items() if v},
        'feel': feel,
        'feelCount': sum(feel.values()),
    }


def placeholder_art(stats, pixels=None):
    """True when the drawing code is overwhelmingly boxes and circles with no images or shaped paths."""
    shaped = stats['detail'].get('bezierCurveTo', 0) + stats['detail'].get('quadraticCurveTo', 0) + \
        stats['detail'].get('drawImage', 0) + stats['detail'].get('Path2D', 0) + stats['detail'].get('ellipse', 0)
    boxy = stats['primitiveShare'] >= 0.6 and shaped < 6
    if pixels and pixels.get('colors') is not None:
        boxy = boxy or (pixels['colors'] < 40 and shaped < 10)
    return boxy


# Runs inside the page: samples the largest canvas, counts quantized colours and edge density.
PIXEL_JS = r'''() => {
  const canvases = [...document.querySelectorAll('canvas')];
  if (!canvases.length) return null;
  const c = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  let data;
  try {
    const t = document.createElement('canvas'); t.width = 240; t.height = Math.max(1, Math.round(240 * c.height / c.width));
    const x = t.getContext('2d'); x.drawImage(c, 0, 0, t.width, t.height); data = x.getImageData(0, 0, t.width, t.height);
  } catch (e) { return {error: String(e)}; }
  const {width: w, height: h, data: d} = data; const seen = new Set(); let edges = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    if (x + 1 < w) { const j = i + 4; if (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) > 60) edges++; }
  }
  return {colors: seen.size, edgeDensity: +(edges / (w * h)).toFixed(4), canvas: [c.width, c.height]};
}'''
