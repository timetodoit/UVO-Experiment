import { Hero } from '@/components/hero/Hero';
import { AfterHero } from '@/sections/AfterHero';
import { LenisProvider } from '@/components/LenisProvider';

export default function Page() {
  return (
    <LenisProvider>
      {/*
        Hero pins at top of viewport for 100vh of scroll (total page ~180vh);
        the scroll distance drives the camera dolly + dither reveal in later
        steps. For step 1 we just stack the sections.
      */}
      <main className="relative">
        <div className="sticky top-0 h-screen w-full">
          <Hero />
        </div>
        <AfterHero />
        {/* extra spacer so there's scroll runway for the future timeline */}
        <div className="h-[40vh] bg-white" aria-hidden="true" />
      </main>
    </LenisProvider>
  );
}
