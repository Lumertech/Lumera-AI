import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Pause, CheckCircle2, Filter } from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const VoiceLibraryGallery = ({ selectedVoiceId, onSelect }) => {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [genderFilter, setGenderFilter] = useState('all');
  const audioRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(`${API_URL}/elevenlabs/library`);
        setVoices(res.data.voices || []);
      } catch (e) {
        console.error('library load failed', e);
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const togglePlay = (voice) => {
    // Stop currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (playingId === voice.voice_id) {
      setPlayingId(null);
      return;
    }
    const a = new Audio(voice.preview_url);
    audioRef.current = a;
    a.play().catch((err) => console.error('preview play failed', err));
    setPlayingId(voice.voice_id);
    a.onended = () => setPlayingId((cur) => (cur === voice.voice_id ? null : cur));
  };

  const filtered = voices.filter((v) => genderFilter === 'all' || v.gender === genderFilter);

  if (loading) {
    return <div className="text-sm text-slate-500">Loading voice gallery…</div>;
  }

  return (
    <div className="space-y-4" data-testid="voice-library-gallery">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Voice Gallery</h3>
          <p className="text-xs text-slate-500">Play a 5-second sample, then tap a card to select it as your bot&apos;s voice.</p>
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-slate-400" />
          {['all', 'female', 'male'].map((g) => (
            <Button
              key={g}
              variant={genderFilter === g ? 'default' : 'outline'}
              size="sm"
              onClick={() => setGenderFilter(g)}
              className={genderFilter === g ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
              data-testid={`voice-filter-${g}`}
            >
              {g[0].toUpperCase() + g.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((v) => {
          const isSelected = selectedVoiceId === v.voice_id;
          const isPlaying = playingId === v.voice_id;
          return (
            <Card
              key={v.voice_id}
              onClick={() => onSelect && onSelect(v)}
              className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'ring-2 ring-indigo-600 border-indigo-300 bg-indigo-50/40' : 'border-slate-200'
              }`}
              data-testid={`voice-card-${v.name.toLowerCase()}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-900">{v.name}</h4>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-indigo-600" />}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{v.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="secondary" className="text-xs">{v.gender}</Badge>
                    <Badge variant="secondary" className="text-xs">{v.accent}</Badge>
                    {v.age && <Badge variant="secondary" className="text-xs">{v.age}</Badge>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); togglePlay(v); }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isPlaying ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                  data-testid={`voice-play-${v.name.toLowerCase()}`}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default VoiceLibraryGallery;
