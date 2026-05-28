export type CampaignMemberRole = 'gm' | 'player';

export type CampaignSummary = {
  id: string;
  name: string;
  gmUserId: string;
  worldId: string;
  createdAt: string;
  memberRole: CampaignMemberRole;
  playersCount: number;
  sessionsCount: number;
  nextSession: string | null;
  pendingFichas: number | null;
};

export type CampaignMember = {
  userId: string;
  username: string;
  role: CampaignMemberRole;
  joinedAt: string;
};

export type CampaignDetail = CampaignSummary & {
  tagline?: string | null;
  members: CampaignMember[];
};
