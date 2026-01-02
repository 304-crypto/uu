
import { WordPressConfig, GeneratedPost, DashboardStats } from "../types";

const getAuthHeader = (config: WordPressConfig) => {
  return { "Authorization": `Basic ${btoa(`${config.username}:${config.applicationPassword}`)}` };
};

export const fetchPostStats = async (config: WordPressConfig): Promise<Pick<DashboardStats, 'wpDraft' | 'wpFuture' | 'wpPublish'>> => {
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const statuses = ['draft', 'future', 'publish'];
  const counts = await Promise.all(statuses.map(async (status) => {
    try {
      const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts?status=${status}&per_page=1`, {
        method: "GET",
        headers: { ...getAuthHeader(config) },
      });
      return parseInt(response.headers.get('X-WP-Total') || '0');
    } catch { return 0; }
  }));
  return { wpDraft: counts[0], wpFuture: counts[1], wpPublish: counts[2] };
};

export const fetchScheduledPosts = async (config: WordPressConfig): Promise<GeneratedPost[]> => {
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const apiUrl = `${baseUrl}/wp-json/wp/v2/posts?status=future,draft,publish&per_page=20&_embed`;
  const response = await fetch(apiUrl, { method: "GET", headers: { ...getAuthHeader(config) } });
  if (!response.ok) throw new Error("목록 로드 실패");
  const posts = await response.json();
  return posts.map((p: any) => ({
    id: p.id,
    title: p.title.rendered,
    content: p.content.rendered,
    excerpt: p.excerpt.rendered,
    status: p.status,
    date: p.date,
    featuredMediaUrl: p._embedded?.['wp:featuredmedia']?.[0]?.source_url
  }));
};

export const deleteWordPressPost = async (config: WordPressConfig, id: number) => {
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${id}`, { method: "DELETE", headers: { ...getAuthHeader(config) } });
  return response.ok;
};

export const updatePostDate = async (config: WordPressConfig, id: number, newDate: string) => {
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader(config) },
    body: JSON.stringify({ date: newDate }),
  });
  return await response.json();
};

/**
 * SEO 최적화 미디어 업로드
 */
const uploadMedia = async (config: WordPressConfig, base64Data: string, postTitle: string) => {
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const apiUrl = `${baseUrl}/wp-json/wp/v2/media`;

  const byteCharacters = atob(base64Data);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
  const blob = new Blob([byteArray], { type: 'image/webp' });

  // SEO 최적화 파일명 생성: 제목을 슬러그화
  const slug = postTitle.replace(/[^a-zA-Z0-9가-힣]/g, '-').substring(0, 30);
  const fileName = `${slug}-${Date.now()}.webp`;
  
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('title', postTitle);
  formData.append('alt_text', postTitle); // Alt 텍스트 자동 입력
  formData.append('caption', postTitle);

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      ...getAuthHeader(config),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
    body: formData,
  });

  if (!response.ok) return null;
  const media = await response.json();
  return media.id;
};

export const publishToWordPress = async (config: WordPressConfig, post: GeneratedPost) => {
  const baseUrl = config.siteUrl.replace(/\/$/, "");
  const apiUrl = `${baseUrl}/wp-json/wp/v2/posts`;

  let featuredMediaId: number | undefined = undefined;
  if (post.thumbnailData) {
    const mediaId = await uploadMedia(config, post.thumbnailData, post.title);
    if (mediaId) featuredMediaId = mediaId;
  }

  const payload: any = {
    title: post.title,
    content: post.content,
    excerpt: post.excerpt,
    status: post.status,
    date: post.date,
  };

  if (config.defaultCategoryId) {
    const catId = parseInt(config.defaultCategoryId);
    if (!isNaN(catId)) payload.categories = [catId];
  }

  if (featuredMediaId) payload.featured_media = featuredMediaId;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader(config) },
    body: JSON.stringify(payload),
  });

  if (!response.ok) throw new Error("발행 실패");
  return await response.json();
};
