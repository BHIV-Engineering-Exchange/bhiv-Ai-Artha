import { useState, useEffect, Component } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Send,
  Download,
  Edit,
  Trash2,
  CreditCard,
  XCircle,
  Printer,
  Mail,
  CheckCircle,
  Clock,
  AlertCircle,
  Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Modal,
  Input,
  Loading,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-6">
          <PageHeader title="Invoice" backUrl="/invoices" />
          <Card className="p-8">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Failed to load invoice</h2>
              <p className="text-muted-foreground mb-4">{this.state.error?.message || 'An error occurred'}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

const InvoiceViewInner = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchInvoice();
  }, [id]);

  const fetchInvoice = async () => {
    try {
      const response = await api.get(`/invoices/${id}`);
      setInvoice(response.data.data);
    } catch (error) {
      console.error('Failed to fetch invoice:', error);
      toast.error('Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvoice = async () => {
    setProcessing(true);
    try {
      await api.post(`/invoices/${id}/send`);
      toast.success('Invoice sent successfully');
      fetchInvoice();
    } catch (error) {
      toast.error('Failed to send invoice');
    } finally {
      setProcessing(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setProcessing(true);
    try {
      await api.post(`/invoices/${id}/payment`, {
        amount: parseFloat(paymentAmount),
        paymentDate: new Date().toISOString(),
        paymentMethod: 'bank_transfer',
      });
      toast.success('Payment recorded successfully');
      setShowPaymentModal(false);
      setPaymentAmount('');
      fetchInvoice();
    } catch (error) {
      toast.error('Failed to record payment');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelInvoice = async () => {
    if (!confirm('Are you sure you want to cancel this invoice?')) return;

    setProcessing(true);
    try {
      await api.post(`/invoices/${id}/cancel`);
      toast.success('Invoice cancelled');
      fetchInvoice();
    } catch (error) {
      toast.error('Failed to cancel invoice');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const response = await api.get(`/invoices/${id}/pdf`, {
        responseType: 'blob',
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `invoice-${invoice.invoiceNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Invoice downloaded');
    } catch (error) {
      toast.error('Failed to download invoice');
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      draft: { variant: 'default', icon: Clock, label: 'Draft' },
      sent: { variant: 'info', icon: Mail, label: 'Sent' },
      paid: { variant: 'success', icon: CheckCircle, label: 'Paid' },
      partial: { variant: 'warning', icon: CreditCard, label: 'Partial' },
      overdue: { variant: 'danger', icon: AlertCircle, label: 'Overdue' },
      cancelled: { variant: 'default', icon: XCircle, label: 'Cancelled' },
    };
    const { variant, icon: Icon, label } = config[status] || config.draft;
    return (
      <Badge variant={variant} size="lg" className="flex items-center gap-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </Badge>
    );
  };

  if (loading) {
    return <Loading.Page />;
  }

  if (!invoice) {
    return <div>Invoice not found</div>;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title={`Invoice ${invoice.invoiceNumber}`}
        backUrl="/invoices"
        action={
          <div className="flex gap-2">
            {invoice.status === 'draft' && (
              <Button onClick={handleSendInvoice} loading={processing} icon={Send}>
                Send Invoice
              </Button>
            )}
            {['sent', 'partial', 'overdue'].includes(invoice.status) && (
              <Button onClick={() => setShowPaymentModal(true)} icon={CreditCard}>
                Record Payment
              </Button>
            )}
            <Button variant="secondary" icon={Download} onClick={handleDownloadPDF}>
              Download PDF
            </Button>
            <Button
              variant="secondary"
              icon={Edit}
              onClick={() => navigate(`/invoices/${id}/edit`)}
            >
              Edit
            </Button>
          </div>
        }
      />

      {/* Invoice Preview */}
      <Card className="p-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">ARTHA</h2>
              <p className="text-muted-foreground">Financial Solutions</p>
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-bold text-foreground">INVOICE</h1>
            <p className="text-lg font-medium text-blue-600 mt-1">{invoice.invoiceNumber}</p>
            <div className="mt-2">{getStatusBadge(invoice.status)}</div>
          </div>
        </div>

        {/* Customer & Invoice Info */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Bill To</h3>
            <p className="text-lg font-semibold text-foreground">{invoice.customerName}</p>
            {invoice.customerEmail && (
              <p className="text-muted-foreground">{invoice.customerEmail}</p>
            )}
            {invoice.customerAddress && (
              <p className="text-muted-foreground whitespace-pre-line">
                {typeof invoice.customerAddress === 'string'
                  ? invoice.customerAddress
                  : [invoice.customerAddress.street, invoice.customerAddress.city, invoice.customerAddress.state, invoice.customerAddress.zipCode, invoice.customerAddress.country].filter(Boolean).join(', ')}
              </p>
            )}
            {invoice.customerGSTIN && (
              <p className="text-muted-foreground mt-2">
                <span className="font-medium">GSTIN:</span> {invoice.customerGSTIN}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="space-y-2">
              <div>
                <span className="text-sm text-muted-foreground">Invoice Date:</span>
                <span className="ml-2 font-medium">{formatDate(invoice.invoiceDate)}</span>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Due Date:</span>
                <span className="ml-2 font-medium">{formatDate(invoice.dueDate)}</span>
              </div>
              <div className="pt-4">
                <span className="text-sm text-muted-foreground">Amount Due:</span>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(invoice.amountDue || invoice.totalAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="border rounded-lg overflow-hidden mb-8">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">
                  Description
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase w-20">
                  Qty
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase w-28">
                  Rate
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase w-20">
                  GST
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase w-32">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(invoice.items || invoice.lines || []).map((item, index) => (
                <tr key={index}>
                  <td className="px-4 py-4 text-foreground">{item.description}</td>
                  <td className="px-4 py-4 text-center text-muted-foreground">{item.quantity}</td>
                  <td className="px-4 py-4 text-right text-muted-foreground">
                    {formatCurrency(item.unitPrice || item.rate)}
                  </td>
                  <td className="px-4 py-4 text-center text-muted-foreground">{item.gstRate || item.taxRate || 0}%</td>
                  <td className="px-4 py-4 text-right font-medium">
                    {formatCurrency(item.amount || item.quantity * item.rate * (1 + item.gstRate / 100))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-72">
            <div className="space-y-2">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(invoice.subtotal)}</span>
              </div>
              {(invoice.gstBreakdown?.cgst > 0 || invoice.taxAmount > 0) && (
                <>
                  {invoice.gstBreakdown?.cgst > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>CGST</span>
                      <span>{formatCurrency(invoice.gstBreakdown?.cgst || 0)}</span>
                    </div>
                  )}
                  {invoice.gstBreakdown?.sgst > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>SGST</span>
                      <span>{formatCurrency(invoice.gstBreakdown?.sgst || 0)}</span>
                    </div>
                  )}
                  {invoice.gstBreakdown?.igst > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>IGST</span>
                      <span>{formatCurrency(invoice.gstBreakdown?.igst || 0)}</span>
                    </div>
                  )}
                  {!invoice.gstBreakdown?.cgst && !invoice.gstBreakdown?.sgst && !invoice.gstBreakdown?.igst && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>GST</span>
                      <span>{formatCurrency(invoice.taxAmount)}</span>
                    </div>
                  )}
                </>
              )}
              {invoice.amountPaid > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Paid</span>
                  <span>- {formatCurrency(invoice.amountPaid)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-bold border-t border-border pt-2">
                <span>Total Due</span>
                <span className="text-blue-600">
                  {formatCurrency(invoice.amountDue || invoice.totalAmount)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes & Terms */}
        {(invoice.notes || invoice.terms) && (
          <div className="mt-8 pt-8 border-t border-border grid grid-cols-2 gap-8">
            {invoice.notes && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Notes</h3>
                <p className="text-muted-foreground">{invoice.notes}</p>
              </div>
            )}
            {invoice.terms && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-2">
                  Terms & Conditions
                </h3>
                <p className="text-muted-foreground">{invoice.terms}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Record Payment"
        description="Enter the payment amount received"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Amount Due: <span className="font-semibold text-foreground">
                {formatCurrency(invoice.amountDue || invoice.totalAmount)}
              </span>
            </p>
            <Input
              label="Payment Amount"
              type="number"
              placeholder="Enter amount"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowPaymentModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} loading={processing}>
              Record Payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

const InvoiceView = () => (
  <ErrorBoundary>
    <InvoiceViewInner />
  </ErrorBoundary>
);

export default InvoiceView;
