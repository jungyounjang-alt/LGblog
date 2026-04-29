// Frontend mirrors of server/types.ts shapes.
// Kept in sync manually for now (no shared package — JSON over HTTP).

export interface Subcategory {
  id: string;
  productCode: string;
  nameKo: string;
  nameEn: string;
}

export interface Category {
  id: string;
  nameKo: string;
  nameEn: string;
  subcategories: Subcategory[];
}

export type WorkflowStatus =
  | 'pending'
  | 'requested'
  | 'in_progress'
  | 'review'
  | 'published';

export interface WorkflowState {
  status: WorkflowStatus;
  assignee: string | null;
  memo: string | null;
  requestedAt: string | null;
  updatedAt: string;
  acknowledged?: boolean;
}

export interface SourceArticle {
  seqId: string;
  title: string;
  url: string;
  categoryId: string;
  subcategoryId: string;
  productCode: string;
  cateName: string;
  topic: string;
  sympSubName: string;
  bodySummary: string;
  bodyText: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  view: string | null;
  hasVideo: boolean;
  firstSeenAt: string;
  lastCheckedAt: string;
  workflow?: WorkflowState;
}

export interface BlogPost {
  postId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  categoryNo: string | null;
  categoryNameKo: string | null;
  sourceSeqId: string | null;
  assignedTo: string | null;
  addedAt: string;
  source: 'manual' | 'backfill_naver' | 'backfill_csv';
}

export interface DedupHit {
  kind: 'seq_id' | 'title_normalized' | 'title_fuzzy' | 'body_cosine';
  blogPost: BlogPost;
  similarity?: number;
  daysSincePublished: number | null;
}

export type RiskLevel = 'red' | 'yellow' | 'green' | 'none';

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
  hits: DedupHit[];
}

export interface DashboardRow {
  article: SourceArticle;
  risk: RiskAssessment;
  effectiveStatus: WorkflowStatus;
  publishedBlogPost: BlogPost | null;
  matchedPost: BlogPost | null;
  matchSource: 'confirmed' | 'title_match' | null;
}

export interface DashboardResponse {
  rows: DashboardRow[];
  totals: { articles: number; blogPosts: number };
}

export interface Settings {
  lastSourceCrawlAt: string | null;
  lastBackfillAt: string | null;
}
