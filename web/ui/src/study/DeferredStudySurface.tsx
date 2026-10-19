import { Component, lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import './DeferredStudySurface.css';

type SurfaceLoader<P extends object> = () => Promise<{ default: ComponentType<P> }>;
interface Props<P extends object> {
  load: SurfaceLoader<P>;
  componentProps: P;
  label: string;
  onBack: () => void;
  backLabel: string;
}
interface State<P extends object> { failed: boolean; surface: LazyExoticComponent<ComponentType<P>> }

class SurfaceLoadError extends Error {}
function deferred<P extends object>(load: SurfaceLoader<P>) {
  return lazy(() => Promise.resolve().then(load).catch(() => { throw new SurfaceLoadError('Study view could not load.'); }));
}

/** A failed download retries here without remounting the room or other drafts. */
export class DeferredStudySurface<P extends object> extends Component<Props<P>, State<P>> {
  state: State<P> = { failed: false, surface: deferred(this.props.load) };
  static getDerivedStateFromError(error: unknown) {
    // Editor render failures still use the existing workspace draft recovery.
    if (!(error instanceof SurfaceLoadError)) throw error;
    return { failed: true };
  }
  retry = () => { this.setState({ failed: false, surface: deferred(this.props.load) }); };
  render() {
    const { label, onBack, backLabel, componentProps } = this.props;
    if (this.state.failed) return <section className="nooks-deferred-study" role="alert">
      <h2>{label} couldn’t load</h2>
      <p>Check your connection, then try again.</p>
      <div><button type="button" className="button primary" onClick={this.retry}>Try again</button><button type="button" className="button" onClick={onBack}>{backLabel}</button></div>
    </section>;
    const Surface = this.state.surface;
    return <Suspense fallback={<section className="nooks-deferred-study" aria-busy="true">
      <p role="status">Opening {label.toLowerCase()}…</p>
      <button type="button" className="button" onClick={onBack}>{backLabel}</button>
    </section>}><Surface {...componentProps}/></Suspense>;
  }
}
