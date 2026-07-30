import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { UserPlus, Mail, Lock, User, Phone, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';

const Signup = () => {
  const navigate = useNavigate();
  const { checkAuth } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!name.trim()) next.name = 'Name is required';
    if (!email.trim()) next.email = 'Email is required';
    if (!password || password.length < 6) next.password = 'At least 6 characters';
    if (Object.keys(next).length) {
      setFieldErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/signup', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password,
      });
      await checkAuth();
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

        <Button type="submit" loading={submitting} className="w-full" size="lg">
          <span className="inline-flex items-center gap-2">
            <UserPlus className="w-4 h-4" />
            Create account
          </span>
        </Button>
      </form>
    </div>
  );
};

export default Signup;
