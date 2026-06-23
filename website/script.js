/**
 * FYP Dashboard — Full-Wave vs 2-Stage CWVM
 */
(function () {
  'use strict';

  const CIRCUIT = {
    FW: 'full_wave',
    TS: 'two_stage_cwvm',
  };

  const RELAY_LABELS = [
    'R1 V→FW', 'R2 V→2S', 'R3 I→FW', 'R4 I→2S',
    'R5 P→FW', 'R6 P→2S', 'R7 Vibration', 'R8 —',
  ];

  /** ESP32 heartbeat every 2s — longer grace while measuring (upload can take 20s+) */
  const HEARTBEAT_STALE_MS = 10000;
  const MEASURING_STALE_MS = 45000;
  const STATE_POLL_MS = 2500;

  const STAGE_LABELS = {
    idle: 'Idle',
    measuring_fw: 'Measuring FW',
    fw_measured: 'FW Measured',
    measuring_2s: 'Measuring 2S',
    twos_measured: '2S Measured',
  };

  const CIRCUIT_LABELS = {
    none: 'None',
    full_wave: 'Full-Wave Bridge',
    two_stage_cwvm: '2-Stage CWVM',
  };

  let sb = null;
  let systemState = {};
  let summaries = { full_wave: null, two_stage_cwvm: null };
  let samples = { full_wave: [], two_stage_cwvm: [] };
  let charts = {};
  let lastKnownStage = 'idle';

  const $ = (id) => document.getElementById(id);

  function fmt(v, digits = 3) {
    if (v == null || Number.isNaN(v)) return '—';
    return Number(v).toFixed(digits);
  }

  function fmtStab(s) {
    if (!s || !s.stabilization_ok) return '—';
    return `${fmt(s.stabilization_time, 0)} s`;
  }

  function initSupabase() {
    const cfg = window.FYP_CONFIG || {};
    const url = cfg.SUPABASE_URL || window.SUPABASE_URL;
    const key = cfg.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error('Missing config.js (FYP_CONFIG)');
      return false;
    }
    sb = window.supabase.createClient(url, key);
    return true;
  }

  function chartOptions(yLabel) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      scales: {
        x: { title: { display: true, text: 'Time (s)' }, ticks: { stepSize: 1 } },
        y: { title: { display: true, text: yLabel } },
      },
      plugins: { legend: { display: false } },
    };
  }

  function makeChart(canvasId, label, color) {
    const ctx = $(canvasId).getContext('2d');
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label,
          data: [],
          borderColor: color,
          backgroundColor: color + '33',
          tension: 0.2,
          fill: true,
        }],
      },
      options: chartOptions(label),
    });
  }

  function initCharts() {
    charts.fwV = makeChart('chartFwV', 'Voltage (V)', '#3b82f6');
    charts.fwI = makeChart('chartFwI', 'Current (mA)', '#22d3ee');
    charts.fwP = makeChart('chartFwP', 'Power (mW)', '#a78bfa');
    charts.tsV = makeChart('chart2sV', 'Voltage (V)', '#f97316');
    charts.tsI = makeChart('chart2sI', 'Current (mA)', '#fbbf24');
    charts.tsP = makeChart('chart2sP', 'Power (mW)', '#fb7185');
  }

  function updateChart(chart, rows, field) {
    const sorted = [...rows].sort((a, b) => a.time_s - b.time_s);
    // current stored in A → display mA; power stored in W → display mW
    const scale = (field === 'current' || field === 'power') ? 1000 : 1;
    chart.data.labels = sorted.map((r) => r.time_s);
    chart.data.datasets[0].data = sorted.map((r) => (r[field] || 0) * scale);
    const vals = chart.data.datasets[0].data;
    const maxVal = vals.length ? Math.max(...vals, 0) : 0;
    chart.options.scales.y.suggestedMin = 0;
    chart.options.scales.y.suggestedMax = maxVal < 0.5 ? 1 : undefined;
    chart.update();
  }

  function clearCircuitDisplay(circuitKey) {
    samples[circuitKey] = [];
    summaries[circuitKey] = null;
    renderCircuit(circuitKey);
    updateConclusionButton();
  }

  function setMetrics(panelId, summary) {
    const panel = $(panelId);
    const map = {
      vavg: summary ? fmt(summary.vavg) + ' V' : '—',
      iavg: summary ? fmt(summary.iavg * 1000, 3) + ' mA' : '—',
      pavg: summary ? fmt(summary.pavg * 1000, 3) + ' mW' : '—',
      stab: summary ? fmtStab(summary) : '—',
    };
    panel.querySelectorAll('[data-m]').forEach((el) => {
      el.textContent = map[el.dataset.m] || '—';
    });
  }

  function renderCircuit(circuitKey) {
    const isFw = circuitKey === CIRCUIT.FW;
    const rows = samples[circuitKey] || [];
    const summary = summaries[circuitKey];
    if (isFw) {
      updateChart(charts.fwV, rows, 'voltage');
      updateChart(charts.fwI, rows, 'current');
      updateChart(charts.fwP, rows, 'power');
      setMetrics('metricsFw', summary);
    } else {
      updateChart(charts.tsV, rows, 'voltage');
      updateChart(charts.tsI, rows, 'current');
      updateChart(charts.tsP, rows, 'power');
      setMetrics('metrics2s', summary);
    }
  }

  async function loadLatestSummary(circuitKey) {
    const { data, error } = await sb
      .from('measurement_summary')
      .select('*')
      .eq('circuit_key', circuitKey)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) { console.error(error); return; }
    summaries[circuitKey] = data && data[0] ? data[0] : null;
    if (summaries[circuitKey]) {
      await loadSamplesForRun(summaries[circuitKey].measurement_id, circuitKey);
    } else {
      samples[circuitKey] = [];
    }
    renderCircuit(circuitKey);
    updateConclusionButton();
  }

  async function loadSamplesForRun(measurementId, circuitKey) {
    const { data, error } = await sb
      .from('measurement_samples')
      .select('*')
      .eq('measurement_id', measurementId)
      .eq('circuit_key', circuitKey)
      .order('time_s', { ascending: true });
    if (error) { console.error(error); return; }
    samples[circuitKey] = data || [];
  }

  function isDeviceOnline(state) {
    if (!state || state.connection !== 'online') return false;
    if (!state.last_seen) return false;
    const age = Date.now() - new Date(state.last_seen).getTime();
    const limit = state.is_measuring ? MEASURING_STALE_MS : HEARTBEAT_STALE_MS;
    return age >= 0 && age < limit;
  }

  function onStageChange(stage) {
    if (stage === 'measuring_fw') clearCircuitDisplay(CIRCUIT.FW);
    if (stage === 'measuring_2s') clearCircuitDisplay(CIRCUIT.TS);
    if (stage === 'fw_measured') loadLatestSummary(CIRCUIT.FW);
    if (stage === 'twos_measured') loadLatestSummary(CIRCUIT.TS);
  }

  function formatLastSeen(iso) {
    if (!iso) return '—';
    const age = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (age < 5) return 'just now';
    if (age < 60) return `${age}s ago`;
    return `${Math.floor(age / 60)}m ago`;
  }

  function formatStage(stage, online) {
    if (!online) return '—';
    return STAGE_LABELS[stage] || stage || '—';
  }

  function formatCircuit(circuit, online) {
    if (!online) return '—';
    return CIRCUIT_LABELS[circuit] || circuit || 'none';
  }

  async function fetchSystemState() {
    const { data, error } = await sb.from('system_state').select('*').eq('id', 1).maybeSingle();
    if (error) {
      console.error('system_state poll failed', error);
      return;
    }
    if (data) updateStatusBar(data);
  }

  function updateStatusBar(state) {
    systemState = state || {};
    const online = isDeviceOnline(state);

    if (state.stage && state.stage !== lastKnownStage) {
      onStageChange(state.stage);
      lastKnownStage = state.stage;
    }

    $('connDot').classList.toggle('online', online);
    $('connDot').classList.toggle('offline-stale', !online);
    $('connText').textContent = online ? 'Online' : 'Offline';
    $('stageText').textContent = formatStage(state.stage, online);
    $('circuitText').textContent = formatCircuit(state.active_circuit, online);
    $('lcdText').textContent = online ? (state.lcd_message || '—') : '—';
    $('lastSeenText').textContent = state.last_seen
      ? `${formatLastSeen(state.last_seen)}${online ? '' : ' (stale)'}`
      : '—';

    const ledFw = online && !!state.led_fw;
    const led2s = online && !!state.led_2s;
    const ledEl = $('ledText');
    ledEl.textContent = `FW ${ledFw ? 'ON' : 'off'} · 2S ${led2s ? 'ON' : 'off'}`;
    ledEl.className = 'led-status' + (ledFw ? ' fw-on' : '') + (led2s ? ' ts-on' : '');

    const statusBar = $('statusBar');
    if (statusBar) {
      statusBar.classList.toggle('device-offline', !online);
      statusBar.classList.toggle('device-measuring', online && !!state.is_measuring);
    }

    const relayBox = $('relayIndicators');
    relayBox.innerHTML = '';
    if (!online) {
      updateMeasureButtons();
      return;
    }
    const active = Array.isArray(state.active_relays) ? state.active_relays : [];
    if (active.length) {
      active.forEach((label) => {
        const span = document.createElement('span');
        span.className = 'relay-chip active';
        span.textContent = label;
        relayBox.appendChild(span);
      });
    } else {
      RELAY_LABELS.forEach((label, i) => {
        const on = state.relay_mask != null && (state.relay_mask & (1 << i));
        const span = document.createElement('span');
        span.className = 'relay-chip' + (on ? ' active' : '');
        span.textContent = label;
        relayBox.appendChild(span);
      });
    }

    updateMeasureButtons();
  }

  function isMeasuring() {
    return isDeviceOnline(systemState) && !!systemState.is_measuring;
  }

  function measuringCircuit() {
    const c = systemState.active_circuit;
    if (c === CIRCUIT.FW || c === CIRCUIT.TS) return c;
    if (systemState.stage === 'measuring_fw') return CIRCUIT.FW;
    if (systemState.stage === 'measuring_2s') return CIRCUIT.TS;
    return null;
  }

  function updateMeasureButtons() {
    const online = isDeviceOnline(systemState);
    const busy = !!systemState.is_measuring;
    const active = measuringCircuit();
    $('btnMeasureFw').disabled = !online || busy;
    $('btnMeasure2s').disabled = !online || busy;
    $('btnMeasureFw').textContent = busy && active === CIRCUIT.FW ? 'Measuring…' : 'Measure FW';
    $('btnMeasure2s').textContent = busy && active === CIRCUIT.TS ? 'Measuring…' : 'Measure 2S';
  }

  function updateConclusionButton() {
    const ready = summaries[CIRCUIT.FW] && summaries[CIRCUIT.TS];
    $('btnConclusion').disabled = !ready;
    $('conclusionHint').textContent = ready
      ? 'Click Conclusion to expand side-by-side comparison.'
      : 'Complete both measurements to unlock side-by-side comparison.';
  }

  async function sendCommand(command) {
    if (command === 'MEASURE_FW_CIRCUIT' || command === 'MEASURE_2S_CIRCUIT') {
      await sb.from('commands').update({
        status: 'error',
        error_message: 'Superseded by new button click',
        processed_at: new Date().toISOString(),
      }).eq('status', 'pending').in('command', ['MEASURE_FW_CIRCUIT', 'MEASURE_2S_CIRCUIT']);
    }
    const { error } = await sb.from('commands').insert({ command, status: 'pending' });
    if (error) alert('Command failed: ' + error.message);
  }

  function betterMetric(name, fw, ts, higherIsBetter) {
    if (fw == null || ts == null) return '—';
    if (Math.abs(fw - ts) < 1e-6) return 'Tie';
    const fwWins = higherIsBetter ? fw > ts : fw < ts;
    return fwWins ? 'Full-Wave' : '2-Stage CWVM';
  }

  function buildConclusionTable() {
    const fw = summaries[CIRCUIT.FW];
    const ts = summaries[CIRCUIT.TS];
    if (!fw || !ts) return;

    const rows = [
      ['Avg Voltage (V)', fmt(fw.vavg), fmt(ts.vavg), betterMetric('v', fw.vavg, ts.vavg, true)],
      ['Avg Current (mA)', fmt(fw.iavg * 1000, 3), fmt(ts.iavg * 1000, 3), betterMetric('i', fw.iavg, ts.iavg, true)],
      ['Avg Power (mW)', fmt(fw.pavg * 1000, 3), fmt(ts.pavg * 1000, 3), betterMetric('p', fw.pavg, ts.pavg, true)],
      ['Stabilization (s)', fmtStab(fw), fmtStab(ts), betterMetric('s', fw.stabilization_time, ts.stabilization_time, false)],
    ];

    const tbody = $('conclusionTable').querySelector('tbody');
    tbody.innerHTML = rows.map((r) =>
      `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="winner">${r[3]}</td></tr>`
    ).join('');

    const pWin = fw.pavg >= ts.pavg ? 'Full-Wave Bridge Rectifier' : '2-Stage Cockcroft-Walton';
    $('conclusionText').innerHTML = `
      <h3>Analysis</h3>
      <p>Under identical 10 s vibration excitation (Relay 7), <strong>${pWin}</strong> delivered higher average output power
      (${fmt(fw.pavg * 1000, 3)} mW vs ${fmt(ts.pavg * 1000, 3)} mW).</p>
      <p>Stabilization time reflects when consecutive voltage samples first plateau (±0.05 V or ±2%):
      FW ${fmtStab(fw)}, 2S ${fmtStab(ts)}. Use these metrics together — not power alone — when selecting a rectifier for piezo harvesting.</p>`;
  }

  function toggleConclusion() {
    const body = $('conclusionBody');
    const opening = body.classList.contains('collapsed');
    if (opening) buildConclusionTable();
    body.classList.toggle('collapsed', !opening);
    if (opening) {
      setTimeout(() => body.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }

  async function emergencyStop() {
    await sendCommand('RESET_SYSTEM');
    const patch = {
      stage: 'idle',
      active_circuit: 'none',
      is_measuring: false,
      led_fw: false,
      led_2s: false,
      lcd_message: 'Ready',
      relay_mask: 0,
      active_relays: [],
    };
    await sb.from('system_state').update(patch).eq('id', 1);
    await fetchSystemState();
  }

  function startStatePolling() {
    setInterval(() => {
      fetchSystemState();
    }, STATE_POLL_MS);
    setInterval(() => {
      if (systemState.last_seen) {
        updateStatusBar({ ...systemState });
      }
    }, 1000);
  }

  function setupRealtime() {
    sb.channel('state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_state' }, (payload) => {
        updateStatusBar(payload.new);
      })
      .subscribe();

    sb.channel('summary')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'measurement_summary' }, (payload) => {
        const row = payload.new;
        if (row.circuit_key === CIRCUIT.FW || row.circuit_key === CIRCUIT.TS) {
          loadLatestSummary(row.circuit_key);
        }
      })
      .subscribe();
  }

  function setupScrollReveal() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
  }

  async function init() {
    if (!initSupabase()) return;
    initCharts();
    setupScrollReveal();

    const { data } = await sb.from('system_state').select('*').eq('id', 1).maybeSingle();
    if (data) {
      lastKnownStage = data.stage || 'idle';
      updateStatusBar(data);
    }

    await Promise.all([loadLatestSummary(CIRCUIT.FW), loadLatestSummary(CIRCUIT.TS)]);
    setupRealtime();
    startStatePolling();

    $('btnMeasureFw').addEventListener('click', () => {
      clearCircuitDisplay(CIRCUIT.FW);
      sendCommand('MEASURE_FW_CIRCUIT');
    });
    $('btnMeasure2s').addEventListener('click', () => {
      clearCircuitDisplay(CIRCUIT.TS);
      sendCommand('MEASURE_2S_CIRCUIT');
    });
    $('btnConclusion').addEventListener('click', toggleConclusion);
    $('btnEmergencyStop').addEventListener('click', () => {
      if (confirm('Emergency STOP — turn off all relays and vibration?')) emergencyStop();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
