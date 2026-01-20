const INMAG_HIGHLIGHT_THRESHOLD = 4100;
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function fetchPrices() {
  try {
    const response = await fetch('/api/prices');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al cargar datos');
    }

    return result.data;
  } catch (error) {
    showError(error.message);
    return [];
  }
}

async function fetchHistory() {
  try {
    const response = await fetch('/api/history?days=30');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Error al cargar historial');
    }

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

    if (!result.success) {
      throw new Error(result.error || 'Error al cargar promedios mensuales');
    }

    return result.data;
  } catch (error) {
    showError(error.message);
    return null;
  }
}

function updateMonthlyStats(stats) {
  if (!stats || stats.days === 0) {
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

  // Update values
  document.getElementById('total-cabezas').textContent = formatNumber(latest.cabezas);
  document.getElementById('inmag-index').textContent = formatCurrency(latest.inmag);
  document.getElementById('total-importe').textContent = formatCurrency(latest.importe);
  document.getElementById('latest-date').textContent = formatDate(latest.fecha);

  // Calculate and show INMAG change
  const changeEl = document.getElementById('inmag-change');
  if (previous) {
    const change = latest.inmag - previous.inmag;
    if (change !== 0) {
      const sign = change > 0 ? '+' : '';
      changeEl.textContent = `${sign}${formatCurrency(change)} vs día anterior`;

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

    if (prevRow) {
      const change = Math.abs(row.inmag - prevRow.inmag);
      if (change > INMAG_HIGHLIGHT_THRESHOLD) {
        inmagClass = 'inmag-high';
      }
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

function showError(message) {
  const toast = document.getElementById('error-toast');
  const messageEl = document.getElementById('error-message');

  messageEl.textContent = message;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 5000);
}

async function loadData() {
  const [data, monthlyStats] = await Promise.all([
    fetchHistory(),
    fetchMonthlyStats()
  ]);

  updateSummary(data);
  updateTable(data);
  updateMonthlyStats(monthlyStats);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData();

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', refreshData);

  // Auto-refresh every 5 minutes
  setInterval(loadData, REFRESH_INTERVAL);
});
