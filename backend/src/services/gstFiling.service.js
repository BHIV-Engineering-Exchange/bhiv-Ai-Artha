import Invoice from '../models/Invoice.js';
import Expense from '../models/Expense.js';
import CompanySettings from '../models/CompanySettings.js';
import GSTReturn from '../models/GSTReturn.js';
import Decimal from 'decimal.js';
import logger from '../config/logger.js';
import fs from 'fs';
import { calculateGSTBreakdown } from './gstEngine.service.js';
import { randomUUID } from 'crypto';
import auditService from './audit.service.js';
import evidenceAutomationService from './evidenceAutomation.service.js';
import tantraService from './tantra.service.js';

class GSTFilingService {
  /**
   * Generate GSTR-1 filing packet (Outward supplies)
   */
  async generateGSTR1FilingPacket(period) {
    try {
      const [year, month] = period.split('-');
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(year, parseInt(month), 0);

      const settings = await CompanySettings.findById('company_settings').lean();
      const companyState = settings?.address?.state || settings?.gstin?.substring(0, 2);

      logger.info(`Generating GSTR-1 packet for ${period}`);

      const invoices = await Invoice.find({
        invoiceDate: { $gte: startDate, $lte: endDate },
        status: { $in: ['sent', 'partial', 'paid'] },
      }).lean();

      const supplies = {
        b2b: [],
        b2b_intrastate: [],
        b2c: [],
        export: [],
      };

      let totalTaxable = new Decimal(0);
      let totalCGST = new Decimal(0);
      let totalSGST = new Decimal(0);
      let totalIGST = new Decimal(0);

      for (const invoice of invoices) {
        const breakdown = invoice.gstBreakdown || {};
        const cgst = new Decimal(breakdown.cgst || 0);
        const sgst = new Decimal(breakdown.sgst || 0);
        const igst = new Decimal(breakdown.igst || 0);
        const taxAmount = cgst.plus(sgst).plus(igst);
        const invoiceTotal = new Decimal(invoice.totalAmount || 0);
        const taxableAmount = invoice.subtotal
          ? new Decimal(invoice.subtotal)
          : invoiceTotal.minus(taxAmount);

        const supplyType = this.determineSupplyType(invoice, companyState, {
          cgst,
          sgst,
          igst,
        });

        const lineItem = {
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.invoiceDate.toISOString().split('T')[0],
          customerName: invoice.customerName,
          customerGSTIN: invoice.customerGSTIN || 'NOT-PROVIDED',
          description: (invoice.lines || [])
            .map((line) => line.description)
            .join(', ')
            .substring(0, 100),
          taxableAmount: taxableAmount.toString(),
          taxAmount: taxAmount.toString(),
          gstRate: invoice.taxRate ?? invoice.lines?.[0]?.taxRate ?? 0,
          totalAmount: invoiceTotal.toString(),
          cgst: cgst.toString(),
          sgst: sgst.toString(),
          igst: igst.toString(),
        };

        totalCGST = totalCGST.plus(cgst);
        totalSGST = totalSGST.plus(sgst);
        totalIGST = totalIGST.plus(igst);

        supplies[supplyType].push(lineItem);
        totalTaxable = totalTaxable.plus(taxableAmount);
      }

      const packet = {
        period,
        filingType: 'GSTR-1',
        description: 'Outward Supplies Summary',
        generatedAt: new Date().toISOString(),
        supplies,
        summary: {
          totalInvoices: invoices.length,
          totalTaxableValue: totalTaxable.toString(),
          totalCGST: totalCGST.toString(),
          totalSGST: totalSGST.toString(),
          totalIGST: totalIGST.toString(),
          totalTaxCollected: totalCGST.plus(totalSGST).plus(totalIGST).toString(),
        },
      };

      logger.info(`GSTR-1 packet generated for ${period}`, {
        totalInvoices: invoices.length,
        totalTax: packet.summary.totalTaxCollected,
      });
      
      // Audit trail
      await auditService.recordEvent({
        eventType: 'GSTR1_FILING_GENERATED',
        entityType: 'GSTFiling',
        entityId: randomUUID(),
        traceId: randomUUID(),
        userId: null,
        details: {
          period,
          filingType: 'GSTR-1',
          totalInvoices: invoices.length,
          totalTaxCollected: packet.summary.totalTaxCollected,
          totalCGST: packet.summary.totalCGST,
          totalSGST: packet.summary.totalSGST,
          totalIGST: packet.summary.totalIGST,
        },
      });
      
      // Capture evidence
      await evidenceAutomationService.captureAPIResponse({
        operation: 'generateGSTR1FilingPacket',
        entityType: 'GSTFiling',
        entityId: randomUUID(),
        request: { period },
        response: { success: true, totalInvoices: invoices.length, totalTaxCollected: packet.summary.totalTaxCollected },
        traceId: randomUUID(),
      });
      
      // Emit TANTRA event
      await tantraService.emitEvent({
        event: 'GSTR1_FILING_GENERATED',
        entityType: 'GSTFiling',
        entityId: randomUUID(),
        details: { period, totalTaxCollected: packet.summary.totalTaxCollected },
      });
      
      return packet;
    } catch (error) {
      logger.error('Generate GSTR-1 packet error:', error);
      throw error;
    }
  }

