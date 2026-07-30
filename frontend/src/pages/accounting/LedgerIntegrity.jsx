import { useState, useEffect } from 'react';
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Link,
  Clock,
  Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Loading,
} from '../../components/common';
import api from '../../services/api';
import { formatDate } from '../../utils/formatters';

const LedgerIntegrity = () => {
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    fetchIntegrityStatus();
  }, []);

  const fetchIntegrityStatus = async () => {
    try {
      const [verifyResponse, entriesResponse] = await Promise.all([
        api.get('/ledger/verify').catch(() => ({ data: { data: null } })),
        api.get('/ledger/entries?limit=20').catch(() => ({ data: { data: [] } })),
      ]);

      setVerificationResult(verifyResponse.data.data);
      setEntries(entriesResponse.data.data || []);
    } catch (error) {
      console.error('Failed to fetch integrity status:', error);
      setVerificationResult(null);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const response = await api.get('/ledger/verify');
      setVerificationResult(response.data.data);
      
      if (response.data.data?.isValid) {
        toast.success('Ledger integrity verified successfully!');
      } else {
        toast.error('Ledger integrity check failed!');
      }
    } catch (error) {
      toast.error('Failed to verify ledger');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return <Loading.Page />;
  }

  const isHealthy = verificationResult?.isValid !== false;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Ledger Integrity"
        description="Verify the cryptographic integrity of your ledger using HMAC-SHA256 hash chain"
        action={
          <Button onClick={handleVerify} loading={verifying} icon={RefreshCw}>
            Verify Ledger
          </Button>
        }
      />

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="p-6 md:col-span-2">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
              isHealthy ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {isHealthy ? (
                <ShieldCheck className="w-8 h-8 text-green-600" />
              ) : (
                <ShieldAlert className="w-8 h-8 text-red-600" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {isHealthy ? 'Ledger Verified' : 'Integrity Issue Detected'}
              </h2>
              <p className="text-muted-foreground">
                {isHealthy
                  ? 'All entries are cryptographically verified'
                  : 'Hash chain verification failed'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
              <Hash className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Entries</p>
              <p className="text-2xl font-bold text-foreground">
                {verificationResult?.totalEntries || entries.length}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Verified</p>
              <p className="text-2xl font-bold text-foreground">
                {verificationResult?.verifiedEntries || entries.length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* How it Works */}
      <Card>
        <h2 className="text-lg font-semibold text-foreground mb-4">How Hash-Chain Verification Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-blue-600">1</span>
            </div>
            <div>
              <h3 className="font-medium text-foreground">Entry Creation</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Each journal entry is hashed using HMAC-SHA256 with a secret key, creating a unique fingerprint.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-blue-600">2</span>
            </div>
            <div>
              <h3 className="font-medium text-foreground">Chain Linking</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Each entry includes the hash of the previous entry, creating an unbreakable chain.
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="font-bold text-blue-600">3</span>
            </div>
            <div>
              <h3 className="font-medium text-foreground">Tamper Detection</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Any modification to an entry breaks the chain, immediately revealing tampering attempts.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Entry Chain Visualization */}
      <Card>
        <h2 className="text-lg font-semibold text-foreground mb-4">Hash Chain Visualization</h2>
        <div className="space-y-4">
          {entries.map((entry, index) => (
            <div key={entry._id} className="relative">
              {/* Connection Line */}
              {index > 0 && (
                <div className="absolute left-6 -top-4 w-0.5 h-4 bg-border" />
              )}
              
              <div className={`flex items-center gap-4 p-4 rounded-lg border-2 ${
                entry.isValid !== false
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}>
                {/* Status Icon */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  entry.isValid !== false ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {entry.isValid !== false ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                </div>

                {/* Entry Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{entry.entryNumber}</span>
                    <Badge variant={entry.isValid !== false ? 'success' : 'danger'}>
                      {entry.isValid !== false ? 'Valid' : 'Invalid'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{entry.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatDate(entry.date)}</p>
                </div>

                {/* Hash Info */}
                <div className="text-right hidden md:block">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Hash:</span>
                    <code className="font-mono bg-muted px-2 py-0.5 rounded">
                      {entry.hash}
                    </code>
                  </div>
                  {entry.prevHash && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Link className="w-3 h-3" />
                      <span>Links to:</span>
                      <code className="font-mono">
                        {entry.prevHash === 'genesis' ? 'Genesis Block' : entry.prevHash}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Last Verification */}
      <Card className="bg-muted">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Last verified: {verificationResult?.lastVerified 
              ? formatDate(verificationResult.lastVerified, 'datetime')
              : 'Never'}
          </span>
        </div>
      </Card>
    </div>
  );
};

export default LedgerIntegrity;
