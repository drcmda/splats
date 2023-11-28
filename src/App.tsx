import { Canvas } from '@react-three/fiber'
import { Float, CameraControls, StatsGl } from '@react-three/drei'
import { Splat } from './splat/Splat'

export default function App() {
  return (
    <Canvas dpr={1.5} gl={{ antialias: false }} camera={{ position: [4, 1.5, -4], fov: 35 }}>
      <color attach='background' args={['black']} />
      <group position={[0, 1.5, 1]}>
        <Float rotationIntensity={2} speed={3}>
          <Splat src='nike.splat' alphaTest={0.1} scale={0.5} position={[0, 0.1, 1]} />
        </Float>
        <Float rotationIntensity={2} speed={3}>
          <Splat src='nike.splat' alphaTest={0.1} scale={0.5} position={[0, 0.1, -2.5]} rotation={[Math.PI, 0, Math.PI]} />
        </Float>
        <Float rotationIntensity={2} speed={4}>
          <Splat src='plush.splat' alphaTest={0.1} scale={0.5} position={[-1.5, 0.1, 0]} />
        </Float>
      </group>
      <Splat src='kitchen-7k.splat' position={[0, 0.25, 0]} />
      <CameraControls />
      <StatsGl />
    </Canvas>
  )
}
