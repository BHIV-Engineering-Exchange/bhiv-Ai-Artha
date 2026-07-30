/**
 * Format number as Indian Rupee currency
 */
export const formatCurrency = (amount, options = {}) => {
  const { showSymbol = true, decimals = 0 } = options;
  
  const formatter = new Intl.NumberFormat('en-IN', {
    style: showSymbol ? 'currency' : 'decimal',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const num = Number(amount);
  return formatter.format(Number.isNaN(num) ? 0 : num);
};

/**
 * Format date to readable string
 */
export const formatDate = (date, format = 'short') => {
  if (!date) return '-';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  const formats = {
    short: { day: '2-digit', month: 'short', year: 'numeric' },
    long: { day: '2-digit', month: 'long', year: 'numeric' },
    full: { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' },
    time: { hour: '2-digit', minute: '2-digit' },
    datetime: { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  };

  return d.toLocaleDateString('en-IN', formats[format] || formats.short);
};

/**
 * Format number with thousand separators
 */
export const formatNumber = (num, decimals = 0) => {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num || 0);
};

/**
 * Format percentage
 */
export const formatPercentage = (value, decimals = 1) => {
  return `${(value || 0).toFixed(decimals)}%`;
};

/**
 * Get relative time (e.g., "2 hours ago")
 */
export const getRelativeTime = (date) => {
  if (!date) return '-';
  
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now - d) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };
  
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }
  
  return 'Just now';
};

/**
 * Truncate text with ellipsis
 */
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Generate invoice number
 */
export const generateInvoiceNumber = (prefix = 'INV', sequence = 1) => {
  const year = new Date().getFullYear();
  const paddedSequence = String(sequence).padStart(4, '0');
  return `${prefix}-${year}-${paddedSequence}`;
};

/**
 * Calculate GST amount
 */
export const calculateGST = (amount, rate = 18) => {
  const gstAmount = (amount * rate) / 100;
  return {
    baseAmount: amount,
    gstRate: rate,
    gstAmount,
    totalAmount: amount + gstAmount,
    cgst: gstAmount / 2,
    sgst: gstAmount / 2,
  };
};

/**
 * Validate GST number
 */
export const isValidGSTN = (gstn) => {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(gstn);
};

/**
 * Validate PAN number
 */
export const isValidPAN = (pan) => {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan);
};

/**
 * Get financial year string
 */
export const getFinancialYear = (date = new Date()) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(2)}`;
  }
};

/**
 * Download file from blob
 */
export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

/**
 * Export a report PDF via the authenticated axios instance.
 * Uses Bearer token from localStorage — works with the app's auth strategy.
 *
 * @param {object} apiInstance  - the axios api instance from services/api.js
 * @param {string} endpoint     - e.g. '/reports/profit-loss/export'
 * @param {object} params       - query params e.g. { startDate, endDate }
 * @param {string} filename     - download filename e.g. 'profit-loss.pdf'
 */
export const exportReportPDF = async (apiInstance, endpoint, params, filename) => {
  const response = await apiInstance.get(endpoint, {
    params,
    responseType: 'blob',
    timeout: 30000,
  });
  downloadFile(response.data, filename);
};
