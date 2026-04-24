// ========================================
// AGRVALIDATOR - FARMER DASHBOARD JS
// ========================================

// Use dynamic origin to avoid 127.0.0.1 vs localhost issues
const API_BASE_URL = window.location.origin;
const chartInstances = {};
let lastPredictionResult = null;

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  predict: 'Crop Prediction',
  advisory: 'AI Advisory',
  history: 'Request History',
  loans: 'My Loans',
  reports: 'Reports'
};

const CHART_COLORS = {
  green: '#16a34a', gold: '#f59e0b', red: '#ef4444',
  blue: '#3b82f6', text: '#374151', textLight: '#6b7280',
  gridLine: 'rgba(0,0,0,0.06)',
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

// ===== SESSION GUARD (Supabase) =====
async function checkSession() {
  const user = await getSupabaseUser();
  if (!user || !['farmer', 'agrivalidator_officer'].includes(user.role)) {
    window.location.href = '/login';
    return null;
  }
  return user;
}

async function initSession() {
  const user = await checkSession();
  if (!user) return;

  const name = user.name || 'User';
  const roleDisplay = user.role === 'agrivalidator_officer' ? 'Agri Officer' : 'Farmer';
  document.getElementById('userName').textContent = name;
  document.getElementById('topbarGreeting').textContent = `Welcome, ${name}`;
  document.getElementById('userRole').textContent = `${roleDisplay} Account`;
  const el = document.getElementById('welcomeName');
  if (el) el.textContent = name;
}

async function handleLogout() {
  await supabaseSignOut();
}

// ===== PAGE INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Farmer Dashboard: DOMContentLoaded');
  initNavigation();
  
  // Load UI components immediately, don't wait for session
  loadCropOptions();
  loadLocationOptions();
  
  await initSession();
  loadDashboardData();
});

// ===== NAVIGATION =====
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page);
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
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (activeNav) activeNav.classList.add('active');

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const targetPage = document.getElementById(`page-${page}`);
  if (targetPage) targetPage.classList.add('active');

  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || page;
  document.getElementById('sidebar').classList.remove('open');

  loadPageData(page);
}

function loadPageData(page) {
  switch(page) {
    case 'dashboard': loadDashboardData(); break;
    case 'history': loadHistory(); break;
    case 'advisory': showAdvisoryPage(); break;
    case 'loans': loadMyLoans(); break;
  }
}

async function loadCropOptions() {
  const cropSelect = document.getElementById('crop');
  if (!cropSelect) return;
  cropSelect.innerHTML = '<option value="">Loading crops...</option>';
  try {
    const resp = await authFetch(`${API_BASE_URL}/api/crops`);
    const data = await resp.json();
    let crops = data.crops || [];
    if (!Array.isArray(crops) || crops.length === 0) {
      crops = ['Rice', 'Wheat', 'Maize', 'Moong', 'Tur', 'Gram', 'Cotton', 'Sugarcane'];
    }
    cropSelect.innerHTML = '<option value="">Select Crop</option>' +
      crops.map(c => `<option value="${c}">${c}</option>`).join('');
  } catch (e) {
    cropSelect.innerHTML = '<option value="">Select Crop</option><option>Rice</option><option>Wheat</option><option>Maize</option><option>Moong</option><option>Tur</option>';
    console.error('Failed to load crop list', e);
  }
}

