export interface Category {
  id: string;
  nameKo: string;
  nameEn: string;
  subcategories: Subcategory[];
}

export interface Subcategory {
  id: string;
  productCode: string;
  nameKo: string;
  nameEn: string;
}

export type WorkflowStatus =
  | 'pending'      // 발행 대기
  | 'requested'    // 발행 요청
  | 'in_progress'  // 협력업체 작성 중
  | 'review'       // 검수 필요
  | 'published';   // 발행 완료 (blog 매핑이 있으면 자동)

export interface WorkflowState {
  status: WorkflowStatus;
  assignee: string | null;
  memo: string | null;
  requestedAt: string | null;
  updatedAt: string;
  acknowledged?: boolean;        // "확인" — 추가 작업 불필요로 표시 → 할 일 목록에서 제외
}

export interface SourceArticle {
  seqId: string;                  // LG 스스로 해결 글 고유 ID (URL의 solutions-{이것})
  title: string;
  url: string;                    // /support/solutions-{seqId} (절대 URL)
  categoryId: string;
  subcategoryId: string;
  productCode: string;
  cateName: string;               // 응답에 들어있는 표시용 카테고리명
  topic: string;
  sympSubName: string;
  bodySummary: string;            // listData.content
  bodyText: string | null;        // 상세 페이지에서 추출 (선택적)
  publishedAt: string | null;     // listData.date
  modifiedAt: string | null;      // 상세 페이지에서 추출
  view: string | null;            // listData.view
  hasVideo: boolean;
  firstSeenAt: string;            // 우리 시스템에서 처음 발견한 시점 (ISO)
  lastCheckedAt: string;          // 마지막으로 크롤러가 확인한 시점 (ISO)
  workflow?: WorkflowState;       // 협업 워크플로우 (선택)
}

export interface BlogPost {
  postId: string;                 // blog.naver.com/lgeservice_kr/{이것}
  title: string;
  url: string;
  publishedAt: string | null;     // YYYY-MM-DD
  categoryNo: string | null;      // 네이버 블로그 categoryNo
  categoryNameKo: string | null;
  sourceSeqId: string | null;     // 매핑된 스스로 해결 seqId (없으면 null)
  assignedTo: string | null;      // 담당 협력업체
  addedAt: string;                // ISO
  source: 'manual' | 'backfill_naver' | 'backfill_csv';
}

export interface Settings {
  lastSourceCrawlAt: string | null;
  lastBackfillAt: string | null;
}

export interface DedupHit {
  kind: 'seq_id' | 'title_normalized' | 'body_cosine';
  blogPost: BlogPost;
  similarity?: number;            // body_cosine일 때만
  daysSincePublished: number | null;
}

export type RiskLevel = 'red' | 'yellow' | 'green' | 'none';

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
  hits: DedupHit[];
}

export type EffectiveStatus = WorkflowStatus;
