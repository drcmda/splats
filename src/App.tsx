import { Canvas } from '@react-three/fiber'
import { Float, CameraControls } from '@react-three/drei'
import { Physics, RigidBody, CuboidCollider, BallCollider } from '@react-three/rapier'
import { Splat } from './splat/Splat'

export default function App() {
  return (
    <Canvas dpr={1.5} gl={{ antialias: false }} camera={{ position: [4, 1.5, -4], fov: 35 }}>
      <color attach='background' args={['black']} />
      <Float rotationIntensity={2} speed={3}>
        <Splat alphaHash src='nike.splat'  scale={0.5} position={[0, 1.6, 2]} />
      </Float>
      <Float rotationIntensity={2} speed={3}>
        <Splat alphaHash src='nike.splat'  scale={0.5} position={[0, 1.6, -1.5]} rotation={[Math.PI, 0, Math.PI]} />
      </Float>
      <Float rotationIntensity={2} speed={4}>
        <Splat alphaHash src='plush.splat'  scale={0.5} position={[-1.5, 1.6, 1]} />
      </Float>
      <Splat alphaHash src='kitchen-7k.splat'  position={[0, 0.25, 0]} />

      {/*<Physics>
        <Shoe position={[0, 5, 0]} />
        <Shoe position={[0, 7, 0]} rotation-y={0.5} />
        <Shoe position={[0, 9, 0]} rotation-y={1} />
        <Shoe position={[0, 11, 0]} rotation-y={1.5} />
        <CuboidCollider position={[0, -2, 0]} args={[20, 0.5, 20]} />
      </Physics>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshBasicMaterial color='white' />
    </mesh>*/}

      <CameraControls />
    </Canvas>
  )
}

function Shoe(props: any) {
  return (
    <RigidBody {...props} colliders={false}>
      <BallCollider position={[-0.5, 0, -0.1]} args={[0.25]} />
      <BallCollider position={[-0, 0, -0]} args={[0.2]} />
      <BallCollider position={[0.65, 0, -0]} args={[0.1]} />
      <CuboidCollider rotation={[0, 0, 0.2]} position={[0.3, -0.1, 0]} args={[0.3, 0.1, 0.2]} />
      <CuboidCollider rotation={[0, -0.2, -0.1]} position={[-0.4, -0.15, -0.1]} args={[0.3, 0.1, 0.15]} />
      <CuboidCollider rotation={[0, 0, -0.3]} position={[0.3, 0.05, 0]} args={[0.3, 0.1, 0.15]} />
      <CuboidCollider rotation={[0, -0.1, 0]} position={[-0.3, 0.15, -0.05]} args={[0.3, 0.1, 0.15]} />
      <Splat src='nike.splat'  scale={0.5} position={[-0.05, 1.1, 0.05]} rotation={[-0.51, 0, 0.1]} />
    </RigidBody>
  )
}
