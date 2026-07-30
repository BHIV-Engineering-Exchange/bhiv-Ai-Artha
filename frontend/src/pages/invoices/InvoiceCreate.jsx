import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Save, Send, Calculator } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  Button,
  Input,
  Select,
  Textarea,
  Loading,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency } from '../../utils/formatters';

const lineItemSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  rate: z.number().min(0, 'Rate must be positive'),
  gstRate: z.number().min(0).max(28),
});

const invoiceSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  customerEmail: z.string().email('Invalid email').optional().or(z.literal('')),
  customerAddress: z.string().optional(),
  customerGSTN: z.string().optional(),
  invoiceDate: z.string().min(1, 'Invoice date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().optional(),
  terms: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1, 'At least one item is required'),
});

const InvoiceCreate = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      customerName: '',
      customerEmail: '',
      customerAddress: '',
      customerGSTN: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
      terms: 'Payment is due within 30 days of invoice date.',
      lineItems: [{ description: '', quantity: 1, rate: 0, gstRate: 18 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lineItems',
  });

  const watchLineItems = watch('lineItems');

  useEffect(() => {
    if (isEditing) {
      fetchInvoice();
    }
  }, [id]);

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/invoices/${id}`);
      const invoice = response.data.data;
      setValue('customerName', invoice.customerName || invoice.customer?.name || '');
      setValue('customerEmail', invoice.customerEmail || invoice.customer?.email || '');
      setValue('customerAddress', invoice.customerAddress || invoice.customer?.address || '');
      setValue('customerGSTN', invoice.customerGSTIN || invoice.customer?.gstn || '');
      setValue('invoiceDate', invoice.invoiceDate?.split('T')[0] || '');
      setValue('dueDate', invoice.dueDate?.split('T')[0] || '');
      setValue('notes', invoice.notes || '');
      setValue('terms', invoice.terms || '');
      const lineItems = invoice.items || invoice.lines || invoice.lineItems || [];
      if (lineItems.length) {
        setValue('lineItems', lineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.unitPrice || item.rate,
          gstRate: item.taxRate || item.gstRate || 0,
          amount: item.amount,
        })));
      }
    } catch (error) {
      toast.error('Failed to fetch invoice');
      navigate('/invoices');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = () => {
    let subtotal = 0;
    let totalGst = 0;

    watchLineItems?.forEach((item) => {
      const itemTotal = (item.quantity || 0) * (item.rate || 0);
      const itemGst = (itemTotal * (item.gstRate || 0)) / 100;
      subtotal += itemTotal;
      totalGst += itemGst;
    });

    return {
      subtotal,
      totalGst,
      cgst: totalGst / 2,
      sgst: totalGst / 2,
      total: subtotal + totalGst,
    };
  };

  const totals = calculateTotals();

  const onSubmit = async (data) => {
    setSaving(true);
    try {
      const payload = {
        customerName: data.customerName,
        customerEmail: data.customerEmail || '',
        customerAddress: data.customerAddress || '',
        customerGSTIN: data.customerGSTN || '',
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate,
        items: data.lineItems.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: String(item.rate),
          amount: String(item.quantity * item.rate),
          taxRate: item.gstRate,
        })),
        notes: data.notes || '',
        terms: data.terms || '',
        subtotal: String(totals.subtotal.toFixed(2)),
        taxAmount: String(totals.totalGst.toFixed(2)),
        totalAmount: String(totals.total.toFixed(2)),
      };

      if (isEditing) {
        const response = await api.put(`/invoices/${id}`, payload);
        toast.success('Invoice updated successfully');
      } else {
        const response = await api.post('/invoices', payload);
        toast.success('Invoice created successfully');
      }
      navigate('/invoices');
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || 'Failed to save invoice';
      toast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const gstOptions = [
    { value: 0, label: '0%' },
    { value: 5, label: '5%' },
    { value: 12, label: '12%' },
    { value: 18, label: '18%' },
    { value: 28, label: '28%' },
  ];

  if (loading) {
    return <Loading.Page />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title={isEditing ? 'Edit Invoice' : 'Create Invoice'}
        description={isEditing ? 'Update invoice details' : 'Create a new invoice for your customer'}
        backUrl="/invoices"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Customer Details */}
        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">Customer Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Customer Name"
              placeholder="Enter customer name"
              error={errors.customerName?.message}
              required
              {...register('customerName')}
            />
            <Input
              label="Email"
              type="email"
              placeholder="customer@example.com"
              error={errors.customerEmail?.message}
              {...register('customerEmail')}
            />
            <Input
              label="GSTN"
              placeholder="22AAAAA0000A1Z5"
              {...register('customerGSTN')}
            />
            <div className="md:col-span-2">
              <Textarea
                label="Address"
                placeholder="Enter customer address"
                rows={2}
                {...register('customerAddress')}
              />
            </div>
          </div>
        </Card>

        {/* Invoice Details */}
        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">Invoice Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Invoice Date"
              type="date"
              error={errors.invoiceDate?.message}
              required
              {...register('invoiceDate')}
            />
            <Input
              label="Due Date"
              type="date"
              error={errors.dueDate?.message}
              required
              {...register('dueDate')}
            />
          </div>
        </Card>

        {/* Line Items */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Line Items</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => append({ description: '', quantity: 1, rate: 0, gstRate: 18 })}
            >
              Add Item
            </Button>
          </div>

          {errors.lineItems?.message && (
            <p className="text-sm text-red-600 mb-4">{errors.lineItems.message}</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase py-3 pr-4">
                    Description
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase py-3 px-2 w-24">
                    Qty
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase py-3 px-2 w-32">
                    Rate
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase py-3 px-2 w-24">
                    GST
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase py-3 px-2 w-32">
                    Amount
                  </th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const quantity = watchLineItems?.[index]?.quantity || 0;
                  const rate = watchLineItems?.[index]?.rate || 0;
                  const gstRate = watchLineItems?.[index]?.gstRate || 0;
                  const amount = quantity * rate;
                  const gstAmount = (amount * gstRate) / 100;

                  return (
                    <tr key={field.id} className="border-b border-border">
                      <td className="py-3 pr-4">
                        <Input
                          placeholder="Item description"
                          error={errors.lineItems?.[index]?.description?.message}
                          {...register(`lineItems.${index}.description`)}
                        />
                      </td>
                      <td className="py-3 px-2">
                        <Input
                          type="number"
                          min="1"
                          {...register(`lineItems.${index}.quantity`, { valueAsNumber: true })}
                        />
                      </td>
                      <td className="py-3 px-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          {...register(`lineItems.${index}.rate`, { valueAsNumber: true })}
                        />
                      </td>
                      <td className="py-3 px-2">
                        <select
                          className="block w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                          {...register(`lineItems.${index}.gstRate`, { valueAsNumber: true })}
                        >
                          {gstOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-2 text-right font-medium">
                        {formatCurrency(amount + gstAmount)}
                      </td>
                      <td className="py-3 pl-2">
                        {fields.length > 1 && (
                          <button
                            type="button"
                            onClick={() => remove(index)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">CGST</span>
                <span className="font-medium">{formatCurrency(totals.cgst)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">SGST</span>
                <span className="font-medium">{formatCurrency(totals.sgst)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold border-t border-border pt-2">
                <span>Total</span>
                <span className="text-blue-600">{formatCurrency(totals.total)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Notes & Terms */}
        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">Additional Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label="Notes"
              placeholder="Notes visible to customer"
              rows={3}
              {...register('notes')}
            />
            <Textarea
              label="Terms & Conditions"
              placeholder="Payment terms and conditions"
              rows={3}
              {...register('terms')}
            />
          </div>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/invoices')}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving} icon={Save}>
            {isEditing ? 'Update Invoice' : 'Create Invoice'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default InvoiceCreate;
