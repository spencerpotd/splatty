/**
 * Physics and collision for the splat viewer (non-LoD).
 * Uses cannon-es: gravity, player capsule, floor + scene bounds from splat AABB.
 */

import * as CANNON from "cannon-es";

const GRAVITY = -9.82;
const PLAYER_RADIUS = 0.4;
const PLAYER_MASS = 1;
const BOUNDS_MARGIN = 0.5;
/** Camera (eye) height above physics body center — same transform for sync */
export const EYE_HEIGHT = 1.2;

/**
 * Create physics world with gravity.
 * @returns {{ world: CANNON.World, playerBody: CANNON.Body }}
 */
export function createPhysicsWorld() {
  const world = new CANNON.World();
  world.gravity.set(0, GRAVITY, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = false;

  const playerShape = new CANNON.Sphere(PLAYER_RADIUS);
  const playerBody = new CANNON.Body({
    mass: PLAYER_MASS,
    shape: playerShape,
    linearDamping: 0.3,
    angularDamping: 0.5,
    fixedRotation: true,
    collisionResponse: true,
  });
  playerBody.position.set(0, 2, 0);
  world.addBody(playerBody);

  // Default floor so the player doesn't fall before scene bounds are added
  addFloor(world, 0, 0, 0);

  return { world, playerBody };
}

/**
 * Add a floor plane at y = floorY (static).
 * Cannon-es spherePlane: contact when sphere is on the side the plane normal points to.
 * We want the player (sphere) to stand on top, so solid must be above = plane normal points up (0,1,0).
 * Local (0,0,1) -> (0,1,0) = -90° around X.
 */
export function addFloor(world, floorY, centerX = 0, centerZ = 0) {
  const floorShape = new CANNON.Plane();
  const floorBody = new CANNON.Body({ mass: 0, shape: floorShape, type: CANNON.Body.STATIC });
  floorBody.position.set(centerX, floorY, centerZ);
  floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
  world.addBody(floorBody);
}

/**
 * Build floor only from a Three.js Box3 (e.g. splat getBoundingBox).
 * No walls — so you can walk freely into interiors (e.g. spaceship).
 * @returns {number} floorY - scene floor plane y so caller can place player on it
 */
export function addSceneCollision(world, box3) {
  const min = box3.min;
  const max = box3.max;
  const floorY = min.y - BOUNDS_MARGIN;
  const centerX = (min.x + max.x) / 2;
  const centerZ = (min.z + max.z) / 2;
  addFloor(world, floorY, centerX, centerZ);
  return floorY;
}

/**
 * Set player body position (e.g. when teleporting camera after load).
 * @param {CANNON.Body} playerBody
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
export function setPlayerPosition(playerBody, x, y, z) {
  playerBody.position.set(x, y, z);
  playerBody.velocity.setZero();
}

const FIXED_DT = 1 / 60;
let physicsAccum = 0;

/**
 * Step the world with fixed timestep for consistent motion.
 * @param {CANNON.World} world
 * @param {number} dt - real elapsed time (seconds)
 */
export function stepPhysics(world, dt) {
  physicsAccum += Math.min(dt, 0.1);
  while (physicsAccum >= FIXED_DT) {
    world.step(FIXED_DT);
    physicsAccum -= FIXED_DT;
  }
}

/**
 * Copy body position to camera position (body = feet, camera = body + EYE_HEIGHT).
 */
export function syncCameraFromBody(playerBody, camera) {
  camera.position.set(
    playerBody.position.x,
    playerBody.position.y + EYE_HEIGHT,
    playerBody.position.z
  );
}

export { PLAYER_RADIUS };
