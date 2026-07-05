import { ArrayNotEmpty, IsArray, IsIn, IsString } from 'class-validator';

const GOALS = ['leadership', 'entrepreneurship', 'networking', 'empowerment'] as const;

const PROGRAMS = [
  'entrepreneurship-workshops',
  'leadership-development',
  'networking-events',
  'business-mentorship',
  'personal-growth',
  'empowerment-initiatives',
] as const;

export class CompleteOnboardingDto {
  @IsString()
  @IsIn(GOALS)
  goal!: (typeof GOALS)[number];

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(PROGRAMS, { each: true })
  interests!: (typeof PROGRAMS)[number][];
}