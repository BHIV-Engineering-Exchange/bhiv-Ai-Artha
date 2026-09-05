/**
 * demoData — generates mock Bright Connection Tally data for demo mode.
 * No Tally required. Produces realistic Delhi/NCR dealer data.
 */

const DEALERS = [
  { name: 'Sharma Electronics', group: 'Sundry Debtors', closing: 245000, opening: 180000, gstin: '07AABCS1234F1Z5', pan: 'AABCS1234F' },
  { name: 'Gupta Traders', group: 'Sundry Debtors', closing: 178000, opening: 150000, gstin: '07AABCG5678G1Z3', pan: 'AABCG5678G' },
  { name: 'Patel & Sons', group: 'Sundry Debtors', closing: 312000, opening: 200000, gstin: '06AABCP9012H1Z1', pan: 'AABCP9012H' },
  { name: 'Mehta Brothers', group: 'Sundry Debtors', closing: 89000, opening: 120000, gstin: '06AABCM3456J1Z8', pan: 'AABCM3456J' },
  { name: 'Kumar Enterprises', group: 'Sundry Debtors', closing: 456000, opening: 300000, gstin: '09AABCK7890K1Z6', pan: 'AABCK7890K' },
  { name: 'Agarwal & Co', group: 'Sundry Debtors', closing: 134000, opening: 95000, gstin: '09AABCA2345L1Z4', pan: 'AABCA2345L' },
  { name: 'Singh Trading Co', group: 'Sundry Debtors', closing: 67000, opening: 80000, gstin: '06AABCJ6789M1Z2', pan: 'AABCJ6789M' },
  { name: 'Reddy Industries', group: 'Sundry Debtors', closing: 201000, opening: 150000, gstin: '06AABCR0123N1Z0', pan: 'AABCR0123N' },
  { name: 'Jain Hardware', group: 'Sundry Debtors', closing: 156000, opening: 110000, gstin: '07AABCJ4567P1Z8', pan: 'AABCJ4567P' },
  { name: 'Verma Sales Corp', group: 'Sundry Debtors', closing: 289000, opening: 220000, gstin: '07AABCV8901Q1Z6', pan: 'AABCV8901Q' },
  { name: 'Bansal Mart', group: 'Sundry Debtors', closing: 98000, opening: 75000, gstin: '09AABCB2345R1Z4', pan: 'AABCB2345R' },
  { name: 'Tiwari Electronics', group: 'Sundry Debtors', closing: 175000, opening: 130000, gstin: '07AABCT6789S1Z2', pan: 'AABCT6789S' },
  { name: 'Bright Connection Capital', group: 'Capital Account', closing: 5000000, opening: 5000000, gstin: '', pan: '' },
  { name: 'Sales Account', group: 'Sales Accounts', closing: 12500000, opening: 0, gstin: '', pan: '' },
  { name: 'Purchase Account', group: 'Purchase Accounts', closing: 8200000, opening: 0, gstin: '', pan: '' },
  { name: 'SBI Bank Account', group: 'Bank Accounts', closing: 3200000, opening: 2800000, gstin: '', pan: '' },
  { name: 'Cash-in-Hand', group: 'Cash-in-Hand', closing: 450000, opening: 380000, gstin: '', pan: '' },
  { name: 'GST Output CGST', group: 'Duties & Taxes', closing: 450000, opening: 0, gstin: '', pan: '' },
  { name: 'GST Output SGST', group: 'Duties & Taxes', closing: 450000, opening: 0, gstin: '', pan: '' },
  { name: 'GST Output IGST', group: 'Duties & Taxes', closing: 320000, opening: 0, gstin: '', pan: '' },
];

const VOUCHER_TYPES = ['Sales', 'Receipt', 'Payment', 'Journal'];
const NARRATIONS = [
  'Being goods sold to dealer',
  'Cash received against invoice',
  'Payment made to supplier',
  'Journal entry for adjustment',
  'Being GST payment for the month',
  'Salary payment for the month',
  'Office rent payment',
  'Electricity bill payment',
];

function randomAmount(min, max) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function randomDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  return d.toISOString().slice(0, 10);
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

export function generateDemoParties() {
  return DEALERS.map((d) => ({
    name: d.name,
    group: d.group,
    closingBalance: d.closing,
    openingBalance: d.opening,
    creditLimit: 500000,
    gstin: d.gstin,
    pan: d.pan,
  }));
}

export function generateDemoOutstanding() {
  const now = new Date();
  const bills = [];
  for (const d of DEALERS.filter(d => d.group === 'Sundry Debtors')) {
    const billCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < billCount; i++) {
      const amount = randomAmount(15000, 150000);
      const billDate = new Date(now);
      billDate.setDate(billDate.getDate() - Math.floor(Math.random() * 60) - 10);
      const dueDate = new Date(billDate);
      dueDate.setDate(dueDate.getDate() + 30);
      const isOverdue = dueDate < now;
      const balance = isOverdue ? amount : randomAmount(0, amount);
      bills.push({
        partyName: d.name,
        billNo: `BC/${billDate.getFullYear()}/${String(Math.floor(Math.random() * 9000) + 1000)}`,
        billDate: formatDate(billDate),
        dueDate: formatDate(dueDate),
        amount,
        balance,
        billType: 'Dr',
      });
    }
  }
  return bills;
}

export function generateDemoVouchers() {
  const now = new Date();
  const vouchers = [];
  let voucherNum = 1000;

  // Generate 30 vouchers over last 30 days
  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dealer = DEALERS[Math.floor(Math.random() * 12)];
    const type = VOUCHER_TYPES[Math.floor(Math.random() * VOUCHER_TYPES.length)];
    const amount = randomAmount(5000, 200000);

    vouchers.push({
      voucherType: type,
      voucherNumber: `${type.substring(0, 3).toUpperCase()}/${date.getFullYear()}/${String(++voucherNum).padStart(6, '0')}`,
      date: formatDate(date),
      amount,
      narration: NARRATIONS[Math.floor(Math.random() * NARRATIONS.length)],
      partyName: dealer.name,
    });
  }
  return vouchers;
}

export function generateDemoSyncRun(counts, durationMs) {
  return {
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
    records_extracted: counts.parties + counts.outstanding + counts.vouchers,
    records_pushed: counts.parties + counts.outstanding + counts.vouchers,
    parties: counts.parties,
    outstanding: counts.outstanding,
    vouchers: counts.vouchers,
    status: 'success',
  };
}
