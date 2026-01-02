
export interface WordPressConfig {
  siteUrl: string;
  username: string;
  applicationPassword: string;
  customInstruction?: string;
  defaultCategoryId?: string;
  enableAiImage?: boolean;
  aiImageCount?: number; // 생성할 이미지 개수 (1-3)
}

export interface GroundingUrl {
  uri: string;
  title: string;
}

export interface AuditResult {
  isHtmlValid: boolean;
  brokenUrls: string[];
  guidelineScore: number;
  aiReview: string;
  passed: boolean;
}

export interface GeneratedPost {
  id?: number;
  title: string;
  content: string;
  excerpt: string;
  status: 'draft' | 'publish' | 'future' | 'pending' | 'private';
  date?: string;
  thumbnailData?: string;
  featuredMediaUrl?: string;
  audit?: AuditResult;
  groundingUrls?: GroundingUrl[];
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  PAUSED = 'PAUSED', 
  ERROR = 'ERROR'
}

export interface DashboardStats {
  unprocessed: number;   
  localPending: number;  
  wpDraft: number;      
  wpFuture: number;     
  wpPublish: number;    
}

export interface BulkItem {
  topic: string;
  status: 'pending' | 'generating' | 'publishing' | 'completed' | 'failed';
  error?: string;
  result?: GeneratedPost;
}
