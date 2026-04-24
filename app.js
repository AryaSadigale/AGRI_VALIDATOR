// ========================================
// AGRVALIDATOR AI PLATFORM
// Complete Dashboard JavaScript
// ========================================

const API_BASE_URL = 'http://127.0.0.1:8000';
const chartInstances = {};

// ========== PAGE TITLES ==========
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  predict: 'Single Prediction',
  batch: 'Batch Validation',
  results: 'Validation Results',
  officer: 'Officer Review',
  monitor: 'AI Model Monitor',
  loans: 'Loan Requests',
  riskmap: 'Agricultural Risk Map',
  reports: 'Reports',
  audit: 'Audit Logs',
  settings: 'Settings'
};

// ========== SIDEBAR NAVIGATION ==========
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      navigateTo(page);
    });
  });

  const toggle = document.getElementById('sidebarToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });
  }
}

function navigateTo(page) {
  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (activeNav) activeNav.classList.add('active');

  // Update pages
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  // Update title
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');

  // Load page data
  loadPageData(page);
}

function loadPageData(page) {
  switch(page) {
    case 'dashboard': loadDashboardData(); break;
    case 'results': loadPredictionHistory(); break;
    case 'officer': loadOfficerReviews(); break;
    case 'monitor': loadModelMonitor(); break;
    case 'loans': loadLoanRequests(); break;
    case 'riskmap': loadRiskMap(); break;
    case 'audit': loadAuditLogs(); break;
  }
}

// ========== TOAST NOTIFICATIONS ==========
function showNotification(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ========== LOADING ==========
function showLoading() { document.getElementById('loadingOverlay')?.classList.add('active'); }
function hideLoading() { document.getElementById('loadingOverlay')?.classList.remove('active'); }

// ========== CHART HELPERS ==========
function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }

const CHART_COLORS = {
  green: '#16a34a', gold: '#f59e0b', red: '#ef4444', yellow: '#f59e0b',
  blue: '#3b82f6', text: '#374151', textLight: '#6b7280', gridLine: 'rgba(0,0,0,0.06)',
  success: '#22c55e', warning: '#f59e0b', danger: '#ef4444'
};

const CHART_DEFAULTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: CHART_COLORS.text, font: { family: 'Inter' } } } },
  scales: {
    x: { ticks: { color: CHART_COLORS.textLight }, grid: { color: CHART_COLORS.gridLine } },
    y: { ticks: { color: CHART_COLORS.textLight }, grid: { color: CHART_COLORS.gridLine } }
  }
};

// ========== DASHBOARD ==========
async function loadDashboardData() {
  try {
    const [metricsRes, insightsRes] = await Promise.all([
      authFetch(`${API_BASE_URL}/api/model-metrics`),
      authFetch(`${API_BASE_URL}/api/insights`)
    ]);
    const metrics = await metricsRes.json();
    const insights = await insightsRes.json();

    // store metrics at top-level for info modal/calculation
    window.lastDashboardMetrics = metrics;

    // KPI Cards: Source Counts
    document.getElementById('kpiSingle').textContent = metrics.total_single || 0;
    document.getElementById('kpiBatch').textContent = metrics.total_batch || 0;
    
    // New Breakdown fields
    if (document.getElementById('kpiTotalSingle')) {
      document.getElementById('kpiTotalSingle').textContent = metrics.total_single || 0;
    }
    if (document.getElementById('kpiTotalBatch')) {
      document.getElementById('kpiTotalBatch').textContent = metrics.total_batch || 0;
    }

    // KPI Cards: Status Counts
    const dd = metrics.decision_distribution || {};
    const approved = dd['APPROVED'] || 0;
    const review = dd['REVIEW REQUIRED'] || 0;
    const rejected = dd['REJECTED'] || 0;

    document.getElementById('kpiTotal').textContent = metrics.total_predictions || 0;
    document.getElementById('kpiApproved').textContent = approved;
    document.getElementById('kpiReview').textContent = review;
    document.getElementById('kpiRejected').textContent = rejected;
    document.getElementById('kpiAvgTri').textContent = (metrics.avg_tri || 0) + '%';

    // Decision Pie Chart
    destroyChart('dashPie');
    chartInstances['dashPie'] = new Chart(document.getElementById('dashPieChart'), {
      type: 'doughnut',
      data: {
        labels: ['Approved', 'Review Required', 'Rejected'],
        datasets: [{ data: [approved, review, rejected], backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: CHART_COLORS.text } } } }
    });

    // Risk Distribution Bar
    const rd = metrics.risk_distribution || {};
    destroyChart('dashBar');
    chartInstances['dashBar'] = new Chart(document.getElementById('dashBarChart'), {
      type: 'bar',
      data: {
        labels: ['Low', 'Medium', 'High'],
        datasets: [{ label: 'Count', data: [rd['Low']||0, rd['Medium']||0, rd['High']||0], backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger], borderRadius: 8, borderSkipped: false }]
      },
      options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } } }
    });

    // AI vs Expert risk comparison (new requirement)
    const er = metrics.expert_risk_distribution || {};
    destroyChart('comparisonChart');
    chartInstances['comparisonChart'] = new Chart(document.getElementById('comparisonChart'), {
      type: 'bar',
      data: {
        labels: ['Low', 'Medium', 'High'],
        datasets: [
          { label: 'AI Risk', data: [rd['Low']||0, rd['Medium']||0, rd['High']||0], backgroundColor: 'rgba(59,130,246,0.7)', borderColor: 'rgba(59,130,246,1)', borderWidth: 1 },
          { label: 'Expert Risk', data: [er['Low']||0, er['Medium']||0, er['High']||0], backgroundColor: 'rgba(34,197,94,0.6)', borderColor: 'rgba(34,197,94,1)', borderWidth: 1 }
        ]
      },
      options: {
        ...CHART_DEFAULTS,
        scales: {
          x: { stacked: false, ticks: { color: CHART_COLORS.textLight }, grid: { color: CHART_COLORS.gridLine } },
          y: { beginAtZero: true, ticks: { color: CHART_COLORS.textLight }, grid: { color: CHART_COLORS.gridLine } }
        }
      }
    });

    // Insights
    renderInsights(insights);
  } catch(e) { console.error('Dashboard load error:', e); }
}

