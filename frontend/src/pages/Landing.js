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
} from 'lucide-react';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Landing = () => {
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [content, setContent] = useState({
    hero_title: 'Smart Booking, Happy Clients',
    hero_subtitle: 'Transform your practice with WhatsApp booking, automated reminders, and an all-in-one CRM. Perfect for doctors, therapists, spas, lawyers, and wellness professionals.',
    hero_image_url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800',
    tagline: 'WhatsApp-Powered Appointments',
    feature_1_title: 'WhatsApp Integration',
    feature_1_description: 'Book appointments via WhatsApp with automated reminders',
    feature_2_title: 'Smart CRM',
    feature_2_description: 'Manage clients, prescriptions, and payments in one place',
    feature_3_title: 'Automated Reminders',
    feature_3_description: '24h and 4h reminders sent automatically via WhatsApp'
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
      // Keep default content on error
    }
  };

  const features = [
    {
      icon: MessageSquare,
      title: 'WhatsApp Integration',
      description: 'Book appointments directly through WhatsApp with automated chatbot responses.',
      color: 'from-green-500 to-teal-500',
    },
    {
      icon: Calendar,
      title: 'Smart Scheduling',
      description: 'Sync with Google Calendar and manage appointments effortlessly.',
      color: 'from-blue-500 to-indigo-500',
    },
    {
      icon: CreditCard,
      title: 'Secure Payments',
      description: 'Accept payments through Stripe with QR codes and payment links.',
      color: 'from-purple-500 to-pink-500',
    },
    {
      icon: Bell,
      title: 'Automated Reminders',
      description: 'Send automatic WhatsApp reminders to reduce no-shows.',
      color: 'from-orange-500 to-red-500',
    },
    {
      icon: Users,
      title: 'Client Management',
      description: 'Track client history, appointments, and preferences in one place.',
      color: 'from-cyan-500 to-blue-500',
    },
    {
      icon: Zap,
      title: 'Multi-Profession Support',
      description: 'Tailored workflows for doctors, therapists, lawyers, spas, and more.',
      color: 'from-yellow-500 to-orange-500',
    },
  ];

  const professions = [
    {
      name: 'Doctors',
      description: 'AI-assisted prescriptions, medication reminders, patient records',
      icon: '🩺',
    },
    {
      name: 'Therapists',
      description: 'Session notes, secure storage, therapy continuity tracking',
      icon: '🧠',
    },
    {
      name: 'Spas & Wellness',
      description: 'Service catalog, package deals, loyalty points management',
      icon: '💆',
    },
    {
      name: 'Lawyers',
      description: 'Document management, contract templates, case tracking',
      icon: '⚖️',
    },
    {
      name: 'Astrologers',
      description: 'Birth chart generation, PDF reports, ritual reminders',
      icon: '🔮',
    },
  ];

  const benefits = [
    'Reduce no-shows by up to 80%',
    'Save 10+ hours per week on scheduling',
    'Increase revenue with easier payments',
    'Improve client satisfaction',
    'Professional WhatsApp presence',
    'All-in-one CRM solution',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Navigation */}
        <nav className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 flex items-center justify-center">
                <span className="text-white font-manrope font-bold text-xl">L</span>
              </div>
              <span className="font-manrope font-bold text-2xl text-slate-900">Lumer</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => navigate('/whatsapp-login')}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid="whatsapp-login-btn"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                WhatsApp Login
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/login')}
                data-testid="nav-login-btn"
              >
                Email Login
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/admin/login')}
                className="border-purple-600 text-purple-600 hover:bg-purple-50"
              >
                <Shield className="h-4 w-4 mr-2" />
                Admin
              </Button>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="container mx-auto px-6 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8 animate-fade-in">
              <div className="inline-block px-4 py-2 bg-white/80 backdrop-blur-sm rounded-full border border-indigo-200">
                <span className="font-manrope font-semibold text-sm text-indigo-600">
                  {content.tagline}
                </span>
              </div>
              <h1 className="font-manrope font-bold text-4xl sm:text-5xl lg:text-6xl text-slate-900 leading-tight tracking-tight">
                {content.hero_title.split(',')[0]},
                <br />
                <span className="text-indigo-600">{content.hero_title.split(',')[1] || 'Happy Clients'}</span>
              </h1>
              <p className="font-inter text-lg text-slate-600 leading-relaxed max-w-xl">
                {content.hero_subtitle}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  size="lg"
                  onClick={() => navigate('/register')}
                  className="bg-indigo-600 hover:bg-indigo-700 shadow-[0_4px_12px_rgba(79,70,229,0.4)] font-manrope font-semibold"
                  data-testid="get-started-btn"
                >
                  Get Started Free
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 font-manrope font-semibold"
                  data-testid="view-demo-btn"
                >
                  View Demo
                </Button>
              </div>
            </div>
            <div className="relative">
              <img
                src={content.hero_image_url}
                alt="Healthcare professional using Lumer"
                className="rounded-2xl shadow-2xl border border-slate-200"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white" data-testid="features-section">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-slate-900 mb-4">
              Everything You Need
            </h2>
            <p className="font-inter text-lg text-slate-600">
              Powerful features designed to streamline your practice and delight your clients.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={index}
                  className="card-hover border-slate-200 bg-white"
                  data-testid={`feature-card-${index}`}
                >
                  <CardContent className="p-6">
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4`}
                    >
                      <Icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-manrope font-bold text-xl text-slate-900 mb-2">
                      {feature.title}
                    </h3>
                    <p className="font-inter text-slate-600 leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Professions Section */}
      <section className="py-20" data-testid="professions-section">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-slate-900 mb-4">
              Built for Your Profession
            </h2>
            <p className="font-inter text-lg text-slate-600">
              Customized workflows and features for different professional needs.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {professions.map((profession, index) => (
              <Card
                key={index}
                className="card-hover border-slate-200 bg-white"
                data-testid={`profession-card-${index}`}
              >
                <CardContent className="p-6">
                  <div className="text-4xl mb-3">{profession.icon}</div>
                  <h3 className="font-manrope font-bold text-xl text-slate-900 mb-2">
                    {profession.name}
                  </h3>
                  <p className="font-inter text-sm text-slate-600">{profession.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-slate-900 mb-6">
                Why Professionals Love Lumer
              </h2>
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center mt-0.5">
                      <Check className="h-4 w-4 text-indigo-600" />
                    </div>
                    <p className="font-inter text-lg text-slate-700">{benefit}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-indigo-100 to-teal-100 rounded-2xl p-8 lg:p-12">
              <div className="space-y-8">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-white shadow-lg flex items-center justify-center">
                    <TrendingUp className="h-8 w-8 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-manrope font-bold text-3xl text-slate-900">85%</p>
                    <p className="font-inter text-slate-600">Reduction in no-shows</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-white shadow-lg flex items-center justify-center">
                    <Users className="h-8 w-8 text-teal-600" />
                  </div>
                  <div>
                    <p className="font-manrope font-bold text-3xl text-slate-900">10k+</p>
                    <p className="font-inter text-slate-600">Happy professionals</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-white shadow-lg flex items-center justify-center">
                    <Shield className="h-8 w-8 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-manrope font-bold text-3xl text-slate-900">100%</p>
                    <p className="font-inter text-slate-600">Secure & HIPAA compliant</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <Card className="bg-gradient-to-br from-indigo-600 to-teal-600 border-0 shadow-2xl">
            <CardContent className="p-12 text-center">
              <h2 className="font-manrope font-bold text-3xl sm:text-4xl text-white mb-4">
                Ready to Transform Your Practice?
              </h2>
              <p className="font-inter text-xl text-indigo-100 mb-8 max-w-2xl mx-auto">
                Join thousands of professionals who have streamlined their booking process with
                Lumer.
              </p>
              <Button
                size="lg"
                onClick={() => navigate('/register')}
                className="bg-white text-indigo-600 hover:bg-indigo-50 shadow-xl font-manrope font-semibold"
                data-testid="cta-get-started-btn"
              >
                Start Free Trial
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="container mx-auto px-6">
          <div className="max-w-6xl mx-auto">
            {/* Top Section */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 pb-8 border-b border-slate-700">
              <div className="flex items-center space-x-3 mb-4 md:mb-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-teal-600 flex items-center justify-center">
                  <span className="text-white font-manrope font-bold text-lg">L</span>
                </div>
                <span className="font-manrope font-bold text-xl">Lumer</span>
              </div>
              <div className="text-center md:text-right">
                <p className="font-inter text-slate-400 text-sm mb-1">
                  Questions or concerns?
                </p>
                <a href="mailto:ravee@lumer.me" className="text-indigo-400 hover:text-indigo-300 font-semibold">
                  ravee@lumer.me
                </a>
              </div>
            </div>

            {/* Policy Links */}
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
                <Link to="/policies#payment-disclaimer" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  Payment Disclaimer
                </Link>
                <Link to="/policies#whatsapp-disclaimer" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  WhatsApp Disclaimer
                </Link>
                <Link to="/policies#data-security" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  Data Security
                </Link>
                <Link to="/policies#cookie-policy" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  Cookie Policy
                </Link>
                <Link to="/policies#limitation-liability" className="text-slate-400 hover:text-white transition-colors font-inter text-center">
                  Liability
                </Link>
              </div>
            </div>

            {/* Copyright */}
            <div className="text-center pt-8 border-t border-slate-700">
              <p className="font-inter text-slate-400 text-sm">
                © 2025 Lumer Tech LLC. All rights reserved. <br className="md:hidden" />
                Governed by Indian law, Pune jurisdiction.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;