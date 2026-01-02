
import { AuditResult } from "../types";

export const performTechnicalAudit = (html: string): { isHtmlValid: boolean; brokenUrls: string[] } => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // 1. HTML 유효성 체크 (브라우저 파싱 시 에러 노드 확인)
  const isHtmlValid = !doc.querySelector('parsererror');

  // 2. URL 유효성 체크
  const brokenUrls: string[] = [];
  const links = doc.querySelectorAll('a');
  
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href === '#' || href === '') {
      brokenUrls.push(link.innerText || '빈 링크');
    } else {
      try {
        new URL(href.startsWith('http') ? href : `https://${href}`);
      } catch (e) {
        brokenUrls.push(href);
      }
    }
  });

  return { isHtmlValid, brokenUrls };
};