  /**
   * Generate GSTR-3B filing packet (Tax summary)
   */
  async generateGSTR3BFilingPacket(period) {
    try {
      const [year, month] = period.split('-');
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(year, parseInt(month), 0);
      const settings = await CompanySettings.findById('company_settings').lean();
      const companyState = settings?.address?.state || settings?.gstin?.substring(0, 2);

      logger.info(`Generating GSTR-3B packet for ${period}`);

      const expenses = await Expense.find({
        date: { $gte: startDate, $lte: endDate },
        status: 'recorded',
      }).lean();

      const invoices = await Invoice.find({
        invoiceDate: { $gte: startDate, $lte: endDate },
        status: { $in: ['sent', 'partial', 'paid'] },
      }).lean();

      let outwardTaxable = new Decimal(0);
      let outwardCGST = new Decimal(0);
      let outwardSGST = new Decimal(0);
      let outwardIGST = new Decimal(0);

      let inwardTaxable = new Decimal(0);
      let inwardCGST = new Decimal(0);
      let inwardSGST = new Decimal(0);
      let inwardIGST = new Decimal(0);

      for (const invoice of invoices) {
        const breakdown = invoice.gstBreakdown || {};
        const cgst = new Decimal(breakdown.cgst || 0);
        const sgst = new Decimal(breakdown.sgst || 0);
        const igst = new Decimal(breakdown.igst || 0);
        const taxAmount = cgst.plus(sgst).plus(igst);
        const taxableAmount = invoice.subtotal
          ? new Decimal(invoice.subtotal)
          : new Decimal(invoice.totalAmount || 0).minus(taxAmount);
        outwardTaxable = outwardTaxable.plus(taxableAmount);

        outwardCGST = outwardCGST.plus(cgst);
        outwardSGST = outwardSGST.plus(sgst);
        outwardIGST = outwardIGST.plus(igst);
      }

      for (const expense of expenses) {
        const taxableAmount = new Decimal(expense.amount || 0);
        const gstRate = expense.gstRate;
        if (gstRate === undefined || gstRate === null) {
          continue;
        }

        if (!companyState || !expense.supplierState) {
          continue;
        }

        const detail = calculateGSTBreakdown({
          transaction_type: 'purchase',
          amount: taxableAmount.toString(),
          gst_rate: gstRate,
          supplier_state: expense.supplierState,
          company_state: companyState,
        });

        const cgst = new Decimal(detail.cgst || 0);
        const sgst = new Decimal(detail.sgst || 0);
        const igst = new Decimal(detail.igst || 0);
        inwardTaxable = inwardTaxable.plus(taxableAmount);
        inwardCGST = inwardCGST.plus(cgst);
        inwardSGST = inwardSGST.plus(sgst);
        if (igst.greaterThan(0)) {
          inwardIGST = inwardIGST.plus(igst);
        }
      }

      const netCGST = outwardCGST.minus(inwardCGST);
      const netSGST = outwardSGST.minus(inwardSGST);
      const netIGST = outwardIGST.minus(inwardIGST);
      const totalTaxPayable = netCGST.plus(netSGST).plus(netIGST);

      const packet = {
        period,
        filingType: 'GSTR-3B',
        description: 'Tax Summary and Reconciliation',
        generatedAt: new Date().toISOString(),
        outwardSupplies: {
          totalInvoices: invoices.length,
          taxableValue: outwardTaxable.toString(),
          cgst: outwardCGST.toString(),
          sgst: outwardSGST.toString(),
          igst: outwardIGST.toString(),
          totalTax: outwardCGST.plus(outwardSGST).plus(outwardIGST).toString(),
        },
        inwardSupplies: {
          totalExpenses: expenses.length,
          taxableValue: inwardTaxable.toString(),
          cgst: inwardCGST.toString(),
          sgst: inwardSGST.toString(),
          igst: inwardIGST.toString(),
          totalInputCredit: inwardCGST.plus(inwardSGST).plus(inwardIGST).toString(),
        },
        netLiability: {
          cgst: netCGST.toString(),
          sgst: netSGST.toString(),
          igst: netIGST.toString(),
          totalPayable: totalTaxPayable.toString(),
        },
      };

      logger.info(`GSTR-3B packet generated for ${period}`, {
        outwardTax: packet.outwardSupplies.totalTax,
        inputCredit: packet.inwardSupplies.totalInputCredit,
        netPayable: packet.netLiability.totalPayable,
      });
      
      // Audit trail
      await auditService.recordEvent({
        eventType: 'GSTR3B_FILING_GENERATED',
        entityType: 'GSTFiling',
        entityId: randomUUID(),
        traceId: randomUUID(),
        userId: null,
        details: {
          period,
          filingType: 'GSTR-3B',
          totalInvoices: invoices.length,
          totalExpenses: expenses.length,
          outwardTax: packet.outwardSupplies.totalTax,
          inputCredit: packet.inwardSupplies.totalInputCredit,
          netPayable: packet.netLiability.totalPayable,
        },
      });
      
      // Capture evidence
      await evidenceAutomationService.captureAPIResponse({
        operation: 'generateGSTR3BFilingPacket',
        entityType: 'GSTFiling',
        entityId: randomUUID(),
        request: { period },
        response: { success: true, totalInvoices: invoices.length, totalExpenses: expenses.length, netPayable: packet.netLiability.totalPayable },
        traceId: randomUUID(),
      });
      
      // Emit TANTRA event
      await tantraService.emitEvent({
        event: 'GSTR3B_FILING_GENERATED',
        entityType: 'GSTFiling',
        entityId: randomUUID(),
        details: { period, netPayable: packet.netLiability.totalPayable },
      });
      
      return packet;
    } catch (error) {
      logger.error('Generate GSTR-3B packet error:', error);
      throw error;
    }
  }