// ========== TRI FORMULA MODAL ==========
function showTriFormula() {
  const modalHtml = `
    <div id="triModal" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title">Trust Reliability Index (TRI)</h3>
          <button class="modal-close" onclick="closeTriModal()">×</button>
        </div>
        <div class="modal-body">
          <p>The <b>Trust Reliability Index (TRI)</b> is a weighted score that determines the system's confidence in a prediction.</p>
          
          <div class="formula-card">
            TRI = (PCS × 0.6) + (EAS × 0.4)
          </div>
          
          <div class="formula-details">
            <ul>
              <li><b>PCS (60%):</b> Prediction Confidence Score from the XGBoost ML model.</li>
              <li><b>EAS (40%):</b> Expert Agreement Score, comparing AI output with heuristic rules.</li>
            </ul>
            <p style="margin-top:1rem; font-size: 0.85rem;">Predictions with TRI ≥ 80% are <b>Auto-Approved</b>. Those between 60-80% require <b>Human Review</b>. High Risk flags are always sent for review regardless of TRI.</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  if (!document.getElementById('triModal')) {
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }
  
  setTimeout(() => {
    document.getElementById('triModal').classList.add('active');
  }, 10);
}

function closeTriModal() {
  const modal = document.getElementById('triModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
}

function showValidationMetricsInfo() {
  const metrics = window.lastDashboardMetrics || {};
  const total = metrics.total_predictions || 0;
  const approved = (metrics.decision_distribution || {})['APPROVED'] || 0;
  const review = (metrics.decision_distribution || {})['REVIEW REQUIRED'] || 0;
  const rejected = (metrics.decision_distribution || {})['REJECTED'] || 0;
  const match = (metrics.alignment || {}).match || 0;
  const totalAlignment = (metrics.alignment || {}).total || 0;
  const matchPct = totalAlignment ? Math.round((match / totalAlignment) * 100) : 0;
  const avgTri = metrics.avg_tri || 0;

  const modalHtml = `
  <div id="validationMetricsModal" class="modal-overlay">
    <div class="modal-container">
      <div class="modal-header">
        <h3 class="modal-title">Validation Metrics Info</h3>
        <button class="modal-close" onclick="closeValidationMetricsModal()">×</button>
      </div>
      <div class="modal-body">
        <p><strong>Data used for calculations:</strong></p>
        <ul>
          <li>Total predictions: ${total}</li>
          <li>Approved: ${approved}</li>
          <li>Review required: ${review}</li>
          <li>Rejected: ${rejected}</li>
          <li>AI/Expert match: ${match} records (${matchPct}% alignment)</li>
          <li>Average TRI: ${avgTri}%</li>
        </ul>
        <p><strong>Calculation formulas:</strong></p>
        <ul>
          <li><em>Approval rate</em> = (Approved / Total) × 100</li>
          <li><em>Review rate</em> = (Review Required / Total) × 100</li>
          <li><em>Rejection rate</em> = (Rejected / Total) × 100</li>
          <li><em>AI/Expert alignment</em> = (Match / Total aligned records) × 100</li>
          <li><em>TRI</em> = 0.6 × PCS + 0.4 × EAS (per record, averaged)</li>
        </ul>
      </div>
    </div>
  </div>`;

  if (!document.getElementById('validationMetricsModal')) {
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } else {
    document.getElementById('validationMetricsModal').outerHTML = modalHtml;
  }

  setTimeout(() => {
    const modal = document.getElementById('validationMetricsModal');
    if (modal) modal.classList.add('active');
  }, 10);
}

function closeValidationMetricsModal() {
  const modal = document.getElementById('validationMetricsModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
  }
}

// Override legacy modal text with the current formulas and cleaner copy.
function showTriFormula() {
  const modalHtml = `
    <div id="triModal" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title">Trust Reliability Index (TRI)</h3>
          <button class="modal-close" onclick="closeTriModal()">×</button>
        </div>
        <div class="modal-body">
          <p>The <b>Trust Reliability Index (TRI)</b> is the platform's overall trust score for a prediction.</p>
          <div class="formula-card">
            TRI = (PCS × 0.55) + (EAS × 0.45)
          </div>
          <div class="formula-details">
            <ul>
              <li><b>PCS (55%):</b> model confidence from the calibrated XGBoost prediction.</li>
              <li><b>EAS (45%):</b> agreement strength after comparing AI output with expert sources.</li>
            </ul>
            <p style="margin-top:1rem; font-size: 0.85rem;">High-risk predictions are still sent for review even when TRI is strong. TRI supports trust, but final decision logic remains the safety gate.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById('triModal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  setTimeout(() => document.getElementById('triModal')?.classList.add('active'), 10);
}

function showValidationMetricsInfo() {
  const metrics = window.lastDashboardMetrics || {};
  const total = metrics.total_predictions || 0;
  const approved = (metrics.decision_distribution || {})['APPROVED'] || 0;
  const review = (metrics.decision_distribution || {})['REVIEW REQUIRED'] || 0;
  const rejected = (metrics.decision_distribution || {})['REJECTED'] || 0;
  const match = (metrics.alignment || {}).match || 0;
  const totalAlignment = (metrics.alignment || {}).total || 0;
  const matchPct = totalAlignment ? Math.round((match / totalAlignment) * 100) : 0;
  const avgTri = metrics.avg_tri || 0;

  const modalHtml = `
    <div id="validationMetricsModal" class="modal-overlay">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title">Validation Metrics Info</h3>
          <button class="modal-close" onclick="closeValidationMetricsModal()">×</button>
        </div>
        <div class="modal-body">
          <p><strong>Current dashboard totals:</strong></p>
          <ul>
            <li>Total predictions: ${total}</li>
            <li>Approved: ${approved}</li>
            <li>Review required: ${review}</li>
            <li>Rejected: ${rejected}</li>
            <li>AI/Expert matches: ${match} records (${matchPct}% alignment)</li>
            <li>Average TRI: ${avgTri}%</li>
          </ul>
          <p><strong>How the main metrics work:</strong></p>
          <ul>
            <li><em>RDI</em> combines the AI-expert gap, expert-source disagreement, and agreement-level penalty.</li>
            <li><em>EAS</em> = 1 - RDI</li>
            <li><em>TRI</em> = 0.55 × PCS + 0.45 × EAS</li>
            <li><em>AI/Expert alignment</em> = (Match / Total aligned records) × 100</li>
          </ul>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById('validationMetricsModal');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  setTimeout(() => document.getElementById('validationMetricsModal')?.classList.add('active'), 10);
}

function renderInsights(insights) {
  const panel = document.getElementById('insightsPanel');
  if (!insights || insights.length === 0) {
    panel.innerHTML = `
      <div class="insight-card info">
        <div class="insight-icon">💡</div>
        <div class="insight-content">
          <div class="insight-title">No Insights Yet</div>
          <div class="insight-text">Process some predictions to generate AI-powered agricultural insights.</div>
        </div>
      </div>`;
    return;
  }
  panel.innerHTML = insights.map(i => `
    <div class="insight-card ${i.type || 'info'}">
      <div class="insight-icon">${i.icon || '💡'}</div>
      <div class="insight-content">
        <div class="insight-title">${i.title}</div>
        <div class="insight-text">${i.text}</div>
      </div>
    </div>
  `).join('');
}

// ========== SYSTEM METRICS WIDGET ==========
async function updateSystemWidget() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/system-metrics`);
    const m = await res.json();
    document.getElementById('widgetTotal').textContent = m.total_predictions || 0;
    document.getElementById('widgetAvgTime').textContent = m.avg_response_time_ms + 'ms';
    document.getElementById('widgetLLM').textContent = m.llm_success_rate + '%';
  } catch(e) { /* silent */ }
}

