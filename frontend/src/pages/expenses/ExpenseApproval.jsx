import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Receipt,
  User,
  Calendar,
  DollarSign,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Modal,
  Textarea,
  Loading,
  EmptyState,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const ExpenseApproval = () => {
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPendingExpenses();
  }, []);

  const fetchPendingExpenses = async () => {
    try {
      const response = await api.get('/expenses?status=pending');
      setExpenses(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
      toast.error('Failed to load pending expenses');
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (expense) => {
    setProcessing(true);
    try {
      const response = await api.post(`/expenses/${expense._id}/approve`);
      if (response.data.warnings?.length) {
        toast(`Approved with warning: ${response.data.warnings[0]}`, { icon: '⚠️' });
      } else {
        toast.success('Expense approved successfully');
      }
      setExpenses((prev) => prev.filter((e) => e._id !== expense._id));
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to approve expense';
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setProcessing(true);
    try {
      await api.post(`/expenses/${selectedExpense._id}/reject`, {
        reason: rejectionReason,
      });
      toast.success('Expense rejected');
      setExpenses((prev) => prev.filter((e) => e._id !== selectedExpense._id));
      setShowModal(false);
      setSelectedExpense(null);
      setRejectionReason('');
    } catch (error) {
      toast.error('Failed to reject expense');
    } finally {
      setProcessing(false);
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      Operations: 'bg-blue-100 text-blue-800 border-blue-200',
      IT: 'bg-purple-100 text-purple-800 border-purple-200',
      Travel: 'bg-green-100 text-green-800 border-green-200',
      Entertainment: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      HR: 'bg-pink-100 text-pink-800 border-pink-200',
      Marketing: 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colors[category] || 'bg-muted text-foreground border-border';
  };

  if (loading) {
    return <Loading.Page />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Expense Approval"
        description="Review and approve pending expense requests"
        backUrl="/expenses"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
            <Clock className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Pending Approval</p>
            <p className="text-2xl font-bold text-foreground">{expenses.length}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(expenses.reduce((sum, e) => sum + parseFloat(e.totalAmount || e.amount || 0), 0))}
            </p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <Receipt className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">GST Claimable</p>
            <p className="text-2xl font-bold text-foreground">
              {formatCurrency(expenses.reduce((sum, e) => sum + (e.gstAmount || 0), 0))}
            </p>
          </div>
        </Card>
      </div>

      {/* Expense Cards */}
      {expenses.length === 0 ? (
        <Card>
          <EmptyState
            icon={CheckCircle}
            title="All caught up!"
            description="There are no expenses pending approval."
            actionLabel="View All Expenses"
            onAction={() => navigate('/expenses')}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {expenses.map((expense) => (
            <Card key={expense._id} className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                {/* Expense Details */}
                <div className="flex-1">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${getCategoryColor(expense.category)}`}>
                      <Receipt className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-semibold text-foreground">
                          {expense.description}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(expense.category)}`}>
                          {expense.category}
                        </span>
                      </div>
                      
                      <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          {expense.submittedBy?.name}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(expense.date)}
                        </span>
                        {expense.vendor && (
                          <span>Vendor: {expense.vendor}</span>
                        )}
                      </div>

                      {expense.notes && (
                        <p className="mt-2 text-sm text-muted-foreground bg-muted p-2 rounded">
                          {expense.notes}
                        </p>
                      )}

                      {expense.receipts?.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Attachments:</span>
                          {expense.receipts.map((receipt, idx) => (
                            <Badge key={idx} variant="default" size="sm">
                              {receipt.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Amount & Actions */}
                <div className="flex flex-col items-end gap-4">
                  <div className="text-right">
                    <p className="text-2xl font-bold text-foreground">
                      {formatCurrency(expense.amount)}
                    </p>
                    {expense.gstAmount > 0 && (
                      <p className="text-sm text-muted-foreground">
                        GST: {formatCurrency(expense.gstAmount)}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      icon={XCircle}
                      onClick={() => {
                        setSelectedExpense(expense);
                        setShowModal(true);
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      icon={CheckCircle}
                      loading={processing}
                      onClick={() => handleApprove(expense)}
                    >
                      Approve
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Rejection Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedExpense(null);
          setRejectionReason('');
        }}
        title="Reject Expense"
        description={`Rejecting: ${selectedExpense?.description}`}
      >
        <div className="space-y-4">
          <Textarea
            label="Reason for Rejection"
            placeholder="Please provide a reason for rejecting this expense..."
            rows={4}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            required
          />
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setShowModal(false);
                setSelectedExpense(null);
                setRejectionReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleReject}
              loading={processing}
            >
              Reject Expense
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ExpenseApproval;
