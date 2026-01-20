const INMAG_HIGHLIGHT_THRESHOLD = 4100;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Chart instances
let inmagChart = null;
let cabezasChart = null;
let monthlyComparisonChart = null;

// Chart colors
const CHART_COLORS = {
  primary: '#2c5530',
  primaryLight: 'rgba(44, 85, 48, 0.2)',
  secondary: '#4a7c59',
  grid: '#e5e5e5'
};

// Current filter state
let currentDays = 30;

// ============ Data Fetching ============

async function fetchHistory(days = 30) {
  try {
    const response = await fetch(`/api/history?days=${days}`);
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Error al cargar historial');
    return result.data;
  } catch (error) {
    showError(error.message);
    return [];
  }
}

async function fetchMonthlyStats() {
  try {
    const response = await fetch('/api/monthly');
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Error al cargar promedios mensuales');
    return result.data;
  } catch (error) {
    showError(error.message);
    return null;
  }
}

async function fetchTrends() {
  try {
    const response = await fetch('/api/stats/trends');
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    console.error('Error fetching trends:', error);
    return null;
  }
}

async function fetchRangeStats(startDate, endDate) {
  try {
    const response = await fetch(`/api/stats/range?start=${startDate}&end=${endDate}`);
    const result = await response.json();
    return result.success ? result.data : null;
  } catch (error) {
    console.error('Error fetching range stats:', error);
    return null;
  }
}

async function fetchMonthlyComparison() {
  try {
    const response = await fetch('/api/stats/monthly-comparison?months=6');
    const result = await response.json();
    return result.success ? result.data : [];
  } catch (error) {
    console.error('Error fetching monthly comparison:', error);
    return [];
  }
}

// ============ Chart Functions ============

