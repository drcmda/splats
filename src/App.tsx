import { Canvas, useFrame } from '@react-three/fiber'
import { Float, CameraControls, StatsGl } from '@react-three/drei'
import { easing } from 'maath'
import { Splat } from './splat/Splat'

export default function App() {
  return (
    <>
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
      <div
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: 'white',
        }}>
        <div style={{ flex: 1, padding: '100px 0px 0px 160px' }}></div>
        <div style={{ flex: 4, padding: '0px 0px 0px 160px', fontSize: '5em', letterSpacing: 12, lineHeight: '1em', fontWeight: 400 }}>
          GAUS SPLATS
          <br />
          FOR
          <br />
          EVERYONE.
        </div>
      </div>
    </>
  )
}

function Rig() {
  useFrame((state, delta) => {
    easing.damp3(state.camera.position, [state.pointer.x * 1.85, state.pointer.y, 4.5], 1, delta)
    state.camera.lookAt(Math.sin(state.clock.elapsedTime / 8) * 4, 0, -10)
  })
  return null
}
