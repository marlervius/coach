import assert from "node:assert/strict";
import test from "node:test";
import { paceSecPerKm, vdotFromRace } from "../src/lib/vdot";

test("vdotFromRace treffer Daniels' referanseverdier", () => {
  // Daniels' tabeller: 5 km på 19:57 ≈ VDOT 50, 10 km på 41:21 ≈ VDOT 50
  assert.ok(Math.abs(vdotFromRace(5, 19 * 60 + 57) - 50) < 1);
  assert.ok(Math.abs(vdotFromRace(10, 41 * 60 + 21) - 50) < 1);
  // Maraton på 2:54:00 ≈ VDOT 54
  assert.ok(Math.abs(vdotFromRace(42.195, 2 * 3600 + 54 * 60) - 54) < 1.5);
});

test("vdotFromRace er konsistent med fartsberegningen", () => {
  // En løper med VDOT 45 som løper 5 km i ~96 % av VO2max bør få ~45 tilbake
  const pace = paceSecPerKm(45, 0.955);
  const raceTime = pace * 5;
  assert.ok(Math.abs(vdotFromRace(5, raceTime) - 45) < 1);
});

test("vdotFromRace avviser ugyldige input", () => {
  assert.ok(Number.isNaN(vdotFromRace(0, 1200)));
  assert.ok(Number.isNaN(vdotFromRace(5, 0)));
  assert.ok(Number.isNaN(vdotFromRace(5, -10)));
});
