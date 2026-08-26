import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Trash2, Dumbbell, Brain, Sparkles } from 'lucide-react';

export const getSpecialtyCategory = (specialty) => {
  if (!specialty) return 'general';
  const s = specialty.toLowerCase();
  if (s.includes('physio')) return 'physio';
  if (s.includes('psych') || s.includes('psycholog')) return 'psych';
  if (s.includes('dermat') || s.includes('aesthetic')) return 'derm';
  return 'general';
};

export const getEmptySpecialtyPlan = (category) => {
  if (category === 'physio') return {
    exercise_plan: [{ exercise_name: '', sets: '', reps: '', hold_duration: '', notes: '' }],
    modalities: { heat_compress: false, cold_pack: false, tens: false, ultrasound: false },
    ergonomic_guidelines: '',
  };
  if (category === 'psych') return {
    cbt_assignments: [{ type: 'Journaling', description: '' }],
    assessment_summaries: { phq9_score: '', phq9_severity: '', gad7_score: '', gad7_severity: '' },
    session_notes: '',
  };
  if (category === 'derm') return {
    am_protocol: '',
    pm_protocol: '',
    aftercare_guidelines: '',
  };
  return null;
};

const PHYSIO_MODALITIES = [
  { key: 'heat_compress', label: 'Heat Compress' },
  { key: 'cold_pack', label: 'Cold Pack' },
  { key: 'tens', label: 'TENS' },
  { key: 'ultrasound', label: 'Ultrasound' },
];

const CBT_TYPES = ['Journaling', 'Grounding Techniques', 'Behavioral Activation', 'Cognitive Restructuring', 'Mindfulness', 'Exposure Task', 'Other'];
const PHQ9_SEVERITIES = ['', 'Minimal (0–4)', 'Mild (5–9)', 'Moderate (10–14)', 'Moderately Severe (15–19)', 'Severe (20–27)'];
const GAD7_SEVERITIES = ['', 'Minimal (0–4)', 'Mild (5–9)', 'Moderate (10–14)', 'Severe (15–21)'];

