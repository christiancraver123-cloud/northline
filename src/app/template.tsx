// Re-mounts on every navigation, so each page settles in once (the app's single page-load motion).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
