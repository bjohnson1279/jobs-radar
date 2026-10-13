export interface JobPosting {
    id: string;
    title: string;
    company: string;
    url: string;
    location: string;
    country?: string; // Optional country supplied by the source.
    description: string;
    postedAt?: string | null;
    postedDateKind?: 'original' | 'lastPublished';
    sourceUpdatedAt?: string | null;
    remoteHint?: boolean; // Source reports remote independently of configured eligibility.
    isRemote: boolean;
    isLocal: boolean;
    locationScore: number; // Configured location preference bonus
    _salary?: { min: number; max: number } | null;
    _ashbyCompensation?: { min: number; max: number } | null;
    score: number;         // Total configured score, floored at zero
}

export interface WorkdayBoard {
    tenant: string;
    datacenter: string; // e.g. 'wd5'
    site: string;       // the career site name segment
    displayName: string;
}
