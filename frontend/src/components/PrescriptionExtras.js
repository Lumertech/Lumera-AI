import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Heart, FlaskConical, Search, Bookmark, Plus, Trash2, Save, Share2, Users } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const VitalField = ({ label, value, onChange, placeholder, testid }) => (
  <div>
    <Label className="text-xs text-slate-600">{label}</Label>
    <Input value={value || ''} onChange={onChange} placeholder={placeholder} className="h-9" data-testid={testid} />
  </div>
);

/** VitalsHeader — structured measurement input */
export const VitalsHeader = ({ vitals, onChange }) => {
  const set = (k) => (e) => onChange({ ...vitals, [k]: e.target.value });
  return (
    <Card className="border-slate-200 bg-gradient-to-br from-rose-50 to-orange-50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <Heart className="h-4 w-4 mr-2 text-rose-600" /> Vitals
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <VitalField label="BP (mmHg)" value={vitals.bp} onChange={set('bp')} placeholder="120/80" testid="vitals-bp" />
          <VitalField label="Pulse (bpm)" value={vitals.pulse} onChange={set('pulse')} placeholder="78" testid="vitals-pulse" />
          <VitalField label="SpO2 (%)" value={vitals.spo2} onChange={set('spo2')} placeholder="98" testid="vitals-spo2" />
          <VitalField label="Temp (°F)" value={vitals.temperature} onChange={set('temperature')} placeholder="98.6" testid="vitals-temp" />
          <VitalField label="Weight (kg)" value={vitals.weight} onChange={set('weight')} placeholder="70" testid="vitals-weight" />
          <VitalField label="Height (cm)" value={vitals.height} onChange={set('height')} placeholder="170" testid="vitals-height" />
          <VitalField label="RR" value={vitals.respiratory_rate} onChange={set('respiratory_rate')} placeholder="16" testid="vitals-rr" />
        </div>
      </CardContent>
    </Card>
  );
};

/** DrugAutocomplete — replace medicine_name Input with searchable dropdown */
export const DrugAutocomplete = ({ value, onSelect, onChange, placeholder = 'Search Indian drugs…' }) => {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => setQuery(value || ''), [value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const doSearch = (q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await axios.get(`${API_URL}/clinical/drugs/search?q=${encodeURIComponent(q)}&limit=8`);
        setResults(res.data.results || []);
      } finally {
        setBusy(false);
      }
    }, 220);
  };

  const handleInput = (e) => {
    const v = e.target.value;
    setQuery(v);
    setOpen(true);
    onChange && onChange(v);
    doSearch(v);
  };

  const pick = (drug) => {
    setQuery(drug.name);
    setOpen(false);
    onSelect && onSelect(drug);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={query}
          onChange={handleInput}
          onFocus={() => { setOpen(true); if (results.length === 0) doSearch(query); }}
          placeholder={placeholder}
          className="pl-9"
          data-testid="drug-autocomplete-input"
        />
      </div>
      {open && (results.length > 0 || busy) && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-slate-200 shadow-lg max-h-72 overflow-y-auto">
          {busy && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
          {results.map((d) => (
            <button
              key={d.name}
              type="button"
              onClick={() => pick(d)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-100 last:border-b-0"
              data-testid={`drug-option-${d.name.replace(/\s+/g, '-').toLowerCase()}`}
            >
              <div className="font-medium text-sm text-slate-900">{d.name}</div>
              <div className="text-xs text-slate-500">{d.generic} · <span className="text-indigo-600">{d.category}</span></div>
            </button>
          ))}
          {!busy && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">No matches — type your own medicine name.</div>
          )}
        </div>
      )}
    </div>
  );
};