// ========== SINGLE PREDICTION ==========
function validatePredictionForm() {
  const fields = ['state','district','crop','season','area','production','yield'];
  for (const f of fields) {
    const el = document.getElementById(f);
    if (!el.value || el.value.trim() === '') { showNotification(`Please fill in ${f}`, 'warning'); return false; }
  }
  if (parseFloat(document.getElementById('area').value) <= 0) { showNotification('Area must be > 0', 'warning'); return false; }
  return true;
}

async function submitPrediction() {
  if (!validatePredictionForm()) return;
  const data = {
    State: document.getElementById('state').value.trim(),
    District: document.getElementById('district').value.trim(),
    Crop: document.getElementById('crop').value.trim(),
    Season: document.getElementById('season').value,
    Area: parseFloat(document.getElementById('area').value),
    Production: parseFloat(document.getElementById('production').value),
    Yield: parseFloat(document.getElementById('yield').value)
  };
  showLoading();
  try {
    const response = await authFetch(`${API_BASE_URL}/predict`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
    const result = await response.json();
    if (result.error) { showNotification(`Error: ${result.error}`, 'danger'); return; }
    displayPredictionResults(result);
    showNotification('Prediction validated successfully!', 'success');
  } catch(e) { showNotification('Failed to get prediction. Ensure server is running.', 'danger'); }
  finally { hideLoading(); }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function formatScore(value, decimals = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toFixed(decimals).replace(/\.?0+$/, '');
}

function formatPercent(value, decimals = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0%';
  return `${(num * 100).toFixed(decimals).replace(/\.?0+$/, '')}%`;
}

function formatAgreementLevel(value) {
  return String(value || 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function renderFinalDecisionPanel(result) {
  const panel = document.getElementById('finalDecisionPanel');
  if (!panel) return;
  const consensus = result.expert_consensus || {};
  panel.innerHTML = `
    <div class="advisory-section">
      <div class="advisory-section-title">Final Risk</div>
      <div class="advisory-section-text">${escapeHtml(result.final_risk || result.expert_risk || 'N/A')}</div>
    </div>
    <div class="advisory-section">
      <div class="advisory-section-title">Final Decision</div>
      <div class="advisory-section-text">${escapeHtml(result.final_decision || result.validation_status || 'N/A')}</div>
    </div>
    <div class="advisory-section">
      <div class="advisory-section-title">Expert Votes</div>
      <div class="advisory-section-text">${consensus.low_votes ?? 0} Low / ${consensus.medium_votes ?? 0} Medium / ${consensus.high_votes ?? 0} High</div>
    </div>
    <div class="advisory-section">
      <div class="advisory-section-title">Agreement Quality</div>
      <div class="advisory-section-text">
        AI vs Expert Agreement: ${formatPercent(consensus.ai_expert_agreement, 0)}<br>
        Expert Source Agreement: ${formatPercent(consensus.expert_source_agreement, 0)}<br>
        Agreement Level: ${escapeHtml(formatAgreementLevel(consensus.agreement_level))}
      </div>
    </div>
    <div class="advisory-section">
      <div class="advisory-section-title">Reason</div>
      <div class="advisory-section-text">${escapeHtml(result.final_decision_reason || 'No final decision reason available.')}</div>
    </div>
  `;
}

function renderExpertSourcesPanel(experts) {
  const panel = document.getElementById('expertSourcesPanel');
  if (!panel) return;
  if (!experts || experts.length === 0) {
    panel.innerHTML = '<p style="color:var(--text-muted)">No expert source details available.</p>';
    return;
  }
  panel.innerHTML = experts.map(expert => `
    <div class="advisory-section">
      <div class="advisory-section-title">${escapeHtml(expert.source_name || 'Expert source')} - ${escapeHtml(expert.applicable ? expert.risk : 'Not applicable')}</div>
      <div class="advisory-section-text">
        Confidence: ${Math.round((expert.confidence || 0) * 100)}%<br>
        Evidence: ${(expert.matched_rules || []).slice(0, 2).map(escapeHtml).join('<br>') || 'No matched rule detail available.'}<br>
        Advice: ${escapeHtml(expert.advisory || '')}
      </div>
    </div>
  `).join('');
}

function displayPredictionResults(result) {
  const el = document.getElementById('predictionResults');
  el.classList.remove('hidden');

  document.getElementById('aiRisk').textContent = result.ai_risk || 'N/A';
  document.getElementById('expertRisk').textContent = result.expert_risk || 'N/A';
  renderFinalDecisionPanel(result);
  renderExpertSourcesPanel(result.expert_validations || []);

  // Transparency bars
  const pcs = result.pcs || 0, eas = result.eas || 0, rdi = result.rdi || 0, tri = result.tri || 0;
  document.getElementById('pcsValue').textContent = formatScore(pcs, 3);
  document.getElementById('easValue').textContent = formatScore(eas, 3);
  document.getElementById('rdiValue').textContent = formatScore(rdi, 3);
  document.getElementById('triValue').textContent = `${formatScore(tri, 2)}%`;

  setTimeout(() => {
    document.getElementById('pcsBar').style.width = (pcs * 100) + '%';
    document.getElementById('easBar').style.width = (eas * 100) + '%';
    document.getElementById('rdiBar').style.width = (rdi * 100) + '%';
    document.getElementById('triBar').style.width = tri + '%';
  }, 100);

  // Status badge
  const badge = document.getElementById('validationStatus');
  badge.textContent = result.final_decision || result.validation_status || 'UNKNOWN';
  badge.className = 'badge-premium';
  if (result.validation_status === 'APPROVED') badge.classList.add('badge-success');
  else if (result.validation_status === 'REVIEW REQUIRED') badge.classList.add('badge-warning');
  else badge.classList.add('badge-danger');

  document.getElementById('confidenceBand').textContent = result.confidence_band || 'N/A';

  // Comparison chart
  const riskMap = { 'Low': 1, 'Medium': 2, 'High': 3 };
  const riskLabelMap = { 0: 'N/A', 1: 'Low', 2: 'Medium', 3: 'High' };
  const riskColor = (risk) => {
    if (risk === 'Low') return CHART_COLORS.success;
    if (risk === 'High') return CHART_COLORS.danger;
    if (risk === 'Medium') return CHART_COLORS.warning;
    return CHART_COLORS.textLight;
  };
  const comparisonRisks = [
    result.ai_risk || 'N/A',
    result.expert_risk || 'N/A',
    result.final_risk || result.expert_risk || result.ai_risk || 'N/A'
  ];
  destroyChart('comparison');
  chartInstances['comparison'] = new Chart(document.getElementById('comparisonChart'), {
    type: 'bar',
    data: {
      labels: ['AI Prediction', 'Expert Rulebooks', 'Final Decision'],
      datasets: [{
        label: 'Risk Level',
        data: comparisonRisks.map(risk => riskMap[risk] || 0),
        backgroundColor: comparisonRisks.map(riskColor),
        borderRadius: 8, borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `Risk: ${riskLabelMap[context.parsed.x] || 'N/A'}`
          }
        }
      },
      scales: {
        x: {
          min: 0,
          max: 3,
          ticks: {
            stepSize: 1,
            color: CHART_COLORS.textLight,
            callback: (value) => riskLabelMap[value] || ''
          },
          grid: { color: CHART_COLORS.gridLine }
        },
        y: {
          ticks: { color: CHART_COLORS.text },
          grid: { display: false }
        }
      }
    }
  });
  const summary = document.getElementById('comparisonChartSummary');
  if (summary) {
    const consensus = result.expert_consensus || {};
    summary.innerHTML = `
      AI vs Expert Agreement: <strong>${formatPercent(consensus.ai_expert_agreement, 0)}</strong>
      <span class="comparison-summary-divider">|</span>
      Expert Source Agreement: <strong>${formatPercent(consensus.expert_source_agreement, 0)}</strong>
      <span class="comparison-summary-divider">|</span>
      RDI: <strong>${formatScore(rdi, 3)}</strong>
    `;
  }

  // Advisory formatted
  const advDiv = document.getElementById('advisoryFormatted');
  const advisory = result.llm_advisory || 'No advisory available';
  const sections = advisory.split('\n').filter(l => l.trim());
  let html = '';
  const sectionKeys = [
    'Risk Summary',
    'Current Field Status', 
    'Key Observations',
    'Recommended Actions',
    'Farmer Guidance',
    'Why this score?', 
    'Farmer\'s Checklist', 
    'Next Steps'
  ];
  let currentSection = null;
  for (const line of sections) {
    const matchedKey = sectionKeys.find(k => line.toLowerCase().startsWith(k.toLowerCase() + ':') || line.toLowerCase().startsWith('**' + k.toLowerCase()));
    if (matchedKey) {
      if (currentSection) html += '</div>';
      const content = line.replace(/^\*\*.*?\*\*:?\s*/, '').replace(new RegExp('^' + matchedKey + ':?\\s*', 'i'), '');
      html += `<div class="advisory-section"><div class="advisory-section-title">${matchedKey}</div><div class="advisory-section-text">${content}`;
      currentSection = matchedKey;
    } else if (currentSection) {
      html += '<br>' + line;
    } else {
      html += `<div class="advisory-section"><div class="advisory-section-text">${line}</div></div>`;
    }
  }
  if (currentSection) html += '</div></div>';
  advDiv.innerHTML = html || '<p style="color:var(--text-muted)">No advisory available</p>';

  // LLM Metrics - Simplified for Farmer
  if (result.llm_validation) {
    const v = result.llm_validation;
    
    // UI Label Map
    const getStatusLabel = (score) => {
        if (score >= 0.8) return '<span style="color:var(--success)">Excellent</span>';
        if (score >= 0.6) return '<span style="color:var(--warning)">Good</span>';
        return '<span style="color:var(--danger)">Needs Check</span>';
    };

    document.getElementById('rcsValue').innerHTML = v.RCS === 1 ? '<span style="color:var(--success)">Consistent</span>' : '<span style="color:var(--warning)">Needs Review</span>';
    document.getElementById('assValue').innerHTML = getStatusLabel(v.ASS);
    document.getElementById('dcsValue').innerHTML = getStatusLabel(v.DCS);
    document.getElementById('ltsValue').textContent = v.LTS ? v.LTS + '%' : 'N/A';
    
    const llmStatus = document.getElementById('llmStatus');
    llmStatus.textContent = v.LLM_Status || 'N/A';
    llmStatus.className = 'badge-premium';
    if (v.LLM_Status === 'APPROVED') llmStatus.classList.add('badge-success');
    else if (v.LLM_Status === 'SKIPPED') llmStatus.classList.add('badge-info');
    else llmStatus.classList.add('badge-warning');
  }

  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========== BATCH VALIDATION ==========
async function uploadBatchFile() {
  const fileInput = document.getElementById('batchFile');
  const file = fileInput.files[0];
  if (!file) { showNotification('Please select a CSV file', 'warning'); return; }
  if (!/\.csv$/i.test(file.name)) { showNotification('Please upload a CSV file', 'warning'); return; }

  const formData = new FormData();
  formData.append('file', file);
  showLoading();
  try {
    const token = await getAccessToken();
    const response = await fetch(`${API_BASE_URL}/batch-validate`, { method: 'POST', body: formData, headers: token ? {'Authorization': `Bearer ${token}`} : {} });
    const responseText = await response.text();
    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch (_) {
      result = {
        error: response.ok
          ? 'Unexpected response from batch validation service.'
          : `Batch validation failed with HTTP ${response.status}. Please use a plain CSV and try again.`
      };
    }

    if (!response.ok && !result.error) {
      result.error = `Batch validation failed with HTTP ${response.status}.`;
    }
    
    if (result.error) {
      displayBatchResults(result);
      showNotification(result.error, 'danger');
      return;
    }
    
    displayBatchResults(result);
    showNotification(`Batch processed: ${result.records_processed} records`, 'success');
  } catch(e) {
    displayBatchResults({ error: e?.message || 'Failed to process batch file.' });
    showNotification(e?.message || 'Failed to process batch file.', 'danger');
  }
  finally { hideLoading(); }
}

function displayBatchResults(result) {
  const div = document.getElementById('batchStatus');
  div.classList.remove('hidden');
  const requiredColumns = (result.required_columns || []).join(', ');
  const acceptedSeasons = (result.accepted_seasons || []).join(', ');
  const previewRows = result.results_preview || [];
  const errorRows = result.sample_errors || [];

  if (result.error) {
    div.innerHTML = `
      <div class="glass-card-premium">
        <div class="card-header-premium"><h3 class="card-title-premium">Batch Validation Needs Attention</h3></div>
        <div class="advisory-section">
          <div class="advisory-section-title">Issue</div>
          <div class="advisory-section-text">${escapeHtml(result.error)}</div>
        </div>
        <div class="advisory-section">
          <div class="advisory-section-title">Required CSV Columns</div>
          <div class="advisory-section-text">${escapeHtml(requiredColumns || 'State, District, Crop, Season, Area, Production, Yield')}</div>
        </div>
        <div class="advisory-section">
          <div class="advisory-section-title">Accepted Season Values</div>
          <div class="advisory-section-text">${escapeHtml(acceptedSeasons || 'Kharif, Rabi, Summer, Total')}</div>
        </div>
        ${errorRows.length ? `
          <div class="advisory-section">
            <div class="advisory-section-title">Sample Row Errors</div>
            <div class="advisory-section-text">${errorRows.map(err => `Row ${err.row}: ${escapeHtml(err.error)}`).join('<br>')}</div>
          </div>
        ` : ''}
      </div>`;
    return;
  }

  div.innerHTML = `
    <div class="glass-card-premium">
      <div class="card-header-premium"><h3 class="card-title-premium">Batch Processing Complete</h3></div>
      <div class="metrics-grid-premium four-col">
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Processed</span><span class="metric-value-premium">${result.records_processed||0}</span></div></div>
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Skipped</span><span class="metric-value-premium">${result.skipped_rows||0}</span></div></div>
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Approved</span><span class="metric-value-premium" style="color:var(--success)">${result.approved||0}</span></div></div>
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Review</span><span class="metric-value-premium" style="color:var(--warning)">${result.review_required||0}</span></div></div>
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Rejected</span><span class="metric-value-premium" style="color:var(--danger)">${result.rejected||0}</span></div></div>
      </div>
      <div class="metrics-grid-premium four-col" style="margin-top:1rem;">
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Avg EAS</span><span class="metric-value-premium">${formatScore(result.avg_eas, 3)}</span></div></div>
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Avg RDI</span><span class="metric-value-premium">${formatScore(result.avg_rdi, 3)}</span></div></div>
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Avg TRI</span><span class="metric-value-premium">${formatScore(result.avg_tri, 2)}%</span></div></div>
        <div class="metric-card-premium"><div class="metric-info"><span class="metric-label-premium">Final Risk Mix</span><span class="metric-value-premium">${(result.risk_distribution||{}).Low||0} / ${(result.risk_distribution||{}).Medium||0} / ${(result.risk_distribution||{}).High||0}</span></div></div>
      </div>
      <div class="advisory-section" style="margin-top:1rem;">
        <div class="advisory-section-title">Batch Parameters</div>
        <div class="advisory-section-text">
          Required CSV columns: ${escapeHtml(requiredColumns || 'State, District, Crop, Season, Area, Production, Yield')}<br>
          Accepted season values: ${escapeHtml(acceptedSeasons || 'Kharif, Rabi, Summer, Total')}
        </div>
      </div>
      ${previewRows.length ? `
        <div class="advisory-section">
          <div class="advisory-section-title">Preview of Processed Rows</div>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr><th>Row</th><th>State</th><th>Crop</th><th>AI</th><th>Expert</th><th>Final</th><th>RDI</th><th>TRI</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${previewRows.map(row => `
                  <tr>
                    <td>${row.row}</td>
                    <td>${escapeHtml(row.state || '')}</td>
                    <td>${escapeHtml(row.crop || '')}</td>
                    <td>${escapeHtml(row.ai_risk || '')}</td>
                    <td>${escapeHtml(row.expert_risk || '')}</td>
                    <td>${escapeHtml(row.final_risk || '')}</td>
                    <td>${formatScore(row.rdi, 3)}</td>
                    <td>${formatScore(row.tri, 2)}%</td>
                    <td>${escapeHtml(row.validation_status || '')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
      ${errorRows.length ? `
        <div class="advisory-section">
          <div class="advisory-section-title">Skipped Row Details</div>
          <div class="advisory-section-text">${errorRows.map(err => `Row ${err.row}: ${escapeHtml(err.error)}`).join('<br>')}</div>
        </div>
      ` : ''}
    </div>`;
}

// ========== PREDICTION HISTORY ==========
let historyPage = 0;
async function loadPredictionHistory(offset = 0) {
  historyPage = offset;
  try {
    const res = await authFetch(`${API_BASE_URL}/api/prediction-history?limit=20&offset=${offset}`);
    const data = await res.json();
    const tbody = document.getElementById('historyBody');
    if (!data.data || data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="table-empty">No predictions found. Run single or batch predictions first.</td></tr>';
      return;
    }
    tbody.innerHTML = data.data.map(r => {
      const statusClass = r.validation_status === 'APPROVED' ? 'badge-success' : r.validation_status === 'REJECTED' ? 'badge-danger' : 'badge-warning';
      const ts = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
      const sourceBadge = r.source === 'batch' ? 'badge-info' : 'badge-premium';
      return `<tr>
        <td>${r.id}</td><td>${ts}</td><td>${r.state||''}</td><td>${r.crop||''}</td>
        <td><span class="badge-premium ${sourceBadge}">${r.source||'single'}</span></td>
        <td>${r.ai_risk||''}</td><td>${r.expert_risk||''}</td><td>${r.tri ? r.tri+'%' : ''}</td>
        <td><span class="badge-premium ${statusClass}">${r.validation_status||''}</span></td>
        <td>${r.decision_action||''}</td>
      </tr>`;
    }).join('');

    // Pagination
    const totalPages = Math.ceil(data.total / 20);
    const currentPage = Math.floor(offset / 20);
    const pagDiv = document.getElementById('historyPagination');
    let pagHtml = '';
    for (let i = 0; i < Math.min(totalPages, 10); i++) {
      pagHtml += `<button class="${i===currentPage?'active':''}" onclick="loadPredictionHistory(${i*20})">${i+1}</button>`;
    }
    pagDiv.innerHTML = pagHtml;
  } catch(e) { console.error(e); }
}

// ========== OFFICER REVIEW ==========
async function loadOfficerReviews() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/officer-reviews?status=pending`);
    const reviews = await res.json();
    const container = document.getElementById('officerReviewList');
    if (!reviews || reviews.length === 0) {
      container.innerHTML = '<div class="review-card"><p style="color:var(--text-muted);text-align:center">No predictions pending review.</p></div>';
      return;
    }
    container.innerHTML = reviews.map(r => {
      const statusClass = r.validation_status === 'APPROVED' ? 'badge-success' : r.validation_status === 'REJECTED' ? 'badge-danger' : 'badge-warning';
      const ts = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
      const riskClass = r.ai_risk === 'High' ? 'color:#ef4444' : r.ai_risk === 'Medium' ? 'color:#f59e0b' : 'color:#22c55e';
      return `
      <div class="review-card" id="review-${r.id}" style="margin-bottom:1rem;border:1px solid var(--border);border-radius:12px;padding:1.25rem">
        <div class="review-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
          <strong style="color:var(--accent-dark);font-size:1rem">Prediction #${r.id}</strong>
          <span class="badge-premium ${statusClass}">${r.validation_status||'PENDING'}</span>
        </div>
        <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.75rem;padding:0.75rem;background:rgba(22,163,74,0.04);border-radius:8px">
          <div style="display:flex;align-items:center;gap:0.4rem">
            <span style="font-size:1.1rem">👨‍🌾</span>
            <div><div style="font-weight:600;font-size:0.85rem">${r.farmer_name||'Unknown'}</div><div style="font-size:0.72rem;color:var(--text-muted)">${r.farmer_email||''}</div></div>
          </div>
          <div style="font-size:0.82rem;color:var(--text-muted);display:flex;align-items:center;gap:0.3rem">🕒 ${ts}</div>
        </div>
        <div class="review-meta" style="display:flex;flex-wrap:wrap;gap:0.75rem;margin-bottom:0.75rem;font-size:0.85rem">
          <span>State: <strong>${r.state||''}</strong></span>
          <span>District: <strong>${r.district||''}</strong></span>
          <span>Crop: <strong>${r.crop||''}</strong></span>
          <span>Season: <strong>${r.season||''}</strong></span>
          <span>AI Risk: <strong style="${riskClass}">${r.ai_risk||''}</strong></span>
          <span>Expert Risk: <strong>${r.expert_risk||''}</strong></span>
          <span>TRI: <strong>${r.tri ? r.tri+'%' : ''}</strong></span>
        </div>
        <div class="review-actions" style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
          <input type="text" id="officer-name-${r.id}" placeholder="Officer Name" style="width:150px;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:0.82rem">
          <input type="text" id="officer-comment-${r.id}" placeholder="Comments" style="width:200px;padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:0.82rem">
          <select id="officer-decision-${r.id}" style="padding:0.4rem 0.6rem;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:0.82rem">
            <option value="APPROVED">Approve</option>
            <option value="REJECTED">Reject</option>
          </select>
          <button class="btn-premium btn-primary-premium btn-sm" onclick="submitReview(${r.id})">Submit Review</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) { console.error(e); }
}

async function submitReview(predId) {
  const name = document.getElementById(`officer-name-${predId}`).value.trim();
  const decision = document.getElementById(`officer-decision-${predId}`).value;
  const comments = document.getElementById(`officer-comment-${predId}`).value.trim();
  if (!name) { showNotification('Please enter officer name', 'warning'); return; }
  try {
    await authFetch(`${API_BASE_URL}/api/officer-review`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prediction_id: predId, officer_name: name, decision, comments })
    });
    showNotification(`Review submitted: ${decision}`, 'success');
    document.getElementById(`review-${predId}`).style.opacity = '0.4';
    setTimeout(() => loadOfficerReviews(), 500);
  } catch(e) { showNotification('Failed to submit review', 'danger'); }
}

// ========== AI MODEL MONITOR ==========
async function loadModelMonitor() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/model-metrics`);
    const m = await res.json();

    document.getElementById('monTotal').textContent = m.total_predictions || 0;
    document.getElementById('monAvgTri').textContent = (m.avg_tri || 0) + '%';

    // TRI Line Chart
    const triData = m.tri_trend || [];
    destroyChart('triLine');
    chartInstances['triLine'] = new Chart(document.getElementById('triLineChart'), {
      type: 'line',
      data: {
        labels: triData.map((_, i) => i + 1),
        datasets: [{
          label: 'TRI Score', data: triData.map(d => d.tri),
          borderColor: CHART_COLORS.green, backgroundColor: 'rgba(139,195,74,0.1)',
          fill: true, tension: 0.4, pointRadius: 2
        }]
      },
      options: CHART_DEFAULTS
    });

    // Risk Bar
    const rd = m.risk_distribution || {};
    destroyChart('monRisk');
    chartInstances['monRisk'] = new Chart(document.getElementById('monRiskBar'), {
      type: 'bar',
      data: {
        labels: ['Low', 'Medium', 'High'],
        datasets: [{ label: 'Predictions', data: [rd['Low']||0, rd['Medium']||0, rd['High']||0], backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger], borderRadius: 8 }]
      },
      options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } } }
    });

    // Decision Pie
    const dd = m.decision_distribution || {};
    destroyChart('monDecision');
    chartInstances['monDecision'] = new Chart(document.getElementById('monDecisionPie'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(dd), datasets: [{ data: Object.values(dd), backgroundColor: [CHART_COLORS.success, CHART_COLORS.danger, CHART_COLORS.warning], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: CHART_COLORS.text } } } }
    });

  } catch(e) { console.error('Monitor error:', e); }
}

// ========== LOAN REQUESTS ==========
let currentLoanId = null;

async function loadLoanRequests() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/loan-requests`);
    const loans = await res.json();
    const tbody = document.getElementById('loanRequestsBody');
    if (!loans || loans.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="table-empty">No loan requests yet.</td></tr>';
      return;
    }
    tbody.innerHTML = loans.map(l => {
      const sc = l.status === 'APPROVED' ? 'badge-success' : l.status === 'REJECTED' ? 'badge-danger' : 'badge-warning';
      const riskStyle = l.ai_risk === 'High' ? 'color:#ef4444' : l.ai_risk === 'Medium' ? 'color:#f59e0b' : 'color:#22c55e';
      const expRiskStyle = l.expert_risk === 'High' ? 'color:#ef4444' : l.expert_risk === 'Medium' ? 'color:#f59e0b' : 'color:#22c55e';
      return `<tr>
        <td><div style="font-weight:600;font-size:0.85rem">${l.farmer_name||'Unknown'}</div><div style="font-size:0.72rem;color:var(--text-muted)">${l.farmer_email||''}</div></td>
        <td>${l.crop||''}</td>
        <td>${l.state||''}, ${l.district||''}</td>
        <td style="${riskStyle};font-weight:600">${l.ai_risk||''}</td>
        <td style="${expRiskStyle};font-weight:600">${l.expert_risk||''}</td>
        <td>${l.tri ? l.tri+'%' : ''}</td>
        <td><span class="badge-premium ${sc}">${l.status}</span></td>
        <td style="font-size:0.82rem">${l.officer_name ? '<strong>' + l.officer_name + '</strong>: ' + (l.officer_reason||'—') : '<span style="color:var(--text-muted)">Awaiting bank review</span>'}</td>
      </tr>`;
    }).join('');
  } catch(e) { console.error(e); }
}

