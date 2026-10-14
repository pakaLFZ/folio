/**
 * Picks the page from the bootstrap view: the landing page, the print page, or
 * the board and deck editor that move between each other in place.
 */
import { usePrintFigure } from "./extensions";
import { Landing } from "./landing/Landing";
import { PageShell } from "./PageShell";
import { PrintView } from "./print/PrintView";
import { TipProvider } from "./ui/tooltip";

/** The print page with the services' figure resolution. */
function Print() {
  return <PrintView figure={usePrintFigure()} />;
}

/**
 * The application root.
 *
 * @param props.view - which page the server asked for.
 */
export function App({ view }: { view: "landing" | "deck" | "inbox" }) {
  const print = new URLSearchParams(location.search).has("print");
  if (view === "deck" && print) return <Print />;
  return <TipProvider>{view === "landing" ? <Landing /> : <PageShell first={view} />}</TipProvider>;
}
