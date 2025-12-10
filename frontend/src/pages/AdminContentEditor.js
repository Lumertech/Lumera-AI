import React, { useEffect, useState } from 'react';
import axios from 'axios';
import AdminLayout from '@/components/Layout/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Save } from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const AdminContentEditor = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState({
    hero_title: '',
    hero_subtitle: '',
    hero_image_url: '',
    tagline: '',
    feature_1_title: '',
    feature_1_description: '',
    feature_2_title: '',
    feature_2_description: '',
    feature_3_title: '',
    feature_3_description: '',
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
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await axios.put(`${API_URL}/admin/content`, content);
      toast.success('Landing page content updated successfully!');
    } catch (error) {
      console.error('Failed to save content:', error);
      toast.error('Failed to save content');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-slate-600">Loading content...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900 mb-2">Landing Page Editor</h1>
          <p className="text-slate-600 font-inter">Customize your landing page content</p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Hero Section */}
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="font-manrope">Hero Section</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Hero Title</Label>
                <Input
                  value={content.hero_title}
                  onChange={(e) => setContent({ ...content, hero_title: e.target.value })}
                  placeholder="Smart Booking, Happy Clients"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Hero Subtitle</Label>
                <Textarea
                  value={content.hero_subtitle}
                  onChange={(e) => setContent({ ...content, hero_subtitle: e.target.value })}
                  placeholder="Transform your practice..."
                  rows={3}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Hero Image URL</Label>
                <Input
                  value={content.hero_image_url}
                  onChange={(e) => setContent({ ...content, hero_image_url: e.target.value })}
                  placeholder="https://..."
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tagline</Label>
                <Input
                  value={content.tagline}
                  onChange={(e) => setContent({ ...content, tagline: e.target.value })}
                  placeholder="WhatsApp-Powered Appointments"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Features */}
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="font-manrope">Features Section</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {[1, 2, 3].map((num) => (
                <div key={num} className="p-4 bg-slate-50 rounded-lg space-y-3">
                  <h3 className="font-semibold text-slate-900">Feature {num}</h3>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={content[`feature_${num}_title`]}
                      onChange={(e) => setContent({ ...content, [`feature_${num}_title`]: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={content[`feature_${num}_description`]}
                      onChange={(e) => setContent({ ...content, [`feature_${num}_description`]: e.target.value })}
                      rows={2}
                      required
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </form>
      </div>
    </AdminLayout>
  );
};

export default AdminContentEditor;