import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { PHRASES, type AudienceConfig, type Kind } from "@/lib/audience";
import type { CrowdAudio, CrowdSound } from "@/lib/crowd-audio";

type Action = "watch" | "clap" | "cheer" | "jump" | "talk" | "laugh" | "skeptic" | "boo" | "mock" | "throw" | "walk";

interface Member {
  kind: Kind;
  seat: THREE.Vector3;
  pos: THREE.Vector3;
  yaw: number;
  action: Action;
  t: number;
  dur: number;
  phase: number;
  talkDir: number;
  path: THREE.Vector3[];
  bubbleCd: number;
  scaleW: number;
  scaleH: number;
  hair: 0 | 1 | 2 | 3; // cap, bun, none, full
  threw: boolean;
  blinkT: number;
}

interface Bubble {
  id: number;
  kind: Kind;
  text: string;
  pos: [number, number, number];
  until: number;
}

interface Stone {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  floor: number;
  spin: number;
}

interface Ring {
  active: boolean;
  pos: THREE.Vector3;
  t: number;
}

export const COLS = 20;
const SPACING = 0.95;
const ROW_DEPTH = 1.15;
const RISE = 0.38;
const FRONT_Z = 3;
const AISLE = 1.6;
const MAX_STONES = 14;
const MAX_RINGS = 10;
const GRAVITY = 9.8;

export function seatPosition(row: number, col: number) {
  const half = COLS / 2;
  const side = col < half ? -1 : 1;
  const idx = col < half ? half - 1 - col : col - half;
  const x = side * (AISLE / 2 + SPACING / 2 + idx * SPACING);
  return new THREE.Vector3(x, row * RISE, FRONT_Z + row * ROW_DEPTH);
}

const LOVER_WEIGHTS: [Action, number][] = [["clap", 0.25], ["cheer", 0.2], ["jump", 0.15], ["watch", 0.2], ["talk", 0.1], ["laugh", 0.1]];
const NEUTRAL_WEIGHTS: [Action, number][] = [["watch", 0.45], ["talk", 0.25], ["clap", 0.1], ["laugh", 0.08], ["walk", 0.12]];

function haterWeights(intensity: number): [Action, number][] {
  switch (intensity) {
    case 0:
      return [["watch", 0.5], ["talk", 0.3], ["skeptic", 0.2]];
    case 1:
      return [["skeptic", 0.3], ["watch", 0.3], ["talk", 0.25], ["boo", 0.08], ["mock", 0.07]];
    case 2:
      return [["skeptic", 0.28], ["boo", 0.2], ["mock", 0.18], ["watch", 0.18], ["talk", 0.16]];
    default:
      return [["boo", 0.3], ["mock", 0.28], ["skeptic", 0.22], ["watch", 0.1], ["talk", 0.1]];
  }
}

function pick(kind: Kind, hw: [Action, number][]): Action {
  const table = kind === "lover" ? LOVER_WEIGHTS : kind === "hater" ? hw : NEUTRAL_WEIGHTS;
  let r = Math.random();
  for (const [a, w] of table) if ((r -= w) <= 0) return a;
  return "watch";
}

const SHIRTS = ["#3d5a80", "#6b4f3a", "#8a8d91", "#2f4f4f", "#7a3b4a", "#c9a66b", "#4a4e69", "#556b2f", "#9c6644", "#e0e1dd", "#5e503f", "#22333b", "#7f5539", "#3a5a40", "#9b2226", "#4361ee"];
const SKINS = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#a1665e", "#6b4a2f", "#f7d7c4"];
const HAIR_COLORS = ["#1a1512", "#3b2a1a", "#6b4a2a", "#a67c3d", "#c9c9c9", "#7a3b22", "#2a2a2a", "#d8b98a"];
const BADGE: Record<Kind, string> = { lover: "#f5b942", hater: "#e0452f", neutral: "#000000" };
const SOUND: Partial<Record<Action, CrowdSound>> = { clap: "clap", cheer: "cheer", jump: "cheer", boo: "boo", laugh: "laugh", mock: "laugh" };
const BUBBLE_ACTIONS: Action[] = ["cheer", "jump", "boo", "mock", "talk", "skeptic"];

