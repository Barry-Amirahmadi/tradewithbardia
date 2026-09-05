import type { ReactNode } from "react";

/**
 * The page shell contract — master prompt §63.
 *
 * Every route renders exactly one of these and nothing else carries
 * `id="main"`. Before this existed the home page put the id on a div *inside*
 * an unnamed `<main>` while other routes put it on `<main>` itself, so the
 * skip link pointed at a different kind of node depending on the route.
 *
 * `tabIndex={-1}` is what makes the skip link actually work. Following a
 * fragment to a non-focusable element scrolls the viewport but leaves keyboard
 * focus where it was, so the next Tab resumes inside the navigation the user
 * just asked to skip. -1 keeps it programmatically focusable without adding it
 * to the tab order, and the focus ring is suppressed because reaching a
 * landmark is not the same as focusing a control.
 */
export default function PageMain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main id="main" tabIndex={-1} className={className}>
      {children}
    </main>
  );
}
