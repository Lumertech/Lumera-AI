import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Calendar, MessageSquare, CreditCard, Bell, Users, Zap,
  Shield, TrendingUp, Check, Phone, Bot, Clock, Sparkles,
  Globe, Mic,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const FEATURE_ICONS = [Phone, MessageSquare, Calendar, Bell, CreditCard, Shield];
const STAT_ICONS = [Calendar, Clock, TrendingUp, Bot];
const PROFESSION_ICONS = ['🩺', '🦷', '🧠', '💆', '🏃', '💼'];
const FEATURE_COLORS = [
  'from-purple-500 to-indigo-500', 'from-green-500 to-teal-500',
  'from-blue-500 to-cyan-500', 'from-orange-500 to-red-500',
  'from-pink-500 to-purple-500', 'from-teal-500 to-green-500',
];

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

const Landing = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState(DEFAULT_CONTENT);

  useEffect(() => {
    axios.get(`${API_URL}/admin/content`)
      .then(r => setContent({ ...DEFAULT_CONTENT, ...r.data }))
      .catch(() => {});
  }, []);

  const c = (field) => content[field] || DEFAULT_CONTENT[field] || '';

  const stats = [1,2,3,4].map((n, i) => ({
    value: c(`stat_${n}_value`), label: c(`stat_${n}_label`), Icon: STAT_ICONS[i],
  }));

  const features = [1,2,3,4,5,6].map((n, i) => ({
    title: c(`feature_${n}_title`), description: c(`feature_${n}_description`),
    color: FEATURE_COLORS[i], Icon: FEATURE_ICONS[i],
  }));

  const problems = [1,2,3].map(n => ({
    title: c(`problem_${n}_title`),
    issues: [c(`problem_${n}_issue_1`), c(`problem_${n}_issue_2`), c(`problem_${n}_issue_3`)],
  }));

  const languages = c('languages_list').split(',').map(l => l.trim()).filter(Boolean);

  const professions = [1,2,3,4,5,6].map((n, i) => ({
    name: c(`profession_${n}_name`), description: c(`profession_${n}_description`),
    icon: PROFESSION_ICONS[i],
  }));

  const testimonials = [1,2,3].map(n => ({
    quote: c(`testimonial_${n}_quote`), name: c(`testimonial_${n}_name`), role: c(`testimonial_${n}_role`),
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Navigation */}
      <nav className="container mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Sparkles className="h-7 w-7 text-white" />
            </div>
            <span className="font-manrope font-bold text-2xl text-white">Lumera</span>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/whatsapp-login')}
              className="bg-green-600 hover:bg-green-700 text-white">
              <MessageSquare className="h-4 w-4 mr-2" />WhatsApp Login
            </Button>
            <Button variant="ghost" onClick={() => navigate('/login')} className="text-white hover:bg-white/10">
              Login
            </Button>
            <Button onClick={() => navigate('/register')}
              className="bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/30">
              Start Free Trial
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-6 py-16 lg:py-24">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center px-4 py-2 bg-purple-500/20 backdrop-blur-sm rounded-full border border-purple-500/30 mb-8">
            <Bot className="h-4 w-4 text-purple-400 mr-2" />
            <span className="font-inter text-sm text-purple-300" data-testid="hero-badge">{c('hero_badge_text')}</span>
          </div>
          <h1 className="font-manrope font-bold text-4xl sm:text-5xl lg:text-6xl text-white leading-tight mb-6"
              data-testid="hero-title">
            {c('hero_title')}
          </h1>
          <p className="font-inter text-lg sm:text-xl text-slate-300 mb-10 max-w-3xl mx-auto leading-relaxed"
             data-testid="hero-subtitle">
            {c('hero_subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button size="lg" onClick={() => navigate('/register')} data-testid="hero-cta-primary"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-xl shadow-purple-500/30 font-manrope font-semibold text-lg px-8">
              <Sparkles className="h-5 w-5 mr-2" />{c('hero_cta_primary')}
            </Button>
            <Button size="lg" variant="outline" data-testid="hero-cta-secondary"
              className="border-2 border-purple-500/50 text-white hover:bg-purple-500/20 font-manrope font-semibold text-lg px-8">
              <Phone className="h-5 w-5 mr-2" />{c('hero_cta_secondary')}
            </Button>
          </div>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                <stat.Icon className="h-8 w-8 text-purple-400 mx-auto mb-3" />
                <p className="font-manrope font-bold text-3xl text-white" data-testid={`stat-${i+1}-value`}>{stat.value}</p>
                <p className="font-inter text-sm text-slate-400" data-testid={`stat-${i+1}-label`}>{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problems */}
      <section className="py-20 bg-slate-900/50">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4" data-testid="problems-title">
              {c('problems_title')}
            </h2>
            <p className="font-inter text-lg text-slate-400" data-testid="problems-subtitle">{c('problems_subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {problems.map((p, i) => (
              <Card key={i} className="bg-red-500/10 border-red-500/20 backdrop-blur-sm">
                <CardContent className="p-6">
                  <h3 className="font-manrope font-bold text-xl text-white mb-4">{p.title}</h3>
                  <ul className="space-y-3">
                    {p.issues.map((issue, j) => (
                      <li key={j} className="flex items-start space-x-2">
                        <span className="text-red-400 mt-1">✗</span>
                        <span className="font-inter text-slate-300 text-sm">{issue}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features / Solution */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center px-4 py-2 bg-green-500/20 rounded-full border border-green-500/30 mb-6">
              <Check className="h-4 w-4 text-green-400 mr-2" />
              <span className="font-inter text-sm text-green-300">{c('features_section_label')}</span>
            </div>
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4" data-testid="features-title">
              {c('features_title')}
            </h2>
            <p className="font-inter text-lg text-slate-400">{c('features_subtitle')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Card key={i} className="bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg`}>
                    <f.Icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-manrope font-bold text-xl text-white mb-2">{f.title}</h3>
                  <p className="font-inter text-slate-400 text-sm leading-relaxed">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Languages */}
      <section className="py-16 bg-gradient-to-r from-purple-900/50 to-indigo-900/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center space-x-4">
              <Globe className="h-12 w-12 text-purple-400" />
              <div>
                <h3 className="font-manrope font-bold text-2xl text-white">{c('languages_title')}</h3>
                <p className="font-inter text-slate-400">{c('languages_subtitle')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              {languages.map((lang) => (
                <span key={lang} className="px-4 py-2 bg-white/10 rounded-full text-white font-inter text-sm border border-white/20">
                  {lang}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Professions */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4">{c('professions_title')}</h2>
            <p className="font-inter text-lg text-slate-400">{c('professions_subtitle')}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {professions.map((prof, i) => (
              <Card key={i} className="bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all">
                <CardContent className="p-6">
                  <div className="text-4xl mb-3">{prof.icon}</div>
                  <h3 className="font-manrope font-bold text-xl text-white mb-2">{prof.name}</h3>
                  <p className="font-inter text-sm text-slate-400">{prof.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-slate-900/50">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4" data-testid="testimonials-title">
              {c('testimonials_title')}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <Card key={i} className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardContent className="p-6">
                  <p className="font-inter text-slate-300 mb-6 leading-relaxed">"{t.quote}"</p>
                  <div>
                    <p className="font-manrope font-bold text-white">{t.name}</p>
                    <p className="font-inter text-sm text-purple-400">{t.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 border-0 shadow-2xl shadow-purple-500/20">
            <CardContent className="p-12 text-center">
              <Sparkles className="h-16 w-16 text-white/80 mx-auto mb-6" />
              <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4" data-testid="cta-title">
                {c('cta_title')}
              </h2>
              <p className="font-inter text-xl text-purple-100 mb-8 max-w-2xl mx-auto" data-testid="cta-subtitle">
                {c('cta_subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" onClick={() => navigate('/register')} data-testid="cta-primary-btn"
                  className="bg-white text-purple-600 hover:bg-purple-50 shadow-xl font-manrope font-semibold">
                  {c('cta_primary_text')}
                </Button>
                <Button size="lg" variant="outline" data-testid="cta-secondary-btn"
                  className="border-2 border-white/50 text-white hover:bg-white/10 font-manrope font-semibold">
                  {c('cta_secondary_text')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 text-white py-12 border-t border-white/10">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 pb-8 border-b border-slate-800">
              <div className="flex items-center space-x-3 mb-4 md:mb-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <span className="font-manrope font-bold text-xl">Lumera</span>
              </div>
              <div className="text-center md:text-right">
                <p className="font-inter text-slate-400 text-sm mb-1">Questions?</p>
                <a href={`mailto:${c('contact_email')}`} className="text-purple-400 hover:text-purple-300 font-semibold"
                   data-testid="footer-contact-email">
                  {c('contact_email')}
                </a>
              </div>
            </div>
            <div className="mb-8">
              <h3 className="font-manrope font-semibold text-lg mb-4 text-center">Policies & Disclaimers</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Link to="/policies#privacy-policy" className="text-slate-400 hover:text-white transition-colors font-inter text-center">Privacy Policy</Link>
                <Link to="/policies#terms-of-service" className="text-slate-400 hover:text-white transition-colors font-inter text-center">Terms of Service</Link>
                <Link to="/policies#medical-disclaimer" className="text-slate-400 hover:text-white transition-colors font-inter text-center">Medical Disclaimer</Link>
                <Link to="/policies#data-security" className="text-slate-400 hover:text-white transition-colors font-inter text-center">Data Security</Link>
              </div>
            </div>
            <div className="text-center pt-8 border-t border-slate-800">
              <p className="font-inter text-slate-500 text-sm">
                © 2026 {c('footer_company')}. All rights reserved. <br className="md:hidden" />
                Made with ❤️ for healthcare professionals.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