  /**
   * Get GST summary for period (Dashboard)
   */
  async getGSTSummary(period) {
    try {
      const [year, month] = period.split('-');
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(year, parseInt(month), 0);

      // Get invoices for the period
      const invoices = await Invoice.find({
        invoiceDate: { $gte: startDate, $lte: endDate },
        status: { $in: ['sent', 'partial', 'paid'] },
      }).lean();

      // Get expenses for the period
      const expenses = await Expense.find({
        date: { $gte: startDate, $lte: endDate },
        status: 'recorded',
      }).lean();

      // Calculate output GST (from invoices)
      let outputGST = new Decimal(0);
      let b2bCount = 0;
      let b2bTaxable = new Decimal(0);
      let b2bTax = new Decimal(0);
      let b2cCount = 0;
      let b2cTaxable = new Decimal(0);
      let b2cTax = new Decimal(0);
      const exportCount = 0;
      const exportTaxable = new Decimal(0);

      invoices.forEach(invoice => {
        const taxAmount = new Decimal(invoice.taxAmount || 0);
        const taxableAmount = new Decimal(invoice.totalAmount || 0).minus(taxAmount);
        outputGST = outputGST.plus(taxAmount);

        if (invoice.customerGSTIN) {
          b2bCount++;
          b2bTaxable = b2bTaxable.plus(taxableAmount);
          b2bTax = b2bTax.plus(taxAmount);
        } else {
          b2cCount++;
          b2cTaxable = b2cTaxable.plus(taxableAmount);
          b2cTax = b2cTax.plus(taxAmount);
        }
      });

      // Calculate input GST (from expenses)
      let inputGST = new Decimal(0);
      expenses.forEach(expense => {
        const taxAmount = new Decimal(expense.taxAmount || 0);
        inputGST = inputGST.plus(taxAmount);
      });

      // Calculate net payable
      const netPayable = outputGST.minus(inputGST);

      // Get previous period's closing credit balance
      const prevMonth = parseInt(month) === 1 ? 12 : parseInt(month) - 1;
      const prevYear = parseInt(month) === 1 ? parseInt(year) - 1 : parseInt(year);
      const prevReturn = await GSTReturn.findOne({
        returnType: 'GSTR3B',
        'period.year': prevYear.toString(),
        'period.month': prevMonth.toString().padStart(2, '0'),
        status: 'filed',
      }).sort({ filedDate: -1 }).lean();
      const previousCredit = new Decimal(prevReturn?.closingBalance || 0);
      const finalPayable = netPayable.minus(previousCredit);

      // Get last 6 months data for trend
      const monthlyData = [];
      for (let i = 5; i >= 0; i--) {
        const trendDate = new Date(year, parseInt(month) - 1 - i, 1);
        const trendEndDate = new Date(year, parseInt(month) - i, 0);
        
        const monthInvoices = await Invoice.find({
          invoiceDate: { $gte: trendDate, $lte: trendEndDate },
          status: { $in: ['sent', 'partial', 'paid'] },
        }).lean();

        const monthExpenses = await Expense.find({
          date: { $gte: trendDate, $lte: trendEndDate },
          status: 'recorded',
        }).lean();

        let monthOutput = new Decimal(0);
        monthInvoices.forEach(inv => {
          monthOutput = monthOutput.plus(inv.taxAmount || 0);
        });

        let monthInput = new Decimal(0);
        monthExpenses.forEach(exp => {
          monthInput = monthInput.plus(exp.taxAmount || 0);
        });

        const monthNet = monthOutput.minus(monthInput);

        monthlyData.push({
          month: trendDate.toLocaleString('default', { month: 'short' }),
          output: parseFloat(monthOutput.toString()),
          input: parseFloat(monthInput.toString()),
          net: parseFloat(monthNet.toString()),
        });
      }

      // Calculate due dates
      const nextMonth = new Date(year, parseInt(month), 1);
      const gstr1DueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 11);
      const gstr3bDueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20);