interface Props {
  config: AudienceConfig;
  running: MutableRefObject<boolean>;
  audio: CrowdAudio;
  showRoles: boolean;
}

export function Audience({ config, running, audio, showRoles }: Props) {
  const rows = Math.ceil(config.size / COLS);
  const hw = useMemo(() => haterWeights(config.intensity), [config.intensity]);

  const members = useMemo<Member[]>(() => {
    const seats: THREE.Vector3[] = [];
    for (let r = 0; r < rows; r++) {
      const cols = [...Array(COLS).keys()].sort((a, b) => Math.abs(a - (COLS - 1) / 2) - Math.abs(b - (COLS - 1) / 2));
      for (const c of cols) seats.push(seatPosition(r, c));
    }
    const kinds: Kind[] = [
      ...Array(config.lovers).fill("lover"),
      ...Array(config.haters).fill("hater"),
      ...Array(config.size - config.lovers - config.haters).fill("neutral"),
    ];
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
    }
    return kinds.map((kind, i) => ({
      kind,
      seat: seats[i]!.clone(),
      pos: seats[i]!.clone(),
      yaw: Math.PI,
      action: "watch" as Action,
      t: 0,
      dur: 1 + Math.random() * 4,
      phase: Math.random() * 10,
      talkDir: Math.random() < 0.5 ? -1 : 1,
      path: [],
      bubbleCd: Math.random() * 5,
      scaleW: 0.9 + Math.random() * 0.25,
      scaleH: 0.92 + Math.random() * 0.16,
      hair: (Math.random() < 0.4 ? 0 : Math.random() < 0.65 ? 1 : Math.random() < 0.7 ? 3 : 2) as 0 | 1 | 2 | 3,
      threw: false,
      blinkT: 1 + Math.random() * 4,
    }));
  }, [config, rows]);

  const geo = useMemo(() => {
    const torso = new THREE.CylinderGeometry(0.17, 0.22, 0.6, 8);
    const head = new THREE.SphereGeometry(0.15, 12, 10);
    const hair = new THREE.SphereGeometry(0.155, 10, 8);
    const arm = new THREE.CapsuleGeometry(0.05, 0.42, 3, 6).translate(0, -0.25, 0);
    const leg = new THREE.CapsuleGeometry(0.075, 0.42, 3, 6).translate(0, -0.25, 0);
    const badge = new THREE.OctahedronGeometry(0.08);
    const eye = new THREE.SphereGeometry(0.03, 8, 6);
    const pupil = new THREE.SphereGeometry(0.014, 6, 6);
    const brow = new THREE.BoxGeometry(0.05, 0.014, 0.018);
    const nose = new THREE.SphereGeometry(0.026, 8, 6);
    const ear = new THREE.SphereGeometry(0.032, 6, 6).scale(0.55, 1, 0.8);
    const mouth = new THREE.SphereGeometry(0.034, 10, 8).scale(1, 0.4, 0.5);
    const seat = new THREE.BoxGeometry(0.8, 1, 0.7);
    const stone = new THREE.DodecahedronGeometry(0.09);
    const ring = new THREE.RingGeometry(0.28, 0.38, 24).rotateX(-Math.PI / 2);
    return { torso, head, hair, arm, leg, badge, seat, stone, ring, eye, pupil, brow, nose, ear, mouth };
  }, []);

  const refs = {
    torso: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    hair: useRef<THREE.InstancedMesh>(null),
    armL: useRef<THREE.InstancedMesh>(null),
    armR: useRef<THREE.InstancedMesh>(null),
    legL: useRef<THREE.InstancedMesh>(null),
    legR: useRef<THREE.InstancedMesh>(null),
    badge: useRef<THREE.InstancedMesh>(null),
    eye: useRef<THREE.InstancedMesh>(null),
    pupil: useRef<THREE.InstancedMesh>(null),
    brow: useRef<THREE.InstancedMesh>(null),
    nose: useRef<THREE.InstancedMesh>(null),
    ear: useRef<THREE.InstancedMesh>(null),
    mouth: useRef<THREE.InstancedMesh>(null),
    seat: useRef<THREE.InstancedMesh>(null),
    stone: useRef<THREE.InstancedMesh>(null),
    ring: useRef<THREE.InstancedMesh>(null),
  };

  const rig = useMemo(() => {
    const root = new THREE.Object3D();
    const torso = new THREE.Object3D();
    const head = new THREE.Object3D();
    const hair = new THREE.Object3D();
    const armL = new THREE.Object3D();
    const armR = new THREE.Object3D();
    const legL = new THREE.Object3D();
    const legR = new THREE.Object3D();
    const badge = new THREE.Object3D();
    const eyeL = new THREE.Object3D();
    const eyeR = new THREE.Object3D();
    const pupilL = new THREE.Object3D();
    const pupilR = new THREE.Object3D();
    const browL = new THREE.Object3D();
    const browR = new THREE.Object3D();
    const nose = new THREE.Object3D();
    const earL = new THREE.Object3D();
    const earR = new THREE.Object3D();
    const mouth = new THREE.Object3D();
    root.add(torso, legL, legR);
    torso.add(head, armL, armR, badge);
    head.add(hair, eyeL, eyeR, pupilL, pupilR, browL, browR, nose, earL, earR, mouth);
    torso.position.set(0, 0.85, 0);
    head.position.set(0, 0.47, 0);
    hair.position.set(0, 0.05, 0);
    eyeL.position.set(-0.058, 0.03, 0.13);
    eyeR.position.set(0.058, 0.03, 0.13);
    pupilL.position.set(-0.058, 0.03, 0.152);
    pupilR.position.set(0.058, 0.03, 0.152);
    browL.position.set(-0.058, 0.078, 0.135);
    browR.position.set(0.058, 0.078, 0.135);
    nose.position.set(0, -0.005, 0.152);
    earL.position.set(-0.15, 0.01, -0.01);
    earR.position.set(0.15, 0.01, -0.01);
    mouth.position.set(0, -0.062, 0.14);
    armL.position.set(-0.25, 0.25, 0);
    armR.position.set(0.25, 0.25, 0);
    legL.position.set(-0.1, 0.55, 0);
    legR.position.set(0.1, 0.55, 0);
    badge.position.set(0, 0.85, 0);
    return { root, torso, head, hair, armL, armR, legL, legR, badge, eyeL, eyeR, pupilL, pupilR, browL, browR, nose, earL, earR, mouth };
  }, []);

  const stones = useMemo<Stone[]>(
    () => Array.from({ length: MAX_STONES }, () => ({ active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), floor: 0, spin: Math.random() * 6 })),
    [],
  );
  const rings = useMemo<Ring[]>(() => Array.from({ length: MAX_RINGS }, () => ({ active: false, pos: new THREE.Vector3(), t: 0 })), []);

  // static colors + seats
  useLayoutEffect(() => {
    const c = new THREE.Color();
    members.forEach((m, i) => {
      refs.torso.current!.setColorAt(i, c.set(SHIRTS[(i * 7) % SHIRTS.length]!));
      const skin = c.set(SKINS[(i * 5) % SKINS.length]!);
      refs.head.current!.setColorAt(i, skin);
      refs.armL.current!.setColorAt(i, skin);
      refs.armR.current!.setColorAt(i, skin);
      refs.nose.current!.setColorAt(i, skin);
      refs.ear.current!.setColorAt(i * 2, skin);
      refs.ear.current!.setColorAt(i * 2 + 1, skin);
      refs.eye.current!.setColorAt(i * 2, c.set("#f2ece1"));
      refs.eye.current!.setColorAt(i * 2 + 1, c.set("#f2ece1"));
      refs.pupil.current!.setColorAt(i * 2, c.set("#171008"));
      refs.pupil.current!.setColorAt(i * 2 + 1, c.set("#171008"));
      refs.mouth.current!.setColorAt(i, c.set("#6b2f28"));
      refs.hair.current!.setColorAt(i, c.set(HAIR_COLORS[(i * 11) % HAIR_COLORS.length]!));
      refs.brow.current!.setColorAt(i * 2, c);
      refs.brow.current!.setColorAt(i * 2 + 1, c);
      refs.badge.current!.setColorAt(i, c.set(BADGE[m.kind]));
    });
    Object.values(refs).forEach((r) => r.current?.instanceColor && (r.current.instanceColor.needsUpdate = true));
    const d = new THREE.Object3D();
    let k = 0;
    for (let r = 0; r < rows; r++)
      for (let col = 0; col < COLS; col++) {
        const p = seatPosition(r, col);
        d.position.set(p.x, p.y + 0.25, p.z + 0.2);
        d.scale.set(1, 0.5, 1);
        d.updateMatrix();
        refs.seat.current!.setMatrixAt(k++, d.matrix);
        // seat back
        d.position.set(p.x, p.y + 0.75, p.z + 0.55);
        d.scale.set(1, 1, 0.15);
        d.updateMatrix();
        refs.seat.current!.setMatrixAt(k++, d.matrix);
      }
    refs.seat.current!.instanceMatrix.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, rows]);

  // blend the looping tunes to the current crowd split
  useEffect(() => {
    audio.setMix(config.lovers, config.haters);
  }, [audio, config.lovers, config.haters]);

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const bubbleRef = useRef<Bubble[]>([]);
  const clock = useRef(0);
  const idRef = useRef(0);

  useFrame((_, raw) => {
    const live = running.current;
    const dt = live ? Math.min(raw, 0.05) : 0;
    clock.current += dt;
    const now = clock.current;
    let walkers = 0;
    for (const m of members) if (m.action === "walk") walkers++;

    let bubblesChanged = false;
    if (bubbleRef.current.some((b) => b.until < now)) {
      bubbleRef.current = bubbleRef.current.filter((b) => b.until >= now);
      bubblesChanged = true;
    }

    const { root, torso, head, hair, armL, armR, legL, legR, badge } = rig;
    const { eyeL, eyeR, pupilL, pupilR, browL, browR, nose, earL, earR, mouth } = rig;

    const spawnRing = (p: THREE.Vector3) => {
      const r = rings.find((r) => !r.active);
      if (!r) return;
      r.active = true;
      r.t = 0;
      r.pos.copy(p);
      r.pos.y += 0.03;
    };

    const spawnStone = (from: THREE.Vector3) => {
      const s = stones.find((s) => !s.active);
      if (!s) return;
      const onStage = Math.random() < 0.6;
      const tx = THREE.MathUtils.clamp(from.x * 0.35 + (Math.random() - 0.5) * 3, -5.5, 5.5);
      const ty = onStage ? 1.05 : 0.05;
      const tz = onStage ? -3.5 + Math.random() * 3 : 0.6 + Math.random() * 1.4;
      const T = 0.9 + Math.random() * 0.5;
      s.active = true;
      s.pos.set(from.x, from.y + 1.5, from.z);
      s.vel.set((tx - s.pos.x) / T, (ty - s.pos.y) / T + 0.5 * GRAVITY * T, (tz - s.pos.z) / T);
      s.floor = ty;
    };

    members.forEach((m, i) => {
      m.t += dt;
      m.bubbleCd -= dt;
      // choose next action
      if (live && m.action !== "walk" && m.t > m.dur) {
        let next = pick(m.kind, hw);
        if (next === "walk" && walkers >= 3) next = "watch";
        if (
          m.kind === "hater" &&
          config.stones &&
          config.intensity >= 2 &&
          next !== "walk" &&
          Math.random() < 0.08 * config.intensity
        )
          next = "throw";
        m.action = next;
        m.t = 0;
        m.threw = false;
        m.dur = next === "watch" ? 2 + Math.random() * 5 : next === "throw" ? 1.6 : 2 + Math.random() * 3;
        if (next === "walk") {
          walkers++;
          const aisleX = 0;
          m.path = [
            new THREE.Vector3(aisleX, m.seat.y, m.seat.z - 0.45),
            new THREE.Vector3(aisleX, 0, FRONT_Z - 1.2),
            new THREE.Vector3(aisleX, m.seat.y, m.seat.z - 0.45),
            m.seat.clone(),
          ];
          m.path[0]!.x = m.seat.x;
          m.path.splice(1, 0, new THREE.Vector3(aisleX, m.seat.y, m.seat.z - 0.45));
        }
        if (next === "talk") m.talkDir = Math.random() < 0.5 ? -1 : 1;
        const s = SOUND[next];
        if (s && Math.random() < 0.6) audio.play(s);
        if (
          BUBBLE_ACTIONS.includes(next) &&
          m.bubbleCd <= 0 &&
          bubbleRef.current.length < 6 &&
          Math.random() < 0.4
        ) {
          const list = PHRASES[m.kind];
          bubbleRef.current = [
            ...bubbleRef.current,
            {
              id: idRef.current++,
              kind: m.kind,
              text: list[Math.floor(Math.random() * list.length)]!,
              pos: [m.pos.x, m.pos.y + 2.1, m.pos.z],
              until: now + 2.8,
            },
          ];
          m.bubbleCd = 6 + Math.random() * 6;
          bubblesChanged = true;
        }
      }
      if (m.action === "talk") talkers++;

      const t = now + m.phase;
      let lift = 0;
      let bob = 0;
      let lean = 0;
      let targetYaw = Math.PI;
      let hx = 0, hy = 0, hz = 0;
      let aLx = -0.6, aLz = 0.1, aRx = -0.6, aRz = -0.1;
      let lLx = -1.45, lRx = -1.45;
      const standing = ["cheer", "jump", "throw", "walk"].includes(m.action) || (m.action === "boo" && m.t < 1.5);

      switch (m.action) {
        case "watch":
          hy = Math.sin(t * 0.4) * 0.25;
          hx = Math.sin(t * 0.3) * 0.08;
          break;
        case "clap": {
          const c = Math.sin(t * 16);
          aLx = aRx = -1.25;
          aLz = 0.45 + c * 0.25;
          aRz = -0.45 - c * 0.25;
          hx = -0.1;
          break;
        }
        case "cheer":
          aLx = -2.9 + Math.sin(t * 9) * 0.25;
          aRx = -2.9 + Math.cos(t * 9) * 0.25;
          aLz = -0.25;
          aRz = 0.25;
          bob = Math.abs(Math.sin(t * 7)) * 0.15;
          hx = -0.25;
          break;
        case "jump":
          aLx = -2.95 + Math.sin(t * 10) * 0.15;
          aRx = -2.95 + Math.cos(t * 10) * 0.15;
          aLz = -0.35;
          aRz = 0.35;
          bob = Math.abs(Math.sin(t * 6)) * 0.34;
          hx = -0.2;
          break;
        case "talk":
          targetYaw = Math.PI - m.talkDir * 0.9;
          aRx = -0.9 + Math.sin(t * 5) * 0.35;
          hx = Math.sin(t * 6) * 0.08;
          hz = m.talkDir * 0.1;
          lean = 0.12;
          break;
        case "laugh":
          lean = -0.15 + Math.abs(Math.sin(t * 10)) * -0.1;
          hx = -0.35;
          aLx = aRx = -0.9;
          aLz = 0.6;
          aRz = -0.6;
          bob = Math.abs(Math.sin(t * 10)) * 0.04;
          break;
        case "skeptic":
          aLx = aRx = -1.5;
          aLz = -0.95;
          aRz = 0.95;
          lean = -0.15;
          hy = Math.sin(t * 2.5) * 0.35;
          hz = 0.15;
          break;
        case "boo":
          aRx = -1.6;
          aRz = 0.2 + Math.sin(t * 6) * 0.1;
          lean = 0.2;
          hx = 0.15;
          hy = Math.sin(t * 4) * 0.2;
          break;
        case "mock":
          // mocking laugh: lean back, pointing arm, head shaking
          lean = -0.18;
          hx = -0.3;
          hy = Math.sin(t * 7) * 0.3;
          aRx = -1.4;
          aRz = -0.2;
          aLx = -0.7;
          aLz = 0.5;
          bob = Math.abs(Math.sin(t * 9)) * 0.05;
          break;
        case "throw": {
          // windup then overhead swing; stone releases mid-swing
          const k = Math.min(m.t / 0.7, 1);
          aRx = -2.6 + k * 2.3;
          aRz = 0.15;
          aLx = -0.8;
          lean = 0.12 + k * 0.1;
          hx = 0.1;
          if (!m.threw && m.t > 0.55) {
            m.threw = true;
            spawnStone(m.pos);
          }
          break;
        }
        case "walk": {
          const target = m.path[0];
          if (target) {
            const dx = target.x - m.pos.x, dy = target.y - m.pos.y, dz = target.z - m.pos.z;
            const dist = Math.hypot(dx, dy, dz);
            const step = 1.1 * dt;
            if (dist <= step) {
              m.pos.copy(target);
              m.path.shift();
            } else {
              m.pos.x += (dx / dist) * step;
              m.pos.y += (dy / dist) * step;
              m.pos.z += (dz / dist) * step;
              if (Math.hypot(dx, dz) > 0.05) targetYaw = Math.atan2(dx, dz);
              else targetYaw = m.yaw;
            }
          } else {
            m.action = "watch";
            m.t = 0;
            m.dur = 3;
          }
          const w = Math.sin(t * 8);
          lLx = w * 0.5;
          lRx = -w * 0.5;
          aLx = -w * 0.4;
          aRx = w * 0.4;
          bob = Math.abs(w) * 0.04;
          if (!m.path.length) targetYaw = Math.PI;
          break;
        }
      }
      if (standing) {
        lift = 0.3;
        if (m.action !== "walk") lLx = lRx = 0;
      }
      if (m.action === "walk" && m.path.length) lift = 0.3;
      if (m.action !== "walk") targetYaw = m.action === "talk" ? targetYaw : Math.PI;

      // smooth yaw
      let dy = targetYaw - m.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      m.yaw += dy * (1 - Math.exp(-6 * (dt || 0.016)));

      root.position.set(m.pos.x, m.pos.y + lift * 1 + bob, m.pos.z);
      root.rotation.set(0, m.yaw, 0);
      root.scale.set(m.scaleW, m.scaleH, m.scaleW);
      torso.rotation.set(lean, 0, 0);
      head.rotation.set(hx, hy, hz);
      if (m.hair === 0) {
        hair.position.set(0, 0.05, 0);
        hair.scale.set(1.05, 0.7, 1.05);
      } else if (m.hair === 1) {
        hair.position.set(0, 0.14, -0.06);
        hair.scale.setScalar(0.55);
      } else {
        hair.scale.setScalar(0);
      }
      armL.rotation.set(aLx, 0, aLz);
      armR.rotation.set(aRx, 0, aRz);
      legL.rotation.set(lLx, 0, 0);
      legR.rotation.set(lRx, 0, 0);
      badge.rotation.set(0, t * 2, 0);
      badge.scale.setScalar(showRoles && m.kind !== "neutral" ? 1 : 0);
      // facial expression: blinking, brow angles, mouth movement
      m.blinkT -= dt;
      if (m.blinkT < -0.12) m.blinkT = 2 + Math.random() * 4;
      const blink = m.blinkT < 0 ? 0.12 : 1;
      eyeL.scale.set(1, blink, 1);
      eyeR.scale.set(1, blink, 1);
      pupilL.scale.setScalar(blink);
      pupilR.scale.setScalar(blink);
      let bl = 0;
      let br = 0;
      if (m.action === "skeptic") {
        bl = -0.45;
        br = 0.25;
      } else if (m.action === "boo" || m.action === "mock") {
        bl = -0.35;
        br = -0.35;
      } else if (m.action === "cheer" || m.action === "jump") {
        bl = 0.3;
        br = -0.3;
      }
      browL.rotation.z = bl;
      browR.rotation.z = br;
      const vocal = ["talk", "clap", "laugh", "cheer", "boo", "mock", "jump"].includes(m.action);
      mouth.scale.set(1, vocal ? 0.7 + Math.abs(Math.sin(t * 11)) * 0.9 : 1, 1);
      root.updateMatrixWorld(true);
      refs.torso.current!.setMatrixAt(i, torso.matrixWorld);
      refs.head.current!.setMatrixAt(i, head.matrixWorld);
      refs.hair.current!.setMatrixAt(i, hair.matrixWorld);
      refs.armL.current!.setMatrixAt(i, armL.matrixWorld);
      refs.armR.current!.setMatrixAt(i, armR.matrixWorld);
      refs.legL.current!.setMatrixAt(i, legL.matrixWorld);
      refs.legR.current!.setMatrixAt(i, legR.matrixWorld);
      refs.badge.current!.setMatrixAt(i, badge.matrixWorld);
      refs.eye.current!.setMatrixAt(i * 2, eyeL.matrixWorld);
      refs.eye.current!.setMatrixAt(i * 2 + 1, eyeR.matrixWorld);
      refs.pupil.current!.setMatrixAt(i * 2, pupilL.matrixWorld);
      refs.pupil.current!.setMatrixAt(i * 2 + 1, pupilR.matrixWorld);
      refs.brow.current!.setMatrixAt(i * 2, browL.matrixWorld);
      refs.brow.current!.setMatrixAt(i * 2 + 1, browR.matrixWorld);
      refs.nose.current!.setMatrixAt(i, nose.matrixWorld);
      refs.ear.current!.setMatrixAt(i * 2, earL.matrixWorld);
      refs.ear.current!.setMatrixAt(i * 2 + 1, earR.matrixWorld);
      refs.mouth.current!.setMatrixAt(i, mouth.matrixWorld);
    });
    for (const k of ["torso", "head", "hair", "armL", "armR", "legL", "legR", "badge", "eye", "pupil", "brow", "nose", "ear", "mouth"] as const)
      refs[k].current!.instanceMatrix.needsUpdate = true;

    // stones in flight
    const d = new THREE.Object3D();
    stones.forEach((s, i) => {
      if (s.active && dt > 0) {
        s.vel.y -= GRAVITY * dt;
        s.pos.addScaledVector(s.vel, dt);
        if (s.pos.y <= s.floor && s.vel.y < 0) {
          s.active = false;
          s.pos.y = s.floor;
          spawnRing(s.pos);
          audio.play("thud");
        }
      }
      if (s.active) {
        d.position.copy(s.pos);
        d.rotation.set(now * 6 + s.spin, s.spin, now * 4);
        d.scale.setScalar(1);
      } else {
        d.scale.setScalar(0);
        d.position.set(0, -10, 0);
      }
      d.updateMatrix();
      refs.stone.current!.setMatrixAt(i, d.matrix);
    });
    refs.stone.current!.instanceMatrix.needsUpdate = true;

    // impact rings
    rings.forEach((r, i) => {
      if (r.active && dt > 0) {
        r.t += dt;
        if (r.t > 0.6) r.active = false;
      }
      if (r.active) {
        const k = r.t / 0.6;
        d.position.copy(r.pos);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(0.3 + k * 1.6);
      } else {
        d.scale.setScalar(0);
        d.position.set(0, -10, 0);
      }
      d.updateMatrix();
      refs.ring.current!.setMatrixAt(i, d.matrix);
    });
    refs.ring.current!.instanceMatrix.needsUpdate = true;

    if (bubblesChanged) setBubbles(bubbleRef.current);
  });

  const n = members.length;
  return (
    <group>
      <instancedMesh ref={refs.seat} args={[geo.seat, undefined, rows * COLS * 2]}>
        <meshStandardMaterial color="#6e1420" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={refs.torso} args={[geo.torso, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <instancedMesh ref={refs.head} args={[geo.head, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={refs.hair} args={[geo.hair, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={refs.eye} args={[geo.eye, undefined, n * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.25} />
      </instancedMesh>
      <instancedMesh ref={refs.pupil} args={[geo.pupil, undefined, n * 2]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={refs.brow} args={[geo.brow, undefined, n * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={refs.nose} args={[geo.nose, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={refs.ear} args={[geo.ear, undefined, n * 2]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={refs.mouth} args={[geo.mouth, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={refs.armL} args={[geo.arm, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={refs.armR} args={[geo.arm, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={refs.legL} args={[geo.leg, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial color="#2a2a33" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={refs.legR} args={[geo.leg, undefined, n]} frustumCulled={false}>
        <meshStandardMaterial color="#2a2a33" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={refs.badge} args={[geo.badge, undefined, n]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={refs.stone} args={[geo.stone, undefined, MAX_STONES]} frustumCulled={false}>
        <meshStandardMaterial color="#8b8b93" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={refs.ring} args={[geo.ring, undefined, MAX_RINGS]} frustumCulled={false}>
        <meshBasicMaterial color="#f5b942" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {bubbles.map((b) => (
        <Html key={b.id} position={b.pos} center distanceFactor={9} zIndexRange={[20, 0]}>
          <div className={`speech-bubble speech-${b.kind}`}>{b.text}</div>
        </Html>
      ))}
    </group>
  );
}
