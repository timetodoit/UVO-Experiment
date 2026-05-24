'use client';

import { button, Leva, useControls } from 'leva';
import { fuelControls, fuelSim } from '@/lib/fuelControls';

export function FuelControlsPanel() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Panel />;
}

function Panel() {
  useControls('Liquid', {
    tension: {
      value: fuelControls.tension,
      min: 0,
      max: 0.1,
      step: 0.001,
      onChange: (v) => {
        fuelControls.tension = v;
      },
    },
    damping: {
      value: fuelControls.damping,
      min: 0,
      max: 0.2,
      step: 0.001,
      onChange: (v) => {
        fuelControls.damping = v;
      },
    },
    spread: {
      value: fuelControls.spread,
      min: 0,
      max: 0.5,
      step: 0.005,
      onChange: (v) => {
        fuelControls.spread = v;
      },
    },
    passes: {
      value: fuelControls.passes,
      min: 0,
      max: 10,
      step: 1,
      onChange: (v) => {
        fuelControls.passes = v;
      },
    },
  });

  useControls('Splash', {
    gain: {
      value: fuelControls.splashGain,
      min: 0,
      max: 0.05,
      step: 0.0005,
      onChange: (v) => {
        fuelControls.splashGain = v;
      },
    },
    max: {
      value: fuelControls.splashMax,
      min: 0,
      max: 20,
      step: 0.1,
      onChange: (v) => {
        fuelControls.splashMax = v;
      },
    },
    radius: {
      value: fuelControls.splashRadius,
      min: 1,
      max: 20,
      step: 1,
      onChange: (v) => {
        fuelControls.splashRadius = v;
      },
    },
  });

  useControls('Actions', {
    calm: button(() => fuelSim.calm()),
  });

  return (
    <Leva
      collapsed={false}
      hidden={false}
      oneLineLabels
      titleBar={{ title: 'Liquid tuning', filter: false }}
    />
  );
}
