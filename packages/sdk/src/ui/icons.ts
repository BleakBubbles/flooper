// Interface icons from Lucide (https://lucide.dev, ISC license), as SVG strings.
// Each icon is imported by name, so the bundler keeps only the ones used here.
import {
  ArrowRight,
  CodeXml,
  Heart,
  SendHorizontal,
  SquareDashedMousePointer,
  X,
} from "lucide-static";

// Decorative: the buttons that use them carry their own accessible names.
const decorative = (svg: string) =>
  svg.trim().replace("<svg", '<svg aria-hidden="true" focusable="false"');

export const ICONS = {
  /** The pick button: a cursor clicking inside a dashed selection box. */
  pick: decorative(SquareDashedMousePointer),
  /** The chip for a picked element: `</>`, an element of the page. */
  element: decorative(CodeXml),
  close: decorative(X),
  /** The key that accepts the example message. */
  arrowRight: decorative(ArrowRight),
  heart: decorative(Heart),
  /** The Send button: a paper plane, flying flat. */
  send: decorative(SendHorizontal),
};
