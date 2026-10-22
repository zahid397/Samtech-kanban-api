import { Component, lazy, Suspense, type ReactNode } from 'react';
import { useMascot, usePreferences } from '../lib/store';
const Mascot = lazy(() => import('./Mascot'));
function FlatSamm() {
  const state = useMascot((s) => s.state);
  return (
    <div className="mascot-fallback" role="img" aria-label={`Samm, your assistant, is ${state}`}>
      <div className="robot-face">
        <i />
        <i />
        <span />
      </div>
      <small>SAMM · {state.toUpperCase()}</small>
    </div>
  );
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <FlatSamm /> : this.props.children;
  }
}
export default function AssistantScene() {
  const low = usePreferences((s) => s.lowPerformance);
  if (low) return <FlatSamm />;
  return (
    <SceneBoundary>
      <Suspense
        fallback={
          <div className="companion-loading" role="status">
            Samm is getting ready…
          </div>
        }
      >
        <Mascot />
      </Suspense>
    </SceneBoundary>
  );
}