async function loadLocationOptions() {
  console.log('Loading location options...');
  const stateSelect = document.getElementById('state');
  if (!stateSelect) {
    console.error('State select element not found!');
    return;
  }
  stateSelect.innerHTML = '<option value="">Loading states...</option>';
  try {
    const resp = await authFetch(`${API_BASE_URL}/api/states`);
    const data = await resp.json();
    let states = data.states || [];
    
    // Fallback if API returns empty
    if (states.length === 0) {
      states = ['Andhra Pradesh', 'Bihar', 'Gujarat', 'Haryana', 'Karnataka', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Uttar Pradesh', 'West Bengal'];
    }
    
    stateSelect.innerHTML = '<option value="">Select State</option>' +
      states.map(s => `<option value="${s}">${s}</option>`).join('');
  } catch (e) {
    console.error('Failed to load state list', e);
    const fallbackStates = ['Andhra Pradesh', 'Bihar', 'Gujarat', 'Haryana', 'Karnataka', 'Maharashtra', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Uttar Pradesh', 'West Bengal'];
    stateSelect.innerHTML = '<option value="">Select State</option>' +
      fallbackStates.map(s => `<option value="${s}">${s}</option>`).join('');
  }
}

async function handleStateChange() {
  const state = document.getElementById('state').value;
  const distSelect = document.getElementById('district');
  if (!distSelect) return;

  if (!state) {
    distSelect.innerHTML = '<option value="">Select District (Select State first)</option>';
    distSelect.disabled = true;
    return;
  }

  distSelect.disabled = false;
  distSelect.innerHTML = '<option value="">Loading districts...</option>';

  try {
    const resp = await authFetch(`${API_BASE_URL}/api/districts/${encodeURIComponent(state)}`);
    const data = await resp.json();
    const districts = data.districts || [];
    distSelect.innerHTML = '<option value="">Select District</option>' +
      districts.map(d => `<option value="${d}">${d}</option>`).join('');
  } catch (e) {
    distSelect.innerHTML = '<option value="">Select District</option>';
    console.error('Failed to load district list', e);
  }
}

// ===== TOAST =====
function showNotification(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ===== LOADING =====
function showLoading() { document.getElementById('loadingOverlay')?.classList.add('active'); }
function hideLoading() { document.getElementById('loadingOverlay')?.classList.remove('active'); }

// ===== CHART HELPERS =====
function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; } }

const METRIC_EXPLANATIONS = {
  pcs: {
    title: 'PCS - Prediction Confidence Score',
    summary: 'This tells how confident the AI model was when it selected the risk level.',
    meaning: 'Score range is 0 to 1. A value near 1 means the AI was very sure; a value near 0.5 means the AI was less sure.',
    calculation: 'The backend uses the highest probability returned by the model. Example: PCS 0.998 means about 99.8% model confidence.',
    farmer: 'Use PCS as a confidence signal only. A high PCS is good, but expert rulebooks and the final decision should still guide action.'
  },
  eas: {
    title: 'EAS - Expert Agreement Score',
    summary: 'This tells how strongly the AI result is supported after checking expert consensus and source-level agreement.',
    meaning: 'Higher is better. Values near 1 mean the AI, expert consensus, and expert sources are broadly aligned.',
    calculation: 'The backend first calculates RDI using AI-expert gap, expert-source disagreement, and agreement penalty. EAS = 1 - RDI.',
    farmer: 'Higher EAS means the AI result is supported by expert rules. Low EAS means the result should be reviewed carefully.'
  },
  rdi: {
    title: 'RDI - Risk Deviation Index',
    summary: 'This tells how much disagreement exists between the AI, the expert consensus, and the expert sources.',
    meaning: 'Lower is better. 0 means the signals are aligned. Higher values mean more disagreement or conflict across the system.',
    calculation: 'RDI combines the AI-expert risk gap, the final-risk gap, expert vote disagreement, and an agreement-level penalty.',
    farmer: 'If RDI is high, trust the final validation decision more than the AI alone.'
  },
  tri: {
    title: 'TRI - Trust Reliability Index',
    summary: 'This is the overall trust score for the prediction result.',
    meaning: 'Score range is 0% to 100%. Above 90% is very reliable, 80-89% is high, 65-79% is moderate, and below 65% needs caution.',
    calculation: 'TRI = (PCS x 55%) + (EAS x 45%), then shown as a percentage.',
    farmer: 'TRI combines AI confidence with expert agreement. It is a quick trust indicator, but final risk is still the safest value to follow.'
  },
  rcs: {
    title: 'RCS - Risk Consistency Score',
    summary: 'This checks whether the written AI advisory matches the predicted risk level.',
    meaning: 'Usually 1 means the advisory passed the rule check, and 0 means the advisory had a serious mismatch.',
    calculation: 'The backend checks simple safety rules. For example, a High-risk advisory should not say "no action", and a Low-risk advisory should not create an emergency.',
    farmer: 'RCS helps make sure the explanation text does not contradict the actual risk.'
  },
  ass: {
    title: 'ASS - Advisory Sentiment Score',
    summary: 'This checks whether the AI advisory sounds similar to agriculture guidance.',
    meaning: 'Score range is 0 to 1. Higher means the advisory is closer to reference agriculture guidance.',
    calculation: 'The backend compares the advisory text with an ICAR-style reference advisory using sentence similarity.',
    farmer: 'ASS helps check whether the advisory uses useful agriculture language, not random or unrelated text.'
  },
  dcs: {
    title: 'DCS - Decision Confidence Score',
    summary: 'This checks whether the advisory gives the right type of action for the risk.',
    meaning: '1 means the action words match the risk well. 0.7 means partial match. Lower means weak alignment.',
    calculation: 'High risk should contain urgent corrective guidance. Medium risk should ask for monitoring. Low risk should suggest normal safe management.',
    farmer: 'DCS helps confirm that the advice is practical for the risk level.'
  },
  lts: {
    title: 'LTS - LLM Trust Score',
    summary: 'This is the overall quality score for the AI-generated advisory text.',
    meaning: 'Score range is 0% to 100%. 80% or higher is approved, 60-79% needs review, and below 60% is rejected.',
    calculation: 'LTS = 40% RCS + 40% ASS + 20% DCS.',
    farmer: 'LTS validates the explanation/advisory text. It does not replace expert validation of the crop risk.'
  }
};

function getDisplayedMetricValue(key) {
  const idMap = {
    pcs: 'pcsValue',
    eas: 'easValue',
    rdi: 'rdiValue',
    tri: 'triValue',
    rcs: 'rcsValue',
    ass: 'assValue',
    dcs: 'dcsValue',
    lts: 'ltsValue'
  };
  const value = document.getElementById(idMap[key])?.textContent?.trim();
  return value && value !== '-' ? value : 'Not calculated yet';
}

function showMetricInfo(key) {
  const info = METRIC_EXPLANATIONS[key];
  if (!info) return;

  const currentValue = getDisplayedMetricValue(key);
  const modalHtml = `
    <div id="metricInfoModal" class="modal-overlay" onclick="closeMetricInfo()">
      <div class="modal-container" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3 class="modal-title">${escapeHtml(info.title)}</h3>
          <button type="button" class="modal-close" onclick="closeMetricInfo()" aria-label="Close metric explanation">x</button>
        </div>
        <div class="modal-body">
          <div class="metric-info-summary">${escapeHtml(info.summary)}</div>
          <div class="metric-info-grid">
            <div class="metric-info-row"><strong>Current value</strong>${escapeHtml(currentValue)}</div>
            <div class="metric-info-row"><strong>What the score means</strong>${escapeHtml(info.meaning)}</div>
            <div class="metric-info-row"><strong>How it is calculated</strong>${escapeHtml(info.calculation)}</div>
            <div class="metric-info-row"><strong>Simple farmer meaning</strong>${escapeHtml(info.farmer)}</div>
          </div>
          <p class="metric-info-note">Note: These scores support transparency. For crop action, follow the Final Validation Decision first.</p>
        </div>
      </div>
    </div>`;

  const existing = document.getElementById('metricInfoModal');
  if (existing) existing.outerHTML = modalHtml;
  else document.body.insertAdjacentHTML('beforeend', modalHtml);

  setTimeout(() => document.getElementById('metricInfoModal')?.classList.add('active'), 10);
}

function closeMetricInfo() {
  const modal = document.getElementById('metricInfoModal');
  if (modal) {
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 200);
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeMetricInfo();
    closeValidationMetricsModal();
  }
});

