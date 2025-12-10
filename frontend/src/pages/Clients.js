import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Users, Search, Phone, Mail, Calendar, CreditCard, Loader2, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const response = await axios.get(`${API_URL}/clients`);
      setClients(response.data);
    } catch (error) {
      console.error('Failed to fetch clients:', error);
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone.includes(searchTerm) ||
      (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const fetchPaymentHistory = async (client) => {
    setSelectedClient(client);
    setPaymentModalOpen(true);
    setLoadingPayments(true);
    try {
      const response = await axios.get(`${API_URL}/clients/${encodeURIComponent(client.phone)}/payment-history`);
      setPaymentHistory(response.data);
    } catch (error) {
      console.error('Failed to fetch payment history:', error);
      toast.error('Failed to load payment history');
    } finally {
      setLoadingPayments(false);
    }
  };

  const getPaymentStatusIcon = (status) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid="clients-page">
        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search clients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="search-clients-input"
              />
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-inter">Loading clients...</p>
            </CardContent>
          </Card>
        ) : filteredClients.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client, index) => (
              <Card key={client.id} className="border-slate-200 card-hover" data-testid={`client-card-${index}`}>
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Users className="h-6 w-6 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-manrope font-semibold text-lg text-slate-900 truncate">
                        {client.name}
                      </h3>
                      <div className="space-y-2 mt-3">
                        <div className="flex items-center space-x-2 text-sm text-slate-600">
                          <Phone className="h-4 w-4 flex-shrink-0" />
                          <span className="font-inter truncate">{client.phone}</span>
                        </div>
                        {client.email && (
                          <div className="flex items-center space-x-2 text-sm text-slate-600">
                            <Mail className="h-4 w-4 flex-shrink-0" />
                            <span className="font-inter truncate">{client.email}</span>
                          </div>
                        )}
                        <div className="flex items-center space-x-2 text-sm text-slate-600">
                          <Calendar className="h-4 w-4 flex-shrink-0" />
                          <span className="font-inter">
                            {client.total_appointments} appointment{client.total_appointments !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchPaymentHistory(client)}
                        className="w-full mt-4 text-xs"
                      >
                        <CreditCard className="h-3 w-3 mr-1" />
                        View Payment History
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <Users className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h3 className="font-manrope font-semibold text-xl text-slate-900 mb-2">
                No clients found
              </h3>
              <p className="font-inter text-slate-600">
                Clients will appear here automatically when you create appointments.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Clients;