/* FImuse — generic adaptive music director, modelled on LucasArts iMUSE.
 *
 * The brick knows nothing about the host game: it only sees abstract cues, segments,
 * bars and layers supplied by the host. It owns the musical transport (which
 * segment plays which bar, which layers are audible) and nothing else: no
 * audio node, no clock, no timer, no randomness, no host content.
 *
 * Two independent mechanics are provided, both required by the brief:
 *   vertical layers  — layers enter and leave on a bar boundary, driven by an
 *                      intensity value and a per-layer threshold;
 *   horizontal joins — a requested cue never cuts in. The current bar is
 *                      always finished, the current segment is finished too
 *                      unless the request is urgent, then a written
 *                      transition segment (fill, rise, bridge) plays before
 *                      the target cue is entered.
 *
 * Determinism: the director is a pure function of the request sequence and of
 * the number of nextBar() calls. No clock, no pseudo-random draw, no iteration order
 * a host could not reproduce.
 */
(function (G) {
  'use strict';
  const {min, max, floor} = Math;
  const clamp = (x, a, b) => max(a, min(b, x));
  const EMPTY = [];

  function validate(cues) {
    const problems = [];
    if (!cues || !Object.keys(cues).length) return ['no cues'];
    for (const id of Object.keys(cues)) {
      const cue = cues[id];
      if (!cue || !cue.segments) { problems.push(id + ': segments missing'); continue; }
      if (!Array.isArray(cue.order) || !cue.order.length) problems.push(id + ': order missing');
      for (const name of cue.order || EMPTY) if (!cue.segments[name]) problems.push(id + ': unknown segment ' + name);
      if (cue.entry !== undefined && !cue.segments[cue.entry]) problems.push(id + ': unknown entry ' + cue.entry);
      for (const t of cue.transitions || EMPTY) {
        if (!cue.segments[t.segment]) problems.push(id + ': unknown transition segment ' + t.segment);
        if (!Number.isInteger(t.bars) || t.bars < 1) problems.push(id + ': transition without bars');
      }
      for (const name of Object.keys(cue.segments)) {
        const seg = cue.segments[name];
        if (!Number.isInteger(seg.bars) || seg.bars < 1) problems.push(id + ': segment without bars ' + name);
        for (const layer of seg.layers || EMPTY) if (!(layer in (cue.layerMin || {}))) problems.push(id + ': undeclared layer ' + layer);
      }
    }
    return problems;
  }

  function create(options) {
    const opts = options || {};
    const supplied = opts.cues || {};
    const problems = validate(supplied);
    if (problems.length) throw new Error('FImuse: ' + problems.join('; '));
    // Descriptors are copied into null-prototype tables: the director owns its
    // view of the score and a host object can never grow into it.
    const cues = Object.create(null);
    for (const id of Object.keys(supplied)) {
      const cue = supplied[id];
      const segments = Object.create(null);
      for (const name of Object.keys(cue.segments)) {
        const segment = cue.segments[name];
        segments[name] = {...segment, layers: (segment.layers || EMPTY).slice()};
      }
      cues[id] = {
        bpm: cue.bpm, entry: cue.entry, order: (cue.order || []).slice(),
        segments,
        layerMin: Object.assign(Object.create(null), cue.layerMin),
        transitions: (cue.transitions || []).map(t => ({...t}))
      };
    }
    const ids = Object.keys(cues);
    const defaultCue = cues[opts.cue] !== undefined ? opts.cue : ids[0];
    const step = opts.intensityStep === undefined ? .05 : max(0, Number(opts.intensityStep) || 0);
    // The event key that caused the current visit is remembered, so the same
    // in-game event cannot pull the transport back onto the same piece.
    const fired = new Map();
    let cueId = defaultCue, segmentName = entryOf(cues[defaultCue]), bar = 0, barIndex = 0;
    let quantized = 0, pending = null, transition = null, joining = false;
    const stats = {barIndex: 0, switches: 0, transitions: 0, ignored: 0, layerChanges: 0, pending: '', transition: ''};

    function entryOf(cue) { return cue.entry !== undefined ? cue.entry : cue.order[0]; }
    function cueOf(id) { return cues[id] || cues[cueId]; }

    // A join is written by the host as a segment plus the pair it links.
    // Wildcards let a cue declare one generic join instead of a full matrix.
    function pickTransition(cue, from, to) {
      let best = null, bestScore = -1;
      for (const t of cue.transitions || EMPTY) {
        const fromOk = t.from === undefined || t.from === '*' ? 1 : (t.from === from ? 2 : 0);
        const toOk = t.to === undefined || t.to === '*' ? 1 : (t.to === to ? 2 : 0);
        if (!fromOk || !toOk) continue;
        const score = fromOk * 2 + toOk;
        if (score > bestScore) { best = t; bestScore = score; }
      }
      return best;
    }

    function nextSegment(cue, current) {
      // A fixed progression keeps the arrangement reproducible; a host that
      // wants another rule supplies its own order array.
      return cue.order[(cue.order.indexOf(current) + 1) % cue.order.length];
    }

    function layersOf(cue, segment) {
      const out = [];
      for (const layer of segment.layers || EMPTY) if (quantized >= cue.layerMin[layer]) out.push(layer);
      return out;
    }

    function setIntensity(value) {
      const next = clamp(Number(value) || 0, 0, 1);
      const stepped = step > 0 ? floor(next / step + 1e-9) * step : next;
      if (stepped === quantized) return false;
      quantized = stepped; stats.layerChanges++;
      return true;
    }

    function enterCue(id) {
      cueId = id; segmentName = entryOf(cues[id]); bar = 0; joining = false;
      fired.delete(id);
      if (pending && pending.key && pending.cue === id) fired.set(id, pending.key);
      pending = null; transition = null; stats.pending = ''; stats.transition = ''; stats.switches++;
    }

    // Requests are idempotent. The same piece, the same queued piece and the
    // same event key that already caused this visit change nothing at all.
    // `force` is the host saying the situation really did change: the piece is
    // re-entered on the next bar line, still through the written join.
    function request(id, meta) {
      if (!cues[id]) { stats.ignored++; return false; }
      const info = meta || {}, urgent = !!info.urgent, key = info.key || '', force = !!info.force;
      if (!force) {
        if (!pending && !joining && id === cueId) { stats.ignored++; return false; }
        if (pending && pending.cue === id) { pending.urgent = pending.urgent || urgent; stats.ignored++; return false; }
        if (key && !pending && fired.get(cueId) === key) { stats.ignored++; return false; }
        if (key && pending && fired.get(pending.cue) === key) { stats.ignored++; return false; }
      }
      pending = {cue: id, urgent: urgent || force, key}; stats.pending = id;
      return true;
    }

    // The bar returned is always self-consistent: cue, segment and bar index
    // all describe the same bar, so a host can switch its score on it.
    function nextBar() {
      const cue = cueOf(cueId);
      const name = joining ? transition.segment : segmentName;
      const segment = cue.segments[name];
      const out = {
        cue: cueId, segment: name, bar: joining ? transition.bar : bar, bars: segment.bars, index: barIndex,
        layers: layersOf(cue, segment), transition: joining ? transition.kind : null,
        tempo: cue.bpm === undefined ? 120 : cue.bpm, intensity: quantized,
        pending: pending ? pending.cue : ''
      };
      barIndex++; stats.barIndex = barIndex;
      advance(cue);
      return out;
    }

    // Move the transport to the bar that follows the one just handed out.
    function advance(cue) {
      if (joining) {
        const join = transition;
        if (join.bar + 1 >= join.bars) {
          // The written join is over: the next bar belongs to the target. A
          // request made during the join wins over the original target.
          enterCue(pending && pending.cue !== join.target ? pending.cue : join.target);
        } else join.bar++;
        return;
      }
      if (pending) {
        const finished = bar + 1 >= cue.segments[segmentName].bars;
        if (finished || pending.urgent) {
          const join = pickTransition(cue, segmentName, pending.cue);
          if (join) {
            transition = {kind: join.kind || 'fill', segment: join.segment, bars: join.bars, bar: 0, target: pending.cue};
            joining = true; stats.transitions++; stats.transition = transition.kind;
            return;
          }
          enterCue(pending.cue);
          return;
        }
      }
      if (bar + 1 >= cue.segments[segmentName].bars) { bar = 0; segmentName = nextSegment(cue, segmentName); }
      else bar++;
    }

    function state() {
      const cue = cueOf(cueId), segment = cue.segments[joining ? transition.segment : segmentName];
      return {
        cue: cueId, segment: joining ? transition.segment : segmentName,
        bar: joining ? transition.bar : bar, bars: segment.bars, barIndex,
        intensity: quantized, pending: pending ? pending.cue : '',
        transition: joining ? transition.kind : '', layers: layersOf(cue, segment)
      };
    }

    return {
      nextBar, request, setIntensity, state, stats, validate,
      cueIds: () => ids.slice(),
      // A host that pauses its transport asks to come back on a bar line: the
      // position restarts at the top of the current segment, the queued request
      // and the memory of fired events survive.
      realign() { if (!joining) bar = 0; },
      // A host that restarts a run resets the transport without rebuilding.
      reset(id) {
        cueId = cues[id] !== undefined ? id : defaultCue;
        segmentName = entryOf(cues[cueId]); bar = 0; barIndex = 0;
        pending = null; transition = null; joining = false;
        stats.pending = ''; stats.transition = ''; stats.barIndex = 0;
        fired.clear();
      }
    };
  }

  G.FImuse = {create, validate};
})(typeof window !== 'undefined' ? window : globalThis);