      return {
        summary: {
          outputGST: parseFloat(outputGST.toString()),
          inputGST: parseFloat(inputGST.toString()),
          netPayable: parseFloat(netPayable.toString()),
          previousCredit: parseFloat(previousCredit.toString()),
          finalPayable: parseFloat(finalPayable.toString()),
        },
        currentMonth: {
          period: `${new Date(year, parseInt(month) - 1).toLocaleString('default', { month: 'long' })} ${year}`,
          gstr1DueDate: gstr1DueDate.toISOString(),
          gstr3bDueDate: gstr3bDueDate.toISOString(),
          gstr1Status: 'not_filed',
          gstr3bStatus: 'not_filed',
        },
        monthlyData,
        invoicesSummary: {
          b2b: {
            count: b2bCount,
            taxable: parseFloat(b2bTaxable.toString()),
            tax: parseFloat(b2bTax.toString()),
          },
          b2c: {
            count: b2cCount,
            taxable: parseFloat(b2cTaxable.toString()),
            tax: parseFloat(b2cTax.toString()),
          },
          exports: {
            count: exportCount,
            taxable: parseFloat(exportTaxable.toString()),
            tax: 0,
          },
        },
        returns: await GSTReturn.find({
          'period.year': year.toString(),
          'period.month': month.toString().padStart(2, '0'),
        }).sort({ filedDate: -1 }).lean(),
      };
    } catch (error) {
      logger.error('Get GST summary error:', error);
      throw error;
    }
  }

  /**
   * Determine supply type
   */
  determineSupplyType(invoice, companyState) {
    if (invoice.isExport) return 'export';
    if (!invoice.customerGSTIN) return 'b2c';

    const customerState = invoice.customerGSTIN
      ? invoice.customerGSTIN.substring(0, 2)
      : (invoice.customerState || invoice.customerAddress?.state);

    if (companyState && customerState && companyState === customerState) {
      return 'b2b_intrastate';
    }

    return 'b2b';
  }

  /**
   * Export filing packet as CSV
   */
  async exportFilingPacketAsCSV(packet, filePath) {
    try {
      const lines = [];

      lines.push('GST Filing Packet Export');
      lines.push(`Period: ${packet.period}`);
      lines.push(`Filing Type: ${packet.filingType}`);
      lines.push(`Generated: ${packet.generatedAt}`);
      lines.push('');

      if (packet.supplies) {
        lines.push('SUPPLIES SUMMARY');
        lines.push('Type,Count,TaxableValue,CGST,SGST,IGST,TotalTax');

        for (const [type, items] of Object.entries(packet.supplies)) {
          if (items.length > 0) {
            let typeValue = new Decimal(0);
            let typeCGST = new Decimal(0);
            let typeSGST = new Decimal(0);
            let typeIGST = new Decimal(0);

            items.forEach((item) => {
              typeValue = typeValue.plus(item.taxableAmount || 0);
              typeCGST = typeCGST.plus(item.cgst || 0);
              typeSGST = typeSGST.plus(item.sgst || 0);
              typeIGST = typeIGST.plus(item.igst || 0);
            });

            const typeTax = typeCGST.plus(typeSGST).plus(typeIGST);
            lines.push(`${type},${items.length},${typeValue},${typeCGST},${typeSGST},${typeIGST},${typeTax}`);
          }
        }
      }

      if (packet.summary) {
        lines.push('');
        lines.push('FILING SUMMARY');
        lines.push(`Total Taxable Value,${packet.summary.totalTaxableValue}`);
        lines.push(`CGST,${packet.summary.totalCGST}`);
        lines.push(`SGST,${packet.summary.totalSGST}`);
        lines.push(`IGST,${packet.summary.totalIGST}`);
        lines.push(`Total Tax,${packet.summary.totalTaxCollected}`);
      }

      fs.writeFileSync(filePath, lines.join('\n'));
      logger.info(`Filing packet exported to ${filePath}`);

      return filePath;
    } catch (error) {
      logger.error('Export filing packet error:', error);
      throw error;
    }
  }
}

export default new GSTFilingService();
