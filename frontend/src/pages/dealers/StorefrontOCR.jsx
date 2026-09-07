import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Upload,
  X,
  CheckCircle,
  AlertCircle,
  Loader2,
  Store,
  MapPin,
  User,
  FileText,
  RotateCcw,
  Eye,
  ChevronDown,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, Card, Button } from '../../components/common';
import api from '../../services/api';

const StorefrontOCR = () => {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [mode, setMode] = useState('idle'); // idle | camera | preview | processing | done
  const [capturedImage, setCapturedImage] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [dealers, setDealers] = useState([]);
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [dealerSearch, setDealerSearch] = useState('');
  const [showDealerDropdown, setShowDealerDropdown] = useState(false);
  const [shopDetails, setShopDetails] = useState({
    name: '',
    address: '',
    phone: '',
    gstin: '',
  });
  const [saving, setSaving] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  useEffect(() => {
    fetchDealers();
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const fetchDealers = async () => {
    try {
      const res = await api.get('/dealers');
      setDealers(res.data?.data || res.data || []);
    } catch (err) {
      console.error('Failed to fetch dealers:', err);
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setMode('camera');
    } catch (err) {
      setCameraError('Camera access denied or not available. You can upload an image instead.');
      console.error('Camera error:', err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(dataUrl);
    stopCamera();
    setMode('preview');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCapturedImage(ev.target.result);
      setMode('preview');
    };
    reader.readAsDataURL(file);
  };

  const processOCR = async () => {
    if (!capturedImage) return;
    setMode('processing');
    try {
      const base64 = capturedImage.split(',')[1];
      const res = await api.post('/storefront/ocr', {
        image: base64,
        mimeType: 'image/jpeg',
      });
      const data = res.data?.data || res.data;
      setOcrResult(data);
      setShopDetails({
        name: data.shopName || '',
        address: data.address || '',
        phone: data.phone || '',
        gstin: data.gstin || '',
      });
      if (data.dealerId) {
        const matched = dealers.find((d) => d._id === data.dealerId);
        if (matched) setSelectedDealer(matched);
      }
      setMode('done');
      toast.success('OCR processing complete');
    } catch (err) {
      console.error('OCR failed:', err);
      toast.error(err.response?.data?.message || 'OCR processing failed');
      setMode('preview');
    }
  };

  const handleSave = async () => {
    if (!selectedDealer) {
      toast.error('Please select a dealer');
      return;
    }
    setSaving(true);
    try {
      await api.post('/storefront/verify', {
        dealerId: selectedDealer._id,
        shopName: shopDetails.name,
        address: shopDetails.address,
        phone: shopDetails.phone,
        gstin: shopDetails.gstin,
        image: capturedImage,
        ocrConfidence: ocrResult?.confidence || 0,
      });
      toast.success('Storefront verified and saved');
      navigate(`/dealers/${selectedDealer._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setCapturedImage(null);
    setOcrResult(null);
    setShopDetails({ name: '', address: '', phone: '', gstin: '' });
    setSelectedDealer(null);
    setMode('idle');
  };

  const filteredDealers = dealers.filter((d) => {
    const q = dealerSearch.toLowerCase();
    return (
      d.name?.toLowerCase().includes(q) ||
      d.shopName?.toLowerCase().includes(q) ||
      d.code?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Storefront OCR"
        subtitle="Capture shop signage to verify and update dealer information"
        icon={Store}
        action={
          mode !== 'idle' && (
            <Button variant="outline" onClick={reset} icon={RotateCcw}>
              Start Over
            </Button>
          )
        }
      />

      {mode === 'idle' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-8 text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={startCamera}>
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Capture with Camera</h3>
            <p className="text-sm text-muted-foreground">
              Use your device camera to photograph the shop signage
            </p>
          </Card>

          <Card className="p-8 text-center hover:shadow-lg transition-shadow cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Upload Image</h3>
            <p className="text-sm text-muted-foreground">
              Upload a previously captured photo of the shop
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </Card>
        </div>
      )}

      {mode === 'camera' && (
        <Card className="overflow-hidden">
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-[500px] object-cover bg-black"
            />
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
              <button
                onClick={capturePhoto}
                className="w-16 h-16 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <div className="w-12 h-12 border-4 border-primary rounded-full" />
              </button>
              <button
                onClick={() => { stopCamera(); setMode('idle'); }}
                className="w-12 h-12 bg-red-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          {cameraError && (
            <div className="p-4 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {cameraError}
            </div>
          )}
        </Card>
      )}

      {(mode === 'preview' || mode === 'processing' || mode === 'done') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-border/50 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Captured Image</h3>
              {mode !== 'processing' && (
                <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">
                  Retake
                </button>
              )}
            </div>
            <div className="relative">
              <img src={capturedImage} alt="Shop signage" className="w-full object-cover max-h-[400px]" />
              {mode === 'processing' && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="flex items-center gap-3 text-white">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Processing OCR...</span>
                  </div>
                </div>
              )}
            </div>
            {mode === 'preview' && (
              <div className="p-4 border-t border-border/50">
                <Button onClick={processOCR} className="w-full" icon={Eye}>
                  Process with OCR
                </Button>
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold text-foreground mb-3">Associate with Dealer</h3>
              <div className="relative">
                <button
                  onClick={() => setShowDealerDropdown(!showDealerDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-muted rounded-xl text-sm text-left"
                >
                  <span className={selectedDealer ? 'text-foreground' : 'text-muted-foreground'}>
                    {selectedDealer ? `${selectedDealer.name} (${selectedDealer.code || ''})` : 'Select dealer...'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                {showDealerDropdown && (
                  <div className="absolute z-20 w-full mt-1 bg-card border border-border rounded-xl shadow-lg max-h-60 overflow-auto">
                    <div className="sticky top-0 bg-card p-2 border-b border-border/50">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search dealers..."
                          value={dealerSearch}
                          onChange={(e) => setDealerSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-muted rounded-lg text-sm"
                          autoFocus
                        />
                      </div>
                    </div>
                    {filteredDealers.map((dealer) => (
                      <button
                        key={dealer._id}
                        onClick={() => {
                          setSelectedDealer(dealer);
                          setShowDealerDropdown(false);
                          setDealerSearch('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2"
                      >
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span>{dealer.name}</span>
                        {dealer.code && <span className="text-muted-foreground">({dealer.code})</span>}
                      </button>
                    ))}
                    {filteredDealers.length === 0 && (
                      <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                        No dealers found
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold text-foreground mb-3">Shop Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Shop Name</label>
                  <input
                    type="text"
                    value={shopDetails.name}
                    onChange={(e) => setShopDetails({ ...shopDetails, name: e.target.value })}
                    className="w-full px-3 py-2 bg-muted rounded-xl text-sm"
                    placeholder="Extracted from OCR"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Address</label>
                  <textarea
                    value={shopDetails.address}
                    onChange={(e) => setShopDetails({ ...shopDetails, address: e.target.value })}
                    className="w-full px-3 py-2 bg-muted rounded-xl text-sm resize-none"
                    rows={2}
                    placeholder="Extracted from OCR"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
                    <input
                      type="text"
                      value={shopDetails.phone}
                      onChange={(e) => setShopDetails({ ...shopDetails, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-sm"
                      placeholder="Extracted from OCR"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">GSTIN</label>
                    <input
                      type="text"
                      value={shopDetails.gstin}
                      onChange={(e) => setShopDetails({ ...shopDetails, gstin: e.target.value })}
                      className="w-full px-3 py-2 bg-muted rounded-xl text-sm"
                      placeholder="Extracted from OCR"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {ocrResult && (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">OCR Results</h3>
                  {ocrResult.confidence != null && (
                    <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">
                      {Math.round(ocrResult.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                {ocrResult.rawText && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      View raw extracted text
                    </summary>
                    <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40 whitespace-pre-wrap">
                      {ocrResult.rawText}
                    </pre>
                  </details>
                )}
              </Card>
            )}

            <Button
              onClick={handleSave}
              disabled={!selectedDealer || saving}
              className="w-full"
              icon={saving ? Loader2 : CheckCircle}
              loading={saving}
            >
              {saving ? 'Saving...' : 'Save & Verify Storefront'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StorefrontOCR;
