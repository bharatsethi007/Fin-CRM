import { Component, type ErrorInfo, type ReactNode } from 'react';

import { logger } from '../../utils/logger';

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Catches render errors in children and returns null so raw stack messages stay off-screen (logs only). */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    logger.error('UI error (hidden from user)', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.hasError ? null : this.props.children;
  }
}
