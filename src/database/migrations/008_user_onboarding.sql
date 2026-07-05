ALTER TABLE users
  ADD COLUMN onboarding_goal VARCHAR(50) NULL,
  ADD COLUMN onboarding_interests JSON NULL,
  ADD COLUMN onboarding_completed_at DATETIME NULL;