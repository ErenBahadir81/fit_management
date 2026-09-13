/**
 * C2 — the rest controller and its timer, re-exported from W1's implementation so the workout
 * screen has one import for "resting" rather than two. Nothing is adapted here: the contract W2
 * consumes is exactly the contract W1 ships.
 */
export { useRestController, type RestController } from "./restEngine";
export { RestTimer } from "./RestTimer";
