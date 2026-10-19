import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { PHRASES, type AudienceConfig, type Kind } from "@/lib/audience";
import type { CrowdAudio, CrowdSound } from "@/lib/crowd-audio";

type Action = "watch" | "clap" | "cheer" | "talk" | "laugh" | "skeptic" | "boo" | "walk";

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
}

interface Bubble {
  id: number;
  kind: Kind;
  text: string;
  pos: [number, number, number];
  until: number;
}

export const COLS = 16;
const SPACING = 0.95;
const ROW_DEPTH = 1.15;
const RISE = 0.38;
const FRONT_Z = 3;
const AISLE = 1.6;

export function seatPosition(row: number, col: number) {
  const half = COLS / 2;
  const side = col < half ? -1 : 1;
  const idx = col < half ? half - 1 - col : col - half;
  const x = side * (AISLE / 2 + SPACING / 2 + idx * SPACING);
  return new THREE.Vector3(x, row * RISE, FRONT_Z + row * ROW_DEPTH);
}

const WEIGHTS: Record<Kind, [Action, number][]> = {
  lover: [["clap", 0.3], ["cheer", 0.25], ["watch", 0.25], ["talk", 0.1], ["laugh", 0.1]],
  hater: [["skeptic", 0.35], ["boo", 0.15], ["watch", 0.25], ["talk", 0.2], ["laugh", 0.05]],
  neutral: [["watch", 0.45], ["talk", 0.25], ["clap", 0.1], ["laugh", 0.08], ["walk", 0.12]],
};

function pick(kind: Kind): Action {
  let r = Math.random();
  for (const [a, w] of WEIGHTS[kind]) if ((r -= w) <= 0) return a;
  return "watch";
}

const SHIRTS = ["#3d5a80", "#6b4f3a", "#8a8d91", "#2f4f4f", "#7a3b4a", "#c9a66b", "#4a4e69", "#556b2f", "#9c6644", "#e0e1dd"];
const SKINS = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac", "#a1665e"];
const BADGE: Record<Kind, string> = { lover: "#f5b942", hater: "#e0452f", neutral: "#000000" };
const SOUND: Partial<Record<Action, CrowdSound>> = { clap: "clap", cheer: "cheer", boo: "boo", laugh: "laugh" };

interface Props {
  config: AudienceConfig;
  running: MutableRefObject<boolean>;
  audio: CrowdAudio;
  showRoles: boolean;
}

