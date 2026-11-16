import { Vector3, type BufferGeometry, type Texture } from 'three';
import {
  HyperObject,
  type GyroVector,
  type MovingPart,
  type HyperMaterialOptions,
  type HyperWorld,
} from '../../engine';
import { L, t, type Localized } from '../../content/i18n';
import { merge } from '../geometry';
import { localizedCanvasTexture, shrinkToFit } from '../text';
import {
  DRAWERS,
  LABELLED,
  MOVING,
  TRAVEL,
  buildCabinet,
  drawerSeat,
  reachOf,
  type Cell,
  type Zone,
} from './cabinetParts';
import { chartsFor, intoChart, place, tessellate, widening, type Chart } from './cabinetTower';

// A chart on the ground cannot reach the sky pole, so the middle of the cabinet is its own object, placed up there.
const ATLAS = 1024;
const CARD_W = 256;
const CARD_H = 87;
const CARD_PITCH = 96;
const CARDS_BOTTOM = 320;
const MONO = 'ui-monospace, Consolas, monospace';
const CARD_PAPER = '#f6f1e2';
const INK = '#2b3138';
const BANDS = ['#c9503f', '#3f6fa8', '#5d9a56'];

function cell(x: number, y: number, w: number, h: number): Cell {
  return [(x + 1) / ATLAS, 1 - (y + h - 1) / ATLAS, (x + w - 1) / ATLAS, 1 - (y + 1) / ATLAS];
}

const CARD_CELLS: Cell[] = Array.from({ length: LABELLED }, (_, i) =>
  cell((i % 4) * CARD_W, Math.floor(i / 4) * CARD_PITCH, CARD_W, CARD_H),
);

const SPANS = ['a – f', 'g – l', 'm – r', 's – z'];

function range(letter: Localized, span: number): Localized {
  const [from, to] = SPANS[span].split(' – ');
  const write = (c: string) => `${c}${from} – ${c}${to}`;
  return L(write(letter.en), write(letter.tr));
}

const FIRST_LETTERS = [L('A', 'A'), L('B', 'B'), L('C', 'C')];
const LAST_LETTERS = [L('X', 'V'), L('Y', 'Y'), L('Z', 'Z')];
const STATION_LABELS = CARD_CELLS.map((_, i) => range(FIRST_LETTERS[Math.floor(i / 4)], i % 4));
const END_LABELS = CARD_CELLS.map((_, i) => range(LAST_LETTERS[Math.floor(i / 4)], i % 4));

function paintCards(ctx: CanvasRenderingContext2D, labels: Localized[]): void {
  ctx.fillStyle = CARD_PAPER;
  ctx.fillRect(0, 0, ATLAS, CARDS_BOTTOM);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  labels.forEach((label, i) => {
    const x = (i % 4) * CARD_W;
    const y = Math.floor(i / 4) * CARD_PITCH;
    ctx.fillStyle = BANDS[Math.floor(i / 4) % BANDS.length];
    ctx.fillRect(x, y, 26, CARD_H);
    ctx.fillStyle = INK;
    const text = t(label);
    shrinkToFit(50, 12, CARD_W - 26 - 28, (size) => {
      ctx.font = `600 ${size}px ${MONO}`;
      return ctx.measureText(text).width;
    });
    ctx.fillText(text, x + 26 + (CARD_W - 26) / 2, y + CARD_H / 2 + 2);
  });
}

function atlas(labels: Localized[]): Texture {
  return localizedCanvasTexture(ATLAS, ATLAS, (ctx) => {
    ctx.fillStyle = CARD_PAPER;
    ctx.fillRect(0, 0, ATLAS, ATLAS);
    paintCards(ctx, labels);
  });
}

type Batch = Map<HyperMaterialOptions, BufferGeometry[]>;

const OPENING = 1.5;
const CLOSING = 1.3;
const NEAR = 24;
const AT_ONCE = 2;

