import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/Layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const DEFAULT_CONTENT = {
  hero_badge_text: 'AI-Powered Practice Management for Healthcare Professionals',
  hero_title: 'Your AI Receptionist for 24/7 Appointment Booking',
  hero_subtitle: 'Let Lumera AI answer calls, book appointments via WhatsApp, and manage your practice automatically — in Hindi, Tamil, Telugu, Marathi, Bengali & English.',
  hero_cta_primary: 'Get Started Free',
  hero_cta_secondary: 'See Demo',
  stat_1_value: '50K+', stat_1_label: 'Appointments Booked',
  stat_2_value: '10K+', stat_2_label: 'Hours Saved Monthly',
  stat_3_value: '95%',  stat_3_label: 'No-Show Reduction',
  stat_4_value: '24/7', stat_4_label: 'AI Availability',
  problems_title: "Sound Familiar? You're Not Alone.",
  problems_subtitle: 'Healthcare professionals struggle with three inefficient ways to handle patient calls:',
  problem_1_title: 'Handle every call yourself',
  problem_1_issue_1: 'Constant interruptions during consultations',
  problem_1_issue_2: 'Missed calls = missed patients',
  problem_1_issue_3: 'No time for actual patient care',
  problem_2_title: 'Let calls go unanswered',
  problem_2_issue_1: 'Patients hang up and call competitors',
  problem_2_issue_2: 'No way to reconnect with lost leads',
  problem_2_issue_3: 'Poor first impression of your practice',
  problem_3_title: 'Hire expensive receptionists',
  problem_3_issue_1: 'High salary costs that add up fast',
  problem_3_issue_2: 'Staff unavailable nights & weekends',
  problem_3_issue_3: 'Inconsistent patient experience',
  features_section_label: 'The Lumera Solution',
  features_title: 'Lumera AI Never Misses a Call',
  features_subtitle: "Trained on your practice, Lumera delivers accurate responses every time. Available 24/7/365, it handles calls and WhatsApp messages whenever you can't.",
  feature_1_title: 'AI Voice Assistant',
  feature_1_description: 'Human-like AI answers calls in Hindi, Tamil, Telugu, Marathi & more. Never miss a patient call again.',
  feature_2_title: 'WhatsApp Integration',
  feature_2_description: 'Patients book appointments through WhatsApp. AI chatbot handles queries 24/7.',
  feature_3_title: 'Smart Scheduling',
  feature_3_description: 'AI manages your calendar, prevents double-bookings, and optimizes appointment slots.',
  feature_4_title: 'Automated Reminders',
  feature_4_description: 'WhatsApp & voice reminders reduce no-shows by up to 95%. Smart follow-ups included.',
  feature_5_title: 'Instant Payments',
  feature_5_description: 'Send payment links via WhatsApp. Accept UPI, cards, or Razorpay. Get paid faster.',
  feature_6_title: 'ABDM Compliant',
  feature_6_description: 'ABHA ID integration, digital consent management, and secure health records.',
  languages_title: 'Multi-Language AI Voice',
  languages_subtitle: "Natural conversations in your patients' preferred language",
  languages_list: 'Hindi,Tamil,Telugu,Marathi,Bengali,English',
  professions_title: 'Built for Healthcare Professionals Like You',
  professions_subtitle: 'Join thousands of doctors, dentists, therapists, and wellness professionals using Lumera.',
  profession_1_name: 'Doctors & Clinics',  profession_1_description: 'AI prescriptions, patient records, ABDM compliance',
  profession_2_name: 'Dentists',           profession_2_description: 'Treatment plans, follow-up reminders, payment tracking',
  profession_3_name: 'Therapists',         profession_3_description: 'Session notes, secure storage, appointment reminders',
  profession_4_name: 'Wellness & Spas',    profession_4_description: 'Service catalog, packages, loyalty management',
  profession_5_name: 'Physiotherapists',   profession_5_description: 'Treatment tracking, exercise reminders, progress notes',
  profession_6_name: 'Consultants',        profession_6_description: 'Meeting scheduling, document sharing, invoicing',
  testimonials_title: 'What Doctors Are Saying',
  testimonial_1_quote: "Lumera AI answers calls instantly and sounds natural. Patients think they're speaking to my receptionist.",
  testimonial_1_name: 'Dr. Priya Sharma',  testimonial_1_role: 'Cardiologist, Mumbai',
  testimonial_2_quote: "Since switching to Lumera, we don't miss after-hours calls anymore. Revenue is up 30%.",
  testimonial_2_name: 'Dr. Rajesh Kumar',  testimonial_2_role: 'Dental Clinic, Bangalore',
  testimonial_3_quote: "The WhatsApp booking is a game-changer. My patients love how easy it is to schedule appointments.",
  testimonial_3_name: 'Dr. Meera Patel',   testimonial_3_role: 'Physiotherapist, Delhi',
  cta_title: 'Ready to Transform Your Practice?',
  cta_subtitle: 'Start your free trial today. No credit card required. Set up in under 5 minutes.',
  cta_primary_text: 'Start Free Trial',
  cta_secondary_text: 'Schedule Demo Call',
  contact_email: 'ravee@lumer.me',
  footer_company: 'Lumera Solutions LLP',
};

