import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message || 'Something went wrong';
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-rose-50 p-6" data-testid="error-boundary">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-rose-100 p-8">
            <div className="w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mb-4">
              <span className="text-2xl">⚠️</span>
            </div>
            <h1 className="font-manrope font-bold text-2xl text-slate-900 mb-2">A page error occurred</h1>
            <p className="text-sm text-slate-600 mb-1">Don't worry — your data is safe. Lumera caught the error before it spread.</p>
            <p className="text-xs text-slate-400 font-mono mt-3 mb-6 p-2 bg-slate-50 rounded border border-slate-200 break-all">{String(message).slice(0, 240)}</p>
            <div className="flex gap-2">
              <button onClick={this.handleReset} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700" data-testid="error-boundary-retry">
                Try again
              </button>
              <button onClick={this.handleReload} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200" data-testid="error-boundary-reload">
                Reload page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
