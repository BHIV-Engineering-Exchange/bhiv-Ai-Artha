import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Database,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
} from 'lucide-react';
import {
  PageHeader,
  Card,
  Button,
  Table,
  Badge,
  Loading,
  EmptyState,
} from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const AUTO_REFRESH_MS = 30000;

const ProvenanceBadge = ({ provenance }) => {
  if (!provenance) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {provenance.brightConnectionId && (
        <Badge variant="info" className="text-xs">
          <ExternalLink className="w-3 h-3 mr-1" />
          {provenance.brightConnectionId}
        </Badge>
      )}
      {provenance.storeName && (
        <Badge variant="secondary" className="text-xs">
          Store: {provenance.storeName}
        </Badge>
      )}
      {provenance.syncedAt && (
        <Badge variant="outline" className="text-xs">
          <Clock className="w-3 h-3 mr-1" />
          Synced: {formatDate(provenance.syncedAt)}
        </Badge>
      )}
      {provenance.migratedToArtha && (
        <Badge variant="success" className="text-xs">
          Migrated to ARTHA
        </Badge>
      )}
    </div>
  );
};

const ProvenancePanel = ({ title, provenance, rawData }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!provenance) return null;
  
  return (
    <Card className="p-4 border-blue-200 bg-blue-50">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-blue-800 flex items-center gap-2">
          <Info className="w-4 h-4" />
          {title}
        </h4>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {expanded ? 'Collapse' : 'Show Details'}
        </button>
      </div>
      
      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Connection:</span>
          <p className="font-medium">{provenance.brightConnectionId || 'N/A'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Account:</span>
          <p className="font-medium">{provenance.accountId || 'N/A'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Source Entity:</span>
          <p className="font-medium">{provenance.sourceEntity || 'N/A'}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Dataset:</span>
          <p className="font-medium">{provenance.dataset || 'N/A'}</p>
        </div>
        {provenance.storeName && (
          <div>
            <span className="text-muted-foreground">Store:</span>
            <p className="font-medium">{provenance.storeName}</p>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Synced At:</span>
          <p className="font-medium">{formatDate(provenance.syncedAt)}</p>
        </div>
        {provenance.syncRunId && (
          <div>
            <span className="text-muted-foreground">Sync Run:</span>
            <p className="font-medium text-xs">{provenance.syncRunId}</p>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Migrated:</span>
          <p className="font-medium">{provenance.migratedToArtha ? 'Yes' : 'No'}</p>
        </div>
      </div>
      
      {expanded && rawData && (
        <div className="mt-3 p-2 bg-white rounded border text-xs">
          <p className="text-muted-foreground mb-1">Raw Tally Payload:</p>
          <pre className="overflow-auto max-h-40 text-xs">
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
};

const TallyConnect = () => {
  const [parties, setParties] = useState([]);
  const [outstanding, setOutstanding] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [error, setError] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [p, o, v, s] = await Promise.all([
        api.get('/tally-connect/parties'),
        api.get('/tally-connect/outstanding', { params: overdueOnly ? { overdue: 'true' } : {} }),
        api.get('/tally-connect/vouchers'),
        api.get('/tally-connect/sync/status'),
      ]);
      setParties(p.data.data || []);
      setOutstanding(o.data.data || []);
      setVouchers(v.data.data || []);
      setSyncStatus(s.data.data || null);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Failed to load Tally data');
    } finally {
      setLoading(false);
    }
  }, [overdueOnly]);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await api.post('/tally-connect/sync/now');
      await fetchAll();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const overdueTotal = outstanding
    .filter((o) => o.daysOverdue > 0)
    .reduce((sum, o) => sum + parseFloat(o.balance || 0), 0);

  const statusVariant = syncStatus?.enabled ? 'success' : 'default';
  const lastRunStatus = syncStatus?.lastRun?.status;
  const lastRunBadge =
    lastRunStatus === 'completed' ? 'success'
    : lastRunStatus === 'partial' ? 'warning'
    : lastRunStatus === 'failed' ? 'danger' : 'default';

  if (loading) return <Loading.Page />;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Tally Connect"
        description="Bright Connection Tally data — synced read-only into ARTHA automatically"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={RefreshCw} onClick={fetchAll}>
              Refresh
            </Button>
            <Button icon={Database} onClick={syncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </Button>
          </div>
        }
      />

      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </p>
        </Card>
      )}

      {/* Provenance Panel - Show connection context */}
      <ProvenancePanel
        title="Bright Connection Tally Context"
        provenance={{
          brightConnectionId: 'bc_bright_connection_001',
          accountId: 'acct_bright_connection',
          sourceEntity: 'tally-connector',
          dataset: 'vouchers, parties, outstanding',
          syncedAt: syncStatus?.lastRun?.at,
          syncRunId: syncStatus?.lastRun?.runId || '',
          migratedToArtha: true,
        }}
        rawData={null}
      />

      {/* Sync status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Auto-Sync</p>
            <Badge variant={statusVariant}>{syncStatus?.enabled ? 'ON' : 'OFF'}</Badge>
          </div>
          <p className="mt-1 text-sm text-foreground">
            Every {syncStatus?.intervalMinutes ?? 15} min from Tally
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Last Sync</p>
          <p className="mt-1 text-sm text-foreground">
            {syncStatus?.lastRun
              ? new Date(syncStatus.lastRun.at).toLocaleString()
              : 'Never'}
          </p>
          {syncStatus?.lastRun && (
            <Badge variant={lastRunBadge} className="mt-2">
              {lastRunStatus}
              {syncStatus.lastRun.mduCount != null
                ? ` · ${syncStatus.lastRun.mduCount} records`
                : ''}
            </Badge>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Parties (Dealers)</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{parties.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Overdue Outstanding</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{formatCurrency(overdueTotal)}</p>
        </Card>
      </div>

      {/* Parties */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Parties / Dealers</h3>
          <span className="text-xs text-muted-foreground">
            New parties added in Tally appear here automatically
          </span>
        </div>
        {parties.length === 0 ? (
          <EmptyState
            icon={Database}
            title="No parties yet"
            description="Run Sync Now or wait for the next auto-sync. Requires the Tally gateway on the LAN."
          />
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Ledger / Party</Table.Head>
                <Table.Head>Type</Table.Head>
                <Table.Head>Closing Balance</Table.Head>
                <Table.Head>GSTIN</Table.Head>
                <Table.Head>Provenance</Table.Head>
                <Table.Head>Fetched</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {parties.map((p) => (
                <Table.Row key={p._id}>
                  <Table.Cell className="font-medium text-blue-600">{p.ledgerName}</Table.Cell>
                  <Table.Cell>{p.partyType || '-'}</Table.Cell>
                  <Table.Cell className="font-semibold">
                    {formatCurrency(p.closingBalance)}
                  </Table.Cell>
                  <Table.Cell className="text-muted-foreground">{p.gstin || '-'}</Table.Cell>
                  <Table.Cell>
                    <ProvenanceBadge provenance={p.provenance} />
                  </Table.Cell>
                  <Table.Cell className="text-muted-foreground">
                    {formatDate(p.fetchedAt || p.syncedAt)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>

      {/* Outstanding */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Outstanding Bills</h3>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => setOverdueOnly(e.target.checked)}
            />
            Overdue only
          </label>
        </div>
        {outstanding.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="No outstanding bills"
            description={overdueOnly ? 'Nothing overdue.' : 'No outstanding recorded yet.'}
          />
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Party</Table.Head>
                <Table.Head>Bill #</Table.Head>
                <Table.Head>Bill Date</Table.Head>
                <Table.Head>Due</Table.Head>
                <Table.Head>Days Overdue</Table.Head>
                <Table.Head>Balance</Table.Head>
                <Table.Head>Provenance</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {outstanding.map((o) => (
                <Table.Row key={o._id}>
                  <Table.Cell className="font-medium">{o.partyName}</Table.Cell>
                  <Table.Cell>{o.billNo || '-'}</Table.Cell>
                  <Table.Cell>{formatDate(o.billDate)}</Table.Cell>
                  <Table.Cell>{formatDate(o.dueDate)}</Table.Cell>
                  <Table.Cell>
                    {o.daysOverdue > 0 ? (
                      <Badge variant="danger">{o.daysOverdue}d</Badge>
                    ) : (
                      <Badge variant="success">0d</Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell className="font-semibold">
                    {formatCurrency(o.balance)}
                  </Table.Cell>
                  <Table.Cell>
                    <ProvenanceBadge provenance={o.provenance} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>

      {/* Vouchers */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Recent Vouchers</h3>
          <span className="text-xs text-muted-foreground">
            Sales, receipts &amp; payments — latest first
          </span>
        </div>
        {vouchers.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No vouchers yet"
            description="Vouchers will appear after the first sync window."
          />
        ) : (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Date</Table.Head>
                <Table.Head>Type</Table.Head>
                <Table.Head>Number</Table.Head>
                <Table.Head>Party</Table.Head>
                <Table.Head>Amount</Table.Head>
                <Table.Head>Provenance</Table.Head>
                <Table.Head>Reference</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {vouchers.slice(0, 50).map((v) => (
                <Table.Row key={v._id}>
                  <Table.Cell>{formatDate(v.date)}</Table.Cell>
                  <Table.Cell>{v.voucherType || '-'}</Table.Cell>
                  <Table.Cell>{v.voucherNumber || '-'}</Table.Cell>
                  <Table.Cell>{v.partyName || '-'}</Table.Cell>
                  <Table.Cell className="font-semibold">{formatCurrency(v.amount)}</Table.Cell>
                  <Table.Cell>
                    <ProvenanceBadge provenance={v.provenance} />
                  </Table.Cell>
                  <Table.Cell className="text-muted-foreground">{v.reference || '-'}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </Card>
    </div>
  );
};

export default TallyConnect;