// Reusable field helpers
const Field = ({ label, id, value, onChange, multiline, rows = 2, placeholder, hint }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-slate-700 font-medium">{label}</Label>
    {hint && <p className="text-xs text-slate-400">{hint}</p>}
    {multiline ? (
      <Textarea id={id} data-testid={`field-${id}`} value={value} onChange={onChange}
        placeholder={placeholder} rows={rows} className="resize-y" />
    ) : (
      <Input id={id} data-testid={`field-${id}`} value={value} onChange={onChange}
        placeholder={placeholder} />
    )}
  </div>
);

const SectionCard = ({ title, children }) => (
  <Card className="border-slate-200 shadow-sm">
    <CardHeader className="pb-3">
      <CardTitle className="font-manrope text-lg text-slate-800">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">{children}</CardContent>
  </Card>
);

const AdminContentEditor = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => { fetchContent(); }, []);

  const fetchContent = async () => {
    try {
      const r = await axios.get(`${API_URL}/admin/content`);
      setContent({ ...DEFAULT_CONTENT, ...r.data });
    } catch {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const set = (field) => (e) => setContent(prev => ({ ...prev, [field]: e.target.value }));
  const v = (field) => content[field] ?? DEFAULT_CONTENT[field] ?? '';

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`${API_URL}/admin/content`, content);
      toast.success('Landing page updated! Changes are live immediately.');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save content');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!window.confirm('Reset all content to defaults? This cannot be undone.')) return;
    setContent(DEFAULT_CONTENT);
    toast.info('Content reset to defaults. Click Save to apply.');
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-slate-600">Loading content…</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-1">Landing Page CMS</h1>
            <p className="text-slate-500 font-inter text-sm">All changes are live immediately after saving.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} data-testid="reset-defaults-btn">
              <RefreshCw className="h-4 w-4 mr-1.5" />Reset Defaults
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="preview-landing-btn">
              <a href="/" target="_blank" rel="noreferrer">
                <Eye className="h-4 w-4 mr-1.5" />Preview
              </a>
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="save-content-btn"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
              <Save className="h-4 w-4 mr-1.5" />{saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="hero" className="space-y-4">
          <TabsList className="grid grid-cols-6 w-full" data-testid="cms-tabs">
            <TabsTrigger value="hero" data-testid="tab-hero">Hero</TabsTrigger>
            <TabsTrigger value="pain" data-testid="tab-pain">Pain Points</TabsTrigger>
            <TabsTrigger value="features" data-testid="tab-features">Features</TabsTrigger>
            <TabsTrigger value="professions" data-testid="tab-professions">Professions</TabsTrigger>
            <TabsTrigger value="testimonials" data-testid="tab-testimonials">Testimonials</TabsTrigger>
            <TabsTrigger value="cta" data-testid="tab-cta">CTA & Footer</TabsTrigger>
          </TabsList>

          {/* ── HERO & STATS ── */}
          <TabsContent value="hero" className="space-y-6">
            <SectionCard title="Hero Section">
              <Field label="Badge / Pill Text" id="hero_badge_text" value={v('hero_badge_text')} onChange={set('hero_badge_text')}
                placeholder="AI-Powered Practice Management…" />
              <Field label="Main Headline" id="hero_title" value={v('hero_title')} onChange={set('hero_title')}
                placeholder="Your AI Receptionist for 24/7 Appointment Booking" />
              <Field label="Sub-headline" id="hero_subtitle" value={v('hero_subtitle')} onChange={set('hero_subtitle')}
                multiline rows={3} placeholder="Let Lumera AI answer calls…" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Primary CTA Button" id="hero_cta_primary" value={v('hero_cta_primary')} onChange={set('hero_cta_primary')} />
                <Field label="Secondary CTA Button" id="hero_cta_secondary" value={v('hero_cta_secondary')} onChange={set('hero_cta_secondary')} />
              </div>
            </SectionCard>

            <SectionCard title="Stats (4 metrics below the hero)">
              {[1,2,3,4].map(n => (
                <div key={n} className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                  <Field label={`Stat ${n} — Value`} id={`stat_${n}_value`} value={v(`stat_${n}_value`)} onChange={set(`stat_${n}_value`)}
                    placeholder="50K+" />
                  <Field label={`Stat ${n} — Label`} id={`stat_${n}_label`} value={v(`stat_${n}_label`)} onChange={set(`stat_${n}_label`)}
                    placeholder="Appointments Booked" />
                </div>
              ))}
            </SectionCard>

            <SectionCard title="Languages Strip">
              <Field label="Section Title" id="languages_title" value={v('languages_title')} onChange={set('languages_title')} />
              <Field label="Section Subtitle" id="languages_subtitle" value={v('languages_subtitle')} onChange={set('languages_subtitle')} />
              <Field label="Languages (comma-separated)" id="languages_list" value={v('languages_list')} onChange={set('languages_list')}
                hint="e.g. Hindi,Tamil,Telugu,Marathi,Bengali,English" />
            </SectionCard>
          </TabsContent>

          {/* ── PAIN POINTS ── */}
          <TabsContent value="pain" className="space-y-6">
            <SectionCard title="Section Header">
              <Field label="Section Title" id="problems_title" value={v('problems_title')} onChange={set('problems_title')} />
              <Field label="Section Subtitle" id="problems_subtitle" value={v('problems_subtitle')} onChange={set('problems_subtitle')} />
            </SectionCard>

            {[1,2,3].map(n => (
              <SectionCard key={n} title={`Problem Card ${n}`}>
                <Field label="Card Title" id={`problem_${n}_title`} value={v(`problem_${n}_title`)} onChange={set(`problem_${n}_title`)} />
                <Field label="Issue 1" id={`problem_${n}_issue_1`} value={v(`problem_${n}_issue_1`)} onChange={set(`problem_${n}_issue_1`)} />
                <Field label="Issue 2" id={`problem_${n}_issue_2`} value={v(`problem_${n}_issue_2`)} onChange={set(`problem_${n}_issue_2`)} />
                <Field label="Issue 3" id={`problem_${n}_issue_3`} value={v(`problem_${n}_issue_3`)} onChange={set(`problem_${n}_issue_3`)} />
              </SectionCard>
            ))}
          </TabsContent>

          {/* ── FEATURES ── */}
          <TabsContent value="features" className="space-y-6">
            <SectionCard title="Section Header">
              <Field label="Section Label (green pill)" id="features_section_label" value={v('features_section_label')} onChange={set('features_section_label')} />
              <Field label="Section Title" id="features_title" value={v('features_title')} onChange={set('features_title')} />
              <Field label="Section Subtitle" id="features_subtitle" value={v('features_subtitle')} onChange={set('features_subtitle')}
                multiline rows={2} />
            </SectionCard>

            <div className="grid md:grid-cols-2 gap-6">
              {[1,2,3,4,5,6].map(n => (
                <SectionCard key={n} title={`Feature Card ${n}`}>
                  <Field label="Title" id={`feature_${n}_title`} value={v(`feature_${n}_title`)} onChange={set(`feature_${n}_title`)} />
                  <Field label="Description" id={`feature_${n}_description`} value={v(`feature_${n}_description`)}
                    onChange={set(`feature_${n}_description`)} multiline rows={2} />
                </SectionCard>
              ))}
            </div>
          </TabsContent>

          {/* ── PROFESSIONS ── */}
          <TabsContent value="professions" className="space-y-6">
            <SectionCard title="Section Header">
              <Field label="Section Title" id="professions_title" value={v('professions_title')} onChange={set('professions_title')} />
              <Field label="Section Subtitle" id="professions_subtitle" value={v('professions_subtitle')} onChange={set('professions_subtitle')} />
            </SectionCard>

            <div className="grid md:grid-cols-2 gap-6">
              {[1,2,3,4,5,6].map(n => (
                <SectionCard key={n} title={`Profession Card ${n}`}>
                  <Field label="Name" id={`profession_${n}_name`} value={v(`profession_${n}_name`)} onChange={set(`profession_${n}_name`)} />
                  <Field label="Description" id={`profession_${n}_description`} value={v(`profession_${n}_description`)}
                    onChange={set(`profession_${n}_description`)} multiline rows={2} />
                </SectionCard>
              ))}
            </div>
          </TabsContent>

          {/* ── TESTIMONIALS ── */}
          <TabsContent value="testimonials" className="space-y-6">
            <SectionCard title="Section Header">
              <Field label="Section Title" id="testimonials_title" value={v('testimonials_title')} onChange={set('testimonials_title')} />
            </SectionCard>

            {[1,2,3].map(n => (
              <SectionCard key={n} title={`Testimonial ${n}`}>
                <Field label="Quote" id={`testimonial_${n}_quote`} value={v(`testimonial_${n}_quote`)}
                  onChange={set(`testimonial_${n}_quote`)} multiline rows={3} />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Name" id={`testimonial_${n}_name`} value={v(`testimonial_${n}_name`)} onChange={set(`testimonial_${n}_name`)} />
                  <Field label="Title / Role" id={`testimonial_${n}_role`} value={v(`testimonial_${n}_role`)} onChange={set(`testimonial_${n}_role`)} />
                </div>
              </SectionCard>
            ))}
          </TabsContent>

          {/* ── CTA & FOOTER ── */}
          <TabsContent value="cta" className="space-y-6">
            <SectionCard title="Call-to-Action Banner">
              <Field label="Headline" id="cta_title" value={v('cta_title')} onChange={set('cta_title')} />
              <Field label="Subtext" id="cta_subtitle" value={v('cta_subtitle')} onChange={set('cta_subtitle')} multiline rows={2} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Primary Button Text" id="cta_primary_text" value={v('cta_primary_text')} onChange={set('cta_primary_text')} />
                <Field label="Secondary Button Text" id="cta_secondary_text" value={v('cta_secondary_text')} onChange={set('cta_secondary_text')} />
              </div>
            </SectionCard>

            <SectionCard title="Footer & Contact">
              <Field label="Contact Email (public-facing)" id="contact_email" value={v('contact_email')} onChange={set('contact_email')}
                hint="Shown in the footer 'Questions?' section" placeholder="ravee@lumer.me" />
              <Field label="Company Name" id="footer_company" value={v('footer_company')} onChange={set('footer_company')}
                hint="Used in footer copyright line" placeholder="Lumera Solutions LLP" />
            </SectionCard>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-700 font-medium mb-1">Domain Policy</p>
              <p className="text-xs text-amber-600">
                All public contact references use <strong>lumer.me</strong>. Do not enter lumera.ai or lumer.com —
                those domains are not owned by Lumera Solutions LLP.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Sticky save bar at bottom */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 -mx-6 px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">Changes are saved to the database and go live immediately.</p>
          <Button onClick={handleSave} disabled={saving} data-testid="save-content-bottom-btn"
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700">
            <Save className="h-4 w-4 mr-1.5" />{saving ? 'Saving…' : 'Save All Changes'}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminContentEditor;
