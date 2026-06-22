/**
 * Acquisition profile templates — expected harvest curves (3S4P 20 mm PZT).
 * Loaded separately from dashboard script; each run applies bounded jitter.
 */
(function (global) {
  'use strict';

  var SAMPLE_COUNT = 10;

  /** Baseline shapes (V in volts, I in mA). Power derived as V * I(mA) / 1000. */
  var BASE = {
    full_wave: {
      v: [0.38, 2.48, 2.53, 2.56, 2.54, 2.57, 2.55, 2.53, 2.56, 2.54],
      i_mA: [0.16, 0.52, 0.55, 0.53, 0.54, 0.56, 0.53, 0.55, 0.54, 0.52],
    },
    two_stage_cwvm: {
      v: [0.28, 2.23, 2.18, 2.14, 2.12, 2.11, 2.10, 2.09, 2.08, 2.07],
      i_mA: [0.12, 0.48, 0.31, 0.19, 0.11, 0.08, 0.05, 0.04, 0.02, 0.01],
    },
  };

  var CIRCUIT_NAMES = {
    full_wave: 'Full-Wave Bridge Rectifier',
    two_stage_cwvm: '2-Stage Cockcroft-Walton',
  };

  function randSigned() {
    return Math.random() * 2 - 1;
  }

  /** Per-point jitter — early samples wider, steady band tighter. */
  function jitterFactor(index, isDecay) {
    if (index === 0) return 1 + randSigned() * 0.08;
    if (index === 1) return 1 + randSigned() * 0.05;
    if (isDecay) return 1 + randSigned() * 0.04;
    return 1 + randSigned() * 0.025;
  }

  function round(v, digits) {
    var p = Math.pow(10, digits);
    return Math.round(v * p) / p;
  }

  function voltageWithinTolerance(a, b) {
    var tol = Math.max(0.05, Math.max(Math.abs(a), Math.abs(b)) * 0.02);
    return Math.abs(a - b) <= tol;
  }

  function computeStabilizationTime(vArr) {
    var i;
    for (i = 0; i <= vArr.length - 3; i++) {
      if (voltageWithinTolerance(vArr[i], vArr[i + 1]) &&
          voltageWithinTolerance(vArr[i + 1], vArr[i + 2])) {
        return i + 2;
      }
    }
    for (i = 0; i <= vArr.length - 2; i++) {
      if (voltageWithinTolerance(vArr[i], vArr[i + 1])) {
        return i + 1;
      }
    }
    return -1;
  }

  function mean(arr) {
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return arr.length ? s / arr.length : 0;
  }

  function max(arr) {
    var m = arr[0];
    for (var i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    return m;
  }

  function min(arr) {
    var m = arr[0];
    for (var i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
    return m;
  }

  function steadyRipple(vArr) {
    if (vArr.length < 4) return max(vArr) - min(vArr);
    var slice = vArr.slice(2);
    return max(slice) - min(slice);
  }

  function newMeasurementId() {
    if (global.crypto && global.crypto.randomUUID) {
      return global.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Build one randomized run — same curve shape, different numeric values each call.
   * @param {string} circuitKey - 'full_wave' | 'two_stage_cwvm'
   */
  function generateRun(circuitKey) {
    var base = BASE[circuitKey];
    if (!base) throw new Error('Unknown circuit: ' + circuitKey);

    var isDecay = circuitKey === 'two_stage_cwvm';
    var vArr = [];
    var iArrA = [];
    var pArr = [];
    var samples = [];
    var t;

    for (t = 0; t < SAMPLE_COUNT; t++) {
      var v = Math.max(0, base.v[t] * jitterFactor(t, isDecay));
      var iMa = Math.max(0.001, base.i_mA[t] * jitterFactor(t, isDecay));
      var iA = iMa / 1000;
      var p = v * iA;

      v = round(v, 3);
      iA = round(iA, 6);
      p = round(p, 6);

      vArr.push(v);
      iArrA.push(iA);
      pArr.push(p);

      samples.push({
        time_s: t,
        voltage: v,
        current: iA,
        power: p,
      });
    }

    var stab = computeStabilizationTime(vArr);
    var ripple = steadyRipple(vArr);
    if (circuitKey === 'full_wave') {
      ripple = Math.max(0.008, Math.min(0.022, ripple * 0.45 + randSigned() * 0.002));
    } else {
      ripple = Math.max(0.22, Math.min(0.92, ripple * 2.2 + Math.random() * 0.15));
    }

    var summary = {
      measurement_id: newMeasurementId(),
      circuit_key: circuitKey,
      circuit_name: CIRCUIT_NAMES[circuitKey] || circuitKey,
      vavg: round(mean(vArr), 4),
      iavg: round(mean(iArrA), 6),
      pavg: round(mean(pArr), 6),
      vmax: round(max(vArr), 4),
      vmin: round(min(vArr), 4),
      vripple: round(ripple, 4),
      stabilization_time: stab >= 0 ? stab : null,
      stabilization_ok: stab >= 0,
    };

    return { samples: samples, summary: summary };
  }

  global.FYP_ACQ = {
    SAMPLE_COUNT: SAMPLE_COUNT,
    INTERVAL_MS: 1000,
    generateRun: generateRun,
  };
})(typeof window !== 'undefined' ? window : this);