async function showLoanReview(loanId) {
  currentLoanId = loanId;
  try {
    const res = await authFetch(`${API_BASE_URL}/api/loan-requests`);
    const loans = await res.json();
    const loan = loans.find(l => l.id === loanId);
    if (!loan) { showNotification('Loan not found', 'danger'); return; }

    const panel = document.getElementById('loanReviewPanel');
    panel.classList.remove('hidden');

    const riskStyle = loan.ai_risk === 'High' ? 'color:#ef4444;font-weight:700' : loan.ai_risk === 'Medium' ? 'color:#f59e0b;font-weight:700' : 'color:#22c55e;font-weight:700';
    document.getElementById('loanReviewDetails').innerHTML = `
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;padding:0.75rem;background:rgba(22,163,74,0.04);border-radius:8px">
        <div style="font-size:1.1rem">\ud83d\udc68\u200d\ud83c\udf3e</div>
        <div><strong>${loan.farmer_name||'Unknown'}</strong><br><span style="font-size:0.78rem;color:var(--text-muted)">${loan.farmer_email||''}</span></div>
      </div>
      <div class="table-responsive">
        <table class="data-table" style="font-size:0.88rem">
          <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Prediction ID</td><td>#${loan.prediction_id}</td></tr>
            <tr><td>State</td><td>${loan.state||''}</td></tr>
            <tr><td>District</td><td>${loan.district||''}</td></tr>
            <tr><td>Crop</td><td>${loan.crop||''}</td></tr>
            <tr><td>Season</td><td>${loan.season||''}</td></tr>
            <tr><td>AI Risk</td><td style="${riskStyle}">${loan.ai_risk||''}</td></tr>
            <tr><td>Expert Risk</td><td>${loan.expert_risk||''}</td></tr>
            <tr><td>TRI</td><td>${loan.tri ? loan.tri+'%' : ''}</td></tr>
            <tr><td>Area (ha)</td><td>${loan.area||''}</td></tr>
            <tr><td>Production (tonnes)</td><td>${loan.production||''}</td></tr>
            <tr><td>Yield (tonnes/ha)</td><td>${loan.yield_val||''}</td></tr>
          </tbody>
        </table>
      </div>`;

    // Reset form
    document.querySelectorAll('input[name="loanDecision"]').forEach(r => r.checked = false);
    document.getElementById('loanOfficerName').value = '';
    document.getElementById('loanReason').value = '';

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch(e) { console.error(e); }
}

async function submitLoanDecision() {
  if (!currentLoanId) { showNotification('No loan selected', 'warning'); return; }
  const decision = document.querySelector('input[name="loanDecision"]:checked')?.value;
  const officerName = document.getElementById('loanOfficerName').value.trim();
  const reason = document.getElementById('loanReason').value.trim();
  if (!decision) { showNotification('Please select Approve or Reject', 'warning'); return; }
  if (!officerName) { showNotification('Please enter officer name', 'warning'); return; }
  try {
    await authFetch(`${API_BASE_URL}/api/loan-decision`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ loan_id: currentLoanId, officer_name: officerName, decision, reason })
    });
    showNotification(`Loan ${decision} successfully`, 'success');
    document.getElementById('loanReviewPanel').classList.add('hidden');
    currentLoanId = null;
    loadLoanRequests();
  } catch(e) { showNotification('Failed to submit decision', 'danger'); }
}

