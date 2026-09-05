import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone, Mail, Target, Clock, Building2, TrendingUp } from 'lucide-react';
import { PageHeader, Card, Button, Badge, Loading, ProgressBar } from '../../components/common';
import api from '../../services/api';
import { formatCurrency, formatDate } from '../../utils/formatters';

const SalesAgentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, [id]);

  const fetchDashboard = async () => {
    try {
      const res = await api.get(`/sales-agents/${id}/dashboard`);
      setDashboard(res.data.data);
    } catch (err) {
      console.error('Failed to fetch agent dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading.Page />;
  if (!dashboard) return <div className="p-8 text-center">Agent not found</div>;

  const { agent, todayStats, currentLocation, assignedDealers, visitStats, last7Days, target } = dashboard;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title={agent.name}
        description={`${agent.agentCode} - ${agent.region || 'No region'}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/agents')} icon={ArrowLeft}>Back</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Today's Visits</p>
              <p className="text-2xl font-bold">{todayStats.visitsToday}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Visits</p>
              <p className="text-2xl font-bold text-green-600">{todayStats.activeVisits}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Assigned Dealers</p>
              <p className="text-2xl font-bold">{assignedDealers}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Target Progress</p>
              <p className="text-2xl font-bold">{target.percent}%</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Agent Info</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground" />
              <span>{agent.phone || 'No phone'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <span>{agent.email || 'No email'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              <span>{agent.region || 'No region'} {agent.area ? `- ${agent.area}` : ''}</span>
            </div>
          </div>
          {currentLocation && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-1">Current Location</p>
              <p className="text-xs text-muted-foreground">
                {currentLocation.address || `${currentLocation.latitude?.toFixed(4)}, ${currentLocation.longitude?.toFixed(4)}`}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Last ping: {formatDate(currentLocation.createdAt)}
              </p>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Target</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Target Amount</span>
              <span className="font-semibold">{formatCurrency(target.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Achieved</span>
              <span className="font-semibold text-green-600">{formatCurrency(target.achieved)}</span>
            </div>
            <ProgressBar value={target.percent} className="mt-2" />
          </div>
        </Card>
      </div>

      {/* Visit Stats */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Performance Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {visitStats.map((stat) => (
            <div key={stat._id} className="text-center p-3 bg-muted/50 rounded-lg">
              <Badge variant={stat._id === 'completed' ? 'success' : stat._id === 'in-progress' ? 'warning' : 'default'} className="mb-2">
                {stat._id}
              </Badge>
              <p className="text-2xl font-bold">{stat.count}</p>
              <p className="text-xs text-muted-foreground">visits</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Last 7 Days */}
      {last7Days.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Last 7 Days</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Date</th>
                  <th className="text-right p-2">Visits</th>
                  <th className="text-right p-2">Orders</th>
                  <th className="text-right p-2">Collections</th>
                </tr>
              </thead>
              <tbody>
                {last7Days.map((day) => (
                  <tr key={day._id} className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">{day._id}</td>
                    <td className="p-2 text-right">{day.visits}</td>
                    <td className="p-2 text-right">{formatCurrency(day.orders)}</td>
                    <td className="p-2 text-right">{formatCurrency(day.collections)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SalesAgentDetail;
