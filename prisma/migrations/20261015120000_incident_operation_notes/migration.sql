-- Operational notes share the immutable incident activity stream and actor/timestamp fields.
ALTER TYPE "AlarmTransitionType" ADD VALUE IF NOT EXISTS 'NOTE_ADDED';