/** LabTestPicker — add lab / imaging orders to the prescription */
export const LabTestPicker = ({ tests, onChange }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  const doSearch = (q) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await axios.get(`${API_URL}/clinical/lab-tests/search?q=${encodeURIComponent(q)}&limit=8`);
        setResults(res.data.results || []);
      } finally {
        setBusy(false);
      }
    }, 220);
  };

  const addTest = (t) => {
    if (tests.some((x) => x.code === t.code)) return toast.info('Already added');
    onChange([...tests, { ...t, notes: '' }]);
    setQuery('');
    setResults([]);
  };

  const removeTest = (idx) => onChange(tests.filter((_, i) => i !== idx));
  const updateNotes = (idx, notes) => {
    const c = [...tests]; c[idx].notes = notes; onChange(c);
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center">
          <FlaskConical className="h-4 w-4 mr-2 text-purple-600" /> Lab / Imaging Orders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value); }}
            placeholder="Search lab tests (CBC, HbA1c, Ultrasound…)"
            className="pl-9"
            data-testid="lab-search-input"
          />
          {results.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-slate-200 shadow-lg max-h-64 overflow-y-auto">
              {results.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => addTest(t)}
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b border-slate-100 last:border-b-0"
                  data-testid={`lab-option-${t.code.toLowerCase()}`}
                >
                  <div className="text-sm text-slate-900 font-medium">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.code} · {t.category} · {t.sample}</div>
                </button>
              ))}
              {busy && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
            </div>
          )}
        </div>
        {tests.length === 0 && (
          <p className="text-xs text-slate-500">No tests added yet.</p>
        )}
        {tests.map((t, i) => (
          <div key={t.code + i} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-900">{t.name}</span>
                <Badge variant="secondary" className="text-xs">{t.code}</Badge>
              </div>
              <Input
                value={t.notes || ''}
                onChange={(e) => updateNotes(i, e.target.value)}
                placeholder="Notes for lab (optional)"
                className="mt-1 h-8 text-sm"
                data-testid={`lab-note-${i}`}
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeTest(i)}
              className="text-red-600 hover:bg-red-50"
              data-testid={`lab-remove-${i}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

/** RxPresets — load / save multi-drug templates */
export const RxPresets = ({ medications, defaultInstructions, onLoad }) => {
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSave, setShowSave] = useState(false);

  const load = async () => {
    try {
      const res = await axios.get(`${API_URL}/rx-presets`);
      setPresets(res.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const applyPreset = (p) => {
    onLoad(p.medications || [], p.default_instructions || '');
    toast.success(`Loaded "${p.name}"`);
  };

  const savePreset = async () => {
    const validMeds = (medications || []).filter((m) => m.medicine_name?.trim());
    if (!saveName.trim()) return toast.error('Give the preset a name');
    if (validMeds.length === 0) return toast.error('Add at least one medication first');
    setSaving(true);
    try {
      await axios.post(`${API_URL}/rx-presets`, {
        name: saveName,
        description: '',
        medications: validMeds,
        default_instructions: defaultInstructions || '',
      });
      toast.success('Preset saved');
      setSaveName('');
      setShowSave(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Save failed');
    } finally { setSaving(false); }
  };

  const deletePreset = async (p) => {
    if (!window.confirm(`Delete preset "${p.name}"?`)) return;
    try {
      await axios.delete(`${API_URL}/rx-presets/${p.id}`);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Delete failed');
    }
  };

  const toggleShare = async (p) => {
    try {
      const res = await axios.post(`${API_URL}/rx-presets/${p.id}/share`);
      toast.success(res.data.shared ? 'Shared with your polyclinic' : 'Sharing removed');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Share failed');
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center">
            <Bookmark className="h-4 w-4 mr-2 text-indigo-600" /> Rx Presets
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => setShowSave(!showSave)} data-testid="rx-preset-save-toggle">
            <Save className="h-4 w-4 mr-1" />
            Save current
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showSave && (
          <div className="flex gap-2 p-3 bg-indigo-50 rounded-lg">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder='e.g. "Acute Gastritis Kit"'
              data-testid="rx-preset-save-name"
            />
            <Button onClick={savePreset} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="rx-preset-save-btn">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
        {loading ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : presets.length === 0 ? (
          <p className="text-xs text-slate-500">
            No presets yet. Add some medications above then tap <strong>Save current</strong> to reuse them next time.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {presets.map((p) => (
              <div key={p.id} className="p-3 border border-slate-200 rounded-lg hover:border-indigo-300 group" data-testid={`rx-preset-${p.id}`}>
                <div className="flex items-start justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900 truncate">{p.name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {p.shared_polyclinic_id && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          <Users className="h-2.5 w-2.5" /> Shared
                        </span>
                      )}
                      {!p.is_mine && (
                        <span className="text-[10px] text-slate-500 truncate">by {p.shared_by_name || 'colleague'}</span>
                      )}
                    </div>
                  </div>
                  {p.is_mine && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => toggleShare(p)}
                        className={`p-1 rounded hover:bg-indigo-50 ${p.shared_polyclinic_id ? 'text-emerald-600' : 'text-slate-500 hover:text-indigo-600'}`}
                        title={p.shared_polyclinic_id ? 'Unshare from polyclinic' : 'Share with polyclinic'}
                        data-testid={`rx-preset-share-${p.id}`}
                      >
                        <Share2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePreset(p)}
                        className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50"
                        data-testid={`rx-preset-delete-${p.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mb-2">{p.medications?.length || 0} medicine{p.medications?.length !== 1 ? 's' : ''}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(p)}
                  className="w-full"
                  data-testid={`rx-preset-load-${p.id}`}
                >
                  <Plus className="h-3 w-3 mr-1" /> Load
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
