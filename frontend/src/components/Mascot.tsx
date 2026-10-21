import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, ContactShadows, RoundedBox } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useMascot, usePreferences } from '../lib/store';
function FrameSchedule() {
  const invalidate = useThree((s) => s.invalidate);
  const reduced = usePreferences((s) => s.reducedMotion);
  const state = useMascot((s) => s.state);
  useEffect(() => {
    invalidate();
    if (state === 'sleeping' || (reduced && state !== 'speaking')) return;
    // A small companion needs at most 30 fps, leaving CPU/GPU time for workspace input.
    const timer = setInterval(() => {
      if (!document.hidden) invalidate();
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [invalidate, reduced, state]);
  return null;
}
function Creature() {
  const group = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const mouth = useRef<THREE.Mesh>(null);
  const antenna = useRef<THREE.Mesh>(null);
  const state = useMascot((s) => s.state);
  const reduced = usePreferences((s) => s.reducedMotion);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const sleeping = state === 'sleeping';
    if (!reduced) {
      group.current.rotation.y = Math.sin(t * 0.5) * 0.16;
      group.current.rotation.z = Math.sin(t * 0.7) * 0.035;
      group.current.position.y = Math.sin(t * 1.7) * 0.07;
    }
    if (eyes.current) eyes.current.scale.y = state === 'blinking' || sleeping ? 0.12 : 1;
    if (mouth.current) mouth.current.scale.x = 0.8;
    if (mouth.current)
      mouth.current.scale.y =
        state === 'speaking'
          ? 0.3 + useMascot.getState().mouth * 2
          : state === 'happy' || state === 'completed'
            ? 1.5
            : 0.25;
    if (antenna.current && !reduced)
      antenna.current.scale.setScalar(
        state === 'listening'
          ? 1 + Math.sin(t * 8) * 0.25
          : state === 'thinking'
            ? 1 + Math.sin(t * 4) * 0.15
            : 1,
      );
  });
  const glow = state === 'error' ? '#ff857a' : state === 'thinking' ? '#b5a2ff' : '#bbff80';
  return (
    <Float
      speed={reduced ? 0 : 1.5}
      rotationIntensity={reduced ? 0 : 0.1}
      floatIntensity={reduced ? 0 : 0.15}
    >
      <group ref={group} rotation={[0, -0.13, 0]} position={[0, 0.05, 0]}>
        <RoundedBox
          args={[1.75, 1.36, 1.08]}
          radius={0.32}
          smoothness={3}
          position={[0, 0.55, 0]}
          castShadow
        >
          <meshStandardMaterial color="#dce8d5" metalness={0.55} roughness={0.25} />
        </RoundedBox>
        <RoundedBox
          args={[1.48, 0.88, 0.19]}
          radius={0.23}
          smoothness={3}
          position={[0, 0.57, 0.55]}
        >
          <meshStandardMaterial color="#10201a" metalness={0.6} roughness={0.2} />
        </RoundedBox>
        <group ref={eyes} position={[0, 0.65, 0.67]}>
          {[-0.34, 0.34].map((x) => (
            <RoundedBox key={x} args={[0.15, 0.27, 0.035]} radius={0.065} position={[x, 0, 0]}>
              <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={3} />
            </RoundedBox>
          ))}
        </group>
        <mesh ref={mouth} position={[0, 0.34, 0.68]}>
          <capsuleGeometry args={[0.045, 0.18, 4, 8]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2} />
        </mesh>
        <mesh position={[0, 1.38, 0]}>
          <cylinderGeometry args={[0.025, 0.025, 0.35, 12]} />
          <meshStandardMaterial color="#77916c" />
        </mesh>
        <mesh ref={antenna} position={[0, 1.6, 0]}>
          <sphereGeometry args={[0.1, 20, 20]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={3} />
        </mesh>
        <RoundedBox args={[1.02, 0.8, 0.8]} radius={0.28} position={[0, -0.58, 0]} castShadow>
          <meshStandardMaterial color="#b4c5a9" metalness={0.5} roughness={0.32} />
        </RoundedBox>
        <mesh position={[0, -0.48, 0.43]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.12, 0.035, 10, 24]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={2} />
        </mesh>
        {[-1, 1].map((x) => (
          <group key={x}>
            <mesh position={[x * 0.76, -0.46, 0.05]} rotation={[0, 0, x * 0.4]} castShadow>
              <capsuleGeometry args={[0.14, 0.38, 6, 16]} />
              <meshStandardMaterial color="#c2d2b7" metalness={0.5} roughness={0.3} />
            </mesh>
            <mesh position={[x * 0.3, -1.1, 0.1]} castShadow>
              <sphereGeometry args={[0.22, 24, 24]} />
              <meshStandardMaterial color="#c2d2b7" metalness={0.5} roughness={0.3} />
            </mesh>
          </group>
        ))}
      </group>
    </Float>
  );
}
export default function Mascot() {
  const low = usePreferences((s) => s.lowPerformance);
  const event = useMascot((s) => s.event);
  const state = useMascot((s) => s.state);
  useEffect(() => {
    let blink: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      const s = useMascot.getState().state;
      if (s === 'idle' || s === 'floating') {
        event('BLINK');
        blink = setTimeout(() => event('FLOAT'), 160);
      }
    }, 4300);
    const visibility = () => event(document.hidden ? 'SLEEP' : 'REST');
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      clearTimeout(blink);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [event]);
  if (low)
    return (
      <div className="mascot-fallback" role="img" aria-label={`Samm, your assistant, is ${state}`}>
        <div className="robot-face">
          <i />
          <i />
          <span />
        </div>
        <small>SAMM · {state.toUpperCase()}</small>
      </div>
    );
  return (
    <div className="mascot-canvas" role="img" aria-label={`Animated 3D Samm robot, ${state}`}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [0, 0.8, 5.2], fov: 40 }}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 5, 4]} intensity={3} />
        <pointLight position={[-3, 1, 2]} color="#a8ff60" intensity={8} />
        <pointLight position={[2, 2, -3]} color="#d8d2ff" intensity={6} />
        <Creature />
        <FrameSchedule />
        <ContactShadows
          frames={1}
          resolution={128}
          position={[0, -1.45, 0]}
          opacity={0.5}
          scale={5}
          blur={2.5}
          far={4}
        />
      </Canvas>
    </div>
  );
}