function updateComparisonExplanation(result) {
  const panel = document.getElementById('comparisonExplanation');
  if (!panel) return;

  const aiRisk = result.ai_risk || 'N/A';
  const expertRisk = result.expert_risk || 'N/A';
  const finalRisk = result.final_risk || expertRisk || aiRisk;
  const aiExpertAgree = aiRisk === expertRisk;
  const finalDecision = result.final_decision || result.validation_status || 'N/A';
  const farmerText = result.farmer_explanation || result.final_decision_reason || 'Use the final risk as the safest action guide.';
  const agreementText = aiExpertAgree
    ? 'AI and expert rulebooks are giving the same risk level, so the result is easier to trust.'
    : 'AI and expert rulebooks are different, so the system uses the final validation decision instead of trusting AI alone.';

  panel.innerHTML = `
    <div class="comparison-status-row">
      <span class="comparison-pill">AI: <strong>${escapeHtml(aiRisk)}</strong></span>
      <span class="comparison-pill">Experts: <strong>${escapeHtml(expertRisk)}</strong></span>
      <span class="comparison-pill">Final: <strong>${escapeHtml(finalRisk)}</strong></span>
    </div>
    <p class="comparison-note">${escapeHtml(agreementText)}</p>
    <p class="comparison-note"><strong>Final decision:</strong> ${escapeHtml(finalDecision)}. ${escapeHtml(farmerText)}</p>
  `;
}

