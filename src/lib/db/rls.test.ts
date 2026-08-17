/**
 * Row level security: proving a coach *cannot* see what they shouldn't.
 *
 * These are deliberately negative tests. A positive test ("A1 sees their own
 * athletes") passes just as well when isolation is broken, so the assertions
 * that matter here are the zero-row ones — especially reads by explicit id,
 * which is exactly what application-layer filtering tends to miss.
 *
 * Requires a seeded database: `npm run db:push && npm run db:seed`.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, withUserId } from "./index";
import {
  athleteMaxes,
  athletes,
  exercises,
  loggedSets,
  prescribedSets,
  programBlocks,
  programs,
  users,
} from "./schema";

let A1 = "";
let A2 = "";
let B1 = "";

/** Ids of rows the tests must never be able to reach, fetched as service role. */
let aishaId = "";
let tomId = "";
let a2AthleteMaxId = "";
let b1ProgramId = "";
let b1PrescribedSetId = "";

beforeAll(async () => {
  // These tests genuinely attempt destructive writes across tenants. If RLS is
  // not active they succeed, mutating the fixture and reporting green on the
  // *next* run. `drizzle-kit push` disables RLS unless `npm run db:push` also
  // re-applies the migration, so this guard is not hypothetical — it has
  // already happened once.
  const [{ n }] = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
    from pg_class c
    join pg_namespace nsp on nsp.oid = c.relnamespace
    where nsp.nspname = 'public'
      and c.relname in ('athletes', 'programs', 'prescribed_sets')
      and c.relrowsecurity
      and c.relforcerowsecurity
  `);
  if (n !== 3) {
    throw new Error(
      "Row level security is not active. Run `npm run db:push` (which applies " +
        "supabase/migrations) before these tests — otherwise they would delete " +
        "fixture data instead of being blocked.",
    );
  }

  const rows = await db.select().from(users);
  A1 = rows.find((u) => u.email === "a1@heme.test")!.id;
  A2 = rows.find((u) => u.email === "a2@heme.test")!.id;
  B1 = rows.find((u) => u.email === "b1@heme.test")!.id;

  const allAthletes = await db.select().from(athletes);
  aishaId = allAthletes.find((a) => a.lastName === "Khan")!.id;
  tomId = allAthletes.find((a) => a.lastName === "Whitfield")!.id;

  const [aishaMax] = await db
    .select()
    .from(athleteMaxes)
    .where(eq(athleteMaxes.athleteId, aishaId))
    .limit(1);
  a2AthleteMaxId = aishaMax.id;

  const [b1Program] = await db
    .select()
    .from(programs)
    .where(eq(programs.ownerCoachId, B1))
    .limit(1);
  b1ProgramId = b1Program.id;

  const [b1Set] = await db
    .select()
    .from(prescribedSets)
    .where(eq(prescribedSets.programId, b1ProgramId))
    .limit(1);
  b1PrescribedSetId = b1Set.id;

  expect(A1 && A2 && B1 && aishaId && tomId && b1ProgramId).toBeTruthy();
});

describe("the fixture is actually adversarial", () => {
  it("puts A1 and A2 in the same organisation", async () => {
    const [a1Row] = await db.select().from(users).where(eq(users.id, A1));
    const [a2Row] = await db.select().from(users).where(eq(users.id, A2));
    // If this ever drifts apart, the interesting tests below become trivial.
    expect(a1Row.orgId).toBe(a2Row.orgId);
  });

  it("puts B1 in a different organisation", async () => {
    const [a1Row] = await db.select().from(users).where(eq(users.id, A1));
    const [b1Row] = await db.select().from(users).where(eq(users.id, B1));
    expect(b1Row.orgId).not.toBe(a1Row.orgId);
  });
});

describe("athletes — same org is not enough", () => {
  it("A1 sees only their own two athletes", async () => {
    const rows = await withUserId(A1, (tx) => tx.select().from(athletes));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.lastName).sort()).toEqual(["Bell", "Raman"]);
  });

  it("A1 cannot read a colleague's athlete by explicit id", async () => {
    const rows = await withUserId(A1, (tx) =>
      tx.select().from(athletes).where(eq(athletes.id, aishaId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("A2 sees only their own athlete", async () => {
    const rows = await withUserId(A2, (tx) => tx.select().from(athletes));
    expect(rows).toHaveLength(1);
    expect(rows[0].lastName).toBe("Khan");
  });

  it("A1 cannot read across organisations", async () => {
    const rows = await withUserId(A1, (tx) =>
      tx.select().from(athletes).where(eq(athletes.id, tomId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("A1 cannot update a colleague's athlete", async () => {
    const updated = await withUserId(A1, (tx) =>
      tx
        .update(athletes)
        .set({ notes: "should never land" })
        .where(eq(athletes.id, aishaId))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const [fresh] = await db
      .select()
      .from(athletes)
      .where(eq(athletes.id, aishaId));
    expect(fresh.notes).toBeNull();
  });

  it("A1 cannot delete a colleague's athlete", async () => {
    const deleted = await withUserId(A1, (tx) =>
      tx.delete(athletes).where(eq(athletes.id, aishaId)).returning(),
    );
    expect(deleted).toHaveLength(0);
  });

  it("A1 cannot create an athlete owned by someone else", async () => {
    const [{ orgId }] = await db
      .select({ orgId: users.orgId })
      .from(users)
      .where(eq(users.id, A1));

    await expect(
      withUserId(A1, (tx) =>
        tx.insert(athletes).values({
          orgId,
          ownerCoachId: A2, // planting a row in a colleague's roster
          firstName: "Trojan",
          lastName: "Row",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("deep tables are filtered too, not just the roots", () => {
  it("A1 cannot read a colleague's athlete maxes by explicit id", async () => {
    const rows = await withUserId(A1, (tx) =>
      tx.select().from(athleteMaxes).where(eq(athleteMaxes.id, a2AthleteMaxId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("A1's athlete maxes cover only their own athletes", async () => {
    const rows = await withUserId(A1, (tx) => tx.select().from(athleteMaxes));
    expect(rows.length).toBeGreaterThan(0);
    const ownIds = new Set(
      (await withUserId(A1, (tx) => tx.select().from(athletes))).map((a) => a.id),
    );
    expect(rows.every((r) => ownIds.has(r.athleteId))).toBe(true);
  });

  it("A1 cannot read another org's prescribed sets — the 7-hop table", async () => {
    const rows = await withUserId(A1, (tx) =>
      tx
        .select()
        .from(prescribedSets)
        .where(eq(prescribedSets.id, b1PrescribedSetId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("A1 cannot update another org's prescribed set", async () => {
    const updated = await withUserId(A1, (tx) =>
      tx
        .update(prescribedSets)
        .set({ reps: 999 })
        .where(eq(prescribedSets.id, b1PrescribedSetId))
        .returning(),
    );
    expect(updated).toHaveLength(0);

    const [fresh] = await db
      .select()
      .from(prescribedSets)
      .where(eq(prescribedSets.id, b1PrescribedSetId));
    expect(fresh.reps).not.toBe(999);
  });

  it("every prescribed set A1 can see belongs to a program A1 can see", async () => {
    const [visibleSets, visiblePrograms] = await withUserId(A1, async (tx) => [
      await tx.select().from(prescribedSets),
      await tx.select().from(programs),
    ]);
    const programIds = new Set(visiblePrograms.map((p) => p.id));
    expect(visibleSets.length).toBeGreaterThan(0);
    expect(visibleSets.every((s) => programIds.has(s.programId))).toBe(true);
  });

  it("logged sets are athlete-scoped", async () => {
    const rows = await withUserId(A1, (tx) => tx.select().from(loggedSets));
    const ownIds = new Set(
      (await withUserId(A1, (tx) => tx.select().from(athletes))).map((a) => a.id),
    );
    expect(rows.every((r) => ownIds.has(r.athleteId))).toBe(true);
  });
});

describe("programs — private by default, shared templates readable", () => {
  it("A2 can read A1's org-shared templates", async () => {
    const rows = await withUserId(A2, (tx) => tx.select().from(programs));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((p) => p.isOrgShared)).toBe(true);
  });

  it("A2 cannot modify A1's shared template — shared means read-only", async () => {
    const [shared] = await withUserId(A2, (tx) => tx.select().from(programs));
    const updated = await withUserId(A2, (tx) =>
      tx
        .update(programs)
        .set({ name: "hijacked" })
        .where(eq(programs.id, shared.id))
        .returning(),
    );
    expect(updated).toHaveLength(0);
  });

  it("A1 cannot see another org's private program", async () => {
    const rows = await withUserId(A1, (tx) =>
      tx.select().from(programs).where(eq(programs.id, b1ProgramId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("B1 sees only their own program", async () => {
    const rows = await withUserId(B1, (tx) => tx.select().from(programs));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(b1ProgramId);
  });
});

describe("exercise library — reference data, shared deliberately", () => {
  it("every coach can read the global library", async () => {
    for (const uid of [A1, A2, B1]) {
      const rows = await withUserId(uid, (tx) =>
        tx.select().from(exercises).where(sql`${exercises.orgId} is null`),
      );
      expect(rows.length).toBe(213);
    }
  });
});

describe("tenancy columns cannot be forged", () => {
  it("a client-supplied org_id on a child row is overwritten by the trigger", async () => {
    const [a1Program] = await withUserId(A1, (tx) =>
      tx.select().from(programs).limit(1),
    );
    const [{ orgId: bOrg }] = await db
      .select({ orgId: users.orgId })
      .from(users)
      .where(eq(users.id, B1));

    // Claim the row belongs to the other tenant; the BEFORE INSERT trigger
    // derives the truth from the parent program regardless.
    const [row] = await db
      .insert(programBlocks)
      .values({
        programId: a1Program.id,
        orgId: bOrg,
        name: "forged",
        orderIndex: 99,
      })
      .returning();

    expect(row.orgId).toBe(a1Program.orgId);
    expect(row.orgId).not.toBe(bOrg);

    await db.execute(sql`delete from program_blocks where id = ${row.id}`);
  });
});

describe("unauthenticated access", () => {
  it("a request with no user id sees nothing", async () => {
    // Empty claims: auth_uid() is null, so current_org_id() is null and every
    // policy predicate fails.
    const rows = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('request.jwt.claims', '{"role":"authenticated"}', true)`,
      );
      await tx.execute(sql`set local role authenticated`);
      return tx.select().from(athletes);
    });
    expect(rows).toHaveLength(0);
  });
});
