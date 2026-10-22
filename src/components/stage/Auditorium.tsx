import { Canvas, useFrame, type ThreeElements } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { Audience, COLS, seatPosition } from "./Audience";
import type { AudienceConfig } from "@/lib/audience";
import type { CrowdAudio } from "@/lib/crowd-audio";

function useWoodTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#5a3a22";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `rgba(${30 + Math.random() * 40},${15 + Math.random() * 20},5,0.35)`;
      g.fillRect(0, i * 16, 256, 15);
      for (let k = 0; k < 30; k++) {
        g.fillStyle = "rgba(0,0,0,0.08)";
        g.fillRect(Math.random() * 256, i * 16 + Math.random() * 15, 40 + Math.random() * 60, 1);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

function Spot({ aim, ...props }: { aim: [number, number, number] } & Omit<ThreeElements["spotLight"], "target">) {
  const ref = useRef<THREE.SpotLight>(null);
  useEffect(() => {
    const l = ref.current!;
    l.target.position.set(aim[0], aim[1], aim[2]);
    l.parent?.add(l.target);
    return () => {
      l.parent?.remove(l.target);
    };
  }, [aim[0], aim[1], aim[2]]);
  return <spotLight ref={ref} {...props} />;
}

function Hall({ rows }: { rows: number }) {
  const wood = useWoodTexture();
  const back = seatPosition(rows, 0).z + 2;
  const depth = back + 9;
  const centerZ = back - depth / 2;
  const riser = useMemo(() => [...Array(rows).keys()], [rows]);
  return (
    <group>
      {/* stage */}
      <mesh position={[0, 0.5, -3.5]} receiveShadow>
        <boxGeometry args={[16, 1, 7]} />
        <meshStandardMaterial map={wood} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.5, 0.01]}>
        <boxGeometry args={[16, 1, 0.05]} />
        <meshStandardMaterial color="#1a0f0a" />
      </mesh>
      {/* curtains */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 7.2, 4, -1]}>
          <boxGeometry args={[1.6, 7, 0.3]} />
          <meshStandardMaterial color="#7d0f1c" roughness={0.9} />
        </mesh>
      ))}
      {/* floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, centerZ]}>
        <planeGeometry args={[20, depth]} />
        <meshStandardMaterial color="#2b1416" roughness={1} />
      </mesh>
      {/* tiered risers */}
      {riser.map((r) => {
        const p = seatPosition(r, 0);
        return (
          <mesh key={r} position={[0, p.y / 2, p.z + 0.1]}>
            <boxGeometry args={[18, Math.max(p.y, 0.01), 1.15]} />
            <meshStandardMaterial color="#3a1c1e" roughness={1} />
          </mesh>
        );
      })}
      {/* walls & ceiling */}
      <mesh position={[0, 5, centerZ]}>
        <boxGeometry args={[20, 10, depth]} />
        <meshStandardMaterial color="#2a1a1c" side={THREE.BackSide} roughness={0.95} />
      </mesh>
      {/* wall sconces */}
      {[...Array(Math.ceil(rows / 2) + 1).keys()].map((i) =>
        [-1, 1].map((s) => (
          <mesh key={`${i}${s}`} position={[s * 9.9, 3.2, 3 + i * 2.4]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshBasicMaterial color="#ffcf8a" toneMapped={false} />
          </mesh>
        )),
      )}
      {/* exit signs */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 8, 3.5, back + 0.9]}>
          <boxGeometry args={[0.8, 0.3, 0.05]} />
          <meshBasicMaterial color="#3ddc84" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Small helicopter that continuously flies across the hall above the crowd. */
