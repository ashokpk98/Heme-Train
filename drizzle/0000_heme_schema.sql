CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('scheduled', 'active', 'completed', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."athlete_status" AS ENUM('active', 'injured', 'rehab', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."block_structure" AS ENUM('straight', 'superset', 'triset', 'circuit', 'complex', 'contrast', 'emom', 'amrap', 'for_time', 'interval');--> statement-breakpoint
CREATE TYPE "public"."block_type" AS ENUM('accumulation', 'transmutation', 'realization', 'deload', 'taper', 'gpp', 'spp', 'in_season', 'off_season', 'pre_season', 'return_to_play');--> statement-breakpoint
CREATE TYPE "public"."contraction_emphasis" AS ENUM('concentric', 'eccentric', 'isometric', 'ballistic', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."exercise_category" AS ENUM('main_lift', 'accessory', 'corrective', 'plyometric', 'conditioning', 'mobility', 'warmup', 'skill');--> statement-breakpoint
CREATE TYPE "public"."force_vector" AS ENUM('vertical', 'horizontal', 'lateral', 'rotational');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('team', 'squad', 'small_group', 'individual');--> statement-breakpoint
CREATE TYPE "public"."laterality" AS ENUM('bilateral', 'unilateral', 'alternating');--> statement-breakpoint
CREATE TYPE "public"."load_basis" AS ENUM('own_1rm', 'derived_from_exercise', 'bodyweight', 'absolute_only');--> statement-breakpoint
CREATE TYPE "public"."logged_session_status" AS ENUM('scheduled', 'in_progress', 'completed', 'partial', 'missed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."max_source" AS ENUM('tested', 'estimated', 'manual');--> statement-breakpoint
CREATE TYPE "public"."microcycle_load_type" AS ENUM('load', 'unload', 'deload', 'test');--> statement-breakpoint
CREATE TYPE "public"."movement_pattern" AS ENUM('squat', 'hinge', 'lunge', 'vertical_push', 'horizontal_push', 'vertical_pull', 'horizontal_pull', 'carry', 'rotation', 'anti_rotation', 'anti_extension', 'anti_lateral_flexion', 'gait', 'jump_land', 'throw', 'sprint', 'olympic', 'isolation', 'mobility');--> statement-breakpoint
CREATE TYPE "public"."percent_of" AS ENUM('1rm', 'training_max', 'bodyweight', 'e1rm');--> statement-breakpoint
CREATE TYPE "public"."periodization_model" AS ENUM('linear', 'block', 'undulating_daily', 'undulating_weekly', 'conjugate', 'concurrent', 'reverse_linear', 'autoregulated', 'none');--> statement-breakpoint
CREATE TYPE "public"."session_block_type" AS ENUM('warmup', 'activation', 'power', 'main_strength', 'accessory', 'conditioning', 'cooldown');--> statement-breakpoint
CREATE TYPE "public"."session_type" AS ENUM('strength', 'power', 'hypertrophy', 'conditioning', 'recovery', 'testing', 'skill', 'rest');--> statement-breakpoint
CREATE TYPE "public"."set_type" AS ENUM('warmup', 'ramp', 'working', 'top', 'backoff', 'drop', 'cluster', 'rest_pause', 'amrap', 'technique');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'coach', 'athlete');--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text,
	"created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "athletes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_coach_id" uuid NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"date_of_birth" date,
	"sex" "sex",
	"height_cm" double precision,
	"bodyweight_kg" double precision,
	"sport" text,
	"position" text,
	"status" "athlete_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"group_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"joined_at" date NOT NULL,
	"left_at" date
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_coach_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "group_type" DEFAULT 'team' NOT NULL,
	"sport" text,
	"season" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"unit_system" text DEFAULT 'kg' NOT NULL,
	"plate_increment_kg" double precision DEFAULT 2.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'coach' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"description" text,
	"movement_pattern" "movement_pattern" NOT NULL,
	"category" "exercise_category" NOT NULL,
	"laterality" "laterality" DEFAULT 'bilateral' NOT NULL,
	"force_vector" "force_vector",
	"contraction_emphasis" "contraction_emphasis" DEFAULT 'mixed' NOT NULL,
	"equipment" text[] DEFAULT '{}' NOT NULL,
	"primary_muscles" text[] DEFAULT '{}' NOT NULL,
	"secondary_muscles" text[] DEFAULT '{}' NOT NULL,
	"tracked_metrics" text[] DEFAULT '{"load","reps"}' NOT NULL,
	"load_basis" "load_basis" DEFAULT 'absolute_only' NOT NULL,
	"derived_from_exercise_id" uuid,
	"derived_ratio" double precision,
	"is_max_testable" boolean DEFAULT false NOT NULL,
	"progression_of_id" uuid,
	"difficulty_level" integer DEFAULT 3 NOT NULL,
	"default_tempo" text,
	"default_rest_seconds" integer,
	"video_url" text,
	"thumbnail_url" text,
	"coaching_cues" text[] DEFAULT '{}' NOT NULL,
	"contraindications" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"program_id" uuid DEFAULT null NOT NULL,
	"session_block_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"letter_label" text,
	"notes" text,
	"coaching_cues" text[] DEFAULT '{}' NOT NULL,
	"substitution_group_id" uuid
);
--> statement-breakpoint
CREATE TABLE "microcycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"program_id" uuid DEFAULT null NOT NULL,
	"block_id" uuid NOT NULL,
	"week_number" integer NOT NULL,
	"label" text,
	"load_type" "microcycle_load_type" DEFAULT 'load' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "prescribed_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"program_id" uuid DEFAULT null NOT NULL,
	"slot_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"set_type" "set_type" DEFAULT 'working' NOT NULL,
	"reps" integer,
	"rep_min" integer,
	"rep_max" integer,
	"is_amrap" boolean DEFAULT false NOT NULL,
	"cluster_reps" integer,
	"cluster_rest_sec" integer,
	"load_kg" double precision,
	"load_percent" double precision,
	"percent_of" "percent_of",
	"rpe_target" double precision,
	"rir_target" double precision,
	"velocity_target_min" double precision,
	"velocity_target_max" double precision,
	"velocity_loss_threshold_pct" double precision,
	"tempo" text,
	"rest_seconds" integer,
	"duration_sec" integer,
	"distance_m" double precision,
	"calories" integer,
	"height_cm" double precision,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "program_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" integer NOT NULL,
	"weeks" integer DEFAULT 4 NOT NULL,
	"block_type" "block_type" DEFAULT 'accumulation' NOT NULL,
	"volume_emphasis" integer DEFAULT 3 NOT NULL,
	"intensity_emphasis" integer DEFAULT 3 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_coach_id" uuid NOT NULL,
	"is_org_shared" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"goal" text,
	"periodization_model" "periodization_model" DEFAULT 'none' NOT NULL,
	"duration_weeks" integer DEFAULT 4 NOT NULL,
	"is_template" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"program_id" uuid DEFAULT null NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text,
	"order_index" integer NOT NULL,
	"block_type" "session_block_type" DEFAULT 'main_strength' NOT NULL,
	"structure" "block_structure" DEFAULT 'straight' NOT NULL,
	"rounds" integer,
	"rest_between_rounds_sec" integer,
	"time_cap_sec" integer,
	"work_interval_sec" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"program_id" uuid DEFAULT null NOT NULL,
	"microcycle_id" uuid NOT NULL,
	"day_index" integer NOT NULL,
	"name" text NOT NULL,
	"session_type" "session_type" DEFAULT 'strength' NOT NULL,
	"estimated_duration_min" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "athlete_maxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"athlete_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"value_kg" double precision NOT NULL,
	"source" "max_source" DEFAULT 'tested' NOT NULL,
	"reps_performed" integer,
	"load_performed_kg" double precision,
	"training_max_kg" double precision,
	"tested_at" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logged_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"assignment_id" uuid,
	"session_id" uuid,
	"athlete_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "logged_session_status" DEFAULT 'scheduled' NOT NULL,
	"session_rpe" double precision,
	"duration_min" integer,
	"notes" text,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "logged_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"athlete_id" uuid DEFAULT null NOT NULL,
	"logged_session_id" uuid NOT NULL,
	"prescribed_set_id" uuid,
	"exercise_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"reps" integer,
	"load_kg" double precision,
	"rpe" double precision,
	"rir" double precision,
	"velocity_ms" double precision,
	"peak_velocity_ms" double precision,
	"duration_sec" integer,
	"distance_m" double precision,
	"height_cm" double precision,
	"calories" integer,
	"completed" boolean DEFAULT true NOT NULL,
	"notes" text,
	"performed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "program_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid DEFAULT null NOT NULL,
	"program_id" uuid NOT NULL,
	"athlete_id" uuid,
	"group_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "assignment_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_owner_coach_id_users_id_fk" FOREIGN KEY ("owner_coach_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_coach_id_users_id_fk" FOREIGN KEY ("owner_coach_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_derived_from_exercise_id_exercises_id_fk" FOREIGN KEY ("derived_from_exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_progression_of_id_exercises_id_fk" FOREIGN KEY ("progression_of_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_slots" ADD CONSTRAINT "exercise_slots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_slots" ADD CONSTRAINT "exercise_slots_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_slots" ADD CONSTRAINT "exercise_slots_session_block_id_session_blocks_id_fk" FOREIGN KEY ("session_block_id") REFERENCES "public"."session_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_slots" ADD CONSTRAINT "exercise_slots_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microcycles" ADD CONSTRAINT "microcycles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microcycles" ADD CONSTRAINT "microcycles_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "microcycles" ADD CONSTRAINT "microcycles_block_id_program_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."program_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescribed_sets" ADD CONSTRAINT "prescribed_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescribed_sets" ADD CONSTRAINT "prescribed_sets_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescribed_sets" ADD CONSTRAINT "prescribed_sets_slot_id_exercise_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."exercise_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_blocks" ADD CONSTRAINT "program_blocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_blocks" ADD CONSTRAINT "program_blocks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_owner_coach_id_users_id_fk" FOREIGN KEY ("owner_coach_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_blocks" ADD CONSTRAINT "session_blocks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_microcycle_id_microcycles_id_fk" FOREIGN KEY ("microcycle_id") REFERENCES "public"."microcycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_maxes" ADD CONSTRAINT "athlete_maxes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_maxes" ADD CONSTRAINT "athlete_maxes_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_maxes" ADD CONSTRAINT "athlete_maxes_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_assignment_id_program_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."program_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sessions" ADD CONSTRAINT "logged_sessions_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_logged_session_id_logged_sessions_id_fk" FOREIGN KEY ("logged_session_id") REFERENCES "public"."logged_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_prescribed_set_id_prescribed_sets_id_fk" FOREIGN KEY ("prescribed_set_id") REFERENCES "public"."prescribed_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logged_sets" ADD CONSTRAINT "logged_sets_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_assignments" ADD CONSTRAINT "program_assignments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athletes_org_idx" ON "athletes" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "athletes_owner_idx" ON "athletes" USING btree ("org_id","owner_coach_id");--> statement-breakpoint
CREATE INDEX "group_members_group_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_members_athlete_idx" ON "group_members" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "groups_org_idx" ON "groups" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "groups_owner_idx" ON "groups" USING btree ("org_id","owner_coach_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_idx" ON "users" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_org_slug_idx" ON "exercises" USING btree ("org_id","slug") WHERE "exercises"."org_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_global_slug_idx" ON "exercises" USING btree ("slug") WHERE "exercises"."org_id" is null;--> statement-breakpoint
CREATE INDEX "exercises_pattern_idx" ON "exercises" USING btree ("movement_pattern");--> statement-breakpoint
CREATE INDEX "exercises_category_idx" ON "exercises" USING btree ("category");--> statement-breakpoint
CREATE INDEX "exercises_name_idx" ON "exercises" USING btree ("name");--> statement-breakpoint
CREATE INDEX "exercise_slots_block_idx" ON "exercise_slots" USING btree ("session_block_id");--> statement-breakpoint
CREATE INDEX "exercise_slots_exercise_idx" ON "exercise_slots" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "exercise_slots_rls_idx" ON "exercise_slots" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "microcycles_block_idx" ON "microcycles" USING btree ("block_id");--> statement-breakpoint
CREATE INDEX "microcycles_rls_idx" ON "microcycles" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "prescribed_sets_slot_idx" ON "prescribed_sets" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "prescribed_sets_rls_idx" ON "prescribed_sets" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "program_blocks_program_idx" ON "program_blocks" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "program_blocks_rls_idx" ON "program_blocks" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "programs_org_idx" ON "programs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "programs_owner_idx" ON "programs" USING btree ("org_id","owner_coach_id");--> statement-breakpoint
CREATE INDEX "session_blocks_session_idx" ON "session_blocks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_blocks_rls_idx" ON "session_blocks" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "sessions_microcycle_idx" ON "sessions" USING btree ("microcycle_id");--> statement-breakpoint
CREATE INDEX "sessions_rls_idx" ON "sessions" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "athlete_maxes_athlete_idx" ON "athlete_maxes" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "athlete_maxes_lookup_idx" ON "athlete_maxes" USING btree ("athlete_id","exercise_id","tested_at");--> statement-breakpoint
CREATE INDEX "athlete_maxes_rls_idx" ON "athlete_maxes" USING btree ("org_id","athlete_id");--> statement-breakpoint
CREATE INDEX "logged_sessions_athlete_idx" ON "logged_sessions" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "logged_sessions_date_idx" ON "logged_sessions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "logged_sessions_rls_idx" ON "logged_sessions" USING btree ("org_id","athlete_id");--> statement-breakpoint
CREATE INDEX "logged_sets_session_idx" ON "logged_sets" USING btree ("logged_session_id");--> statement-breakpoint
CREATE INDEX "logged_sets_exercise_idx" ON "logged_sets" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "logged_sets_prescribed_idx" ON "logged_sets" USING btree ("prescribed_set_id");--> statement-breakpoint
CREATE INDEX "logged_sets_rls_idx" ON "logged_sets" USING btree ("org_id","athlete_id");--> statement-breakpoint
CREATE INDEX "assignments_program_idx" ON "program_assignments" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "assignments_athlete_idx" ON "program_assignments" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "assignments_group_idx" ON "program_assignments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "assignments_rls_idx" ON "program_assignments" USING btree ("org_id");