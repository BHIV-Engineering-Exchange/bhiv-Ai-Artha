import { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Clock, Battery, Signal, RefreshCw, Filter } from 'lucide-react';
import { PageHeader, Card, Button, Table, Badge, Select, Loading, EmptyState } from '../../components/common';
import api from '../../services/api';
import { formatDate } from '../../utils/formatters';

const NiyantranLocation = () => {
  const [locations, setLocations] = useState([]);
  const [activeVisits, setActiveVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const mapRef = useRef(null);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [locRes, visitRes] = await Promise.all([
        api.get('/niyantran/agents/location'),
        api.get('/niyantran/visits/active'),
      ]);
      setLocations(locRes.data.data || []);
      setActiveVisits(visitRes.data.data || []);
    } catch (err) {
      console.error('Failed to fetch location data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const isOnline = (lastPing) => {
    if (!lastPing) return false;
    return (Date.now() - new Date(lastPing).getTime()) < 30 * 60 * 1000;
  };

  const getBatteryColor = (level) => {
    if (level === null) return 'text-muted-foreground';
    if (level > 60) return 'text-green-600';
    if (level > 20) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredLocations = locations.filter((loc) => {
    if (filter === 'online') return isOnline(loc.lastPing);
    if (filter === 'at-dealer') return loc.isAtDealer;
    if (filter === 'offline') return !isOnline(loc.lastPing);
    return true;
  });

  if (loading) return <Loading.Page />;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Niyantran - Live Location Tracking"
        description="Track sales agents in real-time across Bright Connection territories"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleRefresh} icon={RefreshCw} className={refreshing ? 'animate-spin' : ''}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Agents</p>
              <p className="text-2xl font-bold">{locations.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
              <Navigation className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Online Now</p>
              <p className="text-2xl font-bold text-green-600">
                {locations.filter((l) => isOnline(l.lastPing)).length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">At Dealer</p>
              <p className="text-2xl font-bold text-purple-600">
                {locations.filter((l) => l.isAtDealer).length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active Visits</p>
              <p className="text-2xl font-bold text-orange-600">{activeVisits.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter */}
      <Card className="p-4">
        <div className="flex gap-2">
          {['all', 'online', 'at-dealer', 'offline'].map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'primary' : 'secondary'}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f.replace('-', ' ')}
            </Button>
          ))}
        </div>
      </Card>

      {/* Agent Locations Table */}
      {filteredLocations.length === 0 ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="No agent locations"
            description="Agents will appear here once they start sending GPS pings from the Niyantran app."
          />
        </Card>
      ) : (
        <Card padding={false}>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.Head>Agent</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Location</Table.Head>
                <Table.Head>At Dealer</Table.Head>
                <Table.Head>Battery</Table.Head>
                <Table.Head>Network</Table.Head>
                <Table.Head>Last Seen</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredLocations.map((loc) => (
                <Table.Row key={loc._id}>
                  <Table.Cell>
                    <div>
                      <p className="font-medium">{loc.agentName}</p>
                      <p className="text-xs text-muted-foreground">
                        {loc.latitude?.toFixed(4)}, {loc.longitude?.toFixed(4)}
                      </p>
                    </div>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant={isOnline(loc.lastPing) ? 'success' : 'danger'}>
                      {isOnline(loc.lastPing) ? 'Online' : 'Offline'}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell className="max-w-xs truncate">{loc.address || 'No address'}</Table.Cell>
                  <Table.Cell>
                    {loc.isAtDealer ? (
                      <Badge variant="info">{loc.dealerName || 'At Dealer'}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <span className={`flex items-center gap-1 ${getBatteryColor(loc.batteryLevel)}`}>
                      <Battery className="w-4 h-4" />
                      {loc.batteryLevel !== null ? `${loc.batteryLevel}%` : '?'}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <span className="flex items-center gap-1">
                      <Signal className="w-4 h-4" />
                      {loc.networkType || 'unknown'}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="text-sm text-muted-foreground">
                    {formatDate(loc.lastPing)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Card>
      )}

      {/* Active Visits */}
      {activeVisits.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold mb-4">Active Visits</h3>
          <div className="space-y-3">
            {activeVisits.map((visit) => (
              <div key={visit._id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">{visit.agentName}</p>
                  <p className="text-sm text-muted-foreground">at {visit.dealerName || 'Unknown'}</p>
                </div>
                <div className="text-right">
                  <Badge variant="warning">In Progress</Badge>
                  <p className="text-xs text-muted-foreground mt-1">
                    Since {formatDate(visit.checkIn?.time)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default NiyantranLocation;
