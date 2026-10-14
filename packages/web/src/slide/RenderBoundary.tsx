/**
 * A slide that throws while rendering shows a red error box in its place and
 * tells its environment why, so `folio check`, `pdf` and `shot` report
 * FOLIO-RND-001 instead of a blank page. json-render's own boundary around
 * each element draws nothing, so this one sits inside it.
 */
import { Component, type ReactNode } from "react";
import { SlideEnvContext, type SlideEnv } from "./env";

interface Props {
  /** Clears a caught error when it changes: a new spec gets a new try. */
  resetKey: unknown;
  children: ReactNode;
}

export class RenderBoundary extends Component<Props, { error: string | null }> {
  static contextType = SlideEnvContext;
  declare context: SlideEnv | null;
  state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    this.context?.onRenderError?.(error instanceof Error ? error.message : String(error));
  }

  componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    return this.state.error === null ? this.props.children : <RenderError slide={this.context?.slideId ?? "?"} message={this.state.error} />;
  }
}

/** The box drawn over the whole slide in place of what failed. */
function RenderError({ slide, message }: { slide: string; message: string }) {
  return (
    <div data-render-error={slide} style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", gap: "10pt", background: "#fff", border: "4pt solid #d32f2f", color: "#d32f2f", font: "14pt var(--font-mono, monospace)", padding: "40pt", textAlign: "center" }}>
      <div style={{ fontWeight: 700, fontSize: "20pt" }}>Slide {slide} did not render</div>
      <div>{message}</div>
      <div style={{ color: "#555", fontSize: "11pt" }}>If the web app is older than its sources, run pnpm build:web.</div>
    </div>
  );
}
