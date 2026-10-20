import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { IconError, IconRefresh } from './components/Icons';
import { ToastProvider } from './components/Toast';
import { SearchProvider } from './layout/SearchContext';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: (count, error: any) => count < 1 && !(error?.status >= 400 && error?.status < 500) },
  },
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error(error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="login-page">
          <div className="login-card">
            <span className="icon-tile icon-tile-lg icon-tile-danger">
              <IconError size={26} />
            </span>
            <h1>Something went wrong</h1>
            <p className="muted">The page hit an unexpected error. Reloading usually fixes it.</p>
            <pre className="alert-text">{this.state.error.message}</pre>
            <button type="button" className="btn btn-primary" onClick={() => window.location.assign('/')}>
              <IconRefresh size={15} /> Reload Aqua LIMS
            </button>
          </div>
        </div>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <SearchProvider>
                <App />
              </SearchProvider>
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