// ========== EXPLAINABILITY ==========
async function loadExplainability() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/feature-importance`);
    const data = await res.json();
    const features = data.features || [];
    const importances = data.importances || [];
    const maxImp = Math.max(...importances, 0.01);

    destroyChart('featImp');
    chartInstances['featImp'] = new Chart(document.getElementById('featureImportanceChart'), {
      type: 'bar',
      data: {
        labels: features,
        datasets: [{
          label: 'Feature Importance',
          data: importances.map(v => parseFloat((v / maxImp * 100).toFixed(1))),
          backgroundColor: features.map((_, i) => {
            const colors = ['#4fc3f7','#4dd0e1','#4db6ac','#81c784','#aed581','#dce775','#fff176'];
            return colors[i % colors.length];
          }),
          borderRadius: 6, borderSkipped: false
        }]
      },
      options: { ...CHART_DEFAULTS, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ...CHART_DEFAULTS.scales.x, title: { display: true, text: 'Relative Importance (%)', color: CHART_COLORS.text } }, y: CHART_DEFAULTS.scales.y } }
    });

    // Feature explanation items
    const featDiv = document.getElementById('explanationFeatures');
    featDiv.innerHTML = features.map((f, i) => {
      const pct = importances[i] ? parseFloat((importances[i] / maxImp * 100).toFixed(1)) : 0;
      return `<div class="feat-item"><span class="feat-label">${f}</span><div class="feat-bar-wrap"><div class="feat-bar" style="width:${pct}%"></div></div><span class="feat-value">${pct}%</span></div>`;
    }).join('');

    // Update explanation text
    const topFeature = features[importances.indexOf(Math.max(...importances))] || 'Yield';
    document.querySelector('.explanation-text').textContent =
      `The model predicted risk levels primarily based on ${topFeature}. Higher importance indicates greater influence on the model's decision. Features like Area, Production, and Yield are continuous variables, while State, District, Crop, and Season are categorical encodings.`;
  } catch(e) { console.error(e); }
}

