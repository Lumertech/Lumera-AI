import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { PlayCircle, Sparkles, AlertTriangle, CheckCircle2, Volume2 } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const SAMPLE_TEXT = {
  en: 'Hello! Thank you for calling Lumera Clinic. How may I help you today?',
  hi: 'नमस्ते! लुमेरा क्लिनिक में कॉल करने के लिए धन्यवाद। मैं आपकी क्या मदद कर सकता हूं?',
  mr: 'नमस्कार! लुमेरा क्लिनिकला फोन केल्याबद्दल धन्यवाद. मी तुमची कशी मदत करू शकतो?',
  ta: 'வணக்கம்! லுமேரா கிளினிக்கை அழைத்ததற்கு நன்றி. நான் எப்படி உதவ முடியும்?',
  te: 'నమస్కారం! లుమేరా క్లినిక్‌కు కాల్ చేసినందుకు ధన్యవాదాలు. నేను ఎలా సహాయపడగలను?',
  bn: 'নমস্কার! লুমেরা ক্লিনিকে কল করার জন্য ধন্যবাদ। আমি কীভাবে সাহায্য করতে পারি?',
  gu: 'નમસ્તે! લુમેરા ક્લિનિકને કૉલ કરવા બદલ આભાર. હું કેવી રીતે મદદ કરી શકું?',
  kn: 'ನಮಸ್ಕಾರ! ಲುಮೇರಾ ಕ್ಲಿನಿಕ್‌ಗೆ ಕರೆ ಮಾಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಾನು ಹೇಗೆ ಸಹಾಯ ಮಾಡಬಹುದು?',
  ml: 'നമസ്കാരം! ലുമേറ ക്ലിനിക്കിലേക്ക് വിളിച്ചതിന് നന്ദി. ഞാൻ എങ്ങനെ സഹായിക്കാം?',
  pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਲੁਮੇਰਾ ਕਲੀਨਿਕ ਨੂੰ ਕਾਲ ਕਰਨ ਲਈ ਧੰਨਵਾਦ। ਮੈਂ ਕਿਵੇਂ ਮਦਦ ਕਰ ਸਕਦਾ ਹਾਂ?',
  ur: 'السلام علیکم! لومیرا کلینک کو کال کرنے کا شکریہ۔ میں آپ کی کیسے مدد کر سکتا ہوں؟',
  ar: 'مرحبا! شكرا لاتصالك بعيادة لوميرا. كيف يمكنني مساعدتك؟',
};

