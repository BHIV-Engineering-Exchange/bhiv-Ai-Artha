import PDFDocument from 'pdfkit';
import financialReportsService from './financialReports.service.js';

class ExportService {
  /**
   * Export Profit & Loss as PDF
   */
  async exportProfitLossPDF(startDate, endDate) {
    const data = await financialReportsService.generateProfitLoss(startDate, endDate);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('Profit & Loss Statement', { align: 'center' });
    doc.fontSize(10).font('Helvetica');
    doc.text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Income Section
    doc.fontSize(14).font('Helvetica-Bold').text('Income');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    data.income?.items?.forEach(item => {
      doc.text(item.name, 70, doc.y, { continued: true, width: 300 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('Total Income', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.income?.total || 0), { align: 'right' });
    doc.moveDown(1);

    // Expenses Section
    doc.fontSize(14).text('Expenses');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    data.expenses?.items?.forEach(item => {
      doc.text(item.name, 70, doc.y, { continued: true, width: 300 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('Total Expenses', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.expenses?.total || 0), { align: 'right' });
    doc.moveDown(1);

    // Net Profit/Loss
    doc.fontSize(16);
    const isProfit = data.netProfit >= 0;
    doc.fillColor(isProfit ? 'green' : 'red');
    doc.text(`Net ${isProfit ? 'Profit' : 'Loss'}`, 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(Math.abs(data.netProfit || 0)), { align: 'right' });

    doc.end();
    return doc;
  }

  /**
   * Export Balance Sheet as PDF
   */
  async exportBalanceSheetPDF(asOfDate) {
    const data = await financialReportsService.generateBalanceSheet(asOfDate);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    doc.fontSize(20).font('Helvetica-Bold').text('Balance Sheet', { align: 'center' });
    doc.fontSize(10).font('Helvetica');
    doc.text(`As of: ${asOfDate}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Assets
    doc.fontSize(14).font('Helvetica-Bold').text('Assets');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    doc.text('Current Assets', 70);
    data.assets?.current?.items?.forEach(item => {
      doc.text(item.name, 90, doc.y, { continued: true, width: 280 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.text('Non-Current Assets', 70);
    data.assets?.nonCurrent?.items?.forEach(item => {
      doc.text(item.name, 90, doc.y, { continued: true, width: 280 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('Total Assets', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.assets?.total || 0), { align: 'right' });
    doc.moveDown(1);

    // Liabilities
    doc.fontSize(14).text('Liabilities');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    doc.text('Current Liabilities', 70);
    data.liabilities?.current?.items?.forEach(item => {
      doc.text(item.name, 90, doc.y, { continued: true, width: 280 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.text('Non-Current Liabilities', 70);
    data.liabilities?.nonCurrent?.items?.forEach(item => {
      doc.text(item.name, 90, doc.y, { continued: true, width: 280 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('Total Liabilities', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.liabilities?.total || 0), { align: 'right' });
    doc.moveDown(1);

    // Equity
    doc.fontSize(14).text('Equity');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    data.equity?.items?.forEach(item => {
      doc.text(item.name, 70, doc.y, { continued: true, width: 300 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('Total Equity', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.equity?.total || 0), { align: 'right' });

    doc.end();
    return doc;
  }

  /**
   * Export Cash Flow as PDF
   */
  async exportCashFlowPDF(startDate, endDate) {
    const data = await financialReportsService.generateCashFlow(startDate, endDate);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    doc.fontSize(20).font('Helvetica-Bold').text('Cash Flow Statement', { align: 'center' });
    doc.fontSize(10).font('Helvetica');
    doc.text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Operating Activities
    doc.fontSize(14).font('Helvetica-Bold').text('Operating Activities');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    data.operations?.items?.forEach(item => {
      doc.text(item.name, 70, doc.y, { continued: true, width: 300 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('Net Cash from Operations', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.operations?.total || 0), { align: 'right' });
    doc.moveDown(1);

    // Investing Activities
    doc.fontSize(14).text('Investing Activities');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    data.investing?.items?.forEach(item => {
      doc.text(item.name, 70, doc.y, { continued: true, width: 300 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('Net Cash from Investing', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.investing?.total || 0), { align: 'right' });
    doc.moveDown(1);

    // Financing Activities
    doc.fontSize(14).text('Financing Activities');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    
    data.financing?.items?.forEach(item => {
      doc.text(item.name, 70, doc.y, { continued: true, width: 300 });
      doc.text(this.formatCurrency(item.amount), { align: 'right' });
    });
    
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('Net Cash from Financing', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.financing?.total || 0), { align: 'right' });
    doc.moveDown(1);

    // Summary
    doc.fontSize(14);
    doc.text('Opening Balance', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.openingBalance || 0), { align: 'right' });
    doc.text('Net Change', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.netChange || 0), { align: 'right' });
    doc.text('Closing Balance', 70, doc.y, { continued: true, width: 300 });
    doc.text(this.formatCurrency(data.closingBalance || 0), { align: 'right' });

    doc.end();
    return doc;
  }

  /**
   * Export Trial Balance as PDF
   */
  async exportTrialBalancePDF(asOfDate) {
    const data = await financialReportsService.generateTrialBalance(asOfDate);
    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });

    doc.fontSize(20).font('Helvetica-Bold').text('Trial Balance', { align: 'center' });
    doc.fontSize(10).font('Helvetica');
    doc.text(`As of: ${asOfDate}`, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Table Header
    const col1 = 50, col2 = 150, col3 = 400, col4 = 550, col5 = 680;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Code', col1, doc.y);
    doc.text('Account Name', col2, doc.y);
    doc.text('Type', col3, doc.y);
    doc.text('Debit', col4, doc.y);
    doc.text('Credit', col5, doc.y);
    doc.moveDown(0.5);
    doc.moveTo(col1, doc.y).lineTo(750, doc.y).stroke();
    doc.moveDown(0.5);

    // Accounts
    doc.font('Helvetica');
    data.accounts?.forEach(account => {
      doc.text(account.code, col1, doc.y);
      doc.text(account.name, col2, doc.y);
      doc.text(account.type, col3, doc.y);
      doc.text(account.debit > 0 ? this.formatCurrency(account.debit) : '-', col4, doc.y);
      doc.text(account.credit > 0 ? this.formatCurrency(account.credit) : '-', col5, doc.y);
      doc.moveDown(0.3);
    });

    // Totals
    doc.moveDown(0.5);
    doc.moveTo(col1, doc.y).lineTo(750, doc.y).stroke();
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold');
    doc.text('TOTAL', col1, doc.y);
    doc.text(this.formatCurrency(data.totalDebits || 0), col4, doc.y);
    doc.text(this.formatCurrency(data.totalCredits || 0), col5, doc.y);

    doc.end();
    return doc;
  }

  /**
   * Export to CSV
   */
  exportToCSV(data, headers) {
    const sanitizeCSV = (val) => {
      const str = String(val ?? '');
      const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
      if (dangerousPrefixes.some(p => str.startsWith(p))) {
        return `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    let csv = headers.map(h => sanitizeCSV(h)).join(',') + '\n';
    data.forEach(row => {
      csv += row.map(cell => sanitizeCSV(cell)).join(',') + '\n';
    });
    return csv;
  }

  formatCurrency(amount) {
    const num = parseFloat(amount) || 0;
    return '₹' + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

export default new ExportService();