function eased(u: number): number {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

function openness(at: number, held: number): number {
  if (at < OPENING) return eased(at / OPENING);
  return 1 - eased((at - OPENING - held) / CLOSING);
}

interface Ride {
  parts: MovingPart[];
  chart: Chart;
  y: number;
  z: number;
  home: Vector3;
  started: number;
  held: number;
}

interface Pool {
  idle: Ride[];
  busy: Ride[];
  next: number;
}

export interface CabinetsResult {
  object: HyperObject;
  tick: (worldGV: GyroVector, dt: number) => void;
}

export function buildCabinets(world: HyperWorld, at: GyroVector, yaw: number): CabinetsResult {
  const charts = chartsFor(at, yaw);

  const stand = (name: string, gv: GyroVector, tanK: boolean, turn: number): HyperObject => {
    const object = new HyperObject(gv, tanK);
    object.name = name;
    object.rotation.y = turn;
    return object;
  };
  const floor = stand('cabinet:station', at, true, yaw);
  const run = stand('cabinet:station-run', at, true, yaw);
  const crown = stand('cabinet:pole', charts.pole.gv, false, 0);
  const farRun = stand('cabinet:far-run', charts.far.gv, true, 0);
  const end = stand('cabinet:far', charts.far.gv, true, 0);

  const homes: Record<Zone, { object: HyperObject; chart: Chart }> = {
    floor: { object: floor, chart: charts.station },
    run: { object: run, chart: charts.station },
    crown: { object: crown, chart: charts.pole },
    farRun: { object: farRun, chart: charts.far },
    end: { object: end, chart: charts.far },
  };

  const batches = new Map<string, Batch>();
  const sliding = new Map<number, Map<string, Batch>>();
  buildCabinet(
    (g, m, zone, slot = 'solid', drawer) => {
      const home = homes[zone];
      g.computeBoundingBox();
      const { min, max } = g.boundingBox!;
      const wide = widening(reachOf(zone, min.y, max.y));
      const fine = tessellate(g, 0.285, wide, zone === 'crown' ? wide : 1);
      intoChart(fine, home.chart);

      const key = `${zone}:${slot}`;
      let group = batches;
      if (drawer !== undefined) {
        group = sliding.get(drawer) ?? new Map();
        sliding.set(drawer, group);
      }
      let batch = group.get(key);
      if (!batch) group.set(key, (batch = new Map()));
      const parts = batch.get(m);
      if (parts) parts.push(fine);
      else batch.set(m, [fine]);
    },
    {
      label: (drawer) => CARD_CELLS[drawer] ?? CARD_CELLS[drawer - (DRAWERS - LABELLED)],
    },
  );

  const lit: HyperMaterialOptions = { ambient: 0.92, castShadow: false, receiveShadow: false };
  const text: Partial<Record<Zone, HyperMaterialOptions>> = {
    floor: { ...lit, map: atlas(STATION_LABELS) },
    end: { ...lit, map: atlas(END_LABELS) },
  };
  const aloft: HyperMaterialOptions = { castShadow: false, receiveShadow: false };
  const optionsFor = (zone: Zone, slot: string, m: HyperMaterialOptions): HyperMaterialOptions => {
    if (slot === 'text') return { ...m, ...text[zone] };
    return zone === 'floor' || zone === 'end' ? m : { ...m, ...aloft };
  };
  for (const [key, batch] of batches) {
    const [zone, slot] = key.split(':') as [Zone, string];
    for (const [m, parts] of batch) homes[zone].object.addGeometry(world.shared, merge(parts), optionsFor(zone, slot, m));
  }
  const handles = new Map<number, MovingPart[]>();
  for (const [drawer, group] of sliding) {
    const parts: MovingPart[] = [];
    for (const [key, batch] of group) {
      const [zone, slot] = key.split(':') as [Zone, string];
      for (const [m, pieces] of batch) {
        parts.push(
          homes[zone].object.addMovingGeometry(world.shared, merge(pieces), optionsFor(zone, slot, m), undefined, slot !== 'tray'),
        );
      }
    }
    handles.set(drawer, parts);
  }

  for (const object of [floor, end, run, farRun, crown]) world.add(object);

  const pools: Pool[] = [0, 1, 2].map(() => ({ idle: [], busy: [], next: 0 }));
  for (const i of MOVING) {
    const seat = drawerSeat(i);
    const chart = homes[seat.zone].chart;
    const ride: Ride = {
      parts: handles.get(i)!,
      chart,
      y: seat.y,
      z: seat.z,
      home: place(chart, 0, seat.y, seat.z, new Vector3()),
      started: 0,
      held: 0,
    };
    pools[i < NEAR ? 0 : i >= DRAWERS - NEAR ? 2 : 1].idle.push(ride);
  }

  const shift = new Vector3();
  let clock = 0;
  const tick = (_worldGV: GyroVector, dt: number): void => {
    clock += dt;
    for (const pool of pools) {
      if (clock >= pool.next && pool.busy.length < AT_ONCE && pool.idle.length > 0) {
        const [ride] = pool.idle.splice(Math.floor(Math.random() * pool.idle.length), 1);
        ride.started = clock;
        ride.held = 0.8 + Math.random() * 2.4;
        pool.busy.push(ride);
        pool.next = clock + 0.7 + Math.random() * 2.6;
      }
      for (let k = pool.busy.length - 1; k >= 0; k--) {
        const ride = pool.busy[k];
        const since = clock - ride.started;
        const done = since >= OPENING + ride.held + CLOSING;
        const out = done ? 0 : TRAVEL * openness(since, ride.held);
        // A drawer pushed straight out in authored space climbs off its runners: its path is the cabinet's own straight line, mapped into the chart.
        place(ride.chart, 0, ride.y, ride.z + out, shift).sub(ride.home);
        for (const part of ride.parts) part.moveTo(shift.x, shift.y, shift.z);
        if (done) {
          pool.busy.splice(k, 1);
          pool.idle.push(ride);
        }
      }
    }
  };

  return { object: floor, tick };
}