const PhysioPlanCard = ({ plan, onChange }) => {
  const addExercise = () => onChange({ ...plan, exercise_plan: [...plan.exercise_plan, { exercise_name: '', sets: '', reps: '', hold_duration: '', notes: '' }] });
  const removeExercise = (i) => onChange({ ...plan, exercise_plan: plan.exercise_plan.filter((_, idx) => idx !== i) });
  const updateExercise = (i, field, val) => {
    const ep = [...plan.exercise_plan];
    ep[i] = { ...ep[i], [field]: val };
    onChange({ ...plan, exercise_plan: ep });
  };
  const toggleModality = (key) => onChange({ ...plan, modalities: { ...plan.modalities, [key]: !plan.modalities[key] } });

  return (
    <Card className="border-teal-200 bg-teal-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="font-manrope flex items-center gap-2 text-teal-900 text-base">
          <Dumbbell className="h-5 w-5 text-teal-600" />
          Exercise &amp; Physical Therapy Plan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Label className="font-semibold text-sm text-teal-800">Exercise Programme</Label>
          {plan.exercise_plan.map((ex, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end bg-white p-3 rounded-lg border border-teal-200" data-testid={`exercise-row-${i}`}>
              <div className="col-span-12 sm:col-span-4 space-y-1">
                <Label className="text-xs text-slate-600">Exercise Name</Label>
                <Input value={ex.exercise_name} onChange={e => updateExercise(i, 'exercise_name', e.target.value)} placeholder="e.g. Knee Extensions" data-testid={`exercise-name-${i}`} className="text-sm" />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs text-slate-600">Sets</Label>
                <Input value={ex.sets} onChange={e => updateExercise(i, 'sets', e.target.value)} placeholder="3" data-testid={`exercise-sets-${i}`} className="text-sm" />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs text-slate-600">Reps</Label>
                <Input value={ex.reps} onChange={e => updateExercise(i, 'reps', e.target.value)} placeholder="10" data-testid={`exercise-reps-${i}`} className="text-sm" />
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1">
                <Label className="text-xs text-slate-600">Hold (sec)</Label>
                <Input value={ex.hold_duration} onChange={e => updateExercise(i, 'hold_duration', e.target.value)} placeholder="30" data-testid={`exercise-hold-${i}`} className="text-sm" />
              </div>
              <div className="col-span-11 sm:col-span-1 space-y-1 hidden sm:block">
                <Label className="text-xs text-slate-600">Notes</Label>
                <Input value={ex.notes} onChange={e => updateExercise(i, 'notes', e.target.value)} placeholder="Tip" data-testid={`exercise-notes-${i}`} className="text-sm" />
              </div>
              <div className="col-span-1 flex items-end justify-end pb-0.5">
                {plan.exercise_plan.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => removeExercise(i)} data-testid={`remove-exercise-${i}`} className="h-8 w-8 p-0">
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addExercise} className="border-teal-300 text-teal-700 hover:bg-teal-50" data-testid="add-exercise-btn">
            <Plus className="h-4 w-4 mr-1" /> Add Exercise
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="font-semibold text-sm text-teal-800">Therapeutic Modalities</Label>
          <div className="flex flex-wrap gap-3">
            {PHYSIO_MODALITIES.map(m => (
              <label key={m.key} className="flex items-center gap-2 cursor-pointer bg-white border border-teal-200 rounded-lg px-3 py-2 select-none hover:bg-teal-50 transition-colors" data-testid={`modality-${m.key}`}>
                <Switch checked={plan.modalities[m.key]} onCheckedChange={() => toggleModality(m.key)} />
                <span className="text-sm font-medium text-teal-800">{m.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="font-semibold text-sm text-teal-800">Ergonomic Guidelines</Label>
          <Textarea
            value={plan.ergonomic_guidelines}
            onChange={e => onChange({ ...plan, ergonomic_guidelines: e.target.value })}
            placeholder="e.g. Avoid slouching; maintain neutral spine while seated. Use lumbar support cushion..."
            rows={3}
            className="font-inter text-sm"
            data-testid="ergonomic-guidelines-input"
          />
        </div>
      </CardContent>
    </Card>
  );
};

const PsychPlanCard = ({ plan, onChange }) => {
  const addAssignment = () => onChange({ ...plan, cbt_assignments: [...plan.cbt_assignments, { type: 'Journaling', description: '' }] });
  const removeAssignment = (i) => onChange({ ...plan, cbt_assignments: plan.cbt_assignments.filter((_, idx) => idx !== i) });
  const updateAssignment = (i, field, val) => {
    const ca = [...plan.cbt_assignments];
    ca[i] = { ...ca[i], [field]: val };
    onChange({ ...plan, cbt_assignments: ca });
  };
  const updateScore = (field, val) => onChange({ ...plan, assessment_summaries: { ...plan.assessment_summaries, [field]: val } });

  return (
    <Card className="border-purple-200 bg-purple-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="font-manrope flex items-center gap-2 text-purple-900 text-base">
          <Brain className="h-5 w-5 text-purple-600" />
          Behavioral &amp; Cognitive Plan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Label className="font-semibold text-sm text-purple-800">Assessment Scores (PHQ-9 / GAD-7)</Label>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-lg border border-purple-200 space-y-2">
              <Label className="text-xs font-semibold text-purple-700">PHQ-9 — Depression</Label>
              <div className="flex gap-2">
                <Input value={plan.assessment_summaries.phq9_score} onChange={e => updateScore('phq9_score', e.target.value)} placeholder="Score" className="w-20 text-sm" data-testid="phq9-score" />
                <Select value={plan.assessment_summaries.phq9_severity} onValueChange={v => updateScore('phq9_severity', v)}>
                  <SelectTrigger className="flex-1 text-sm" data-testid="phq9-severity"><SelectValue placeholder="Severity" /></SelectTrigger>
                  <SelectContent>{PHQ9_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s || 'Select severity'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-purple-200 space-y-2">
              <Label className="text-xs font-semibold text-purple-700">GAD-7 — Anxiety</Label>
              <div className="flex gap-2">
                <Input value={plan.assessment_summaries.gad7_score} onChange={e => updateScore('gad7_score', e.target.value)} placeholder="Score" className="w-20 text-sm" data-testid="gad7-score" />
                <Select value={plan.assessment_summaries.gad7_severity} onValueChange={v => updateScore('gad7_severity', v)}>
                  <SelectTrigger className="flex-1 text-sm" data-testid="gad7-severity"><SelectValue placeholder="Severity" /></SelectTrigger>
                  <SelectContent>{GAD7_SEVERITIES.map(s => <SelectItem key={s} value={s}>{s || 'Select severity'}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="font-semibold text-sm text-purple-800">CBT &amp; Behavioral Assignments</Label>
          {plan.cbt_assignments.map((a, i) => (
            <div key={i} className="bg-white p-3 rounded-lg border border-purple-200 space-y-2" data-testid={`cbt-row-${i}`}>
              <div className="flex items-center gap-2">
                <Select value={a.type} onValueChange={v => updateAssignment(i, 'type', v)}>
                  <SelectTrigger className="w-52 text-sm" data-testid={`cbt-type-${i}`}><SelectValue /></SelectTrigger>
                  <SelectContent>{CBT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                {plan.cbt_assignments.length > 1 && (
                  <Button size="sm" variant="ghost" onClick={() => removeAssignment(i)} data-testid={`remove-cbt-${i}`} className="h-8 w-8 p-0 ml-auto">
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                )}
              </div>
              <Textarea value={a.description} onChange={e => updateAssignment(i, 'description', e.target.value)} placeholder="Instructions or description for this assignment..." rows={2} className="font-inter text-sm" data-testid={`cbt-description-${i}`} />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addAssignment} className="border-purple-300 text-purple-700 hover:bg-purple-50" data-testid="add-cbt-btn">
            <Plus className="h-4 w-4 mr-1" /> Add Assignment
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="font-semibold text-sm text-purple-800">Session Notes <span className="font-normal text-slate-500">(Private)</span></Label>
          <Textarea
            value={plan.session_notes}
            onChange={e => onChange({ ...plan, session_notes: e.target.value })}
            placeholder="Clinical observations, risk assessment, treatment adjustments..."
            rows={3}
            className="font-inter text-sm"
            data-testid="psych-session-notes"
          />
        </div>
      </CardContent>
    </Card>
  );
};

const DermPlanCard = ({ plan, onChange }) => (
  <Card className="border-rose-200 bg-rose-50/30">
    <CardHeader className="pb-3">
      <CardTitle className="font-manrope flex items-center gap-2 text-rose-900 text-base">
        <Sparkles className="h-5 w-5 text-rose-500" />
        Skincare Protocol &amp; Aftercare
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="font-semibold text-sm text-rose-800">AM Skincare Routine</Label>
          <Textarea
            value={plan.am_protocol}
            onChange={e => onChange({ ...plan, am_protocol: e.target.value })}
            placeholder="Step 1: Gentle cleanser&#10;Step 2: Vitamin C serum&#10;Step 3: Moisturiser&#10;Step 4: SPF 50+"
            rows={6}
            className="font-inter text-sm"
            data-testid="am-protocol-input"
          />
        </div>
        <div className="space-y-2">
          <Label className="font-semibold text-sm text-rose-800">PM Skincare Routine</Label>
          <Textarea
            value={plan.pm_protocol}
            onChange={e => onChange({ ...plan, pm_protocol: e.target.value })}
            placeholder="Step 1: Oil cleanser (double cleanse)&#10;Step 2: Retinol 0.025%&#10;Step 3: Barrier repair cream"
            rows={6}
            className="font-inter text-sm"
            data-testid="pm-protocol-input"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="font-semibold text-sm text-rose-800">Post-Procedure Aftercare Guidelines</Label>
        <Textarea
          value={plan.aftercare_guidelines}
          onChange={e => onChange({ ...plan, aftercare_guidelines: e.target.value })}
          placeholder="Avoid sun exposure for 48h. Do not pick or exfoliate treated area. Apply prescribed soothing cream twice daily..."
          rows={4}
          className="font-inter text-sm"
          data-testid="aftercare-guidelines-input"
        />
      </div>
    </CardContent>
  </Card>
);

const SpecialtyPlanSection = ({ category, plan, onChange }) => {
  if (!category || category === 'general' || !plan) return null;
  if (category === 'physio') return <PhysioPlanCard plan={plan} onChange={onChange} />;
  if (category === 'psych') return <PsychPlanCard plan={plan} onChange={onChange} />;
  if (category === 'derm') return <DermPlanCard plan={plan} onChange={onChange} />;
  return null;
};

export default SpecialtyPlanSection;
