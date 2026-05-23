/**
 * FYP Dashboard — Supabase Realtime + 5-panel results (waveform + 4 metrics)
 */
(function () {
  'use strict';

  const cfg = window.FYP_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR_PROJECT')) {
    console.warn('Configure website/config.js with your Supabase credentials.');
  }

  let supabase = null;
  try {
    if (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.error('Supabase init failed:', e);
  }

  document.querySelectorAll('.section.reveal').forEach((s) => s.classList.add('visible'));

  const CIRCUIT_NAMES = {
    1: 'Full-Wave Bridge Rectifier',
    2: 'Half-Wave Rectifier',
    3: '2-Stage Cockcroft-Walton',
    4: '3-Stage Cockcroft-Walton',
    5: '4-Stage Cockcroft-Walton',
  };

  const STAGE_LABELS = {
    bridge: 'Bridge rectifier',
    cwvm: 'CWVM',
    final: 'Final champion',
  };

  let systemState = {};
  let activeComparisonId = null;
  const chartInstances = {};

  const connDot = document.getElementById('connDot');
  const connText = document.getElementById('connText');
  const stageText = document.getElementById('stageText');
  const lcdText = document.getElementById('lcdText');
  const ledZoneText = document.getElementById('ledZoneText');
  const relayIndicators = document.getElementById('relayIndicators');

  const btnBridge = document.getElementById('btnBridge');
  const btnCwvm = document.getElementById('btnCwvm');
  const btnFinal = document.getElementById('btnFinal');
  const finalGateHint = document.getElementById('finalGateHint');

  for (let i = 1; i <= 8; i++) {
    const el = document.createElement('div');
    el.className = 'relay-led';
    el.id = `relay-${i}`;
    el.textContent = `R${i}`;
    if (i === 6) {
      el.title = 'Vibration motor (12 V via relay)';
      el.classList.add('vibration-relay');
    } else {
      el.title = i <= 5 ? CIRCUIT_NAMES[i] || `Relay ${i}` : 'Unused';
    }
    relayIndicators.appendChild(el);
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add('visible');
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll('.section.reveal').forEach((s) => revealObserver.observe(s));

  const tooltip = document.getElementById('tooltip');
  document.querySelectorAll('.hover-tip').forEach((el) => {
    el.addEventListener('mouseenter', () => {
      tooltip.textContent = el.dataset.tip || '';
      tooltip.classList.add('show');
    });
    el.addEventListener('mousemove', (e) => {
      tooltip.style.left = e.pageX + 12 + 'px';
      tooltip.style.top = e.pageY + 12 + 'px';
    });
    el.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
  });

  function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.classList.remove('scroll-flash');
    void section.offsetWidth;
    section.classList.add('scroll-flash');
    setTimeout(() => section.classList.remove('scroll-flash'), 1300);
  }

  document.getElementById('btnToCwvm')?.addEventListener('click', () => scrollToSection('cwvm'));
  document.getElementById('btnToFinal')?.addEventListener('click', () => {
    updateFinalists();
    scrollToSection('final');
  });
  document.getElementById('btnToEnd')?.addEventListener('click', () => scrollToSection('end'));

  document.querySelector('.scroll-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToSection('bridge');
  });

  const particlesEl = document.getElementById('particles');
  if (particlesEl) {
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.top = Math.random() * 100 + '%';
      p.style.animationDelay = Math.random() * 8 + 's';
      particlesEl.appendChild(p);
    }
  }

  function isOnline(state) {
    if (!state?.last_seen) return false;
    const last = new Date(state.last_seen).getTime();
    return Date.now() - last < 15000;
  }

  function canStartFinal() {
    const br = systemState.bridge_winner_relay;
    const cr = systemState.cwvm_winner_relay;
    return br >= 1 && br <= 2 && cr >= 3 && cr <= 5;
  }

  function updateFinalGate() {
    const ok = canStartFinal();
    if (btnFinal) btnFinal.disabled = !ok || !!systemState.is_measuring;
    finalGateHint?.classList.toggle('hidden', ok);
  }

  function updateStatusBar(state) {
    systemState = state || {};
    const online = isOnline(state);
    connDot.classList.toggle('online', online);
    connText.textContent = online ? 'Online' : 'Offline';
    stageText.textContent = state?.stage || 'idle';
    stageText.classList.toggle('measuring-pulse', state?.is_measuring);
    lcdText.textContent = state?.lcd_message || 'Ready';
    ledZoneText.textContent = String(state?.led_zone ?? 0);

    const mask = state?.relay_mask ?? 0;
    for (let i = 1; i <= 8; i++) {
      const bit = 1 << (i - 1);
      document.getElementById(`relay-${i}`)?.classList.toggle('active', (mask & bit) !== 0);
    }

    const measuring = !!state?.is_measuring;
    if (btnBridge) btnBridge.disabled = measuring;
    if (btnCwvm) btnCwvm.disabled = measuring;
    updateFinalGate();

    if (state?.bridge_winner_relay || state?.cwvm_winner_relay) updateFinalists();
  }

  function updateFinalists() {
    const br = systemState.bridge_winner_relay;
    const cr = systemState.cwvm_winner_relay;
    if (br) {
      document.getElementById('finalBridgeName').textContent = CIRCUIT_NAMES[br] || '—';
      document.getElementById('finalBridgeRelay').textContent = br;
    }
    if (cr) {
      document.getElementById('finalCwvmName').textContent = CIRCUIT_NAMES[cr] || '—';
      document.getElementById('finalCwvmRelay').textContent = cr;
    }
    if (br && cr) {
      document.getElementById('finalExplain').textContent =
        `Relay ${br} (${CIRCUIT_NAMES[br]}) is the bridge winner stored in the system. Relay ${cr} (${CIRCUIT_NAMES[cr]}) is the CWVM winner. The final comparison will energise only these two relays in sequence while vibration and zone 3 LED indicate the champion showdown.`;
    }
    updateFinalGate();
  }

  async function sendCommand(command) {
    if (!supabase) {
      alert('Supabase not configured. Check website/config.js is deployed on Vercel.');
      return;
    }
    if (command === 'START_FINAL_COMPARISON' && !canStartFinal()) {
      alert('Complete 1st (bridge) and 2nd (CWVM) comparisons first.');
      return;
    }
    const { error } = await supabase.from('commands').insert({
      command,
      status: 'pending',
    });
    if (error) {
      alert('Failed to send command: ' + error.message);
      return;
    }
    activeComparisonId = null;
  }

  [btnBridge, btnCwvm, btnFinal].forEach((btn) => {
    btn?.addEventListener('click', () => sendCommand(btn.dataset.command));
  });

  const btnEmergencyStop = document.getElementById('btnEmergencyStop');

  async function emergencyStop() {
    if (!supabase) {
      alert('Supabase not configured. Check website/config.js is deployed on Vercel.');
      return;
    }
    if (
      !confirm(
        'Emergency STOP: halt all measurements, turn off relays/LEDs, and reset the system to idle?'
      )
    ) {
      return;
    }

    btnEmergencyStop.disabled = true;

    const idlePatch = {
      stage: 'idle',
      is_measuring: false,
      lcd_message: 'Ready',
      led_zone: 0,
      relay_mask: 0,
      active_relays: [],
      error_message: 'Emergency stop',
    };

    const { error: stateErr } = await supabase.from('system_state').update(idlePatch).eq('id', 1);
    if (stateErr) {
      console.warn('system_state update:', stateErr);
    } else {
      updateStatusBar({ ...systemState, ...idlePatch, connection: systemState.connection || 'online' });
    }

    await supabase
      .from('commands')
      .update({ status: 'error', error_message: 'emergency reset' })
      .in('status', ['pending', 'processing']);

    const { error: cmdErr } = await supabase.from('commands').insert({
      command: 'RESET_SYSTEM',
      status: 'pending',
    });

    btnEmergencyStop.disabled = false;

    if (cmdErr) {
      alert('Emergency stop failed: ' + cmdErr.message);
      return;
    }

    activeComparisonId = null;
  }

  btnEmergencyStop?.addEventListener('click', () => emergencyStop());

  function downsample(arr, maxPoints = 100) {
    if (!arr || !arr.length) return [];
    if (arr.length <= maxPoints) return arr;
    const step = Math.ceil(arr.length / maxPoints);
    const out = [];
    for (let i = 0; i < arr.length; i += step) out.push(arr[i]);
    return out;
  }

  function destroyCharts(prefix) {
    Object.keys(chartInstances).forEach((key) => {
      if (key.startsWith(prefix)) {
        chartInstances[key].destroy();
        delete chartInstances[key];
      }
    });
  }

  const chartColors = ['#00ff88', '#00d4ff', '#ffaa00', '#ff66aa', '#a78bfa'];

  function createOscilloscopeChart(canvasId, label, vSamples, iSamples) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const v = downsample(vSamples);
    const labels = v.map((_, i) => i);

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Voltage (V)',
            data: v,
            borderColor: '#00ff88',
            backgroundColor: 'rgba(0, 255, 136, 0.08)',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.2,
          },
          {
            label: 'Current (mA)',
            data: downsample(iSamples).map((x) => x * 1000),
            borderColor: '#00d4ff',
            borderWidth: 1,
            pointRadius: 0,
            tension: 0.2,
            yAxisID: 'y1',
          },
        ],
      },
      options: chartOptions(label),
    });
    chartInstances[canvasId] = chart;
  }

  function chartOptions(title) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800 },
      plugins: {
        legend: { labels: { color: '#8ba3b8' } },
        title: title ? { display: true, text: title, color: '#8ba3b8', font: { size: 11 } } : undefined,
      },
      scales: {
        x: {
          ticks: { color: '#8ba3b8', maxTicksLimit: 8 },
          grid: { color: 'rgba(0,212,255,0.08)' },
        },
        y: {
          position: 'left',
          ticks: { color: '#00ff88' },
          grid: { color: 'rgba(0,255,136,0.1)' },
          title: { display: true, text: 'V', color: '#00ff88' },
        },
        y1: {
          position: 'right',
          ticks: { color: '#00d4ff' },
          grid: { drawOnChartArea: false },
          title: { display: true, text: 'mA', color: '#00d4ff' },
        },
      },
    };
  }

  function createOverlayWaveformChart(canvasId, results) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const datasets = results.map((r, idx) => ({
      label: `R${r.relay} ${r.circuit_name}`,
      data: downsample(r.v_samples || []),
      borderColor: chartColors[idx % chartColors.length],
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0.2,
    }));

    const maxLen = Math.max(...datasets.map((d) => d.data.length), 1);
    const labels = Array.from({ length: maxLen }, (_, i) => i);

    const chart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#8ba3b8' } } },
        scales: {
          x: { ticks: { color: '#8ba3b8', maxTicksLimit: 8 }, grid: { color: 'rgba(0,212,255,0.08)' } },
          y: {
            ticks: { color: '#00ff88' },
            grid: { color: 'rgba(0,255,136,0.1)' },
            title: { display: true, text: 'Voltage (V)', color: '#00ff88' },
          },
        },
      },
    });
    chartInstances[canvasId] = chart;
  }

  function createMetricBarChart(canvasId, title, results, field, unit, higherIsBetter) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    const labels = results.map((r) => `R${r.relay}`);
    const values = results.map((r) => Number(r[field]) || 0);
    const colors = results.map((r, idx) =>
      r.winner ? '#00ff88' : chartColors[idx % chartColors.length]
    );

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: title, data: values, backgroundColor: colors.map((c) => c + '99'), borderColor: colors, borderWidth: 1 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          title: { display: true, text: title + (higherIsBetter === false ? ' (lower better)' : ''), color: '#8ba3b8', font: { size: 11 } },
        },
        scales: {
          x: {
            ticks: { color: '#8ba3b8', callback: (v) => v + (unit || '') },
            grid: { color: 'rgba(0,212,255,0.08)' },
          },
          y: { ticks: { color: '#8ba3b8' }, grid: { display: false } },
        },
      },
    });
    chartInstances[canvasId] = chart;
  }

  function applyWinnerFlags(results, winnerRelay) {
    return results.map((r) => ({
      ...r,
      winner: r.winner || r.relay === winnerRelay,
    }));
  }

  function renderFivePanelDashboard(dashboardId, results) {
    const el = document.getElementById(dashboardId);
    if (!el) return;
    destroyCharts(dashboardId);

    const waveId = `${dashboardId}-wave`;
    const vavgId = `${dashboardId}-vavg`;
    const rippleId = `${dashboardId}-ripple`;
    const poutId = `${dashboardId}-pout`;
    const stabId = `${dashboardId}-stab`;

    el.innerHTML = `
      <div class="dash-panel dash-wave"><h4>1 — Waveform comparison (oscilloscope)</h4><div class="chart-wrap"><canvas id="${waveId}"></canvas></div></div>
      <div class="dash-panel"><h4>2 — Average voltage</h4><div class="chart-wrap"><canvas id="${vavgId}"></canvas></div></div>
      <div class="dash-panel"><h4>3 — Ripple voltage</h4><div class="chart-wrap"><canvas id="${rippleId}"></canvas></div></div>
      <div class="dash-panel"><h4>4 — Output power</h4><div class="chart-wrap"><canvas id="${poutId}"></canvas></div></div>
      <div class="dash-panel"><h4>5 — Stability score</h4><div class="chart-wrap"><canvas id="${stabId}"></canvas></div></div>
    `;

    setTimeout(() => {
      createOverlayWaveformChart(waveId, results);
      createMetricBarChart(vavgId, 'Average voltage', results, 'vavg', ' V', true);
      createMetricBarChart(rippleId, 'Ripple voltage', results, 'vripple', ' V', false);
      createMetricBarChart(poutId, 'Output power', results, 'pout', ' W', true);
      createMetricBarChart(stabId, 'Stability', results, 'stability', '%', true);
    }, 50);
  }

  function renderConclusion(conclusionId, results, summary, stage) {
    const el = document.getElementById(conclusionId);
    if (!el || !summary) return;

    const winner = results.find((r) => r.relay === summary.winner_relay) || results[0];
    const others = results.filter((r) => r.relay !== summary.winner_relay);
    const label = STAGE_LABELS[stage] || stage;

    let compare = '';
    if (others.length && winner) {
      const bits = others.map((o) => {
        const vDiff = ((winner.vavg - o.vavg) / (o.vavg || 1)) * 100;
        return `${o.circuit_name} (R${o.relay}): Vavg ${Number(o.vavg).toFixed(3)} V vs winner ${Number(winner.vavg).toFixed(3)} V`;
      });
      compare = bits.join('; ') + '.';
    }

    el.textContent =
      `Conclusion (${label}): ${summary.winner_name} on Relay ${summary.winner_relay} wins with the best combined score (25% each: average voltage, ripple, output power, stability). ${compare} This relay is stored as the ${stage === 'bridge' ? 'bridge' : stage === 'cwvm' ? 'CWVM' : 'overall'} winner for the next step.`;
  }

  function renderStageResults(stage, panelId, dashboardId, chartsId, winnerTextId, conclusionId) {
    const panel = document.getElementById(panelId);
    const chartsEl = document.getElementById(chartsId);
    const compId = activeComparisonId || systemState.current_comparison_id;

    if (!compId || !supabase) return;

    Promise.all([
      supabase
        .from('circuit_results')
        .select('*')
        .eq('comparison_id', compId)
        .eq('stage', stage)
        .order('relay'),
      supabase
        .from('comparison_summary')
        .select('*')
        .eq('comparison_id', compId)
        .eq('stage', stage)
        .order('created_at', { ascending: false })
        .limit(1),
    ]).then(([resOut, sumOut]) => {
      const results = resOut.data;
      const summary = sumOut.data?.[0];
      if (!results?.length) return;

      const withWinner = summary
        ? applyWinnerFlags(results, summary.winner_relay)
        : results;

      panel?.classList.remove('hidden');
      destroyCharts(chartsId);
      destroyCharts(dashboardId);

      renderFivePanelDashboard(dashboardId, withWinner);

      if (chartsEl) {
        chartsEl.innerHTML = '<p class="results-sub">Per-circuit detail waveforms</p>';
        withWinner.forEach((r, idx) => {
          const card = document.createElement('div');
          card.className = 'chart-card';
          const canvasId = `${chartsId}-canvas-${idx}`;
          card.innerHTML = `<h4>${r.circuit_name} — Relay ${r.relay}${r.winner ? ' ★ Winner' : ''}</h4><div class="chart-wrap"><canvas id="${canvasId}"></canvas></div>`;
          chartsEl.appendChild(card);
          setTimeout(() => createOscilloscopeChart(canvasId, r.circuit_name, r.v_samples, r.i_samples), 80);
        });
      }

      if (summary && document.getElementById(winnerTextId)) {
        document.getElementById(winnerTextId).textContent =
          `Winner: ${summary.winner_name} (Relay ${summary.winner_relay}) — Best overall score across average voltage, ripple, output power, and stability.`;
      }

      if (summary) renderConclusion(conclusionId, withWinner, summary, stage);

      if (stage === 'bridge' || stage === 'cwvm') updateFinalists();
    });
  }

  const stageRenderMap = {
    bridge: ['bridgeResults', 'bridgeDashboard', 'bridgeCharts', 'bridgeWinnerText', 'bridgeConclusion'],
    cwvm: ['cwvmResults', 'cwvmDashboard', 'cwvmCharts', 'cwvmWinnerText', 'cwvmConclusion'],
    final: ['finalResults', 'finalDashboard', 'finalCharts', 'finalWinnerText', 'finalConclusion'],
  };

  function triggerStageRender(stage) {
    const cfg = stageRenderMap[stage];
    if (!cfg) return;
    renderStageResults(stage, cfg[0], cfg[1], cfg[2], cfg[3], cfg[4]);
  }

  async function loadInitialState() {
    if (!supabase) return;
    const { data } = await supabase.from('system_state').select('*').eq('id', 1).single();
    if (data) updateStatusBar(data);
  }

  if (!supabase) {
    console.warn('Dashboard running without Supabase — buttons will not work until config.js is set.');
    return;
  }

  supabase
    .channel('system_state_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'system_state' }, (payload) => {
      updateStatusBar(payload.new);
    })
    .subscribe();

  supabase
    .channel('circuit_results_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'circuit_results' }, (payload) => {
      const row = payload.new;
      if (!activeComparisonId) activeComparisonId = row.comparison_id;
      triggerStageRender(row.stage);
    })
    .subscribe();

  supabase
    .channel('summary_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comparison_summary' }, (payload) => {
      const s = payload.new;
      activeComparisonId = s.comparison_id;
      triggerStageRender(s.stage);
    })
    .subscribe();

  supabase
    .channel('commands_changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commands' }, (payload) => {
      if (payload.new?.status === 'processing') {
        activeComparisonId = systemState.current_comparison_id;
      }
    })
    .subscribe();

  setInterval(async () => {
    const { data } = await supabase.from('system_state').select('*').eq('id', 1).single();
    if (data) updateStatusBar(data);
  }, 5000);

  loadInitialState();
})();
