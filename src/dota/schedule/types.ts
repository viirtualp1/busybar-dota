export type UpcomingMatch = {
  teamA: string;
  teamB: string;
  tagA: string;
  tagB: string;
  startsAtMs: number | null;
  stage: string;
  stageShort: string;
  bestOf: number;
};

export type BracketRow = {
  label: string;
  text: string;
  next: boolean;
};

export type Schedule = {
  next: UpcomingMatch | null;
  upcoming: UpcomingMatch[];
  bracket: BracketRow[];
};

export type ScheduleSource = {
  readonly label: string;
  poll(): Promise<Schedule | null>;
};
