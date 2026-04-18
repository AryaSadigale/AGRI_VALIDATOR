// ========================================
// AGRVALIDATOR - BANK OFFICER DASHBOARD JS
// ========================================

const API_BASE_URL = 'http://127.0.0.1:8000';
const chartInstances = {};
let allLoans = [];
let currentLoanId = null;

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  loans: 'Loan Applications'
};

const CHART_COLORS = {
  green: '#16a34a', gold: '#f59e0b', red: '#ef4444',
  blue: '#2563eb', text: '#374151', textLight: '#6b7280',
  gridLine: 'rgba(0,0,0,0.06)',
  success: '#22c55e', warning: '#f59e0b', danger: '#ef4444'
};

// ===== SESSION GUARD (Supabase) =====
async function checkBankOfficerSession() {
  const user = await getSupabaseUser();
  if (!user || (user.role !== 'bank_officer' && user.role !== 'agrivalidator_officer')) {
    window.location.href = '/login';
    return null;
  }
  return user;
}

async function initSession() {
  const user = await checkBankOfficerSession();
  if (!user) return;

  const name = user.name || 'Officer';
  const role = user.role || 'bank_officer';

  document.getElementById('userName').textContent = name;
  document.getElementById('topbarGreeting').textContent = `Welcome, ${name}`;
  document.getElementById('welcomeName').textContent = name;

  const roleText = role === 'bank_officer' ? 'Bank Officer Account' : 'Agri Officer Account';
  document.getElementById('userRole').textContent = roleText;

  const brandMain = document.querySelector('.brand-main');
  const brandSub = document.querySelector('.brand-sub');
  if (role === 'bank_officer') {
    brandMain.textContent = 'AgriValidator';
    brandSub.textContent = 'Bank Officer Portal';
  } else {
    brandMain.textContent = 'AgriValidator';
    brandSub.textContent = 'Agri Officer Portal';
  }
}

async function handleLogout() {
  await supabaseSignOut();
}

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
    case 'dashboard': loadDashboard(); break;
    case 'validation': loadPredictionHistoryForOfficer(); break;
    case 'loans': loadLoanRequests(); break;
  }
}

