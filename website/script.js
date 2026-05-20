/**
 * FYP Dashboard — Supabase Realtime + Chart.js oscilloscope views
 */
(function () {
  'use strict';

  const cfg = window.FYP_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR_PROJECT')) {
    console.warn('Configure website/config.js with your Supabase credentials.');
  }

  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const CIRCUIT_NAMES = {
    1: 'Full-Wave Bridge Rectifier',
    2: 'Half-Wave Rectifier',
    3: '2-Stage Cockcroft-Walton',
    4: '3-Stage Cockcroft-Walton',
    5: '4-Stage Cockcroft-Walton',
  };

  let systemState = {};
  let activeComparisonId = null;
  const chartInstances = {};

  // DOM refs
  const connDot = document.getElementById('connDot');
  const connText = document.getElementById('connText');
  const stageText = document.getElementById('stageText');
  const lcdText = document.getElementById('lcdText');
  const ledZoneText = document.getElementById('ledZoneText');
  const relayIndicators = document.getElementById('relayIndicators');

  const btnBridge = document.getElementById('btnBridge');
  const btnCwvm = document.getElementById('btnCwvm');
  const btnFinal = document.getElementById('btnFinal');

  // Init relay indicators R1-R8
  for (let i = 1; i <= 8; i++) {
    const el = document.createElement('div');
    el.className = 'relay-led';
    el.id = `relay-${i}`;
    el.textContent = `R${i}`;
    el.title = i <= 5 ? CIRCUIT_NAMES[i] || `Relay ${i}` : 'Unused';
    relayIndicators.appendChild(el);
  }

  // Scroll reveal
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add('visible');
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll('.section.reveal').forEach((s) => revealObserver.observe(s));

  // Tooltips
  const tooltip = document.getElementById('tooltip');
  document.querySelectorAll('.hover-tip').forEach((el) => {
    el.addEventListener('mouseenter', (e) => {
      tooltip.textContent = el.dataset.tip || '';
      tooltip.classList.add('show');
    });
    el.addEventListener('mousemove', (e) => {
      tooltip.style.left = e.pageX + 12 + 'px';
      tooltip.style.top = e.pageY + 12 + 'px';
    });
    el.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
  });

  // Navigation buttons
  document.getElementById('btnToCwvm')?.addEventListener('click', () => {
    document.getElementById('cwvm').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btnToFinal')?.addEventListener('click', () => {
    updateFinalists();
    document.getElementById('final').scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('btnToEnd')?.addEventListener('click', () => {
    document.getElementById('end').scrollIntoView({ behavior: 'smooth' });
  });

  // Particles on end section
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
    [btnBridge, btnCwvm, btnFinal].forEach((b) => {
      if (b) b.disabled = measuring;
    });

    if (state?.bridge_winner_relay) updateFinalists();
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
        `Relay ${br} (${CIRCUIT_NAMES[br]}) won the bridge comparison with the best combined score for average voltage, ripple, power, and stability. Relay ${cr} (${CIRCUIT_NAMES[cr]}) won among CWVM stages. They now compete for the best piezoelectric harvesting rectification solution.`;
    }
  }

  async function sendCommand(command) {
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
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800 },
        plugins: {
          legend: { labels: { color: '#8ba3b8' } },
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
      },
    });
    chartInstances[canvasId] = chart;
  }

  function renderMetrics(containerId, results) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    results.forEach((r) => {
      const card = document.createElement('div');
      card.className = 'metric-card' + (r.winner ? ' winner-highlight' : '');
      card.innerHTML = `
        <div class="label">${r.circuit_name} (R${r.relay})</div>
        <div class="value">Vavg: ${Number(r.vavg).toFixed(3)} V</div>
        <div class="label">Ripple: ${Number(r.vripple).toFixed(3)} V</div>
        <div class="label">Power: ${Number(r.pout).toFixed(4)} W</div>
        <div class="label">Stability: ${Number(r.stability).toFixed(1)}%</div>
      `;
      container.appendChild(card);
    });
  }

  function renderStageResults(stage, panelId, chartsId, metricsId, winnerTextId) {
    const panel = document.getElementById(panelId);
    const chartsEl = document.getElementById(chartsId);
    const compId = activeComparisonId || systemState.current_comparison_id;

    if (!compId) return;

    supabase
      .from('circuit_results')
      .select('*')
      .eq('comparison_id', compId)
      .eq('stage', stage)
      .order('relay')
      .then(({ data: results }) => {
        if (!results?.length) return;

        panel?.classList.remove('hidden');
        destroyCharts(chartsId);

        chartsEl.innerHTML = '';
        results.forEach((r, idx) => {
          const card = document.createElement('div');
          card.className = 'chart-card';
          const canvasId = `${chartsId}-canvas-${idx}`;
          card.innerHTML = `<h4>${r.circuit_name} — Relay ${r.relay}</h4><div class="chart-wrap"><canvas id="${canvasId}"></canvas></div>`;
          chartsEl.appendChild(card);
          setTimeout(() => {
            createOscilloscopeChart(canvasId, r.circuit_name, r.v_samples, r.i_samples);
          }, 50);
        });

        renderMetrics(metricsId, results);
      });

    supabase
      .from('comparison_summary')
      .select('*')
      .eq('comparison_id', compId)
      .eq('stage', stage)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data: rows }) => {
        const summary = rows?.[0];
        if (summary && document.getElementById(winnerTextId)) {
          document.getElementById(winnerTextId).textContent =
            `Winner: ${summary.winner_name} (Relay ${summary.winner_relay}) — Best overall score across average voltage, ripple, output power, and stability.`;
        }
      });
  }

  async function loadInitialState() {
    const { data } = await supabase.from('system_state').select('*').eq('id', 1).single();
    if (data) updateStatusBar(data);
  }

  // Realtime subscriptions
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
      if (row.stage === 'bridge') renderStageResults('bridge', 'bridgeResults', 'bridgeCharts', 'bridgeMetrics', 'bridgeWinnerText');
      if (row.stage === 'cwvm') renderStageResults('cwvm', 'cwvmResults', 'cwvmCharts', 'cwvmMetrics', 'cwvmWinnerText');
      if (row.stage === 'final') renderStageResults('final', 'finalResults', 'finalCharts', 'finalMetrics', 'finalWinnerText');
    })
    .subscribe();

  supabase
    .channel('summary_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comparison_summary' }, (payload) => {
      const s = payload.new;
      activeComparisonId = s.comparison_id;
      if (s.stage === 'bridge') renderStageResults('bridge', 'bridgeResults', 'bridgeCharts', 'bridgeMetrics', 'bridgeWinnerText');
      if (s.stage === 'cwvm') renderStageResults('cwvm', 'cwvmResults', 'cwvmCharts', 'cwvmMetrics', 'cwvmWinnerText');
      if (s.stage === 'final') renderStageResults('final', 'finalResults', 'finalCharts', 'finalMetrics', 'finalWinnerText');
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

  // Poll connection when Realtime quiet
  setInterval(async () => {
    const { data } = await supabase.from('system_state').select('*').eq('id', 1).single();
    if (data) updateStatusBar(data);
  }, 5000);

  loadInitialState();
})();