// ===== DASHBOARD =====
async function loadDashboardData() {
  try {
    const [metricsRes, insightsRes] = await Promise.all([
      authFetch(`${API_BASE_URL}/api/model-metrics`),
      authFetch(`${API_BASE_URL}/api/insights`)
    ]);

    if (!metricsRes.ok || !insightsRes.ok) {
      console.error('Dashboard API response error', {
        metricsStatus: metricsRes.status,
        insightsStatus: insightsRes.status
      });
      document.getElementById('insightsPanel').innerHTML = `<div class="insight-card danger"><div class="insight-icon">⚠️</div><div class="insight-content"><div class="insight-title">Unable to load dashboard</div><div class="insight-text">Check your network connection or session status.</div></div></div>`;
      return;
    }

    const metrics = await metricsRes.json();
    const insights = await insightsRes.json();
    window.lastDashboardMetrics = metrics;

    const dd = metrics.decision_distribution || {};
    const approved = dd['APPROVED'] || 0;
    const review = dd['REVIEW REQUIRED'] || 0;
    const rejected = dd['REJECTED'] || 0;

    // KPI cards
    if (document.getElementById('kpiSingle')) {
      document.getElementById('kpiSingle').textContent = metrics.total_single || 0;
    }
    if (document.getElementById('kpiBatch')) {
      document.getElementById('kpiBatch').textContent = metrics.total_batch || 0;
    }
    if (document.getElementById('kpiTotal')) {
      document.getElementById('kpiTotal').textContent = metrics.total_predictions || 0;
    }
    document.getElementById('kpiApproved').textContent = approved;
    document.getElementById('kpiReview').textContent = review;
    document.getElementById('kpiAvgTri').textContent = (metrics.avg_tri || 0) + '%';

    const alignment = metrics.alignment || { match: 0, mismatch: 0, total: 0 };
    const matchPct = alignment.total > 0 ? Math.round((alignment.match / alignment.total) * 100) : 0;
    document.getElementById('kpiMatch').textContent = matchPct + '%';

    // Pie
    destroyChart('dashPie');
    chartInstances['dashPie'] = new Chart(document.getElementById('dashPieChart'), {
      type: 'doughnut',
      data: {
        labels: ['Approved', 'Review Required', 'Rejected'],
        datasets: [{ data: [approved, review, rejected], backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: CHART_COLORS.text } } } }
    });

    // Bar
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

    // Agreement chart
    const agreement = metrics.alignment || { match: 0, mismatch: 0, total: 0 };
    destroyChart('agreement');
    chartInstances['agreement'] = new Chart(document.getElementById('agreementChart'), {
      type: 'bar',
      data: {
        labels: ['Match', 'Mismatch'],
        datasets: [{
          label: 'Records',
          data: [agreement.match || 0, agreement.mismatch || 0],
          backgroundColor: [CHART_COLORS.success, CHART_COLORS.danger],
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: { ...CHART_DEFAULTS, plugins: { legend: { display: false } } }
    });

    // Insights
    const panel = document.getElementById('insightsPanel');
    if (!insights || insights.length === 0) {
      panel.innerHTML = `
        <div class="insight-card info">
          <div class="insight-icon">💡</div>
          <div class="insight-content">
            <div class="insight-title">No Insights Yet</div>
            <div class="insight-text">Submit your first crop prediction to see AI-powered agricultural insights here.</div>
          </div>
        </div>`;
    } else {
      panel.innerHTML = insights.map(i => `
        <div class="insight-card ${i.type || 'info'}">
          <div class="insight-icon">${i.icon || '💡'}</div>
          <div class="insight-content">
            <div class="insight-title">${i.title}</div>
            <div class="insight-text">${i.text}</div>
          </div>
        </div>`).join('');
    }
  } catch(e) { console.error('Dashboard error:', e); }
}

function showValidationMetricsInfo() {
  const metrics = window.lastDashboardMetrics || {};
  const total = metrics.total_predictions || 0;
  const approved = (metrics.decision_distribution || {})['APPROVED'] || 0;
  const review = (metrics.decision_distribution || {})['REVIEW REQUIRED'] || 0;
  const rejected = (metrics.decision_distribution || {})['REJECTED'] || 0;
  const matchCount = (metrics.alignment || {}).match || 0;
  const totalAlign = (metrics.alignment || {}).total || 0;
  const matchPct = totalAlign ? Math.round((matchCount / totalAlign) * 100) : 0;
  const avgTri = metrics.avg_tri || 0;

  const modalHtml = `
  <div id="validationMetricsModal" class="modal-overlay">
    <div class="modal-container">
      <div class="modal-header">
        <h3 class="modal-title">Validation Metrics Info</h3>
        <button class="modal-close" onclick="closeValidationMetricsModal()">×</button>
      </div>
      <div class="modal-body">
        <ul>
          <li>Total predictions: ${total}</li>
          <li>Approved: ${approved}</li>
          <li>Review required: ${review}</li>
          <li>Rejected: ${rejected}</li>
          <li>AI/Expert match: ${matchCount} (${matchPct}%)</li>
          <li>Avg TRI: ${avgTri}%</li>
        </ul>
        <p>Formulas:</p>
        <ul>
          <li>Approval rate = (Approved / Total) × 100</li>
          <li>Review rate = (Review / Total) × 100</li>
          <li>Rejection rate = (Rejected / Total) × 100</li>
          <li>AI/Expert alignment = (Match / Aligned Total) × 100</li>
          <li>TRI = 0.55 x PCS + 0.45 x EAS (record-level averaged)</li>
        </ul>
      </div>
    </div>
  </div>`;

  if (!document.getElementById('validationMetricsModal')) {
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } else {
    document.getElementById('validationMetricsModal').outerHTML = modalHtml;
  }
  setTimeout(() => { document.getElementById('validationMetricsModal')?.classList.add('active'); }, 10);
}

function closeValidationMetricsModal() {
  const modal = document.getElementById('validationMetricsModal');
  if (modal) { modal.classList.remove('active'); setTimeout(() => modal.remove(), 250); }
}

// ===== PREDICTION =====
function validateForm() {
  const fields = ['state','district','crop','season','area','production','yield'];
  for (const f of fields) {
    const el = document.getElementById(f);
    if (!el.value || el.value.trim() === '') { showNotification(`Please fill in ${f}`, 'warning'); return false; }
  }
  if (parseFloat(document.getElementById('area').value) <= 0) { showNotification('Area must be > 0', 'warning'); return false; }
  return true;
}

async function submitPrediction() {
  if (!validateForm()) return;
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
    lastPredictionResult = result;
    displayResults(result);

    // Refresh dashboard charts/insights/history after successful prediction
    await loadDashboardData();
    await loadHistory();

    // Show Request Loan button for all predictions and indicate eligibility
    const loanBtn = document.getElementById('requestLoanBtn');
    if (loanBtn) {
      loanBtn.style.display = 'inline-flex';
      loanBtn.dataset.predId = result.id;
      if ((result.final_risk || result.ai_risk) === 'High') {
        loanBtn.textContent = '💰 Request Loan (Not eligible for High Risk)';
        loanBtn.disabled = true;
        loanBtn.classList.add('btn-disabled');
      } else {
        loanBtn.textContent = '💰 Request Loan';
        loanBtn.disabled = false;
        loanBtn.classList.remove('btn-disabled');
      }
    }
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

function riskClass(risk) {
  const normalized = String(risk || '').toLowerCase();
  if (normalized === 'low') return 'expert-risk-low';
  if (normalized === 'high') return 'expert-risk-high';
  return 'expert-risk-medium';
}

function populateFinalValidation(result) {
  const consensus = result.expert_consensus || {};
  const finalRisk = result.final_risk || result.expert_risk || result.ai_risk || 'N/A';
  const finalDecision = result.final_decision || result.validation_status || 'N/A';
  const consensusText = `${consensus.low_votes ?? 0} Low / ${consensus.medium_votes ?? 0} Medium / ${consensus.high_votes ?? 0} High`;

  document.getElementById('finalRiskValue').textContent = finalRisk;
  document.getElementById('finalDecisionValue').textContent = finalDecision;
  document.getElementById('expertConsensusValue').textContent = consensusText;
  document.getElementById('finalDecisionReason').textContent = result.final_decision_reason || 'Final decision reason is not available.';
  document.getElementById('farmerExplanation').textContent = result.farmer_explanation || 'Please consult your local agriculture officer before making major crop decisions.';
}

function renderExpertSources(experts) {
  const panel = document.getElementById('expertSourcesPanel');
  if (!panel) return;
  if (!experts || experts.length === 0) {
    panel.innerHTML = '<p style="color:var(--text-muted)">No expert source details available.</p>';
    return;
  }

  panel.innerHTML = experts.map(expert => {
    const riskLabel = expert.applicable ? expert.risk : 'Not applicable';
    const confidence = typeof expert.confidence === 'number' ? Math.round(expert.confidence * 100) : 0;
    const evidence = (expert.matched_rules || []).slice(0, 2).map(escapeHtml).join('<br>');
    return `
      <div class="expert-source-card">
        <div class="expert-source-head">
          <div class="expert-source-title">${escapeHtml(expert.source_name || 'Expert source')}</div>
          <span class="expert-risk-pill ${riskClass(expert.risk)}">${escapeHtml(riskLabel)}</span>
        </div>
        <div class="expert-source-meta">Confidence: ${confidence}%</div>
        <div class="expert-source-evidence"><strong>Evidence:</strong><br>${evidence || 'No matched rule detail available.'}</div>
        <div class="expert-source-advice"><strong>Advice:</strong><br>${escapeHtml(expert.advisory || '')}</div>
      </div>
    `;
  }).join('');
}

function displayResults(result) {
  const el = document.getElementById('predictionResults');
  el.classList.remove('hidden');

  // Banner
  const finalRisk = result.final_risk || result.expert_risk || result.ai_risk;
  document.getElementById('resultSummary').textContent = `Final Risk: ${finalRisk} | AI Risk: ${result.ai_risk} | Expert Consensus: ${result.expert_risk}`;
  const badge = document.getElementById('resultBadge');
  badge.textContent = result.final_decision || result.validation_status || 'UNKNOWN';
  badge.className = 'badge';
  if (result.validation_status === 'APPROVED') badge.classList.add('badge-success');
  else if (result.validation_status === 'REVIEW REQUIRED') badge.classList.add('badge-warning');
  else badge.classList.add('badge-danger');

  const icon = document.getElementById('resultIcon');
  icon.textContent = result.validation_status === 'APPROVED' ? '✅' : result.validation_status === 'REJECTED' ? '❌' : '⚠️';

  populateFinalValidation(result);
  renderExpertSources(result.expert_validations || []);

  // Trust scores
  const pcs = result.pcs || 0, eas = result.eas || 0, rdi = result.rdi || 0, tri = result.tri || 0;
  document.getElementById('pcsValue').textContent = pcs;
  document.getElementById('easValue').textContent = eas;
  document.getElementById('rdiValue').textContent = rdi;
  document.getElementById('triValue').textContent = tri + '%';

  setTimeout(() => {
    document.getElementById('pcsBar').style.width = (pcs * 100) + '%';
    document.getElementById('easBar').style.width = (eas * 100) + '%';
    document.getElementById('rdiBar').style.width = (rdi * 100) + '%';
    document.getElementById('triBar').style.width = tri + '%';
  }, 100);

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
        borderRadius: 8,
        borderSkipped: false
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
  updateComparisonExplanation(result);

  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ===== ADVISORY PAGE =====
function showAdvisoryPage() {
  if (!lastPredictionResult) {
    document.getElementById('advisoryEmpty').classList.remove('hidden');
    document.getElementById('advisoryContent').classList.add('hidden');
    return;
  }

  document.getElementById('advisoryEmpty').classList.add('hidden');
  document.getElementById('advisoryContent').classList.remove('hidden');

  const result = lastPredictionResult;
  const agreement = result.ai_risk === result.expert_risk ? 'AI and expert consensus agree' : 'AI and expert consensus differ';
  document.getElementById('advisorySub').textContent = `Final Risk: ${result.final_risk || '-'} | AI Risk: ${result.ai_risk} | Expert Consensus: ${result.expert_risk} | ${agreement}`;

  // AI advisory quality assessment
  const isAdvisoryGood = result.llm_validation && result.llm_validation.RCS === 1 && (result.final_risk || result.expert_risk) === result.expert_risk;
  const qualityText = isAdvisoryGood ? 'Excellent: The AI advisory aligns with ICAR expert guidance and is suitable for crop management.' : 'Review required: The AI advisory is not fully aligned with ICAR rules, proceed carefully and consult an expert.';
  const qualityColor = isAdvisoryGood ? 'var(--success)' : 'var(--warning)';

  // Expert advisory summary
  const expertAdvDiv = document.getElementById('expertAdvisoryFormatted');
  expertAdvDiv.innerHTML = `
    <div style="font-size:0.93rem; color: var(--text-primary);">
      <p><strong>Final Decision:</strong> ${escapeHtml(result.final_decision || result.validation_status || 'N/A')}</p>
      <p><strong>Final Risk:</strong> ${escapeHtml(result.final_risk || 'N/A')}</p>
      <p style="margin-top:0.5rem;">${escapeHtml(result.final_decision_reason || 'No final decision reason available.')}</p>
      <p style="margin-top:0.5rem;"><strong>Farmer action:</strong> ${escapeHtml(result.farmer_explanation || 'Consult your local agriculture officer for field-specific action.')}</p>
      <div style="margin-top:1rem">${(result.expert_validations || []).map(expert => `
        <div class="expert-source-card" style="margin-bottom:0.75rem">
          <div class="expert-source-head">
            <div class="expert-source-title">${escapeHtml(expert.source_name || 'Expert source')}</div>
            <span class="expert-risk-pill ${riskClass(expert.risk)}">${escapeHtml(expert.applicable ? expert.risk : 'Not applicable')}</span>
          </div>
          <div class="expert-source-evidence"><strong>Evidence:</strong><br>${(expert.matched_rules || []).slice(0, 2).map(escapeHtml).join('<br>') || 'No matched rule detail available.'}</div>
          <div class="expert-source-advice"><strong>Advice:</strong><br>${escapeHtml(expert.advisory || '')}</div>
        </div>
      `).join('')}</div>
      <p style="margin-top:0.5rem; color: ${qualityColor}; font-weight: 700;">${qualityText}</p>
      <p style="margin-top:0.5rem; color: var(--text-secondary);">Crop safety note: Final risk is produced by deterministic backend validation. The LLM is only used to explain the result in simple language.</p>
    </div>
  `;

  // Advisory formatted
  const advDiv = document.getElementById('advisoryFormatted');
  const advisory = result.llm_advisory || 'No advisory available';
  const sections = advisory.split('\n').filter(l => l.trim());
  let html = '';
  const sectionKeys = ['Risk Level', 'Action', 'Reason', 'Recommendation', 'Risk Summary', 'Key Observations', 'Recommended Actions', 'Farmer Guidance'];
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

  // LLM Metrics
  if (result.llm_validation) {
    document.getElementById('rcsValue').textContent = result.llm_validation.RCS ?? 'N/A';
    document.getElementById('assValue').textContent = result.llm_validation.ASS ?? 'N/A';
    document.getElementById('dcsValue').textContent = result.llm_validation.DCS ?? 'N/A';
    document.getElementById('ltsValue').textContent = result.llm_validation.LTS != null ? result.llm_validation.LTS + '%' : 'N/A';
    const llmStatus = document.getElementById('llmStatus');
    llmStatus.textContent = result.llm_validation.LLM_Status || 'N/A';
    llmStatus.className = 'badge';
    if (result.llm_validation.LLM_Status === 'APPROVED') llmStatus.classList.add('badge-success');
    else if (result.llm_validation.LLM_Status === 'SKIPPED') llmStatus.classList.add('badge-info');
    else llmStatus.classList.add('badge-warning');
  }
}

// ===== HISTORY =====
let historyPage = 0;
async function loadHistory(offset = 0) {
  historyPage = offset;
  try {
    const res = await authFetch(`${API_BASE_URL}/api/prediction-history?limit=20&offset=${offset}`);
    const data = await res.json();
    const tbody = document.getElementById('historyBody');
    if (!data.data || data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No predictions found. Submit a prediction to see it here.</td></tr>';
      return;
    }
    tbody.innerHTML = data.data.map(r => {
      const statusClass = r.validation_status === 'APPROVED' ? 'badge-success' : r.validation_status === 'REJECTED' ? 'badge-danger' : 'badge-warning';
      const ts = r.timestamp ? new Date(r.timestamp).toLocaleDateString() : '';
      let reviewHtml = '';
      if (r.officer_name) {
        const decClass = r.officer_decision === 'APPROVED' ? 'color:#22c55e' : r.officer_decision === 'REJECTED' ? 'color:#ef4444' : 'color:#f59e0b';
        reviewHtml = `<div style="font-size:0.8rem;line-height:1.4">
          <div><strong style="${decClass}">${r.officer_decision||''}</strong></div>
          <div>By: ${r.officer_name}</div>
          ${r.officer_comments ? '<div style="color:var(--text-muted)">' + r.officer_comments + '</div>' : ''}
        </div>`;
      } else {
        if (r.validation_status === 'REVIEW REQUIRED') {
          reviewHtml = '<span style="color:var(--warning);font-size:0.8rem">Awaiting officer review</span>';
        } else if (r.validation_status === 'APPROVED') {
          reviewHtml = '<span style="color:var(--success);font-size:0.8rem">Auto-approved</span>';
        } else if (r.validation_status === 'REJECTED') {
          reviewHtml = '<span style="color:var(--danger);font-size:0.8rem">Auto-rejected</span>';
        } else {
          reviewHtml = '<span style="color:var(--text-muted);font-size:0.8rem">Not required</span>';
        }
      }
      return `<tr>
        <td>${r.id}</td><td>${ts}</td><td>${r.state||''}</td><td>${r.crop||''}</td>
        <td>${r.ai_risk||''}</td><td>${r.tri ? r.tri+'%' : ''}</td>
        <td><span class="badge ${statusClass}">${r.validation_status||''}</span></td>
        <td>${reviewHtml}</td>
      </tr>`;
    }).join('');

    const totalPages = Math.ceil(data.total / 20);
    const currentPage = Math.floor(offset / 20);
    const pagDiv = document.getElementById('historyPagination');
    let html = '';
    for (let i = 0; i < Math.min(totalPages, 10); i++) {
      html += `<button class="${i===currentPage?'active':''}" onclick="loadHistory(${i*20})">${i+1}</button>`;
    }
    pagDiv.innerHTML = html;
  } catch(e) { console.error(e); }
}

// ===== REPORT =====
function downloadReport() {
  window.open(`${API_BASE_URL}/download-report`, '_blank');
}

async function uploadExpertRules() {
  const fileInput = document.getElementById('expertPdfInput');
  const statusEl = document.getElementById('expertRuleStatus');
  if (!fileInput.files || fileInput.files.length === 0) {
    statusEl.textContent = 'Please select a PDF file first.';
    statusEl.style.color = 'var(--danger)';
    return;
  }

  const fd = new FormData();
  fd.append('file', fileInput.files[0]);
  statusEl.textContent = 'Uploading rules...';
  statusEl.style.color = 'var(--text-secondary)';

  try {
    const res = await authFetch(`${API_BASE_URL}/api/upload-expert-rules`, {
      method: 'POST', body: fd
    });
    const json = await res.json();
    if (json.error) {
      statusEl.textContent = `Error: ${json.error}`;
      statusEl.style.color = 'var(--danger)';
    } else {
      statusEl.textContent = `Rules applied: ${json.rules.length} rules loaded.`;
      statusEl.style.color = 'var(--success)';
    }
  } catch (e) {
    statusEl.textContent = 'Upload failed. Check console for details.';
    statusEl.style.color = 'var(--danger)';
    console.error(e);
  }
}

// ===== LOANS =====
async function loadMyLoans() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/my-loans`);
    const loans = await res.json();
    const tbody = document.getElementById('loansBody');
    if (!loans || loans.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No loan requests yet. Make a prediction and request a loan.</td></tr>';
      return;
    }
    tbody.innerHTML = loans.map(l => {
      const sc = l.status === 'APPROVED' ? 'badge-success' : l.status === 'REJECTED' ? 'badge-danger' : 'badge-warning';
      return `<tr>
        <td>${l.id}</td>
        <td>#${l.prediction_id}</td>
        <td>${l.crop||''}</td>
        <td>${l.ai_risk||''}</td>
        <td><span class="badge ${sc}">${l.status}</span></td>
        <td>${l.officer_name||'-'}</td>
        <td style="font-size:0.82rem;max-width:200px">${l.officer_reason||'-'}</td>
      </tr>`;
    }).join('');
  } catch(e) { console.error(e); }
}

async function requestLoanFromResult() {
  const btn = document.getElementById('requestLoanBtn');
  const predId = btn?.dataset.predId;
  if (!predId) { showNotification('No prediction to request loan for', 'warning'); return; }
  try {
    const res = await authFetch(`${API_BASE_URL}/api/loan-request`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ prediction_id: parseInt(predId) })
    });
    const result = await res.json();
    if (result.error) { showNotification(result.error, 'warning'); }
    else { showNotification('Loan request submitted successfully!', 'success'); btn.style.display = 'none'; }
  } catch(e) { showNotification('Failed to submit loan request', 'danger'); }
}

// ===== RESET =====
function resetForm() {
  document.getElementById('predictionForm').reset();
  document.getElementById('predictionResults').classList.add('hidden');
}

