'use client';

import { useState } from 'react';
import { fuelControls, fuelSim } from '@/lib/fuelControls';

type Knob = {
  label: string;
  key:
    | 'tension'
    | 'damping'
    | 'spread'
    | 'passes'
    | 'splashGain'
    | 'splashMax'
    | 'splashRadius';
  min: number;
  max: number;
  step: number;
  int?: boolean;
};

const KNOBS: { group: string; items: Knob[] }[] = [
  {
    group: 'Liquid',
    items: [
      { label: 'tension', key: 'tension', min: 0, max: 0.1, step: 0.001 },
      { label: 'damping', key: 'damping', min: 0, max: 0.2, step: 0.001 },
      { label: 'spread', key: 'spread', min: 0, max: 0.5, step: 0.005 },
      { label: 'passes', key: 'passes', min: 0, max: 10, step: 1, int: true },
    ],
  },
  {
    group: 'Splash',
    items: [
      { label: 'gain', key: 'splashGain', min: 0, max: 0.05, step: 0.0005 },
      { label: 'max', key: 'splashMax', min: 0, max: 20, step: 0.1 },
      { label: 'radius', key: 'splashRadius', min: 1, max: 20, step: 1, int: true },
    ],
  },
];

export function FuelControlsPanel() {
  if (process.env.NODE_ENV !== 'development') return null;
  return <Panel />;
}

function Panel() {
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 260,
        zIndex: 9999,
        background: 'rgba(15, 25, 35, 0.92)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        color: '#dfe6ee',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px)',
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%',
          padding: '8px 12px',
          background: 'transparent',
          color: '#dfe6ee',
          border: 'none',
          borderBottom: collapsed
            ? 'none'
            : '1px solid rgba(255,255,255,0.08)',
          textAlign: 'left',
          fontFamily: 'inherit',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        Liquid tuning
        <span style={{ opacity: 0.5 }}>{collapsed ? '+' : '−'}</span>
      </button>

      {!collapsed && (
        <div style={{ padding: '10px 12px' }}>
          {KNOBS.map((g) => (
            <div key={g.group} style={{ marginBottom: 12 }}>
              <div
                style={{
                  opacity: 0.5,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontSize: 10,
                  marginBottom: 6,
                }}
              >
                {g.group}
              </div>
              {g.items.map((k) => (
                <Row key={k.key} knob={k} onChange={rerender} />
              ))}
            </div>
          ))}
          <button
            type="button"
            onClick={() => fuelSim.calm()}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: '#2c8cff',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
              cursor: 'pointer',
            }}
          >
            CALM SURFACE
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ knob, onChange }: { knob: Knob; onChange: () => void }) {
  const value = fuelControls[knob.key];
  const display = knob.int ? Math.round(value).toString() : value.toFixed(3);
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 2,
        }}
      >
        <span>{knob.label}</span>
        <span style={{ opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={knob.min}
        max={knob.max}
        step={knob.step}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          (fuelControls as any)[knob.key] = knob.int ? Math.round(v) : v;
          onChange();
        }}
        style={{ width: '100%', accentColor: '#2c8cff' }}
      />
    </div>
  );
}
