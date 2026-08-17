/**
 * Seed fixture, shaped so isolation is demonstrable rather than assumed.
 *
 *   Org A ── coach A1 (Priya, Marcus)
 *         └─ coach A2 (Aisha)        <- same org, different coach
 *   Org B ── coach B1 (Tom)          <- different tenant entirely
 *
 * A1 vs A2 is the interesting pair: same organisation, so anything that scopes
 * by `org_id` alone would wrongly let them see each other's athletes.
 */

export interface SeedAthlete {
  firstName: string;
  lastName: string;
  sex: "male" | "female" | "other";
  dob: string;
  height: number;
  weight: number;
  sport: string;
  position: string | null;
  /** Exercise slug -> tested 1RM in kg. */
  maxes: Record<string, number>;
}

export interface SeedCoach {
  key: string;
  email: string;
  password: string;
  name: string;
  /** Coaches sharing an orgKey end up in the same organisation. */
  orgKey: string;
  orgName: string;
  athletes: SeedAthlete[];
  /** Groups this coach owns: name, type, and which athletes belong. */
  groups: {
    name: string;
    type: "team" | "squad" | "small_group" | "individual";
    sport?: string;
    members: string[];
  }[];
}

export const SEED_PASSWORD = "heme-demo-1234";

export const SEED_COACHES: SeedCoach[] = [
  {
    key: "a1",
    email: "a1@heme.test",
    password: SEED_PASSWORD,
    name: "Alex Reid",
    orgKey: "orgA",
    orgName: "HEME Performance",
    athletes: [
      {
        firstName: "Priya",
        lastName: "Raman",
        sex: "female",
        dob: "2001-04-12",
        height: 168,
        weight: 63,
        sport: "Athletics",
        position: "400m",
        maxes: {
          "back-squat": 95,
          deadlift: 115,
          "bench-press": 52.5,
          "overhead-press": 35,
          "power-clean": 62.5,
        },
      },
      {
        firstName: "Marcus",
        lastName: "Bell",
        sex: "male",
        dob: "1999-09-02",
        height: 186,
        weight: 94,
        sport: "Rugby",
        position: "Flanker",
        maxes: {
          "back-squat": 180,
          deadlift: 220,
          "bench-press": 135,
          "overhead-press": 85,
          "power-clean": 115,
        },
      },
    ],
    groups: [
      {
        name: "Senior Squad",
        type: "team",
        sport: "Rugby",
        members: ["Priya Raman", "Marcus Bell"],
      },
    ],
  },
  {
    key: "a2",
    email: "a2@heme.test",
    password: SEED_PASSWORD,
    name: "Jordan Six",
    // Same organisation as A1 — this is the pair the isolation tests turn on.
    orgKey: "orgA",
    orgName: "HEME Performance",
    athletes: [
      {
        firstName: "Aisha",
        lastName: "Khan",
        sex: "female",
        dob: "2003-01-25",
        height: 174,
        weight: 70,
        sport: "Netball",
        position: "Goal Attack",
        maxes: {
          "back-squat": 105,
          deadlift: 130,
          "bench-press": 55,
          "overhead-press": 37.5,
          "power-clean": 65,
        },
      },
    ],
    groups: [
      {
        name: "Aisha Khan — 1:1",
        type: "individual",
        sport: "Netball",
        members: ["Aisha Khan"],
      },
    ],
  },
  {
    key: "b1",
    email: "b1@heme.test",
    password: SEED_PASSWORD,
    name: "Sam Okafor",
    orgKey: "orgB",
    orgName: "Northside Strength",
    athletes: [
      {
        firstName: "Tom",
        lastName: "Whitfield",
        sex: "male",
        dob: "1997-06-18",
        height: 180,
        weight: 88,
        sport: "Rugby",
        position: "Scrum-half",
        maxes: {
          "back-squat": 160,
          deadlift: 200,
          "bench-press": 120,
          "overhead-press": 75,
          "power-clean": 105,
        },
      },
    ],
    groups: [
      {
        name: "Tom Whitfield — 1:1",
        type: "individual",
        sport: "Rugby",
        members: ["Tom Whitfield"],
      },
    ],
  },
];
