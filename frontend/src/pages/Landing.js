import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Calendar,
  MessageSquare,
  CreditCard,
  Bell,
  Users,
  Zap,
  Shield,
  TrendingUp,
  Check,
  Phone,
  Bot,
  Clock,
  Sparkles,
  Globe,
  Mic,
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Landing = () => {
  const navigate = useNavigate();
  const [content, setContent] = useState({
    hero_title: 'Never Miss Another Appointment',
    hero_subtitle: 'Lumera AI answers calls, books appointments, and manages your practice 24/7 — so you can focus on what matters most: your patients.',
    hero_image_url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800',
    tagline: 'AI-Powered Practice Management',
  });

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/content`);
      setContent(response.data);
    } catch (error) {
      console.error('Failed to fetch content:', error);
    }
  };

  const stats = [
    { value: '50K+', label: 'Appointments Booked', icon: Calendar },
    { value: '10K+', label: 'Hours Saved Monthly', icon: Clock },
    { value: '95%', label: 'No-Show Reduction', icon: TrendingUp },
    { value: '24/7', label: 'AI Availability', icon: Bot },
  ];

  const features = [
    {
      icon: Phone,
      title: 'AI Voice Assistant',
      description: 'Human-like AI answers calls in Hindi, Tamil, Telugu, Marathi & more. Never miss a patient call again.',
      color: 'from-purple-500 to-indigo-500',
    },
    {
      icon: MessageSquare,
      title: 'WhatsApp Integration',
      description: 'Patients book appointments through WhatsApp. AI chatbot handles queries 24/7.',
      color: 'from-green-500 to-teal-500',
    },
    {
      icon: Calendar,
      title: 'Smart Scheduling',
      description: 'AI manages your calendar, prevents double-bookings, and optimizes appointment slots.',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Bell,
      title: 'Automated Reminders',
      description: 'WhatsApp & voice reminders reduce no-shows by up to 95%. Smart follow-ups included.',
      color: 'from-orange-500 to-red-500',
    },
    {
      icon: CreditCard,
      title: 'Instant Payments',
      description: 'Send payment links via WhatsApp. Accept UPI, cards, or Razorpay. Get paid faster.',
      color: 'from-pink-500 to-purple-500',
    },
    {
      icon: Shield,
      title: 'ABDM Compliant',
      description: 'ABHA ID integration, digital consent management, and secure health records.',
      color: 'from-teal-500 to-green-500',
    },
  ];

  const problems = [
    {
      title: 'Handle every call yourself',
      issues: [
        'Constant interruptions during consultations',
        'Missed calls = missed patients',
        'No time for actual patient care',
      ],
    },
    {
      title: 'Let calls go unanswered',
      issues: [
        'Patients hang up and call competitors',
        'No way to reconnect with lost leads',
        'Poor first impression of your practice',
      ],
    },
    {
      title: 'Hire expensive receptionists',
      issues: [
        'High salary costs that add up fast',
        'Staff unavailable nights & weekends',
        'Inconsistent patient experience',
      ],
    },
  ];

  const professions = [
    { name: 'Doctors & Clinics', icon: '🩺', description: 'AI prescriptions, patient records, ABDM compliance' },
    { name: 'Dentists', icon: '🦷', description: 'Treatment plans, follow-up reminders, payment tracking' },
    { name: 'Therapists', icon: '🧠', description: 'Session notes, secure storage, appointment reminders' },
    { name: 'Wellness & Spas', icon: '💆', description: 'Service catalog, packages, loyalty management' },
    { name: 'Physiotherapists', icon: '🏃', description: 'Treatment tracking, exercise reminders, progress notes' },
    { name: 'Consultants', icon: '💼', description: 'Meeting scheduling, document sharing, invoicing' },
  ];

  const testimonials = [
    {
      quote: "Lumera AI answers calls instantly and sounds natural. Patients think they're speaking to my receptionist.",
      name: 'Dr. Priya Sharma',
      role: 'Cardiologist, Mumbai',
    },
    {
      quote: "Since switching to Lumera, we don't miss after-hours calls anymore. Revenue is up 30%.",
      name: 'Dr. Rajesh Kumar',
      role: 'Dental Clinic, Bangalore',
    },
    {
      quote: "The WhatsApp booking is a game-changer. My patients love how easy it is to schedule appointments.",
      name: 'Dr. Meera Patel',
      role: 'Physiotherapist, Delhi',
    },
  ];

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
            <Button
              variant="ghost"
              onClick={() => navigate('/whatsapp-login')}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              WhatsApp Login
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/login')}
              className="text-white hover:bg-white/10"
            >
              Login
            </Button>
            <Button
              onClick={() => navigate('/register')}
              className="bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-500/30"
            >
              Start Free Trial
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-16 lg:py-24">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center px-4 py-2 bg-purple-500/20 backdrop-blur-sm rounded-full border border-purple-500/30 mb-8">
            <Bot className="h-4 w-4 text-purple-400 mr-2" />
            <span className="font-inter text-sm text-purple-300">
              AI-Powered Practice Management for Healthcare Professionals
            </span>
          </div>
          
          <h1 className="font-manrope font-bold text-4xl sm:text-5xl lg:text-6xl text-white leading-tight mb-6">
            Your AI Receptionist for
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent"> 24/7 </span>
            Appointment Booking
          </h1>
          
          <p className="font-inter text-lg sm:text-xl text-slate-300 mb-10 max-w-3xl mx-auto leading-relaxed">
            Let Lumera AI answer calls, book appointments via WhatsApp, and manage your practice automatically — 
            in <span className="text-purple-400 font-semibold">Hindi, Tamil, Telugu, Marathi, Bengali & English</span>.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button
              size="lg"
              onClick={() => navigate('/register')}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-xl shadow-purple-500/30 font-manrope font-semibold text-lg px-8"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              Get Started Free
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-2 border-purple-500/50 text-white hover:bg-purple-500/20 font-manrope font-semibold text-lg px-8"
            >
              <Phone className="h-5 w-5 mr-2" />
              See Demo
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <Icon className="h-8 w-8 text-purple-400 mx-auto mb-3" />
                  <p className="font-manrope font-bold text-3xl text-white">{stat.value}</p>
                  <p className="font-inter text-sm text-slate-400">{stat.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 bg-slate-900/50">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4">
              Sound Familiar? You're Not Alone.
            </h2>
            <p className="font-inter text-lg text-slate-400">
              Healthcare professionals struggle with three inefficient ways to handle patient calls:
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {problems.map((problem, index) => (
              <Card key={index} className="bg-red-500/10 border-red-500/20 backdrop-blur-sm">
                <CardContent className="p-6">
                  <h3 className="font-manrope font-bold text-xl text-white mb-4">{problem.title}</h3>
                  <ul className="space-y-3">
                    {problem.issues.map((issue, i) => (
                      <li key={i} className="flex items-start space-x-2">
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

      {/* Solution Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <div className="inline-flex items-center px-4 py-2 bg-green-500/20 rounded-full border border-green-500/30 mb-6">
              <Check className="h-4 w-4 text-green-400 mr-2" />
              <span className="font-inter text-sm text-green-300">The Lumera Solution</span>
            </div>
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4">
              Lumera AI Never Misses a Call
            </h2>
            <p className="font-inter text-lg text-slate-400">
              <span className="text-white font-semibold">Trained on your practice</span>, Lumera delivers accurate responses every time. 
              <span className="text-white font-semibold"> Available 24/7/365</span>, it handles calls and WhatsApp messages whenever you can't.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 shadow-lg`}>
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-manrope font-bold text-xl text-white mb-2">{feature.title}</h3>
                    <p className="font-inter text-slate-400 text-sm leading-relaxed">{feature.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Languages Section */}
      <section className="py-16 bg-gradient-to-r from-purple-900/50 to-indigo-900/50">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center space-x-4">
              <Globe className="h-12 w-12 text-purple-400" />
              <div>
                <h3 className="font-manrope font-bold text-2xl text-white">Multi-Language AI Voice</h3>
                <p className="font-inter text-slate-400">Natural conversations in your patients' preferred language</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              {['Hindi', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'English'].map((lang) => (
                <span key={lang} className="px-4 py-2 bg-white/10 rounded-full text-white font-inter text-sm border border-white/20">
                  {lang}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Professions Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4">
              Built for Healthcare Professionals Like You
            </h2>
            <p className="font-inter text-lg text-slate-400">
              Join thousands of doctors, dentists, therapists, and wellness professionals using Lumera.
            </p>
          </div>
          
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {professions.map((profession, index) => (
              <Card key={index} className="bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all">
                <CardContent className="p-6">
                  <div className="text-4xl mb-3">{profession.icon}</div>
                  <h3 className="font-manrope font-bold text-xl text-white mb-2">{profession.name}</h3>
                  <p className="font-inter text-sm text-slate-400">{profession.description}</p>
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
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4">
              What Doctors Are Saying
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-white/5 border-white/10 backdrop-blur-sm">
                <CardContent className="p-6">
                  <p className="font-inter text-slate-300 mb-6 leading-relaxed">"{testimonial.quote}"</p>
                  <div>
                    <p className="font-manrope font-bold text-white">{testimonial.name}</p>
                    <p className="font-inter text-sm text-purple-400">{testimonial.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 border-0 shadow-2xl shadow-purple-500/20">
            <CardContent className="p-12 text-center">
              <Sparkles className="h-16 w-16 text-white/80 mx-auto mb-6" />
              <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4">
                Ready to Transform Your Practice?
              </h2>
              <p className="font-inter text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
                Start your free trial today. No credit card required. Set up in under 5 minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  onClick={() => navigate('/register')}
                  className="bg-white text-purple-600 hover:bg-purple-50 shadow-xl font-manrope font-semibold"
                >
                  Start Free Trial
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-white/50 text-white hover:bg-white/10 font-manrope font-semibold"
                >
                  Schedule Demo Call
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
                <a href="mailto:support@lumera.ai" className="text-purple-400 hover:text-purple-300 font-semibold">
                  support@lumera.ai
                </a>
              </div>
            </div>

            <div className="mb-8">
              <h3 className="font-manrope font-semibold text-lg mb-4 text-center">Policies & Disclaimers</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Link to="/policies#privacy-policy" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  Privacy Policy
                </Link>
                <Link to="/policies#terms-of-service" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  Terms of Service
                </Link>
                <Link to="/policies#medical-disclaimer" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  Medical Disclaimer
                </Link>
                <Link to="/policies#data-security" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  Data Security
                </Link>
              </div>
            </div>

            <div className="text-center pt-8 border-t border-slate-800">
              <p className="font-inter text-slate-500 text-sm">
                © 2025 Lumera AI. All rights reserved. <br className="md:hidden" />
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