function Helicopter() {
  const g = useRef<THREE.Group>(null);
  const rotor = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Mesh>(null);
  const beacon = useRef<THREE.Mesh>(null);
  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const t = g.current;
    if (!t) return;
    t.position.x -= dt * 2.4;
    if (t.position.x < -16) t.position.x = 16;
    t.position.y = 8.5 + Math.sin(t.position.x * 0.45) * 0.22;
    t.rotation.z = -0.04;
    if (rotor.current) rotor.current.rotation.y += dt * 42;
    if (tail.current) tail.current.rotation.x += dt * 60;
    if (beacon.current) beacon.current.scale.setScalar(Math.sin(performance.now() * 0.006) > 0 ? 1 : 0.25);
  });
  return (
    <group ref={g} position={[16, 8.5, 5]}>
      {/* fuselage */}
      <mesh scale={[1.6, 0.62, 0.66]}>
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshStandardMaterial color="#23262b" roughness={0.45} metalness={0.3} />
      </mesh>
      {/* cockpit glass */}
      <mesh position={[-0.55, 0.06, 0]} scale={[0.6, 0.45, 0.5]}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial color="#0e1a24" roughness={0.15} metalness={0.6} />
      </mesh>
      {/* tail boom, fin and tail rotor */}
      <mesh position={[1.25, 0.1, 0]} rotation-z={-0.06}>
        <boxGeometry args={[1.7, 0.1, 0.1]} />
        <meshStandardMaterial color="#23262b" roughness={0.5} />
      </mesh>
      <mesh position={[2.05, 0.28, 0]}>
        <boxGeometry args={[0.08, 0.45, 0.04]} />
        <meshStandardMaterial color="#23262b" />
      </mesh>
      <mesh ref={tail} position={[2.12, 0.28, 0.03]}>
        <boxGeometry args={[0.02, 0.5, 0.02]} />
        <meshStandardMaterial color="#151515" />
      </mesh>
      {/* landing skids */}
      {[-0.28, 0.28].map((z) => (
        <mesh key={z} position={[0, -0.5, z]}>
          <boxGeometry args={[1.3, 0.04, 0.05]} />
          <meshStandardMaterial color="#151719" />
        </mesh>
      ))}
      {/* rotor mast + spinning main rotor */}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 0.18, 6]} />
        <meshStandardMaterial color="#151719" />
      </mesh>
      <group ref={rotor} position={[0, 0.55, 0]}>
        {[0, Math.PI / 2].map((r) => (
          <mesh key={r} rotation-y={r}>
            <boxGeometry args={[3.4, 0.015, 0.12]} />
            <meshStandardMaterial color="#191b1e" roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* blinking beacon */}
      <mesh ref={beacon} position={[2.1, 0.52, 0]}>
        <sphereGeometry args={[0.05, 6, 6]} />
        <meshBasicMaterial color="#ff3b30" toneMapped={false} />
      </mesh>
    </group>
  );
}

interface Props {
  config: AudienceConfig;
  running: MutableRefObject<boolean>;
  audio: CrowdAudio;
  showRoles: boolean;
  seed: number;
}

export function Auditorium({ config, running, audio, showRoles, seed }: Props) {
  const rows = Math.ceil(config.size / COLS);
  const midZ = seatPosition(Math.floor(rows / 2), 0).z;
  const houseLights = [...Array(Math.ceil(rows / 2)).keys()];
  return (
    <div data-stage-canvas className="fixed inset-0">
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: true }}
      camera={{ position: [0, 2.8, -2.5], fov: 60, near: 0.1, far: 120 }}
    >
      <color attach="background" args={["#0d0809"]} />
      <fog attach="fog" args={["#0d0809", 12, 46]} />
      <hemisphereLight args={["#ffd9b0", "#2a1010", 0.55]} />
      <ambientLight intensity={0.25} />
      {/* stage wash spilling onto the front rows */}
      <Spot position={[0, 7, -5]} aim={[0, 1, 6]} angle={0.6} penumbra={0.8} intensity={60} color="#fff1d6" distance={30} decay={1.5} />
      <Spot position={[-5, 8, 0]} aim={[0, 1, -2]} angle={0.4} penumbra={1} intensity={40} color="#ffb070" distance={25} decay={1.5} />
      <Spot position={[5, 8, 0]} aim={[0, 1, -2]} angle={0.4} penumbra={1} intensity={40} color="#9fc3ff" distance={25} decay={1.5} />
      {houseLights.map((i) => (
        <pointLight key={i} position={[0, 6, 4 + i * 2.4]} intensity={6} distance={9} color="#ffc78a" decay={1.6} />
      ))}
      <Environment resolution={64}>
        <Lightformer intensity={1.2} position={[0, 5, 0]} scale={[10, 10, 1]} color="#ffd9b0" />
        <Lightformer intensity={0.5} color="#8bb" position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
      </Environment>
      <Hall rows={rows} />
      <Helicopter />
      <Audience key={seed} config={config} running={running} audio={audio} showRoles={showRoles} />
      <OrbitControls
        target={[0, 1.6, midZ]}
        enablePan={false}
        minDistance={3}
        maxDistance={16}
        minPolarAngle={0.9}
        maxPolarAngle={1.7}
        minAzimuthAngle={Math.PI - 0.9}
        maxAzimuthAngle={Math.PI + 0.9}
        enableDamping
      />
      </Canvas>
    </div>
  );
}