export function Audience({ config, running, audio, showRoles }: Props) {
  const rows = Math.ceil(config.size / COLS);

  const members = useMemo<Member[]>(() => {
    const seats: THREE.Vector3[] = [];
    for (let r = 0; r < rows; r++) {
      const cols = [...Array(COLS).keys()].sort((a, b) => Math.abs(a - 7.5) - Math.abs(b - 7.5));
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
    }));
  }, [config, rows]);

  const geo = useMemo(() => {
    const torso = new THREE.CylinderGeometry(0.17, 0.22, 0.6, 8);
    const head = new THREE.SphereGeometry(0.15, 12, 10);
    const arm = new THREE.CapsuleGeometry(0.05, 0.42, 3, 6).translate(0, -0.25, 0);
    const leg = new THREE.CapsuleGeometry(0.075, 0.42, 3, 6).translate(0, -0.25, 0);
    const badge = new THREE.OctahedronGeometry(0.08);
    const seat = new THREE.BoxGeometry(0.8, 1, 0.7);
    return { torso, head, arm, leg, badge, seat };
  }, []);

  const refs = {
    torso: useRef<THREE.InstancedMesh>(null),
    head: useRef<THREE.InstancedMesh>(null),
    armL: useRef<THREE.InstancedMesh>(null),
    armR: useRef<THREE.InstancedMesh>(null),
    legL: useRef<THREE.InstancedMesh>(null),
    legR: useRef<THREE.InstancedMesh>(null),
    badge: useRef<THREE.InstancedMesh>(null),
    seat: useRef<THREE.InstancedMesh>(null),
  };

  const rig = useMemo(() => {
    const root = new THREE.Object3D();
    const torso = new THREE.Object3D();
    const head = new THREE.Object3D();
    const armL = new THREE.Object3D();
    const armR = new THREE.Object3D();
    const legL = new THREE.Object3D();
    const legR = new THREE.Object3D();
    const badge = new THREE.Object3D();
    root.add(torso, legL, legR);
    torso.add(head, armL, armR, badge);
    torso.position.set(0, 0.85, 0);
    head.position.set(0, 0.47, 0);
    armL.position.set(-0.25, 0.25, 0);
    armR.position.set(0.25, 0.25, 0);
    legL.position.set(-0.1, 0.55, 0);
    legR.position.set(0.1, 0.55, 0);
    badge.position.set(0, 0.85, 0);
    return { root, torso, head, armL, armR, legL, legR, badge };
  }, []);

  // static colors + seats
  useLayoutEffect(() => {
    const c = new THREE.Color();
    members.forEach((m, i) => {
      refs.torso.current!.setColorAt(i, c.set(SHIRTS[(i * 7) % SHIRTS.length]!));
      const skin = c.set(SKINS[(i * 5) % SKINS.length]!);
      refs.head.current!.setColorAt(i, skin);
      refs.armL.current!.setColorAt(i, skin);
      refs.armR.current!.setColorAt(i, skin);
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
    let talkers = 0;
    for (const m of members) if (m.action === "walk") walkers++;

    let bubblesChanged = false;
    if (bubbleRef.current.some((b) => b.until < now)) {
      bubbleRef.current = bubbleRef.current.filter((b) => b.until >= now);
      bubblesChanged = true;
    }

    const { root, torso, head, armL, armR, legL, legR, badge } = rig;

    members.forEach((m, i) => {
      m.t += dt;
      m.bubbleCd -= dt;
      // choose next action
      if (live && m.action !== "walk" && m.t > m.dur) {
        let next = pick(m.kind);
        if (next === "walk" && walkers >= 3) next = "watch";
        m.action = next;
        m.t = 0;
        m.dur = next === "watch" ? 2 + Math.random() * 5 : 2 + Math.random() * 3;
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
          ["cheer", "boo", "talk", "skeptic"].includes(next) &&
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
      const standing = ["cheer", "walk"].includes(m.action) || (m.action === "boo" && m.t < 1.5);

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
      torso.rotation.set(lean, 0, 0);
      head.rotation.set(hx, hy, hz);
      armL.rotation.set(aLx, 0, aLz);
      armR.rotation.set(aRx, 0, aRz);
      legL.rotation.set(lLx, 0, 0);
      legR.rotation.set(lRx, 0, 0);
      badge.rotation.set(0, t * 2, 0);
      badge.scale.setScalar(showRoles && m.kind !== "neutral" ? 1 : 0);
      root.updateMatrixWorld(true);
      refs.torso.current!.setMatrixAt(i, torso.matrixWorld);
      refs.head.current!.setMatrixAt(i, head.matrixWorld);
      refs.armL.current!.setMatrixAt(i, armL.matrixWorld);
      refs.armR.current!.setMatrixAt(i, armR.matrixWorld);
      refs.legL.current!.setMatrixAt(i, legL.matrixWorld);
      refs.legR.current!.setMatrixAt(i, legR.matrixWorld);
      refs.badge.current!.setMatrixAt(i, badge.matrixWorld);
    });
    for (const k of ["torso", "head", "armL", "armR", "legL", "legR", "badge"] as const)
      refs[k].current!.instanceMatrix.needsUpdate = true;
    if (live) audio.setActivity(talkers / Math.max(1, members.length) * 3);
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
      {bubbles.map((b) => (
        <Html key={b.id} position={b.pos} center distanceFactor={9} zIndexRange={[20, 0]}>
          <div className={`speech-bubble speech-${b.kind}`}>{b.text}</div>
        </Html>
      ))}
    </group>
  );
}