function initInmagChart(data) {
  const ctx = document.getElementById('inmag-chart');
  if (!ctx) return;

  const sortedData = [...data].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const labels = sortedData.map(d => d.fecha);
  const values = sortedData.map(d => d.inmag);

  if (inmagChart) inmagChart.destroy();

  inmagChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'INMAG',
        data: values,
        borderColor: CHART_COLORS.primary,
        backgroundColor: CHART_COLORS.primaryLight,
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `INMAG: ${formatCurrency(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: CHART_COLORS.grid },
          ticks: {
            callback: function(value, index) {
              return formatDateShort(this.getLabelForValue(value));
            },
            maxTicksLimit: 8
          }
        },
        y: {
          grid: { color: CHART_COLORS.grid },
          ticks: {
            callback: (value) => formatCurrency(value)
          }
        }
      }
    }
  });
}

function initCabezasChart(data) {
  const ctx = document.getElementById('cabezas-chart');
  if (!ctx) return;

  const sortedData = [...data].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  const labels = sortedData.map(d => d.fecha);
  const values = sortedData.map(d => d.cabezas);

  if (cabezasChart) cabezasChart.destroy();

  cabezasChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Cabezas',
        data: values,
        backgroundColor: CHART_COLORS.secondary,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Cabezas: ${formatNumber(ctx.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            callback: function(value, index) {
              return formatDateShort(this.getLabelForValue(value));
            },
            maxTicksLimit: 8
          }
        },
        y: {
          grid: { color: CHART_COLORS.grid },
          ticks: {
            callback: (value) => formatNumber(value)
          }
        }
      }
    }
  });
}

function initMonthlyComparisonChart(data) {
  const ctx = document.getElementById('monthly-comparison-chart');
  if (!ctx || data.length === 0) return;

  if (monthlyComparisonChart) monthlyComparisonChart.destroy();

  const labels = data.map(d => `${d.monthName} ${d.year}`);
  const inmagValues = data.map(d => d.avg_inmag);
  const cabezasValues = data.map(d => d.avg_cabezas);

  monthlyComparisonChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Promedio INMAG',
          data: inmagValues,
          backgroundColor: CHART_COLORS.primary,
          yAxisID: 'y'
        },
        {
          label: 'Promedio Cabezas',
          data: cabezasValues,
          backgroundColor: CHART_COLORS.secondary,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'INMAG ($)' },
          ticks: { callback: (v) => formatCurrency(v) }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Cabezas' },
          grid: { drawOnChartArea: false },
          ticks: { callback: (v) => formatNumber(v) }
        }
      }
    }
  });
}

// ============ UI Update Functions ============

function updateMonthlyStats(stats) {
  if (!stats || !stats.days) {
    document.getElementById('month-name').textContent = 'Sin datos';
    document.getElementById('avg-cabezas').textContent = '-';
    document.getElementById('avg-inmag').textContent = '-';
    document.getElementById('total-month-cabezas').textContent = '-';
    document.getElementById('month-days').textContent = '-';
    return;
  }

  document.getElementById('month-name').textContent = `${stats.monthName} ${stats.year}`;
  document.getElementById('avg-cabezas').textContent = formatNumber(stats.avg_cabezas);
  document.getElementById('avg-inmag').textContent = formatCurrency(stats.avg_inmag);
  document.getElementById('total-month-cabezas').textContent = formatNumber(stats.total_cabezas);
  document.getElementById('month-days').textContent = stats.days;
}

function updateSummary(data) {
  if (data.length === 0) {
    document.getElementById('total-cabezas').textContent = '-';
    document.getElementById('inmag-index').textContent = '-';
    document.getElementById('total-importe').textContent = '-';
    document.getElementById('latest-date').textContent = 'Sin datos';
    return;
  }

  const latest = data[0];
  const previous = data[1];

  document.getElementById('total-cabezas').textContent = formatNumber(latest.cabezas);
  document.getElementById('inmag-index').textContent = formatCurrency(latest.inmag);
  document.getElementById('total-importe').textContent = formatCurrency(latest.importe);
  document.getElementById('latest-date').textContent = formatDate(latest.fecha);

  const changeEl = document.getElementById('inmag-change');
  if (previous) {
    const change = latest.inmag - previous.inmag;
    if (change !== 0) {
      const sign = change > 0 ? '+' : '';
      changeEl.textContent = `${sign}${formatCurrency(change)} vs dia anterior`;
      changeEl.className = 'card-change';
      if (Math.abs(change) > INMAG_HIGHLIGHT_THRESHOLD) {
        changeEl.classList.add('highlight');
      } else if (change > 0) {
        changeEl.classList.add('positive');
      } else {
        changeEl.classList.add('negative');
      }
    } else {
      changeEl.textContent = 'Sin cambio';
      changeEl.className = 'card-change';
    }
  } else {
    changeEl.textContent = '';
  }
}

function updateTable(data) {
  const tbody = document.getElementById('prices-body');

  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="loading">No hay datos disponibles</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((row, index) => {
    const prevRow = data[index + 1];
    let inmagClass = '';
    if (prevRow && Math.abs(row.inmag - prevRow.inmag) > INMAG_HIGHLIGHT_THRESHOLD) {
      inmagClass = 'inmag-high';
    }
    return `
      <tr>
        <td>${formatDate(row.fecha)}</td>
        <td>${formatNumber(row.cabezas)}</td>
        <td>${formatCurrency(row.importe)}</td>
        <td class="${inmagClass}">${formatCurrency(row.inmag)}</td>
      </tr>
    `;
  }).join('');
}

function updateTrendsUI(trends) {
  if (!trends) return;

  if (trends.weekly) {
    const weeklyEl = document.getElementById('weekly-trend');
    const weeklyChangeEl = document.getElementById('weekly-change');

    weeklyEl.textContent = formatCurrency(trends.weekly.current_avg);

    if (trends.weekly.change_percent !== null) {
      const change = trends.weekly.change_percent;
      const arrow = change >= 0 ? '▲' : '▼';
      const sign = change >= 0 ? '+' : '';
      weeklyChangeEl.textContent = `${arrow} ${sign}${change}%`;
      weeklyChangeEl.className = `stat-change ${change >= 0 ? 'positive' : 'negative'}`;
    }
  }

  if (trends.monthly) {
    const monthlyEl = document.getElementById('monthly-trend');
    const monthlyChangeEl = document.getElementById('monthly-change');

    monthlyEl.textContent = formatCurrency(trends.monthly.current_avg);

    if (trends.monthly.change_percent !== null) {
      const change = trends.monthly.change_percent;
      const arrow = change >= 0 ? '▲' : '▼';
      const sign = change >= 0 ? '+' : '';
      monthlyChangeEl.textContent = `${arrow} ${sign}${change}%`;
      monthlyChangeEl.className = `stat-change ${change >= 0 ? 'positive' : 'negative'}`;
    }
  }
}

function updateRangeStatsUI(stats) {
  if (!stats) return;

  const maxEl = document.getElementById('max-inmag');
  const minEl = document.getElementById('min-inmag');
  const volEl = document.getElementById('volatility');

  if (maxEl) maxEl.textContent = formatCurrency(stats.max_inmag);
  if (minEl) minEl.textContent = formatCurrency(stats.min_inmag);
  if (volEl) volEl.textContent = formatCurrency(stats.volatility);
}

// ============ Formatting Functions ============

function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat('es-AR').format(num);
}

function formatCurrency(num) {
  if (num === null || num === undefined) return '-';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2
  }).format(num);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date);
  } catch {
    return dateStr;
  }
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit'
    }).format(date);
  } catch {
    return dateStr;
  }
}

function showError(message) {
  const toast = document.getElementById('error-toast');
  const messageEl = document.getElementById('error-message');
  messageEl.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 5000);
}

// ============ Event Handlers ============

async function refreshData() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Actualizando...';

  try {
    const response = await fetch('/api/refresh', { method: 'POST' });
    const result = await response.json();
    if (result.success) {
      await loadData();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Actualizar';
  }
}

function initPeriodSelector() {
  document.querySelectorAll('.period-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentDays = parseInt(btn.dataset.days);
      const data = await fetchHistory(currentDays);

      initInmagChart(data);
      initCabezasChart(data);

      // Update range stats for selected period
      const today = new Date();
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() - currentDays);

      const rangeStats = await fetchRangeStats(
        startDate.toISOString().split('T')[0],
        today.toISOString().split('T')[0]
      );
      updateRangeStatsUI(rangeStats);
    });
  });
}

function initDatePickers() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const startInput = document.getElementById('start-date');
  const endInput = document.getElementById('end-date');

  if (startInput && endInput) {
    const todayStr = today.toISOString().split('T')[0];
    startInput.max = todayStr;
    endInput.max = todayStr;
    startInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    endInput.value = todayStr;
  }
}

async function applyDateFilter() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  if (!startDate || !endDate) {
    showError('Por favor seleccione ambas fechas');
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    showError('La fecha inicial debe ser anterior a la final');
    return;
  }

  try {
    const [rangeStats, historyResponse] = await Promise.all([
      fetchRangeStats(startDate, endDate),
      fetch(`/api/stats/range?start=${startDate}&end=${endDate}`)
    ]);

    // Fetch filtered data for table and charts
    const response = await fetch(`/api/history?days=365`);
    const result = await response.json();

    if (result.success) {
      const filteredData = result.data.filter(r =>
        r.fecha >= startDate && r.fecha <= endDate
      );

      updateTable(filteredData);
      initInmagChart(filteredData);
      initCabezasChart(filteredData);
    }

    updateRangeStatsUI(rangeStats);
  } catch (error) {
    showError(error.message);
  }
}

async function clearDateFilter() {
  initDatePickers();
  await loadData();
}

function exportToCSV() {
  const startDate = document.getElementById('start-date').value;
  const endDate = document.getElementById('end-date').value;

  let url = '/api/export';
  if (startDate && endDate) {
    url += `?start=${startDate}&end=${endDate}`;
  }

  window.location.href = url;
}

// ============ Main Load Function ============

async function loadData() {
  const [data, monthlyStats, trends, comparisonData] = await Promise.all([
    fetchHistory(currentDays),
    fetchMonthlyStats(),
    fetchTrends(),
    fetchMonthlyComparison()
  ]);

  updateSummary(data);
  updateTable(data);
  updateMonthlyStats(monthlyStats);
  updateTrendsUI(trends);

  // Initialize charts
  initInmagChart(data);
  initCabezasChart(data);
  if (comparisonData.length > 0) {
    initMonthlyComparisonChart(comparisonData);
  }

  // Get range stats for current period
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - currentDays);

  const rangeStats = await fetchRangeStats(
    startDate.toISOString().split('T')[0],
    today.toISOString().split('T')[0]
  );
  updateRangeStatsUI(rangeStats);
}

// ============ Initialize ============

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initDatePickers();
  initPeriodSelector();

  // Event listeners
  document.getElementById('refresh-btn').addEventListener('click', refreshData);

  const applyBtn = document.getElementById('apply-filter-btn');
  if (applyBtn) applyBtn.addEventListener('click', applyDateFilter);

  const clearBtn = document.getElementById('clear-filter-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearDateFilter);

  const exportBtn = document.getElementById('export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportToCSV);

  // Auto-refresh every 5 minutes
  setInterval(loadData, REFRESH_INTERVAL);
});
