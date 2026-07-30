import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Save, Check, AlertCircle } from 'lucide-react';
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

const lineSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  debit: z.number().min(0),
  credit: z.number().min(0),
  description: z.string().optional(),
});

const entrySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(3, 'Description is required'),
  reference: z.string().optional(),
  lines: z.array(lineSchema).min(2, 'At least 2 lines required'),
});

const JournalEntryCreate = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [entryStatus, setEntryStatus] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
      description: '',
      reference: '',
      lines: [
        { accountId: '', debit: 0, credit: 0, description: '' },
        { accountId: '', debit: 0, credit: 0, description: '' },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  });

  const watchLines = watch('lines');

  useEffect(() => {
    fetchAccounts();
    if (isEditing) {
      fetchEntry();
    }
  }, [id]);

  const fetchAccounts = async () => {
    try {
      const response = await api.get('/accounts');
      setAccounts(response.data.data || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      toast.error('Failed to load chart of accounts');
      setAccounts([]);
    }
  };

  const fetchEntry = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/ledger/entries/${id}`);
      const entry = response.data.data;
      setEntryStatus(entry.status);
      setValue('date', entry.date?.split('T')[0] || '');
      setValue('description', entry.description);
      setValue('reference', entry.reference || '');
      if (entry.lines?.length) {
        setValue('lines', entry.lines.map(l => ({
          accountId: l.accountId || l.account?._id || '',
          debit: l.debit || 0,
          credit: l.credit || 0,
          description: l.description || '',
        })));
      }
    } catch (error) {
      toast.error('Failed to fetch entry');
      navigate('/journal-entries');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = () => {
    let totalDebit = 0;
    let totalCredit = 0;

    watchLines?.forEach((line) => {
      totalDebit += Number(line.debit) || 0;
      totalCredit += Number(line.credit) || 0;
    });

    return {
      totalDebit,
      totalCredit,
      isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
      difference: totalDebit - totalCredit,
    };
  };

  const totals = calculateTotals();

  const accountOptions = accounts.map((acc) => ({
    value: acc._id,
    label: `${acc.code} - ${acc.name}`,
  }));

  const onSubmit = async (data) => {
    if (!totals.isBalanced) {
      toast.error('Entry must be balanced (Debits = Credits)');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: data.date,
        description: data.description,
        reference: data.reference,
        lines: data.lines.map((line) => ({
          account: line.accountId,
          debit: Number(line.debit) || 0,
          credit: Number(line.credit) || 0,
          description: line.description,
        })),
      };

      if (isEditing) {
        await api.put(`/ledger/entries/${id}`, payload);
        toast.success('Entry updated successfully');
      } else {
        await api.post('/ledger/entries', payload);
        toast.success('Entry created successfully');
      }
      navigate('/journal-entries');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async () => {
    if (!totals.isBalanced) {
      toast.error('Cannot post unbalanced entry');
      return;
    }

    setSaving(true);
    try {
      await api.post(`/ledger/entries/${id}/post`);
      toast.success('Entry posted successfully');
      navigate('/journal-entries');
    } catch (error) {
      toast.error('Failed to post entry');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading.Page />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title={isEditing ? 'Edit Journal Entry' : 'New Journal Entry'}
        description="Create a double-entry transaction"
        backUrl="/journal-entries"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Entry Header */}
        <Card>
          <h2 className="text-lg font-semibold text-foreground mb-4">Entry Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Date"
              type="date"
              error={errors.date?.message}
              required
              {...register('date')}
            />
            <Input
              label="Reference"
              placeholder="Optional reference number"
              {...register('reference')}
            />
            <div className="md:col-span-3">
              <Textarea
                label="Description"
                placeholder="Describe this transaction"
                error={errors.description?.message}
                rows={2}
                required
                {...register('description')}
              />
            </div>
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
              onClick={() => append({ accountId: '', debit: 0, credit: 0, description: '' })}
            >
              Add Line
            </Button>
          </div>

          {errors.lines?.message && (
            <p className="text-sm text-red-600 mb-4">{errors.lines.message}</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase py-3 pr-4">
                    Account
                  </th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase py-3 px-2 w-40">
                    Description
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase py-3 px-2 w-36">
                    Debit
                  </th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase py-3 px-2 w-36">
                    Credit
                  </th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id} className="border-b border-border/50">
                    <td className="py-3 pr-4">
                      <Select
                        placeholder="Select account"
                        options={accountOptions}
                        error={errors.lines?.[index]?.accountId?.message}
                        {...register(`lines.${index}.accountId`)}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <Input
                        placeholder="Line description"
                        {...register(`lines.${index}.description`)}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="text-right"
                        {...register(`lines.${index}.debit`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="py-3 px-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="text-right"
                        {...register(`lines.${index}.credit`, { valueAsNumber: true })}
                      />
                    </td>
                    <td className="py-3 pl-2">
                      {fields.length > 2 && (
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
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td colSpan={2} className="py-3 pr-4 text-right font-semibold text-foreground">
                    Totals
                  </td>
                  <td className="py-3 px-2 text-right font-mono font-semibold text-foreground">
                    {formatCurrency(totals.totalDebit)}
                  </td>
                  <td className="py-3 px-2 text-right font-mono font-semibold text-foreground">
                    {formatCurrency(totals.totalCredit)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Balance Indicator */}
          <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
            totals.isBalanced 
              ? 'bg-green-50 text-green-700' 
              : 'bg-red-50 text-red-700'
          }`}>
            {totals.isBalanced ? (
              <>
                <Check className="w-5 h-5" />
                <span className="font-medium">Entry is balanced</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5" />
                <span className="font-medium">
                  Entry is unbalanced by {formatCurrency(Math.abs(totals.difference))}
                </span>
              </>
            )}
          </div>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/journal-entries')}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving} icon={Save}>
            Save as Draft
          </Button>
          {isEditing && entryStatus !== 'POSTED' && entryStatus !== 'posted' && (
            <Button
              type="button"
              variant="success"
              loading={saving}
              icon={Check}
              onClick={handlePost}
              disabled={!totals.isBalanced}
            >
              Post Entry
            </Button>
          )}
          {isEditing && (entryStatus === 'POSTED' || entryStatus === 'posted') && (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-success/10 text-success text-sm font-medium">
              <Check className="w-4 h-4" />
              Already Posted
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

export default JournalEntryCreate;