const ElevenLabsVoicePanel = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [status, setStatus] = useState({ available: false });
  const [voices, setVoices] = useState([]);
  const [voicesNote, setVoicesNote] = useState('');
  const [voicesSource, setVoicesSource] = useState('default');
  const [languages, setLanguages] = useState([]);
  const [config, setConfig] = useState({
    enabled: false,
    voice_id: '',
    voice_name: '',
    language: 'en',
    model_id: 'eleven_multilingual_v2',
    stability: 0.5,
    similarity_boost: 0.75,
    server_configured: false,
  });
  const [previewText, setPreviewText] = useState(SAMPLE_TEXT.en);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [s, v, l, c] = await Promise.all([
        axios.get(`${API_URL}/elevenlabs/status`),
        axios.get(`${API_URL}/elevenlabs/voices`),
        axios.get(`${API_URL}/elevenlabs/languages`),
        axios.get(`${API_URL}/elevenlabs/config`),
      ]);
      setStatus(s.data);
      setVoices(v.data.voices || []);
      setVoicesSource(v.data.source || 'default');
      setVoicesNote(v.data.note || '');
      setLanguages(l.data.languages || []);
      setConfig((prev) => ({ ...prev, ...c.data }));
    } catch (e) {
      console.error('ElevenLabs load failed', e);
      toast.error('Failed to load ElevenLabs settings');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (key, value) => setConfig((c) => ({ ...c, [key]: value }));

  const handleVoiceChange = (voiceId) => {
    const v = voices.find((x) => x.voice_id === voiceId);
    setConfig((c) => ({ ...c, voice_id: voiceId, voice_name: v?.name || '' }));
  };

  const handleLanguageChange = (lang) => {
    setConfig((c) => ({ ...c, language: lang }));
    if (SAMPLE_TEXT[lang]) setPreviewText(SAMPLE_TEXT[lang]);
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/elevenlabs/config`, {
        enabled: config.enabled,
        voice_id: config.voice_id || null,
        voice_name: config.voice_name || null,
        language: config.language,
        model_id: config.model_id,
        stability: config.stability,
        similarity_boost: config.similarity_boost,
      });
      toast.success('Voice preferences saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const previewVoice = async () => {
    if (!config.voice_id) {
      toast.error('Please select a voice first');
      return;
    }
    if (!previewText.trim()) {
      toast.error('Enter some text to preview');
      return;
    }
    setPreviewing(true);
    try {
      const res = await axios.post(`${API_URL}/elevenlabs/preview`, {
        text: previewText,
        voice_id: config.voice_id,
        model_id: config.model_id,
        stability: config.stability,
        similarity_boost: config.similarity_boost,
      });
      const bytes = Uint8Array.from(atob(res.data.audio_base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: res.data.mime_type || 'audio/mpeg' }));
      const audio = new Audio(url);
      audio.play();
      toast.success('Playing preview…');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Voice preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="elevenlabs-panel">
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center">
                <Sparkles className="h-5 w-5 mr-2 text-purple-600" />
                ElevenLabs AI Voice
              </CardTitle>
              <CardDescription>
                Natural-sounding AI voices in 29+ languages for your inbound call bot.
              </CardDescription>
            </div>
            <Badge
              variant={status.available ? 'default' : 'secondary'}
              className={status.available ? 'bg-green-600' : ''}
              data-testid="elevenlabs-status-badge"
            >
              {status.available ? (
                <><CheckCircle2 className="h-3 w-3 mr-1" /> Connected</>
              ) : (
                <><AlertTriangle className="h-3 w-3 mr-1" /> Not configured</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <Label className="text-base font-medium">Use ElevenLabs for voice bot</Label>
              <p className="text-sm text-slate-600 mt-1">
                When enabled, inbound calls will be answered using the selected ElevenLabs voice.
                Azure Speech is used as a fallback.
              </p>
            </div>
            <Switch
              checked={config.enabled}
              onCheckedChange={(v) => updateField('enabled', v)}
              data-testid="elevenlabs-enabled-switch"
            />
          </div>

          {/* Language */}
          <div>
            <Label className="mb-2 block">Primary language for voice bot</Label>
            <Select value={config.language} onValueChange={handleLanguageChange}>
              <SelectTrigger data-testid="elevenlabs-language-select">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.name} — <span className="text-slate-500 ml-1">{l.native_name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 mt-1">
              ElevenLabs multilingual v2 model auto-detects and speaks in the language of your text.
            </p>
          </div>

          {/* Voice */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Voice</Label>
              <span className="text-xs text-slate-500">
                {voicesSource === 'default' ? 'Default library' : 'From your ElevenLabs account'}
              </span>
            </div>
            <Select value={config.voice_id} onValueChange={handleVoiceChange}>
              <SelectTrigger data-testid="elevenlabs-voice-select">
                <SelectValue placeholder="Choose a voice…" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((v) => (
                  <SelectItem key={v.voice_id} value={v.voice_id}>
                    {v.name}
                    {v.gender ? ` · ${v.gender}` : ''}
                    {v.accent ? ` · ${v.accent}` : ''}
                    {v.description ? ` — ${v.description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {voicesSource === 'default' && voicesNote && (
              <p className="text-xs text-amber-600 mt-1 flex items-start">
                <AlertTriangle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
                Showing built-in voices. Add <code className="mx-1">voices_read</code> scope to your key to browse your custom voices.
              </p>
            )}
          </div>

          {/* Advanced */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div>
              <div className="flex justify-between mb-2">
                <Label>Stability</Label>
                <span className="text-sm text-slate-600">{config.stability.toFixed(2)}</span>
              </div>
              <Slider
                min={0} max={1} step={0.05}
                value={[config.stability]}
                onValueChange={(v) => updateField('stability', v[0])}
                data-testid="elevenlabs-stability-slider"
              />
              <p className="text-xs text-slate-500 mt-1">Lower = more expressive, higher = more consistent.</p>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <Label>Similarity boost</Label>
                <span className="text-sm text-slate-600">{config.similarity_boost.toFixed(2)}</span>
              </div>
              <Slider
                min={0} max={1} step={0.05}
                value={[config.similarity_boost]}
                onValueChange={(v) => updateField('similarity_boost', v[0])}
                data-testid="elevenlabs-similarity-slider"
              />
              <p className="text-xs text-slate-500 mt-1">Higher = clearer voice match, may reduce naturalness.</p>
            </div>
          </div>

          <Button
            onClick={savePreferences}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700"
            data-testid="elevenlabs-save-btn"
          >
            {saving ? 'Saving…' : 'Save voice preferences'}
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Volume2 className="h-5 w-5 mr-2 text-indigo-600" />
            Live preview
          </CardTitle>
          <CardDescription>Hear how your voice bot will greet callers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={3}
            value={previewText}
            onChange={(e) => setPreviewText(e.target.value)}
            placeholder="Enter the greeting text your bot should say…"
            data-testid="elevenlabs-preview-text"
          />
          <Button
            onClick={previewVoice}
            disabled={previewing || !config.voice_id}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="elevenlabs-preview-btn"
          >
            <PlayCircle className="h-4 w-4 mr-2" />
            {previewing ? 'Generating…' : 'Play preview'}
          </Button>
          {!status.available && (
            <p className="text-xs text-amber-600 flex items-start">
              <AlertTriangle className="h-3 w-3 mr-1 mt-0.5 flex-shrink-0" />
              Server is missing <code className="mx-1">ELEVENLABS_API_KEY</code>. Add it in <code className="mx-1">backend/.env</code>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ElevenLabsVoicePanel;
