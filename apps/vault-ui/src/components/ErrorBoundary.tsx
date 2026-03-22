import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label ?? '', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-[2rem] border border-rose-300/20 bg-rose-300/10 p-8">
          <p className="text-sm uppercase tracking-widest text-rose-300/70">
            {this.props.label ?? 'Something went wrong'}
          </p>
          <p className="mt-2 text-sm text-slate-200">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-2xl border border-white/10 px-4 py-2 text-sm text-white transition hover:border-white/30"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
