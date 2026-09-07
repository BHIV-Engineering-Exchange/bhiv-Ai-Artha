import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, Clock, Battery, Signal, RefreshCw, List, Map } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PageHeader, Card, Button, Table, Badge, Loading, EmptyState } from '../../components/common';
import api from '../../services/api';
import { formatDate } from '../../utils/formatters';

const AGENT_ICON = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const AGENT_OFFLINE_ICON = L.divIcon({
  className: '',
  html: `<div style="width:32px;height:32px;background:#9ca3af;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  </div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const DEALER_ICON = L.divIcon({
  className: '',
  html: `<div style="width:28px;height:28px;background:#f59e0b;border-radius:6px;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>
  </div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }, [bounds, map]);
  return null;
}

function MapLegend() {
  return (
    <div className="absolute bottom-4 left-4 z-[1000] bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold mb-2">Legend</p>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
        <span>Agent (Online)</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <div className="w-3 h-3 rounded-full bg-gray-400"></div>
        <span>Agent (Offline)</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded bg-amber-500"></div>
        <span>Dealer</span>
      </div>
    </div>
  );
}

const NiyantranLocation = () => {
  const [locations, setLocations] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [activeVisits, setActiveVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState('map');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [locRes, visitRes, dealerRes] = await Promise.all([
        api.get('/niyantran/agents/location'),
        api.get('/niyantran/visits/active'),
        api.get('/dealers').catch(() => ({ data: { data: [] } })),
      ]);
      setLocations(locRes.data.data || locRes.data.locations || []);
      setActiveVisits(visitRes.data.data || visitRes.data.visits || []);
      setDealers(dealerRes.data.dealers || dealerRes.data.data || []);
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

  const mapBounds = [
    ...filteredLocations
      .filter((l) => l.latitude && l.longitude)
      .map((l) => [l.latitude, l.longitude]),
    ...dealers
      .filter((d) => d.latitude && d.longitude)
      .map((d) => [d.latitude, d.longitude]),
  ];

  const defaultCenter = [19.076, 72.8777];
  const center = mapBounds.length > 0 ? mapBounds[0] : defaultCenter;

  if (loading) return <Loading.Page />;

  return (
    <div className="space-y-6 animate-fadeIn">
      <PageHeader
        title="Niyantran - Live Location Tracking"
        description="Track sales agents and dealers on the map in real-time"
        action={
          <div className="flex gap-2">
            <div className="flex bg-muted rounded-lg p-1">
              <button
                onClick={() => setView('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === 'map' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Map className="w-4 h-4" /> Map
              </button>
              <button
                onClick={() => setView('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  view === 'table' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="w-4 h-4" /> Table
              </button>
            </div>
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

      {/* Map View */}
      {view === 'map' && (
        <Card padding={false} className="overflow-hidden">
          {mapBounds.length === 0 ? (
            <div className="h-[500px] flex items-center justify-center bg-muted/20">
              <EmptyState
                icon={MapPin}
                title="No locations to display"
                description="Agents will appear on the map once they start sending GPS pings."
              />
            </div>
          ) : (
            <div className="relative">
              <MapContainer
                center={center}
                zoom={12}
                style={{ height: '500px', width: '100%' }}
                scrollWheelZoom={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds bounds={mapBounds} />

                {filteredLocations
                  .filter((l) => l.latitude && l.longitude)
                  .map((loc) => (
                    <Marker
                      key={`agent-${loc._id}`}
                      position={[loc.latitude, loc.longitude]}
                      icon={isOnline(loc.lastPing) ? AGENT_ICON : AGENT_OFFLINE_ICON}
                    >
                      <Popup>
                        <div className="min-w-[200px]">
                          <p className="font-semibold text-sm">{loc.agentName}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {isOnline(loc.lastPing) ? '🟢 Online' : '🔴 Offline'}
                          </p>
                          {loc.isAtDealer && (
                            <p className="text-xs text-purple-600 mt-1">
                              📍 At: {loc.dealerName || 'Dealer'}
                            </p>
                          )}
                          {loc.address && (
                            <p className="text-xs text-gray-500 mt-1">{loc.address}</p>
                          )}
                          <div className="flex gap-3 mt-2 text-xs text-gray-500">
                            {loc.batteryLevel !== null && (
                              <span>🔋 {loc.batteryLevel}%</span>
                            )}
                            {loc.networkType && (
                              <span>📶 {loc.networkType}</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            Last seen: {formatDate(loc.lastPing)}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  ))}

                {dealers
                  .filter((d) => d.latitude && d.longitude)
                  .map((dealer) => (
                    <Marker
                      key={`dealer-${dealer._id}`}
                      position={[dealer.latitude, dealer.longitude]}
                      icon={DEALER_ICON}
                    >
                      <Popup>
                        <div className="min-w-[180px]">
                          <p className="font-semibold text-sm">{dealer.name}</p>
                          <p className="text-xs text-gray-500 mt-1">{dealer.address || 'No address'}</p>
                          {dealer.region && (
                            <p className="text-xs text-amber-600 mt-1">📍 {dealer.region}</p>
                          )}
                          {dealer.contactPerson && (
                            <p className="text-xs text-gray-500 mt-1">👤 {dealer.contactPerson}</p>
                          )}
                          {dealer.phone && (
                            <p className="text-xs text-gray-500">📞 {dealer.phone}</p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
              </MapContainer>
              <MapLegend />
            </div>
          )}
        </Card>
      )}

      {/* Table View */}
      {view === 'table' && (
        <>
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
        </>
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
