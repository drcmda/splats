import { Canvas } from '@react-three/fiber'
import { CameraControls, StatsGl } from '@react-three/drei'
import { useControls } from 'leva'
import { Splat } from './lib/Splat'

export default function App() {
  const { hashed } = useControls({ hashed: true })
  return (
    <Canvas dpr={1.5} gl={{ antialias: false }} camera={{ position: [4, 1.5, -4], fov: 35 }}>
      <color attach='background' args={['white']} />
      <CameraControls makeDefault />
      <StatsGl />
      <Splat alphaHash={hashed} alphaTest={hashed ? 0 : 0.1} src='nike.splat' scale={0.5} position={[0, 1.6, 2]} />
      <Splat
        alphaHash={hashed}
        alphaTest={hashed ? 0 : 0.1}
        src='nike.splat'
        scale={0.5}
        position={[0, 1.6, -1.5]}
        rotation={[Math.PI, 0, Math.PI]}
      />
      <Splat alphaHash={hashed} alphaTest={hashed ? 0 : 0.1} src='plush.splat' scale={0.5} position={[-1.5, 1.6, 1]} />
      <Splat alphaHash={hashed} src='kitchen-7k.splat' position={[0, 0.25, 0]} />
    </Canvas>
  )
}
