// /world — safe "coming soon". Deliberately contains no world code and reads no real state; the simulated POC lives at /world-dev (development only).
export const metadata = { title: "Northline World" };
export default function WorldComingSoon() {
  return (
    <div className="mx-auto max-w-xl pt-10 text-center">
      <h1 className="text-2xl font-bold">Northline World</h1>
      <p className="mt-3 text-muted">An explorable 3D view of the studio is being built. It is not available yet, and nothing here reflects real operations.</p>
    </div>
  );
}
