import { FuelSlider } from '@/components/fuel/FuelSlider';
import { FuelControlsPanel } from '@/components/fuel/FuelControlsPanel';

export default function Page() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6">
      <FuelSlider />
      <FuelControlsPanel />
    </main>
  );
}
