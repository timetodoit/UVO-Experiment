export function AfterHero() {
  return (
    <section className="relative bg-white text-black">
      <div className="mx-auto max-w-5xl px-10 py-32">
        <h2 className="text-5xl font-medium tracking-tight">
          Intelligence, surfaced.
        </h2>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-black/70">
          Below the waterline, Hydraoo consolidates every signal your fleet
          produces — from engine telemetry to crew rotations — and turns it into
          decisions you can act on from shore.
        </p>

        <div className="mt-20 grid gap-10 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-medium">Route intelligence</h3>
            <p className="mt-2 text-sm text-black/60">
              Weather-aware routing that learns from your fleet's own history.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-medium">Fleet health</h3>
            <p className="mt-2 text-sm text-black/60">
              Predictive maintenance built on years of operational telemetry.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-medium">Crew insights</h3>
            <p className="mt-2 text-sm text-black/60">
              Operations context so captains and shore teams stay in sync.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
