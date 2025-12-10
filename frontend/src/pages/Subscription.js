import React, { useEffect, useState } from 'react';
import axios from 'axios';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CreditCard, 
  Wallet, 
  MessageSquare, 
  Calendar, 
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const Subscription = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [topUpModalOpen, setTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('500');
  const [processingTopUp, setProcessingTopUp] = useState(false);

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const fetchSubscriptionData = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/subscription/status`);
      setData(response.data);
    } catch (error) {
      console.error('Failed to fetch subscription data:', error);
      toast.error('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  };

  const handleTopUp = async () => {
    const amount = parseInt(topUpAmount);
    if (amount < 100) {
      toast.error('Minimum top-up amount is ₹100');
      return;
    }

    setProcessingTopUp(true);
    try {
      const response = await axios.post(`${API_URL}/wallet/topup`, { amount });
      
      // Open payment link in new window
      window.open(response.data.payment_link, '_blank');
      
      toast.success('Payment link generated! Complete payment in the new window.');
      setTopUpModalOpen(false);
      setTopUpAmount('500');
    } catch (error) {
      console.error('Top-up failed:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate payment link');
    } finally {
      setProcessingTopUp(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel auto-renewal? Your subscription will end on the next billing date.')) {
      return;
    }

    try {
      await axios.post(`${API_URL}/subscription/cancel`);
      toast.success('Auto-renewal cancelled successfully');
      fetchSubscriptionData();
    } catch (error) {
      console.error('Cancel failed:', error);
      toast.error('Failed to cancel subscription');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      </DashboardLayout>
    );
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'trial':
        return 'bg-blue-100 text-blue-800';
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'trial':
        return <Clock className="h-5 w-5 text-blue-600" />;
      case 'active':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'cancelled':
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-slate-600" />;
    }
  };

  const usagePercentage = (data.usage.bundled_used / data.pricing.bundled_messages) * 100;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="font-manrope font-bold text-3xl text-slate-900">
            Subscription & Billing
          </h1>
          <p className="font-inter text-slate-600 mt-2">
            Manage your Lumer subscription, usage, and payments
          </p>
        </div>

        {/* Trial Alert */}
        {data.subscription.status === 'trial' && (
          <Alert className="border-blue-200 bg-blue-50">
            <Clock className="h-4 w-4 text-blue-600" />
            <AlertDescription className="font-inter text-blue-900">
              <strong>Free Trial Active!</strong> You have {data.trial_days_remaining} day{data.trial_days_remaining !== 1 ? 's' : ''} remaining.
              You will be auto-charged ₹{data.pricing.subscription_price} on {formatDate(data.subscription.next_billing_date)} unless you cancel.
            </AlertDescription>
          </Alert>
        )}

        {/* Top Cards Row */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Subscription Status Card */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="font-manrope text-lg flex items-center space-x-2">
                <CreditCard className="h-5 w-5 text-indigo-600" />
                <span>Subscription Status</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {getStatusIcon(data.subscription.status)}
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(data.subscription.status)}`}>
                    {data.subscription.status.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 font-inter">Plan:</span>
                  <span className="font-semibold text-slate-900">₹{data.pricing.subscription_price}/month</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 font-inter">Next Billing:</span>
                  <span className="font-semibold text-slate-900">
                    {formatDate(data.subscription.next_billing_date)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 font-inter">Auto-Renew:</span>
                  <span className={`font-semibold ${data.subscription.auto_renew ? 'text-green-600' : 'text-red-600'}`}>
                    {data.subscription.auto_renew ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              {data.subscription.auto_renew && data.subscription.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelSubscription}
                  className="w-full text-red-600 hover:text-red-700 border-red-200"
                >
                  Cancel Auto-Renewal
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Wallet Balance Card */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="font-manrope text-lg flex items-center space-x-2">
                <Wallet className="h-5 w-5 text-green-600" />
                <span>Wallet Balance</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center py-4">
                <div className="text-4xl font-bold text-green-600 font-manrope">
                  ₹{data.wallet.balance.toFixed(2)}
                </div>
                <p className="text-sm text-slate-600 font-inter mt-1">
                  Available balance
                </p>
              </div>

              <Button
                onClick={() => setTopUpModalOpen(true)}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Top Up Wallet
              </Button>

              {data.wallet.balance < 50 && (
                <Alert className="border-orange-200 bg-orange-50">
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-xs text-orange-900">
                    Low balance! Top up to continue using extra messages.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Current Usage Card */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="font-manrope text-lg flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                <span>Message Usage</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-600 font-inter">This Period</span>
                  <span className="font-semibold text-slate-900">
                    {data.usage.message_count} / {data.pricing.bundled_messages}
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      usagePercentage >= 100 ? 'bg-red-500' : usagePercentage >= 80 ? 'bg-orange-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  ></div>
                </div>
                <p className="text-xs text-slate-500 mt-2 font-inter">
                  {data.pricing.bundled_messages - data.usage.bundled_used} messages remaining in quota
                </p>
              </div>

              {data.usage.extra_used > 0 && (
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-orange-900 font-inter">Extra Messages:</span>
                    <span className="font-semibold text-orange-900">{data.usage.extra_used}</span>
                  </div>
                  <p className="text-xs text-orange-700 mt-1">
                    @ ₹{data.pricing.message_price}/message
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Billing Details */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-manrope text-xl flex items-center space-x-2">
              <TrendingUp className="h-6 w-6 text-indigo-600" />
              <span>Billing Details</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-manrope font-semibold text-lg">Current Plan</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg">
                    <span className="font-inter text-slate-700">Monthly Subscription</span>
                    <span className="font-bold text-indigo-600">₹{data.pricing.subscription_price}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="font-inter text-slate-700">Included Messages</span>
                    <span className="font-bold text-slate-900">{data.pricing.bundled_messages}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <span className="font-inter text-slate-700">Extra Message Rate</span>
                    <span className="font-bold text-slate-900">₹{data.pricing.message_price}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-manrope font-semibold text-lg">Billing Period</h3>
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center space-x-2 mb-1">
                      <Calendar className="h-4 w-4 text-slate-600" />
                      <span className="text-sm font-inter text-slate-600">Period Start</span>
                    </div>
                    <span className="font-semibold text-slate-900">
                      {formatDate(data.usage.period_start)}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center space-x-2 mb-1">
                      <Calendar className="h-4 w-4 text-slate-600" />
                      <span className="text-sm font-inter text-slate-600">Period End</span>
                    </div>
                    <span className="font-semibold text-slate-900">
                      {formatDate(data.usage.period_end)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        {data.wallet.recent_transactions.length > 0 && (
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="font-manrope text-xl">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.wallet.recent_transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                  >
                    <div>
                      <p className="font-inter text-sm text-slate-900 font-semibold">
                        {transaction.description}
                      </p>
                      <p className="font-inter text-xs text-slate-600">
                        {formatDate(transaction.timestamp)}
                      </p>
                    </div>
                    <span
                      className={`font-bold ${
                        transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {transaction.amount >= 0 ? '+' : ''}₹{Math.abs(transaction.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top-Up Modal */}
      <Dialog open={topUpModalOpen} onOpenChange={setTopUpModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-manrope">Top Up Wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Select Amount</Label>
              <div className="grid grid-cols-3 gap-3">
                {['500', '1000', '2000'].map((amount) => (
                  <Button
                    key={amount}
                    variant={topUpAmount === amount ? 'default' : 'outline'}
                    onClick={() => setTopUpAmount(amount)}
                    className={topUpAmount === amount ? 'bg-indigo-600' : ''}
                  >
                    ₹{amount}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-manrope font-semibold">Custom Amount</Label>
              <Input
                type="number"
                placeholder="Enter amount (min ₹100)"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                min="100"
              />
            </div>

            <Alert className="bg-slate-50 border-slate-200">
              <AlertCircle className="h-4 w-4 text-slate-600" />
              <AlertDescription className="text-xs text-slate-700 font-inter">
                A payment link will be generated. Complete the payment to add funds to your wallet.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => setTopUpModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleTopUp}
                disabled={processingTopUp || parseInt(topUpAmount) < 100}
                className="bg-green-600 hover:bg-green-700"
              >
                {processingTopUp ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Wallet className="mr-2 h-4 w-4" />
                    Generate Payment Link
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Subscription;
