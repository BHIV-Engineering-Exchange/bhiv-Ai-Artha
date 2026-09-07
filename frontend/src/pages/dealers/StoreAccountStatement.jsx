import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Download,
  Calendar,
  Filter,
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { PageHeader, Card, Button, Badge, Loading } from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const PERIODS = [
  { label: 'All Time', value: 'all' },
  { label: 'This Month', value: 'month' },
  { label: 'This Quarter', value: 'quarter' },
  { label: 'This FY', value: 'fy' },
  { label: 'Custom', value: 'custom' },
];

const StoreAccountStatement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dealer, setDealer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const pageSize = 50;

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [dealerRes, txRes, summaryRes] = await Promise.all([
        api.get(`/dealers/${id}`),
        api.get(`/dealers/${id}/transactions?limit=500`),
        api.get(`/dealers/${id}/summary`),
      ]);
      setDealer(dealerRes.data?.data || dealerRes.data);
      setTransactions(txRes.data?.data || txRes.data || []);
      setSummary(summaryRes.data?.data);
    } catch (err) {
      console.error('Failed to fetch store account data:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    let filtered = [...transactions];
    const now = new Date();

    if (period === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = filtered.filter((t) => new Date(t.date) >= start);
    } else if (period === 'quarter') {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      filtered = filtered.filter((t) => new Date(t.date) >= start);
    } else if (period === 'fy') {
      const fyStart = now.getMonth() >= 3 ? new Date(now.getFullYear(), 3, 1) : new Date(now.getFullYear() - 1, 3, 1);
      filtered = filtered.filter((t) => new Date(t.date) >= fyStart);
    } else if (period === 'custom' && customStart && customEnd) {
      const start = new Date(customStart);
      const end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });
    }

    return filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [transactions, period, customStart, customEnd]);

  const transactionsWithBalance = useMemo(() => {
    let runningBalance = 0;
    return filteredTransactions.map((t) => {
      const debit = t.type === 'Sale' || t.type === 'Journal' ? t.amount : 0;
      const credit = t.type === 'Receipt' || t.type === 'Payment' ? t.amount : 0;
      runningBalance += debit - credit;
      return { ...t, debit, credit, runningBalance };
    });
  }, [filteredTransactions]);

  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return transactionsWithBalance.slice(start, start + pageSize);
  }, [transactionsWithBalance, currentPage]);

  const totalPages = Math.ceil(transactionsWithBalance.length / pageSize);

  const periodSummary = useMemo(() => {
    const totalDebit = transactionsWithBalance.reduce((s, t) => s + t.debit, 0);
    const totalCredit = transactionsWithBalance.reduce((s, t) => s + t.credit, 0);
    const avgInvoice = totalDebit / (transactionsWithBalance.filter((t) => t.debit > 0).length || 1);
    return {
      totalDebit,
      totalCredit,
      netBalance: totalDebit - totalCredit,
      transactionCount: transactionsWithBalance.length,
      avgInvoice,
    };
  }, [transactionsWithBalance]);

  const handleExport = () => {
    const headers = ['Date', 'Type', 'Number', 'Debit', 'Credit', 'Balance', 'Narration'];
    const rows = transactionsWithBalance.map((t) => [
      t.date,
      t.type,
      t.number || '',
      t.debit || '',
      t.credit || '',
      t.runningBalance,
      t.narration || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dealer?.name || 'store'}-account-statement.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Loading.Page />;
  if (!dealer) return <div className="p-8 text-center">Store not found</div>;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title={`Account Statement: ${dealer.name}`}
        subtitle={dealer.dealerCode || dealer.shopName || ''}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate(`/dealers/${id}`)} icon={ArrowLeft}>
              Back
            </Button>
            <Button variant="outline" onClick={handleExport} icon={Download}>
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Debit</p>
              <p className="text-lg font-bold">{formatCurrency(periodSummary.totalDebit)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Credit</p>
              <p className="text-lg font-bold">{formatCurrency(periodSummary.totalCredit)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 rounded-lg flex items-center justify-center">
              {periodSummary.netBalance >= 0 ? (
                <TrendingUp className="w-5 h-5 text-amber-500" />
              ) : (
                <TrendingDown className="w-5 h-5 text-amber-500" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net Balance</p>
              <p className={`text-lg font-bold ${periodSummary.netBalance >= 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {formatCurrency(Math.abs(periodSummary.netBalance))}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Transactions</p>
              <p className="text-lg font-bold">{periodSummary.transactionCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
              <IndianRupee className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Invoice</p>
              <p className="text-lg font-bold">{formatCurrency(periodSummary.avgInvoice)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Period Filter */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPeriod(p.value); setCurrentPage(1); }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                period === p.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {p.label}
            </button>
          ))}
          {period === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-3 py-1.5 bg-muted rounded-lg text-sm border-0"
              />
              <span className="text-muted-foreground">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-3 py-1.5 bg-muted rounded-lg text-sm border-0"
              />
            </div>
          )}
        </div>
      </Card>

      {/* Transaction Ledger */}
      <Card>
        <div className="p-4 border-b border-border/50 flex items-center justify-between">
          <h3 className="font-semibold text-foreground">
            Transaction Ledger ({transactionsWithBalance.length})
          </h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1 hover:bg-muted rounded disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1 hover:bg-muted rounded disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Number</th>
                <th className="text-right p-3 font-medium">Debit</th>
                <th className="text-right p-3 font-medium">Credit</th>
                <th className="text-right p-3 font-medium">Balance</th>
                <th className="text-left p-3 font-medium">Narration</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No transactions found for this period
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((t, i) => (
                  <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="p-3">
                      <Badge
                        variant={
                          t.type === 'Receipt' ? 'success'
                            : t.type === 'Payment' ? 'warning'
                            : t.type === 'Sale' ? 'info'
                            : 'default'
                        }
                      >
                        {t.type}
                      </Badge>
                    </td>
                    <td className="p-3 font-medium">{t.number || '-'}</td>
                    <td className="p-3 text-right">
                      {t.debit > 0 ? formatCurrency(t.debit) : '-'}
                    </td>
                    <td className="p-3 text-right">
                      {t.credit > 0 ? formatCurrency(t.credit) : '-'}
                    </td>
                    <td className={`p-3 text-right font-semibold ${t.runningBalance >= 0 ? 'text-amber-600' : 'text-green-600'}`}>
                      {formatCurrency(Math.abs(t.runningBalance))}
                    </td>
                    <td className="p-3 text-muted-foreground truncate max-w-xs">{t.narration || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-semibold border-t-2">
                <td className="p-3" colSpan={3}>Total</td>
                <td className="p-3 text-right">{formatCurrency(periodSummary.totalDebit)}</td>
                <td className="p-3 text-right">{formatCurrency(periodSummary.totalCredit)}</td>
                <td className="p-3 text-right">{formatCurrency(Math.abs(periodSummary.netBalance))}</td>
                <td className="p-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default StoreAccountStatement;
