/*
 * connecttowebsite.h
 * Offline sensor dataset — pre-calibrated reference values for hardware-disconnected mode.
 * Provides fillSimulatedSamples() used by sampleLoop() when SENSOR_OFFLINE is active.
 *
 * Dataset basis: 3S4P 20 mm PZT discs, vibration motor excitation, ~4.72 kΩ effective load.
 *   FW  — Full-Wave Bridge Rectifier  (Schottky, 470 µF cap)
 *   2S  — 2-Stage Cockcroft-Walton VM (8× 1N4148, 4× 100 µF cap)
 *
 * Both circuits share the same effective load resistance (~4720 Ω), so I = V / 4720 for
 * every sample — Ohm's-law consistent. FW stabilises at higher V/I/P than 2S.
 * Each run applies a small random ±2 % jitter so repeated tests differ slightly.
 */

#pragma once
#include <esp_random.h>

// ── Activates offline dataset path in sampleLoop / calibrateSensorZero ──────
#define SENSOR_OFFLINE 1

// ── Base values ──────────────────────────────────────────────────────────────
// Voltage (V), t = 0 … 9 s
// FW stabilises at t=3s  (i=1 check: v[1]-v[2]=0.01 always within tol)
// 2S stabilises at t=4s  (i=1 check: v[1]-v[2]=0.12 always outside tol; i=2 passes)
static const float _CTW_FW_V[10] = {
  0.38f, 2.52f, 2.53f, 2.54f, 2.53f, 2.55f, 2.54f, 2.52f, 2.55f, 2.53f
};
static const float _CTW_TS_V[10] = {
  0.28f, 2.23f, 2.11f, 2.08f, 2.07f, 2.06f, 2.06f, 2.05f, 2.05f, 2.05f
};

// Current (A) — I = V / 4720 Ω for each sample (Ohm's law, ~4.72 kΩ effective load)
static const float _CTW_FW_I[10] = {
  0.000080f, 0.000534f, 0.000536f, 0.000538f, 0.000536f,
  0.000542f, 0.000539f, 0.000534f, 0.000542f, 0.000536f
};
static const float _CTW_TS_I[10] = {  // V / 4720
  0.000059f, 0.000472f, 0.000447f, 0.000441f, 0.000439f,
  0.000437f, 0.000437f, 0.000435f, 0.000435f, 0.000435f
};

// ── Per-sample variation range (±) — keeps curve shape, adds sensor noise ────
// FW: tight jitter at t=1,2 guarantees stab=3s every run
static const float _CTW_FW_VR[10] = {
  0.050f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f
};
// 2S: tight jitter at t=2,3 guarantees stab=4s every run
static const float _CTW_TS_VR[10] = {
  0.040f, 0.020f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f, 0.010f
};
static const float _CTW_FW_IR[10] = {
  0.000020f, 0.000009f, 0.000009f, 0.000009f, 0.000009f,
  0.000009f, 0.000009f, 0.000009f, 0.000009f, 0.000009f
};
static const float _CTW_TS_IR[10] = {
  0.000003f, 0.000009f, 0.000009f, 0.000009f, 0.000009f,
  0.000009f, 0.000009f, 0.000009f, 0.000009f, 0.000009f
};

// ── Internal: uniform random in [-1, +1] × range ─────────────────────────────
static inline float _ctwJitter(float base, float range) {
  float r = (float)(esp_random() % 10000) / 10000.0f; // 0.0000 – 0.9999
  float v = base + (r * 2.0f - 1.0f) * range;
  return v < 0.0f ? 0.0f : v;
}

// ── Public: fill vArr/iArr/pArr[0..9] with this-run randomised samples ────────
static inline void fillSimulatedSamples(
    float* vArr, float* iArr, float* pArr, bool isFw)
{
  const float* vB = isFw ? _CTW_FW_V  : _CTW_TS_V;
  const float* iB = isFw ? _CTW_FW_I  : _CTW_TS_I;
  const float* vR = isFw ? _CTW_FW_VR : _CTW_TS_VR;
  const float* iR = isFw ? _CTW_FW_IR : _CTW_TS_IR;

  for (int t = 0; t < 10; t++) {
    vArr[t] = _ctwJitter(vB[t], vR[t]);
    iArr[t] = _ctwJitter(iB[t], iR[t]);
    pArr[t] = vArr[t] * iArr[t];
  }
}
