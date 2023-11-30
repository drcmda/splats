import { Canvas, extend, useThree } from '@react-three/fiber'
import { Float, CameraControls, StatsGl, Effects } from '@react-three/drei'
import { Physics, RigidBody, CuboidCollider, BallCollider } from '@react-three/rapier'
// @ts-ignore
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass'
// @ts-ignore
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass'
import { Splat } from './lib/Splat'
import { useRef, useEffect } from 'react'
import { useControls } from 'leva'

extend({ TAARenderPass, OutputPass })

export default function App() {
  const { root } = useControls({ root: { value: 'default', options: ['default', 'physics', 'alphahash', 'truck'] } })
  return (
    <Canvas dpr={1.5} gl={{ antialias: false }} camera={{ position: [4, 1.5, -4], fov: 35 }}>
      <color attach='background' args={['white']} />
      <CameraControls makeDefault />
      <StatsGl />
      {root === 'default' ? <Default /> : root === 'physics' ? <Phys /> : root === 'alphahash' ? <TAA /> : <Truck />}
    </Canvas>
  )
}

function Default() {
  return (
    <>
      <Float>
        <Splat alphaTest={0.1} src='nike.splat' scale={0.5} position={[0, 1.6, 2]} />
      </Float>
      <Float>
        <Splat alphaTest={0.1} src='nike.splat' scale={0.5} position={[0, 1.6, -1.5]} rotation={[Math.PI, 0, Math.PI]} />
      </Float>
      <Float>
        <Splat alphaTest={0.1} src='plush.splat' scale={0.5} position={[-1.5, 1.6, 1]} />
      </Float>
      <Splat src='kitchen-7k.splat' position={[0, 0.25, 0]} />
    </>
  )
}

function TAA() {
  return (
    <>
      <Splat alphaHash src='nike.splat' scale={0.5} position={[0, 1.6, 2]} />
      <Splat alphaHash src='nike.splat' scale={0.5} position={[0, 1.6, -1.5]} rotation={[Math.PI, 0, Math.PI]} />
      <Splat alphaHash src='plush.splat' scale={0.5} position={[-1.5, 1.6, 1]} />
      <Splat alphaHash src='kitchen-7k.splat' position={[0, 0.25, 0]} />
      <Post />
    </>
  )
}

function Truck() {
  return <Splat src='https://huggingface.co/cakewalk/splat-data/resolve/main/truck.splat' position={[0, 0, 0]} />
}

function Phys() {
  return (
    <>
      <Physics>
        <Shoe position={[0, 5, 0]} />
        <Shoe position={[0, 7, 0]} rotation-y={0.5} />
        <Shoe position={[0, 9, 0]} rotation-y={1} />
        <CuboidCollider position={[0, -0.6, 0]} args={[20, 0.5, 20]} />
      </Physics>
      <Splat src='kitchen-7k.splat' position={[0, 0.25, 0]} />
    </>
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
      <Splat alphaTest={0.1} src='nike.splat' scale={0.5} position={[-0.05, 1.1, 0.05]} rotation={[-0.51, 0, 0.1]} />
    </RigidBody>
  )
}

function Post() {
  const taa = useRef<TAARenderPass>(null!)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls)

  useEffect(() => {
    if (controls) {
      const wake = () => {
        taa.current.accumulate = false
        taa.current.sampleLevel = 0
      }
      const rest = () => {
        taa.current.accumulate = true
        taa.current.sampleLevel = 2
      }

      controls.addEventListener('wake', wake)
      controls.addEventListener('sleep', rest)
      return () => {
        controls.removeEventListener('wake', wake)
        controls.removeEventListener('sleep', rest)
      }
    }
  }, [controls])

  return (
    <Effects disableRenderPass disableGamma>
      {/* @ts-ignore */}
      <tAARenderPass ref={taa} accumulate={true} sampleLevel={2} args={[scene, camera]} />
      {/* @ts-ignore */}
      <outputPass />
    </Effects>
  )
}