// ===== PREDICTION HISTORY (Officer) =====
let officerHistoryPage = 0;
async function loadPredictionHistoryForOfficer(offset = 0) {
  officerHistoryPage = offset;
  try {
    const res = await authFetch(`${API_BASE_URL}/api/prediction-history?limit=20&offset=${offset}`);
    const data = await res.json();
    const tbody = document.getElementById('historyBody');
    if (!data.data || data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="table-empty">No predictions found. Run single or batch predictions first.</td></tr>';
      document.getElementById('historyPagination').innerHTML = '';
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

    const totalPages = Math.ceil((data.total || 0) / 20);
    const currentPage = Math.floor(offset / 20);
    const pagDiv = document.getElementById('historyPagination');
    let pagHtml = '';
    for (let i = 0; i < Math.min(totalPages, 10); i++) {
      pagHtml += `<button class="${i===currentPage?'active':''}" onclick="loadPredictionHistoryForOfficer(${i*20})">${i+1}</button>`;
    }
    pagDiv.innerHTML = pagHtml;
  } catch(e) {
    console.error('Prediction history error:', e);
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

// ===== DASHBOARD =====
async function loadDashboard() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/loan-requests`);
    const loans = await res.json();
    if (!loans || !Array.isArray(loans)) return;

    const total = loans.length;
    const pending = loans.filter(l => l.status === 'PENDING').length;
    const approved = loans.filter(l => l.status === 'APPROVED').length;
    const rejected = loans.filter(l => l.status === 'REJECTED').length;

    document.getElementById('kpiTotal').textContent = total;
    document.getElementById('kpiPending').textContent = pending;
    document.getElementById('kpiApproved').textContent = approved;
    document.getElementById('kpiRejected').textContent = rejected;

    // Decision pie
    destroyChart('dashPie');
    chartInstances['dashPie'] = new Chart(document.getElementById('dashPieChart'), {
      type: 'doughnut',
      data: {
        labels: ['Pending', 'Approved', 'Rejected'],
        datasets: [{ data: [pending, approved, rejected], backgroundColor: [CHART_COLORS.warning, CHART_COLORS.success, CHART_COLORS.danger], borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: CHART_COLORS.text } } } }
    });

    // Risk bar
    const riskCounts = { Low: 0, Medium: 0, High: 0 };
    loans.forEach(l => { if (l.ai_risk && riskCounts.hasOwnProperty(l.ai_risk)) riskCounts[l.ai_risk]++; });
    destroyChart('dashBar');
    chartInstances['dashBar'] = new Chart(document.getElementById('dashBarChart'), {
      type: 'bar',
      data: {
        labels: ['Low Risk', 'Medium Risk', 'High Risk'],
        datasets: [{ label: 'Applications', data: [riskCounts.Low, riskCounts.Medium, riskCounts.High], backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger], borderRadius: 8, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: CHART_COLORS.textLight }, grid: { color: CHART_COLORS.gridLine } },
          y: { ticks: { color: CHART_COLORS.textLight }, grid: { color: CHART_COLORS.gridLine } }
        }
      }
    });

    window.lastDashboardMetrics = {
      total_predictions: total,
      decision_distribution: { APPROVED: approved, 'REVIEW REQUIRED': pending, REJECTED: rejected },
      avg_tri: null,
      alignment: { match: 0, mismatch: 0, total: 0 }
    };

  } catch(e) { console.error('Dashboard error:', e); }
}

function showValidationMetricsInfo() {
  const metrics = window.lastDashboardMetrics || {};
  const total = metrics.total_predictions || 0;
  const approved = (metrics.decision_distribution || {}).APPROVED || 0;
  const review = (metrics.decision_distribution || {})['REVIEW REQUIRED'] || 0;
  const rejected = (metrics.decision_distribution || {}).REJECTED || 0;

  const modalHtml = `
  <div id="validationMetricsModal" class="modal-overlay">
    <div class="modal-container">
      <div class="modal-header">
        <h3 class="modal-title">Validation Metrics Info</h3>
        <button class="modal-close" onclick="closeValidationMetricsModal()">×</button>
      </div>
      <div class="modal-body">
        <ul>
          <li>Total applications: ${total}</li>
          <li>Approved: ${approved}</li>
          <li>Under review: ${review}</li>
          <li>Rejected: ${rejected}</li>
          <li>AI/Expert alignment not available on this portal yet</li>
        </ul>
        <p>Formulas:</p>
        <ul>
          <li>Approval rate = (Approved / Total) × 100</li>
          <li>Review rate = (Review / Total) × 100</li>
          <li>Rejection rate = (Rejected / Total) × 100</li>
          <li>TRI = 0.6 × PCS + 0.4 × EAS (per record average)</li>
        </ul>
      </div>
    </div>
  </div>`;

  if (!document.getElementById('validationMetricsModal')) {
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  } else {
    document.getElementById('validationMetricsModal').outerHTML = modalHtml;
  }
  setTimeout(() => document.getElementById('validationMetricsModal')?.classList.add('active'), 10);
}

function closeValidationMetricsModal() {
  const modal = document.getElementById('validationMetricsModal');
  if (modal) { modal.classList.remove('active'); setTimeout(() => modal.remove(), 250); }
}

// ===== LOAN REQUESTS =====
async function loadLoanRequests() {
  try {
    const res = await authFetch(`${API_BASE_URL}/api/loan-requests`);
    allLoans = await res.json();
    if (!allLoans || !Array.isArray(allLoans)) { allLoans = []; }
    renderLoans(allLoans);
  } catch(e) { console.error(e); }
}

function filterLoans() {
  const filter = document.getElementById('loanFilter').value;
  if (filter === 'all') {
    renderLoans(allLoans);
  } else {
    renderLoans(allLoans.filter(l => l.status === filter));
  }
}

function renderLoans(loans) {
  const tbody = document.getElementById('loanRequestsBody');
  if (!loans || loans.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No loan applications found.</td></tr>';
    return;
  }
  tbody.innerHTML = loans.map(l => {
    const sc = l.status === 'APPROVED' ? 'badge-success' : l.status === 'REJECTED' ? 'badge-danger' : 'badge-warning';
    const riskStyle = l.ai_risk === 'High' ? 'color:#ef4444' : l.ai_risk === 'Medium' ? 'color:#f59e0b' : 'color:#22c55e';
    const expRiskStyle = l.expert_risk === 'High' ? 'color:#ef4444' : l.expert_risk === 'Medium' ? 'color:#f59e0b' : 'color:#22c55e';
    const actionBtn = l.status === 'PENDING'
      ? `<button class="btn btn-primary btn-sm" onclick="showLoanReview(${l.id})">Review</button>`
      : `<span style="font-size:0.78rem;color:var(--text-muted)">${l.officer_name || 'Decided'}</span>`;
    return `<tr>
      <td><div style="font-weight:600;font-size:0.85rem">${l.farmer_name||'Unknown'}</div><div style="font-size:0.72rem;color:var(--text-muted)">${l.farmer_email||''}</div></td>
      <td>${l.crop||''}</td>
      <td>${l.state||''}, ${l.district||''}</td>
      <td style="${riskStyle};font-weight:600">${l.ai_risk||''}</td>
      <td style="${expRiskStyle};font-weight:600">${l.expert_risk||''}</td>
      <td>${l.tri ? l.tri+'%' : ''}</td>
      <td><span class="badge ${sc}">${l.status}</span></td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}

// ===== LOAN REVIEW =====
function showLoanReview(loanId) {
  currentLoanId = loanId;
  const loan = allLoans.find(l => l.id === loanId);
  if (!loan) { showNotification('Loan not found', 'danger'); return; }

  const panel = document.getElementById('loanReviewPanel');
  panel.classList.remove('hidden');

  // Farmer info
  document.getElementById('loanFarmerInfo').innerHTML = `
    <div style="display:flex;gap:1rem;align-items:center;padding:1rem;background:var(--accent-bg);border-radius:8px;border:1px solid var(--accent-light)">
      <span style="font-size:2rem">👨‍🌾</span>
      <div>
        <div style="font-weight:700;font-size:1rem;color:var(--text-heading)">${loan.farmer_name||'Unknown Farmer'}</div>
        <div style="font-size:0.82rem;color:var(--text-muted)">${loan.farmer_email||''}</div>
      </div>
      <span class="badge ${loan.validation_status === 'APPROVED' ? 'badge-success' : loan.validation_status === 'REJECTED' ? 'badge-danger' : 'badge-warning'}" style="margin-left:auto">
        AI: ${loan.validation_status||'PENDING'}
      </span>
    </div>`;

  // Prediction details
  const riskStyle = loan.ai_risk === 'High' ? 'color:#ef4444;font-weight:700' : loan.ai_risk === 'Medium' ? 'color:#f59e0b;font-weight:700' : 'color:#22c55e;font-weight:700';
  document.getElementById('loanPredDetails').innerHTML = `
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
          <tr><td>TRI Score</td><td><strong>${loan.tri ? loan.tri+'%' : 'N/A'}</strong></td></tr>
          <tr><td>Area (hectares)</td><td>${loan.area||''}</td></tr>
          <tr><td>Production (tonnes)</td><td>${loan.production||''}</td></tr>
          <tr><td>Yield (tonnes/ha)</td><td>${loan.yield_val||''}</td></tr>
        </tbody>
      </table>
    </div>`;

  // Decision Transparency metrics
  const pcs = loan.pcs || 0, eas = loan.eas || 0, rdi = loan.rdi || 0, tri = loan.tri || 0;
  document.getElementById('reviewPcs').textContent = pcs;
  document.getElementById('reviewEas').textContent = eas;
  document.getElementById('reviewRdi').textContent = rdi;
  document.getElementById('reviewTri').textContent = tri + '%';
  document.getElementById('reviewConfidence').textContent = loan.confidence_band || 'N/A';

  // Animate bars
  setTimeout(() => {
    document.getElementById('reviewPcsBar').style.width = (pcs * 100) + '%';
    document.getElementById('reviewEasBar').style.width = (eas * 100) + '%';
    document.getElementById('reviewRdiBar').style.width = (rdi * 100) + '%';
    document.getElementById('reviewTriBar').style.width = tri + '%';
  }, 100);

  // Reset decision form
  document.querySelectorAll('input[name="loanDecision"]').forEach(r => r.checked = false);
  document.getElementById('loanComments').value = '';

  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeLoanReview() {
  document.getElementById('loanReviewPanel').classList.add('hidden');
  currentLoanId = null;
}

// ===== SUBMIT LOAN DECISION =====
async function submitLoanDecision() {
  if (!currentLoanId) { showNotification('No loan selected', 'warning'); return; }
  const decision = document.querySelector('input[name="loanDecision"]:checked')?.value;
  const comments = document.getElementById('loanComments').value.trim();

  if (!decision) { showNotification('Please select Approve or Reject', 'warning'); return; }

  // Get bank officer name from session
  const user = await getSupabaseUser();
  const officerName = user?.name || 'Bank Officer';

  showLoading();
  try {
    const res = await authFetch(`${API_BASE_URL}/api/loan-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loan_id: currentLoanId,
        officer_name: officerName,
        decision: decision,
        reason: comments
      })
    });
    const result = await res.json();
    if (result.error) {
      showNotification(result.error, 'danger');
    } else {
      showNotification(`Loan ${decision} successfully`, 'success');
      closeLoanReview();
      loadLoanRequests();
    }
  } catch(e) {
    showNotification('Failed to submit decision', 'danger');
  } finally {
    hideLoading();
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await initSession();
  initNavigation();
  loadDashboard();
});
