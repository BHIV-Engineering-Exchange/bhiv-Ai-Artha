import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserPlus, Mail, Lock, User, Phone, ArrowLeft, Shield, Key } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';

const ROLES = [
  { value: 'viewer', label: 'Viewer', description: 'View reports and dashboards', requiresCode: false },
  { value: 'accountant', label: 'Accountant', description: 'Manage invoices, expenses, and reconciliation', requiresCode: true },
  { value: 'admin', label: 'Admin', description: 'Full access including user management', requiresCode: true },
];

const Signup = () => {
  const navigate = useNavigate();
  const { checkAuth } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer');
  const [activationCode, setActivationCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const selectedRole = ROLES.find((r) => r.value === role);
  const showActivationCode = selectedRole?.requiresCode;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!name.trim()) next.name = 'Name is required';
    if (!email.trim()) next.email = 'Email is required';
    if (!password || password.length < 8) next.password = 'At least 8 characters';
    if (showActivationCode && !activationCode.trim()) next.activationCode = 'Activation code is required';
    if (Object.keys(next).length) {
      setFieldErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password,
        role,
      };
      if (showActivationCode) {
        payload.activationCode = activationCode.trim();
      }
      await api.post('/auth/signup', payload);
      await checkAuth();
      toast.success(`Account created as ${selectedRole.label}`);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Signup failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fadeIn">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-foreground">Create your Artha account</h1>
        <p className="text-muted-foreground mt-2">Sign up with email and password.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Link>

        <Input
          label="Full name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: '' }));
          }}
          error={fieldErrors.name}
          icon={User}
          autoComplete="name"
          autoFocus
        />

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: '' }));
          }}
          error={fieldErrors.email}
          icon={Mail}
          autoComplete="email"
        />

        <Input
          label="Phone (optional)"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          icon={Phone}
          autoComplete="tel"
        />

        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: '' }));
          }}
          error={fieldErrors.password}
          icon={Lock}
          autoComplete="new-password"
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              Account Type
            </span>
          </label>
          <div className="grid grid-cols-1 gap-2">
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => {
                  setRole(r.value);
                  if (!r.requiresCode) setActivationCode('');
                  if (fieldErrors.activationCode) setFieldErrors((p) => ({ ...p, activationCode: '' }));
                }}
                className={`flex items-start gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  role === r.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30 hover:bg-muted/50'
                }`}
              >
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  role === r.value ? 'border-primary' : 'border-muted-foreground/30'
                }`}>
                  {role === r.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{r.label}</div>
                  <div className="text-xs text-muted-foreground">{r.description}</div>
                  {r.requiresCode && (
                    <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      Requires activation code
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {showActivationCode && (
          <div className="animate-fadeIn">
            <Input
              label="Activation Code"
              value={activationCode}
              onChange={(e) => {
                setActivationCode(e.target.value);
                if (fieldErrors.activationCode) setFieldErrors((p) => ({ ...p, activationCode: '' }));
              }}
              error={fieldErrors.activationCode}
              icon={Key}
              placeholder="e.g. #BHIVATH01"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Contact your administrator for an activation code.
            </p>
          </div>
        )}

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          <span className="inline-flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Create {selectedRole?.label || ''} Account
          </span>
        </Button>
      </form>
    </div>
  );
};

export default Signup;
