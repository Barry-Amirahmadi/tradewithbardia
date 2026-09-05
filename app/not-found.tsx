import NotFoundContent from "@/components/sections/NotFoundContent";

/**
 * The last boundary: a path that never resolved to a locale. Renders inside
 * the document shell, so unlike the framework's internal error document it
 * carries the application's stylesheet and brand.
 */
export default function RootNotFound() {
  return <NotFoundContent />;
}