// ========== RISK MAP ==========
async function loadRiskMap() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/risk-heatmap`);
    const states = await res.json();
    const grid = document.getElementById('riskMapGrid');

    if (!states || states.length === 0) {
      grid.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:2rem;grid-column:1/-1">No data available. Run batch predictions to populate the risk map.</div>';
      return;
    }

    grid.innerHTML = states.map(s => {
      const riskClass = s.dominant_risk === 'High' ? 'risk-high' : s.dominant_risk === 'Medium' ? 'risk-medium' : 'risk-low';
      const badgeClass = s.dominant_risk.toLowerCase();
      const crops = (s.crops || '').split(',').slice(0, 3).join(', ');
      return `
        <div class="state-card ${riskClass}" onmouseenter="showMapTooltip(event, ${JSON.stringify(s).replace(/"/g, '&quot;')})" onmouseleave="hideMapTooltip()">
          <div class="state-risk-bar"></div>
          <div class="state-name">${s.state}</div>
          <div class="state-info">${s.total} predictions</div>
          <div class="state-info">Avg Yield: ${s.avg_yield}</div>
          <span class="state-risk-badge ${badgeClass}">${s.dominant_risk} Risk</span>
        </div>`;
    }).join('');
  } catch(e) { console.error(e); }
}

function showMapTooltip(event, data) {
  const tt = document.getElementById('mapTooltip');
  tt.classList.remove('hidden');
  tt.innerHTML = `
    <div class="tt-title">${data.state}</div>
    <div class="tt-row"><span>Dominant Risk:</span><span>${data.dominant_risk}</span></div>
    <div class="tt-row"><span>High:</span><span>${data.high}</span></div>
    <div class="tt-row"><span>Medium:</span><span>${data.medium}</span></div>
    <div class="tt-row"><span>Low:</span><span>${data.low}</span></div>
    <div class="tt-row"><span>Avg Yield:</span><span>${data.avg_yield} kg/ha</span></div>
    <div class="tt-row"><span>Crops:</span><span>${(data.crops||'').split(',').slice(0,4).join(', ')}</span></div>
  `;
  tt.style.left = (event.clientX + 15) + 'px';
  tt.style.top = (event.clientY - 10) + 'px';
}

function hideMapTooltip() {
  document.getElementById('mapTooltip').classList.add('hidden');
}

// ========== AUDIT LOGS ==========
let auditPage = 0;
async function loadAuditLogs(offset = 0) {
  auditPage = offset;
  try {
    const res = await authFetch(`${API_BASE_URL}/api/audit-logs?limit=20&offset=${offset}`);
    const data = await res.json();
    const tbody = document.getElementById('auditBody');
    if (!data.data || data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No audit logs yet.</td></tr>';
      return;
    }
    tbody.innerHTML = data.data.map(r => {
      const ts = r.timestamp ? new Date(r.timestamp).toLocaleString() : '';
      const typeClass = r.event_type === 'ERROR' ? 'color:var(--danger)' : r.event_type === 'BATCH' ? 'color:var(--info)' : 'color:var(--accent)';
      return `<tr><td>${r.id}</td><td>${ts}</td><td style="${typeClass};font-weight:600">${r.event_type||''}</td><td>${r.message||''}</td><td style="font-size:0.8rem;color:var(--text-muted)">${r.details||''}</td></tr>`;
    }).join('');

    const totalPages = Math.ceil(data.total / 20);
    const currentPage = Math.floor(offset / 20);
    const pagDiv = document.getElementById('auditPagination');
    let html = '';
    for (let i = 0; i < Math.min(totalPages, 10); i++) {
      html += `<button class="${i===currentPage?'active':''}" onclick="loadAuditLogs(${i*20})">${i+1}</button>`;
    }
    pagDiv.innerHTML = html;
  } catch(e) { console.error(e); }
}

// ========== DOWNLOAD REPORT ==========
function downloadReport() {
  window.open(`${API_BASE_URL}/download-report`, '_blank');
}

// ========== FILE UPLOAD ==========
function initFileUpload() {
  const area = document.getElementById('fileUploadArea');
  const input = document.getElementById('batchFile');
  if (!area || !input) return;
  area.addEventListener('click', () => input.click());
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault(); area.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) { input.files = e.dataTransfer.files; updateFileName(e.dataTransfer.files[0].name); }
  });
  input.addEventListener('change', e => { if (e.target.files.length > 0) updateFileName(e.target.files[0].name); });
}

function updateFileName(name) {
  const d = document.getElementById('fileNameDisplay');
  if (d) { d.textContent = `Selected: ${name}`; d.style.color = 'var(--accent)'; }
}

// ========== RESET FORMS ==========
function resetPredictionForm() {
  document.getElementById('predictionForm').reset();
  document.getElementById('predictionResults').classList.add('hidden');
}

function resetBatchForm() {
  document.getElementById('batchFile').value = '';
  document.getElementById('batchStatus').classList.add('hidden');
  const d = document.getElementById('fileNameDisplay');
  if (d) { d.textContent = 'No file selected'; d.style.color = 'var(--text-muted)'; }
}

// ========== SESSION GUARD (Supabase) ==========
async function checkOfficerSession() {
  const user = await getSupabaseUser();
  if (!user) {
    window.location.href = '/login';
    return null;
  }
  // Allow any role that is NOT farmer or bank_officer into officer portal
  // This handles: 'officer' (legacy), 'agrivalidator_officer', or any variant
  if (user.role === 'farmer' || user.role === 'bank_officer') {
    window.location.href = '/login';
    return null;
  }
  return user;
}

async function initOfficerSession() {
  const user = await checkOfficerSession();
  if (!user) return;
  const name = user.name || 'Officer';
  const nameEl = document.getElementById('officerUserName');
  if (nameEl) nameEl.textContent = name;
}

async function handleLogout() {
  await supabaseSignOut();
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  await initOfficerSession();
  initNavigation();
  initFileUpload();
  loadDashboardData();
  updateSystemWidget();
  // Refresh system metrics every 30s
  setInterval(updateSystemWidget, 30000);
});
